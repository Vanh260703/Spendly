import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { resolvePeriod } from '../../common/utils/period';
import { User } from '../users/entities/user.entity';
import { TransactionsService } from '../transactions/transactions.service';
import { ContributeDto, CreateGoalDto, ListGoalQuery, UpdateGoalDto } from './dto/goal.dto';
import { GoalContribution } from './entities/goal-contribution.entity';
import { Goal, GoalStatus } from './entities/goal.entity';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal) private readonly repo: Repository<Goal>,
    @InjectRepository(GoalContribution)
    private readonly contributions: Repository<GoalContribution>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly transactions: TransactionsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string, query: ListGoalQuery = {}): Promise<Goal[]> {
    return this.repo.find({
      where: {
        userId,
        ...(query.horizon && { horizon: query.horizon }),
        ...(query.status && { status: query.status }),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Số tiền đã nạp trong kỳ HIỆN TẠI cho từng mục tiêu.
   *
   * Kỳ tính theo `user.monthStartDay` như mọi chỗ khác — nếu chu kỳ tháng của user bắt đầu
   * ngày 25 thì "tháng này đã nạp chưa" cũng phải theo mốc đó, không lấy tháng dương lịch.
   *
   * Trả Map để controller ghép vào DTO mà không cần N+1 query.
   */
  async contributedThisPeriod(
    userId: string,
    goalIds: string[],
  ): Promise<Map<string, number>> {
    if (goalIds.length === 0) return new Map();

    const user = await this.users.findOneByOrFail({ id: userId });
    const { start, end } = resolvePeriod('month', {
      timezone: user.timezone,
      monthStartDay: user.monthStartDay,
    });

    const rows = await this.contributions
      .createQueryBuilder('c')
      .select('c.goalId', 'goalId')
      .addSelect('SUM(c.amount)', 'total')
      .where('c.goalId IN (:...goalIds)', { goalIds })
      .andWhere('c.date BETWEEN :start AND :end', { start, end })
      .groupBy('c.goalId')
      .getRawMany<{ goalId: string; total: string }>();

    // SUM() từ raw query trả về CHUỖI — quên Number() là dính lỗi nối chuỗi
    return new Map(rows.map((r) => [r.goalId, Number(r.total)]));
  }

  async findOne(userId: string, id: string): Promise<Goal> {
    const g = await this.repo.findOneBy({ id, userId });
    if (!g) throw new NotFoundException('Không tìm thấy mục tiêu');
    return g;
  }

  async create(userId: string, dto: CreateGoalDto): Promise<Goal> {
    return this.repo.save(this.repo.create({ ...dto, userId }));
  }

  async update(userId: string, id: string, dto: UpdateGoalDto): Promise<Goal> {
    await this.findOne(userId, id);
    await this.repo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    // Lịch sử nạp tiền xóa theo (FK CASCADE) — nó chỉ có nghĩa trong ngữ cảnh mục tiêu
    await this.repo.delete({ id, userId });
  }

  /**
   * Nạp tiền vào mục tiêu — **không tạo `Transaction`**.
   *
   * Đây là "gắn nhãn", không phải "chi": tiền vẫn nằm trong ví, chỉ là đã có chủ. Nếu sinh
   * giao dịch chi thì số dư sẽ tụt trong khi tiền thật không đổi, và user phải bấm
   * "Điều chỉnh số dư" mỗi tháng để bù con số lệch do chính app tạo ra (SPEC §4.5).
   *
   * Bù lại phải **chặn nạp vượt số tiền đang có**, nếu không sẽ cam kết 50tr cho mục tiêu
   * trong khi ví chỉ có 10tr.
   */
  async contribute(userId: string, id: string, dto: ContributeDto) {
    const goal = await this.findOne(userId, id);

    if (goal.status !== GoalStatus.ACTIVE) {
      throw new ConflictException('Chỉ nạp được vào mục tiêu đang chạy');
    }

    const { currentBalance } = await this.transactions.getBalance(userId);
    const daCamKet = await this.tongDaCamKet(userId);

    if (daCamKet + dto.amount > currentBalance) {
      throw new ConflictException(
        `Không đủ tiền tự do. Số tiền hiện có ${currentBalance.toLocaleString('vi-VN')}₫, ` +
          `đã cam kết ${daCamKet.toLocaleString('vi-VN')}₫, ` +
          `chỉ còn ${(currentBalance - daCamKet).toLocaleString('vi-VN')}₫ để nạp.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(GoalContribution, {
          goalId: id,
          amount: dto.amount,
          date: dto.date,
          note: dto.note ?? null,
        }),
      );

      const currentAmount = goal.currentAmount + dto.amount;
      await manager.update(Goal, { id, userId }, {
        currentAmount,
        // Đạt đích thì tự chuyển trạng thái, khỏi bắt user vào bấm tay
        ...(currentAmount >= goal.targetAmount && { status: GoalStatus.ACHIEVED }),
      });

      return manager.findOneByOrFail(Goal, { id });
    });
  }

  async contributions_(userId: string, id: string): Promise<GoalContribution[]> {
    await this.findOne(userId, id);
    return this.contributions.find({ where: { goalId: id }, order: { date: 'DESC' } });
  }

  /** Tổng tiền đã gắn nhãn cho các mục tiêu đang chạy */
  private async tongDaCamKet(userId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('g')
      .select('COALESCE(SUM(g.currentAmount), 0)', 'total')
      .where('g.userId = :userId AND g.status = :status', {
        userId,
        status: GoalStatus.ACTIVE,
      })
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }
}
