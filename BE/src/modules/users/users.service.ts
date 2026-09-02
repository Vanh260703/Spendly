import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { UserProfileDto, toUserProfile } from './dto/user-profile.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
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


  /** Hồ sơ đầy đủ kèm tài khoản ngân hàng — dùng cho `GET /users/me` */
  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.findById(userId);
    const account = await this.repo.manager.findOneBy(BankAccount, { userId });
    return toUserProfile(user, account ?? undefined);
  }



}
