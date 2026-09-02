import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { SYSTEM_CATEGORY } from '../categories/default-categories';
import { Category, CategoryType } from '../categories/entities/category.entity';
import { Transaction, TxType } from '../transactions/entities/transaction.entity';
import { SepayApiClient } from './sepay-api.client';
import { GiaoDichChuanHoa, chuanHoa } from './sepay.normalizer';

/** SePay trả tối đa 5000 dòng/lần — chạm trần nghĩa là còn nữa, phải xin tiếp */
const TRAN_MOI_LAN = 5000;

export interface KetQuaDongBo {
  /** Số giao dịch MỚI được ghi vào sổ */
  moi: number;
  /** Số dòng SePay trả về nhưng đã có sẵn — chạy thừa là bình thường, không phải lỗi */
  daCo: number;
  soDu: number;
  thoiDiem: Date;
}

/**
 * KÉO giao dịch từ SePay về — cơ chế đồng bộ DUY NHẤT của app.
 *
 * Thay cho webhook. Đổi lại độ trễ (vài giờ thay vì tức thì), được hai thứ đáng giá hơn:
 *
 * 1. **Tự bù được.** Webhook mà app đang tắt là mất luôn — SePay thử lại vài lần rồi thôi,
 *    và không có cách nào biết mình đã bỏ lỡ gì. Kéo thì hỏi lúc nào cũng ra đủ.
 * 2. **App không cần lộ ra Internet.** Không webhook thì không cần tunnel, và toàn bộ rủi
 *    ro của việc bỏ auth biến mất theo.
 *
 * Cũng chỉ có đường này mới lấy được **giao dịch phát sinh trước khi cài app** — webhook
 * theo định nghĩa chỉ mang tới những gì xảy ra từ lúc bật nó lên.
 */
@Injectable()
export class SepaySyncService {
  private readonly logger = new Logger(SepaySyncService.name);

  /**
   * Chặn hai lần đồng bộ chạy chồng lên nhau.
   *
   * Bấm nút trên giao diện đúng lúc cron đang chạy thì cả hai cùng gọi SePay, cùng thấy một
   * `since_id` và cùng thử ghi — khóa duy nhất ở DB sẽ chặn được trùng, nhưng vẫn tốn hai
   * lượt gọi và làm log khó đọc.
   */
  private dangChay: Promise<KetQuaDongBo> | null = null;

  constructor(
    @InjectRepository(BankAccount) private readonly accounts: Repository<BankAccount>,
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    private readonly api: SepayApiClient,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Cron chạy nền.
   *
   * Ba giờ một lần — ngân hàng không gấp tới mức phải hỏi mỗi phút, và nút bấm tay lo phần
   * "vừa bật máy lên, muốn thấy ngay".
   *
   * ⚠️ Khai `timeZone` tường minh — mặc định là timezone MÁY CHỦ, mà container chạy UTC còn
   * máy dev chạy giờ VN, nên cùng biểu thức sẽ chạy vào hai thời điểm khác nhau.
   */
  @Cron('0 */3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async cronDongBo(): Promise<void> {
    if (!this.api.isConfigured) return;
    try {
      const kq = await this.dongBo();
      if (kq.moi > 0) this.logger.log(`Cron: thêm ${kq.moi} giao dịch mới`);
    } catch (err) {
      // Cron hỏng không được làm chết app — lần sau chạy lại, và nút bấm tay vẫn còn
      this.logger.warn(`Cron đồng bộ thất bại: ${(err as Error).message}`);
    }
  }

  /** Đồng bộ mọi tài khoản. Gọi từ cron hoặc từ nút bấm trên giao diện. */
  dongBo(tuNgay?: string): Promise<KetQuaDongBo> {
    this.dangChay ??= this.chayThat(tuNgay).finally(() => {
      this.dangChay = null;
    });
    return this.dangChay;
  }

  private async chayThat(tuNgay?: string): Promise<KetQuaDongBo> {
    const accounts = await this.accounts.find();
    let moi = 0;
    let daCo = 0;

    for (const acc of accounts) {
      const kq = await this.dongBoMotTaiKhoan(acc, tuNgay);
      moi += kq.moi;
      daCo += kq.daCo;
    }

    const sauCung = await this.accounts.find();
    return {
      moi,
      daCo,
      soDu: sauCung.reduce((t, a) => t + a.currentBalance, 0),
      thoiDiem: new Date(),
    };
  }

  private async dongBoMotTaiKhoan(
    acc: BankAccount,
    tuNgay?: string,
  ): Promise<{ moi: number; daCo: number }> {
    /*
     * Điểm bắt đầu: ID lớn nhất đã có. Xin từ đó trở đi thay vì kéo lại 5000 dòng mỗi lần.
     *
     * `tuNgay` ghi đè nó — dùng khi nạp lịch sử cũ lần đầu, vì lúc đó `since_id` sẽ là
     * `undefined` và ta muốn nói rõ lấy từ mốc nào.
     */
    const sinceId = tuNgay ? undefined : await this.layIdLonNhat(acc.userId);

    let moi = 0;
    let daCo = 0;
    let conNua = true;
    let moc = sinceId;
    /** Giao dịch có `sepayId` lớn nhất trong đợt này — dùng để đặt số dư */
    let moiNhat: GiaoDichChuanHoa | null = null;

    while (conNua) {
      const rows = await this.api.layDanhSach({
        accountNumber: acc.accountNumber,
        sinceId: moc,
        tuNgay,
        limit: TRAN_MOI_LAN,
      });

      if (rows.length === 0) break;

      for (const row of rows) {
        const gd = chuanHoa(row);
        if (!moiNhat || gd.sepayId > moiNhat.sepayId) moiNhat = gd;
        (await this.ghiMot(acc, gd)) ? moi++ : daCo++;
      }

      /*
       * Chạm trần 5000 nghĩa là SePay còn nữa. Đặt mốc mới là ID lớn nhất vừa nhận rồi xin
       * tiếp — không có bước này thì lần đồng bộ đầu của một tài khoản nhiều năm sẽ lặng lẽ
       * dừng ở 5000 giao dịch và không ai biết là thiếu.
       */
      conNua = rows.length >= TRAN_MOI_LAN;
      if (conNua) {
        moc = Math.max(...rows.map((r) => Number(r.id)));
        tuNgay = undefined; // từ vòng thứ hai trở đi thì đi theo id, không theo ngày nữa
      }
    }

    /*
     * Số dư đặt MỘT LẦN sau khi ghi xong, theo `accumulated` của giao dịch có `sepayId` LỚN
     * NHẤT trong đợt.
     *
     * Không đặt theo từng dòng: đợt đồng bộ có thể trả về cả giao dịch cũ (lúc nạp lịch sử),
     * và `accumulated` của một giao dịch năm ngoái mà ghi đè lên số dư hôm nay thì số dư
     * nhảy ngược về quá khứ.
     *
     * `sepayId` tăng dần theo thời gian nên nó là thước đo "mới nhất" đáng tin hơn `date` —
     * hai giao dịch cùng một giây vẫn phân biệt được.
     */
    if (moiNhat && moiNhat.sepayId >= (sinceId ?? 0)) {
      await this.accounts.update(
        { id: acc.id },
        { currentBalance: moiNhat.accumulated, lastSyncedAt: new Date() },
      );
    } else {
      // Không có gì mới nhưng vẫn ghi nhận là đã hỏi — để giao diện không báo "im lặng lâu"
      await this.accounts.update({ id: acc.id }, { lastSyncedAt: new Date() });
    }
    return { moi, daCo };
  }

  /** Trả `true` nếu ghi mới, `false` nếu đã có */
  private async ghiMot(acc: BankAccount, gd: GiaoDichChuanHoa): Promise<boolean> {
    const daCo = await this.txs.findOneBy({ userId: acc.userId, sepayId: gd.sepayId });
    if (daCo) return false;

    const category = await this.layDanhMucChuaPhanLoai(acc.userId, gd.type);
    if (!category) {
      this.logger.error(
        `Thiếu danh mục hệ thống "${SYSTEM_CATEGORY.CHUA_PHAN_LOAI}" — bỏ qua giao dịch ${gd.sepayId}`,
      );
      return false;
    }

    try {
      await this.dataSource.transaction(async (em) => {
        await em.save(
          em.create(Transaction, {
            userId: acc.userId,
            bankAccountId: acc.id,
            categoryId: category.id,
            type: gd.type,
            amount: gd.amount,
            date: gd.date,
            note: gd.content,
            sepayId: gd.sepayId,
            referenceCode: gd.referenceCode,
            tags: [],
          }),
        );
      });
      return true;
    } catch (err) {
      // Khóa duy nhất (userId, sepayId) — hai lần đồng bộ chạy song song
      if (/duplicate key/i.test((err as Error).message)) return false;
      throw err;
    }
  }

  private async layIdLonNhat(userId: string): Promise<number | undefined> {
    const row = await this.txs
      .createQueryBuilder('t')
      .select('MAX(t.sepayId)', 'max')
      .where('t.userId = :userId', { userId })
      .getRawOne<{ max: string | null }>();

    // ⚠️ `MAX()` qua raw query trả về CHUỖI — `transformer` không áp dụng
    return row?.max ? Number(row.max) : undefined;
  }

  private layDanhMucChuaPhanLoai(userId: string, type: TxType) {
    return this.categories.findOneBy({
      userId,
      isSystem: true,
      name: SYSTEM_CATEGORY.CHUA_PHAN_LOAI,
      type: type === TxType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE,
    });
  }
}
