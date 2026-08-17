import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { Wallet } from '../wallets/entities/wallet.entity';
import { UserProfileDto, toUserProfile } from './dto/user-profile.dto';
import { OnboardingDto, UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    data: { email: string; passwordHash: string; name: string },
    manager: EntityManager,
  ): Promise<User> {
    const repo = manager.getRepository(User);
    return repo.save(repo.create(data));
  }

  /**
   * Tìm user kèm `passwordHash` để xác thực đăng nhập.
   *
   * Cần `addSelect` vì cột này đánh dấu `select: false` — mặc định không bao giờ được
   * load ra, để không vô tình lọt vào response. Đây là chỗ DUY NHẤT được lấy nó.
   */
  async findForAuth(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.repo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getExists();
  }

  /** Hồ sơ đầy đủ kèm ví — dùng cho `GET /users/me` */
  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.findById(userId);
    const wallet = await this.repo.manager.findOneBy(Wallet, { userId });
    return toUserProfile(user, wallet ?? undefined);
  }

  async update(userId: string, dto: UpdateUserDto): Promise<UserProfileDto> {
    await this.repo.update({ id: userId }, dto);
    return this.getProfile(userId);
  }

  /**
   * Đổi mật khẩu — **thu hồi toàn bộ refresh token** của user.
   *
   * Nếu không thu hồi, kẻ đã chiếm được tài khoản vẫn giữ phiên đăng nhập dù chủ tài khoản
   * đã đổi mật khẩu; lúc đó việc đổi mật khẩu gần như vô nghĩa. Đánh đổi: các thiết bị
   * khác của chính chủ cũng bị đăng xuất — chấp nhận được.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    await this.repo.update(
      { id: userId },
      { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) },
    );

    await this.redis.delByPrefix(RedisKeys.refreshTokenPrefix(userId));
  }

  /**
   * Thiết lập ban đầu: ghi số dư vào **ví**, thu nhập vào **user**, trong một transaction.
   *
   * Chỉ chạy được MỘT LẦN. Cho chạy lại sẽ reset `startedAt` và làm dịch chuyển toàn bộ
   * lịch sử số dư (xem SPEC §3) — muốn sửa số dư ban đầu thì dùng `PATCH /wallet`,
   * muốn bù chênh lệch phát sinh thì dùng `POST /transactions/adjust-balance`.
   */
  async completeOnboarding(
    userId: string,
    dto: OnboardingDto,
  ): Promise<UserProfileDto> {
    const user = await this.findById(userId);
    if (user.onboardedAt) {
      throw new ConflictException(
        'Bạn đã hoàn tất thiết lập ban đầu. Dùng PATCH /wallet để sửa số dư.',
      );
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        Wallet,
        { userId },
        { initialBalance: dto.initialBalance, startedAt: now },
      );
      await manager.update(
        User,
        { id: userId },
        { monthlyIncome: dto.monthlyIncome ?? null, onboardedAt: now },
      );
    });

    return this.getProfile(userId);
  }
}
