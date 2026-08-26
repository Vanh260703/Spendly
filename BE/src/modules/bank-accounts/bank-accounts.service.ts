import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RedisKeys, RedisService } from '../../shared/redis';
import { LinkBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';
import { BankAccount } from './entities/bank-account.entity';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly repo: Repository<BankAccount>,
    private readonly redis: RedisService,
  ) {}

  findAll(userId: string): Promise<BankAccount[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async findOne(userId: string, id: string): Promise<BankAccount> {
    const a = await this.repo.findOneBy({ id, userId });
    if (!a) throw new NotFoundException('Không tìm thấy tài khoản ngân hàng');
    return a;
  }

  /**
   * Liên kết một tài khoản ngân hàng.
   *
   * ⚠️ `accountNumber` duy nhất TOÀN CỤC, không phải theo user: một số tài khoản chỉ thuộc
   * về một người. Cho phép trùng thì giao dịch của người này chạy vào sổ người kia — và
   * không ai phát hiện ra cho tới khi số dư sai.
   */
  async link(userId: string, dto: LinkBankAccountDto): Promise<BankAccount> {
    const trung = await this.repo.findOneBy({ accountNumber: dto.accountNumber });
    if (trung) {
      throw new ConflictException('Số tài khoản này đã được liên kết');
    }
    return this.repo.save(
      this.repo.create({
        userId,
        accountNumber: dto.accountNumber,
        bankName: dto.bankName,
        nickname: dto.nickname || 'Tài khoản chính',
      }),
    );
  }

  async update(userId: string, id: string, dto: UpdateBankAccountDto): Promise<BankAccount> {
    const a = await this.findOne(userId, id);
    if (dto.nickname !== undefined) a.nickname = dto.nickname;
    return this.repo.save(a);
  }

  async unlink(userId: string, id: string): Promise<void> {
    const a = await this.findOne(userId, id);
    await this.repo.remove(a);
    await this.redis.delByPrefix(RedisKeys.statsPrefix(userId));
  }

  /** Tra chủ sở hữu từ số tài khoản — webhook SePay không kèm `userId` */
  findByAccountNumber(accountNumber: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(BankAccount) : this.repo;
    return repo.findOneBy({ accountNumber });
  }

  /**
   * Cập nhật số dư từ `accumulated` của webhook.
   *
   * ⚠️ **Gán đè, không cộng dồn.** `accumulated` là số dư THẬT sau giao dịch do ngân hàng
   * cấp; tự cộng trừ là quay lại đúng cái bẫy mà app này đã tránh từ đầu.
   */
  async capNhatSoDu(
    id: string,
    soDu: number,
    thoiDiem: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(BankAccount) : this.repo;
    await repo.update({ id }, { currentBalance: soDu, lastSyncedAt: thoiDiem });
  }
}
