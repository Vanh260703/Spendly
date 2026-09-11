import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { CategoriesService } from '../categories/categories.service';
import { User } from './entities/user.entity';

/**
 * Dựng sẵn mọi thứ app cần từ **biến môi trường**, ngay lúc khởi động.
 *
 * App phục vụ một người, một tài khoản ngân hàng, và những giá trị đó gần như không bao giờ
 * đổi — nên khai trong `.env` thay vì dựng màn hình onboarding + trang cài đặt. Mỗi màn hình
 * thừa là một chỗ có thể hỏng, và ở đây chúng không đổi lấy được gì.
 *
 * Chạy mỗi lần khởi động và **idempotent**: có rồi thì đồng bộ lại theo `.env`, chưa có thì
 * tạo. Sửa `.env` rồi restart là đủ, không cần thao tác gì trong app.
 *
 * ⚠️ Đổi `BANK_ACCOUNT_NUMBER` sang số khác sẽ tạo **tài khoản thứ hai**, không sửa đè lên
 * cái cũ — giao dịch cũ vẫn thuộc về số cũ, ghi đè là làm lịch sử nói dối.
 */
@Injectable()
export class SingleUserService implements OnModuleInit {
  private readonly logger = new Logger(SingleUserService.name);

  /** Cache để mỗi request không phải truy DB thêm một lần */
  private cachedId: string | null = null;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(BankAccount) private readonly accounts: Repository<BankAccount>,
    private readonly categories: CategoriesService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const user = await this.layUser();
    await this.dongBoTaiKhoan(user.id);
  }

  /**
   * Người dùng duy nhất — tạo kèm bộ danh mục mặc định nếu chưa có.
   *
   * DB có nhiều dòng (dữ liệu từ thời còn đăng ký) thì lấy dòng **cũ nhất**. Không tự xóa
   * dòng thừa: xóa user là `CASCADE` kéo theo toàn bộ giao dịch của họ.
   */
  async layUser(): Promise<User> {
    const daCo = await this.users.find({ order: { createdAt: 'ASC' }, take: 2 });

    if (daCo.length > 0) {
      if (daCo.length > 1) {
        this.logger.warn('DB có nhiều hơn một user — dùng dòng cũ nhất.');
      }
      const user = daCo[0];
      await this.dongBoCaiDat(user);
      this.cachedId = user.id;
      return user;
    }

    const user = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const created = await repo.save(
        repo.create({
          name: 'Tôi',
          timezone: this.config.get<string>('TIMEZONE'),
          monthStartDay: this.config.get<number>('MONTH_START_DAY'),
        }),
      );
      await this.categories.seedDefaults(created.id, manager);
      return created;
    });

    this.logger.log('Đã tạo người dùng kèm danh mục mặc định');
    this.cachedId = user.id;
    return user;
  }

  async layUserId(): Promise<string> {
    if (this.cachedId) return this.cachedId;
    return (await this.layUser()).id;
  }

  /** `.env` là nguồn sự thật cho cài đặt — sửa file rồi restart là xong */
  private async dongBoCaiDat(user: User): Promise<void> {
    const tz = this.config.get<string>('TIMEZONE')!;
    const ngay = this.config.get<number>('MONTH_START_DAY')!;
    /**
     * ⚠️ Không dùng `?? null`: biến để trống trong `.env` là chuỗi RỖNG (`""`), không phải
     * `undefined` — `ConfigService.get()` rơi về đọc thẳng `process.env` (bỏ qua kết quả đã
     * validate/preprocess ở `env.ts`) khi giá trị đã validate là `undefined`, nên `.get()`
     * trả về `""` chứ không phải `undefined`. `"" ?? null` vẫn ra `""` (không phải giá trị
     * nullish) — gán thẳng vào cột `bigint` thì `transformer: money` áp `Number("")` = `0`,
     * user tưởng "để trống" mà tự nhiên thu nhập tháng thành 0.
     */
    const raw = this.config.get<number | string>('MONTHLY_INCOME');
    const thuNhap = raw ? Number(raw) : null;
    if (user.timezone === tz && user.monthStartDay === ngay && user.monthlyIncome === thuNhap) {
      return;
    }

    await this.users.update(
      { id: user.id },
      { timezone: tz, monthStartDay: ngay, monthlyIncome: thuNhap },
    );
    user.timezone = tz;
    user.monthStartDay = ngay;
    user.monthlyIncome = thuNhap;
    this.logger.log(`Đã đồng bộ cài đặt từ .env: ${tz}, ngày ${ngay}`);
  }

  /**
   * Liên kết tài khoản ngân hàng khai trong `.env`.
   *
   * Chỉ tạo khi chưa có. **Không cập nhật số dư** ở đây — số dư chỉ đến từ `accumulated`
   * của webhook, ghi tay một con số khởi tạo là quay lại đúng cái bẫy mà bản thiết kế này
   * sinh ra để tránh.
   */
  private async dongBoTaiKhoan(userId: string): Promise<void> {
    const accountNumber = this.config.get<string>('BANK_ACCOUNT_NUMBER')!;

    const daCo = await this.accounts.findOneBy({ accountNumber });
    if (daCo) return;

    await this.accounts.save(
      this.accounts.create({
        userId,
        accountNumber,
        bankName: this.config.get<string>('BANK_NAME')!,
        nickname: 'Tài khoản chính',
      }),
    );
    this.logger.log(`Đã liên kết tài khoản ${accountNumber} từ .env`);
  }
}
