import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateDebtDto, PayDebtDto, UpdateDebtDto } from './dto/debt.dto';
import { DebtPayment } from './entities/debt-payment.entity';
import { Debt, DebtStrategy } from './entities/debt.entity';

export interface PayoffStep {
  debtId: string;
  name: string;
  interestRate: number;
  remaining: number;
  payoffDate: string;
  totalInterest: number;
  months: number;
}

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt) private readonly repo: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly payments: Repository<DebtPayment>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string, includePaid = false): Promise<Debt[]> {
    return this.repo.find({
      where: { userId, ...(includePaid ? {} : { isPaid: false }) },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, id: string): Promise<Debt> {
    const d = await this.repo.findOneBy({ id, userId });
    if (!d) throw new NotFoundException('Không tìm thấy khoản nợ');
    return d;
  }

  async create(userId: string, dto: CreateDebtDto): Promise<Debt> {
    return this.repo.save(
      this.repo.create({
        ...dto,
        userId,
        // Vay xong thì còn nợ đúng bằng tiền gốc
        remaining: dto.remaining ?? dto.principal,
        startDate: dto.startDate ?? new Date(),
      }),
    );
  }

  async update(userId: string, id: string, dto: UpdateDebtDto): Promise<Debt> {
    await this.findOne(userId, id);
    await this.repo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  /**
   * Ghi một lần trả nợ: tạo `DebtPayment` + trừ `remaining` trong **cùng một transaction**.
   * Tách ra sẽ có lúc ghi được lịch sử mà số dư nợ không giảm (hoặc ngược lại).
   */
  async pay(userId: string, id: string, dto: PayDebtDto): Promise<Debt> {
    const debt = await this.findOne(userId, id);
    if (debt.isPaid) throw new ConflictException('Khoản nợ này đã trả xong');

    return this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(DebtPayment, {
          debtId: id,
          amount: dto.amount,
          date: dto.date,
        }),
      );

      // Trả dư thì kẹp về 0, không để nợ âm
      const remaining = Math.max(0, debt.remaining - dto.amount);
      await manager.update(Debt, { id, userId }, { remaining, isPaid: remaining === 0 });

      return manager.findOneByOrFail(Debt, { id });
    });
  }

  async paymentHistory(userId: string, id: string): Promise<DebtPayment[]> {
    await this.findOne(userId, id);
    return this.payments.find({ where: { debtId: id }, order: { date: 'DESC' } });
  }

  /**
   * Mô phỏng kế hoạch trả nợ theo tháng.
   *
   * - **snowball**: dồn trả khoản CÒN NỢ ÍT NHẤT trước → tốn lãi hơn nhưng nhanh thấy
   *   kết quả, dễ giữ động lực.
   * - **avalanche**: dồn trả khoản LÃI CAO NHẤT trước → tổng lãi phải trả ít nhất.
   *
   * Cách chạy: mỗi tháng cộng lãi vào từng khoản, trả `minPayment` cho tất cả, rồi dồn
   * toàn bộ phần dư (`extraPayment` + tiền của các khoản đã trả xong) vào khoản đứng đầu
   * danh sách ưu tiên. Đây chính là điểm mạnh của cả hai chiến lược: khoản trả xong sẽ
   * giải phóng dòng tiền cho khoản tiếp theo (hiệu ứng "quả cầu tuyết").
   */
  async payoffPlan(
    userId: string,
    strategy: DebtStrategy,
    extraPayment = 0,
  ): Promise<{
    strategy: DebtStrategy;
    order: PayoffStep[];
    debtFreeDate: string | null;
    totalInterest: number;
    months: number;
  }> {
    const debts = await this.findAll(userId);
    if (debts.length === 0) {
      return { strategy, order: [], debtFreeDate: null, totalInterest: 0, months: 0 };
    }

    const state = debts.map((d) => ({
      id: d.id,
      name: d.name,
      interestRate: d.interestRate,
      remaining: d.remaining,
      minPayment: d.minPayment,
      banDau: d.remaining,
      laiTraThem: 0,
      soThang: 0,
    }));

    const uuTien = (list: typeof state) =>
      [...list].sort((a, b) =>
        strategy === DebtStrategy.SNOWBALL
          ? a.remaining - b.remaining
          : b.interestRate - a.interestRate,
      );

    const ketQua: PayoffStep[] = [];
    const homNay = new Date();
    let thang = 0;
    // Trần 600 tháng (50 năm): chặn vòng lặp vô hạn khi minPayment không đủ trả nổi lãi
    const TRAN_THANG = 600;

    while (state.some((d) => d.remaining > 0) && thang < TRAN_THANG) {
      thang++;
      let nganSachThem = extraPayment;

      // 1. Cộng lãi tháng + trả mức tối thiểu cho mọi khoản
      for (const d of state) {
        if (d.remaining <= 0) {
          // Khoản đã xong → tiền trả hằng tháng của nó dồn sang khoản khác
          nganSachThem += d.minPayment;
          continue;
        }
        const lai = (d.remaining * d.interestRate) / 100 / 12;
        d.laiTraThem += lai;
        d.remaining += lai;

        const tra = Math.min(d.minPayment, d.remaining);
        d.remaining -= tra;
        // Trả xong sớm hơn mức tối thiểu thì phần thừa cũng dồn tiếp
        if (d.minPayment > tra) nganSachThem += d.minPayment - tra;
      }

      // 2. Dồn toàn bộ phần dư vào khoản ưu tiên cao nhất
      for (const d of uuTien(state)) {
        if (nganSachThem <= 0) break;
        if (d.remaining <= 0) continue;
        const tra = Math.min(nganSachThem, d.remaining);
        d.remaining -= tra;
        nganSachThem -= tra;
      }

      // 3. Ghi nhận khoản vừa trả xong
      for (const d of state) {
        if (d.remaining <= 0.5 && d.soThang === 0) {
          d.remaining = 0;
          d.soThang = thang;
          const ngay = new Date(homNay);
          ngay.setMonth(ngay.getMonth() + thang);
          ketQua.push({
            debtId: d.id,
            name: d.name,
            interestRate: d.interestRate,
            remaining: d.banDau,
            payoffDate: ngay.toISOString().slice(0, 10),
            totalInterest: Math.round(d.laiTraThem),
            months: thang,
          });
        }
      }
    }

    const chuaTraXong = state.some((d) => d.remaining > 0);
    const ngayHetNo = new Date(homNay);
    ngayHetNo.setMonth(ngayHetNo.getMonth() + thang);

    return {
      strategy,
      order: ketQua,
      // null = mức trả hằng tháng không đủ để tất toán trong 50 năm (lãi ăn hết tiền trả)
      debtFreeDate: chuaTraXong ? null : ngayHetNo.toISOString().slice(0, 10),
      totalInterest: Math.round(state.reduce((s, d) => s + d.laiTraThem, 0)),
      months: chuaTraXong ? 0 : thang,
    };
  }
}
