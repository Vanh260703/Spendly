import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { UpdateWalletDto } from './dto/wallet.dto';
import { Wallet } from './entities/wallet.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly repo: Repository<Wallet>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Tạo ví chung cho user mới. Chạy trong transaction đăng ký (xem `CategoriesService.seedDefaults`).
   *
   * `initialBalance = 0` lúc này — số thật được hỏi ở bước onboarding, vì bắt khai tiền
   * ngay trên form đăng ký sẽ làm người dùng chùn tay.
   */
  async createForUser(userId: string, manager: EntityManager): Promise<Wallet> {
    const repo = manager.getRepository(Wallet);
    return repo.save(repo.create({ userId, name: 'Ví chính', initialBalance: 0 }));
  }

  /** Ví của user. Mỗi user có đúng một ví nên không cần truyền id. */
  async findByUser(userId: string): Promise<Wallet> {
    const wallet = await this.repo.findOneBy({ userId });
    if (!wallet) throw new NotFoundException('Không tìm thấy ví');
    return wallet;
  }

  /** Chỉ lấy id — dùng khi tạo giao dịch, khỏi kéo cả bản ghi về. */
  async getWalletId(userId: string): Promise<string> {
    return (await this.findByUser(userId)).id;
  }

  /**
   * Sửa ví. Đổi `initialBalance` sẽ **dịch chuyển toàn bộ lịch sử số dư** — mọi kỳ trong
   * quá khứ đều đổi số. Chỉ dùng khi khai sai lúc onboarding; lệch do quên nhập giao dịch
   * thì phải dùng `POST /transactions/adjust-balance` để bù tại một ngày cụ thể (SPEC §3).
   *
   * Xóa cache thống kê vì `initialBalance` là thành phần của công thức số tiền hiện có.
   */
  async update(userId: string, dto: UpdateWalletDto): Promise<Wallet> {
    await this.repo.update({ userId }, dto);
    if (dto.initialBalance !== undefined || dto.startedAt !== undefined) {
      await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
    }
    return this.findByUser(userId);
  }
}
