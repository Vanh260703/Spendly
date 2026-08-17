import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { CategoriesService } from '../categories/categories.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  parseDurationToSeconds,
} from './auth.constants';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface AuthResult {
  user: Pick<User, 'id' | 'email' | 'name'> & { onboardedAt: Date | null };
  accessToken: string;
  /** Chỉ dùng để controller set cookie — không bao giờ trả về trong body */
  refreshToken: string;
  refreshTtlSeconds: number;
}

@Injectable()
export class AuthService {
  /**
   * Hạn token tính bằng GIÂY, không phải chuỗi "15m"/"7d".
   *
   * Dùng cùng một con số cho `expiresIn` của JWT và TTL của whitelist Redis, để hai bên
   * không bao giờ lệch nhau — token còn hạn mà whitelist đã hết (hoặc ngược lại) sẽ gây
   * đăng xuất ngẫu nhiên rất khó lần ra.
   */
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly users: UsersService,
    private readonly wallets: WalletsService,
    private readonly categories: CategoriesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {
    this.accessTtlSeconds = parseDurationToSeconds(
      this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
    );
    this.refreshTtlSeconds = parseDurationToSeconds(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
    );
  }

  /**
   * Đăng ký: tạo user + ví chung + seed danh mục mặc định trong **một transaction**.
   *
   * Phải nguyên tử vì nếu tạo được user mà seed lỗi, tài khoản đó sẽ không nhập liệu
   * được, và user cũng không đăng ký lại được do email đã tồn tại — kẹt hoàn toàn.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.users.existsByEmail(dto.email)) {
      throw new ConflictException('Email này đã được đăng ký');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.dataSource.transaction(async (manager) => {
      const created = await this.users.create(
        { email: dto.email, passwordHash, name: dto.name },
        manager,
      );
      await this.wallets.createForUser(created.id, manager);
      await this.categories.seedDefaults(created.id, manager);
      return created;
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findForAuth(dto.email);

    // Thông báo giống hệt nhau cho "sai email" và "sai mật khẩu" — nếu khác nhau,
    // kẻ tấn công có thể dò xem email nào đã đăng ký trong hệ thống.
    const sai = new UnauthorizedException('Email hoặc mật khẩu không đúng');
    if (!user) throw sai;

    const hopLe = await argon2.verify(user.passwordHash, dto.password);
    if (!hopLe) throw sai;

    return this.issueTokens(user);
  }

  /**
   * Cấp access token mới từ refresh token, đồng thời **xoay vòng** refresh token:
   * thu hồi `jti` cũ và phát `jti` mới.
   *
   * Xoay vòng để nếu refresh token bị đánh cắp thì nó chỉ dùng được một lần — lần dùng
   * kế tiếp (dù của kẻ trộm hay của chủ) sẽ thất bại vì `jti` đã bị thu hồi.
   */
  async refresh(token: string | undefined): Promise<AuthResult> {
    const hetHan = new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    if (!token) throw hetHan;

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw hetHan;
    }

    // Chữ ký hợp lệ vẫn chưa đủ — token có thể đã bị thu hồi khi logout hoặc đổi mật khẩu
    const key = RedisKeys.refreshToken(payload.sub, payload.jti);
    if (!(await this.redis.isRefreshTokenAllowed(key))) throw hetHan;

    await this.redis.del(key);

    return this.issueTokens(await this.users.findById(payload.sub));
  }

  /** Thu hồi refresh token khỏi whitelist. Bỏ qua token rác — logout luôn phải thành công. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      await this.redis.del(RedisKeys.refreshToken(payload.sub, payload.jti));
    } catch {
      // Token hỏng/hết hạn thì coi như đã đăng xuất rồi
    }
  }

  private async issueTokens(user: User): Promise<AuthResult> {
    const jti = randomUUID();

    const accessPayload: AccessTokenPayload = { sub: user.id, email: user.email };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtlSeconds,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.refreshTtlSeconds,
      }),
    ]);

    // TTL của whitelist khớp đúng hạn của token, để không có cửa sổ lệch nhau
    await this.redis.allowRefreshToken(
      RedisKeys.refreshToken(user.id, jti),
      this.refreshTtlSeconds,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        onboardedAt: user.onboardedAt ?? null,
      },
      accessToken,
      refreshToken,
      refreshTtlSeconds: this.refreshTtlSeconds,
    };
  }
}
