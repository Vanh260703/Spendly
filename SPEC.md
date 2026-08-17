# Spendly — Đặc tả dự án

> **Source of truth** cho toàn bộ dự án. Mọi thay đổi về tính năng / data model / API phải cập nhật file này trước hoặc cùng lúc với code.

Ứng dụng web quản lý tài chính cá nhân (dùng riêng, 1 người dùng là chính nhưng vẫn có auth đầy đủ để có thể mở rộng). Ghi chép dòng tiền, xem chi tiêu theo ngày/tuần/tháng, lập ngân sách, đặt mục tiêu, và dùng **AI (Gemini)** để đánh giá tình hình tài chính + tư vấn chi tiêu.

---

## 1. Mục tiêu sản phẩm

| Mục tiêu | Đo bằng gì |
|---|---|
| Nhập liệu phải **nhanh**, nếu không sẽ bỏ giữa chừng | Thêm 1 giao dịch ≤ 3 thao tác, ≤ 10 giây |
| Trả lời được "tiền của tôi đi đâu?" | Dashboard theo ngày/tuần/tháng + biểu đồ theo danh mục |
| Không chỉ ghi chép mà còn **nói được khoản nào không cần thiết và cắt thế nào** | AI đánh giá theo tiền + tần suất, gợi ý kèm số tiền tiết kiệm được (§4.7) |
| Giữ được kỷ luật dài hạn | Ngân sách có cảnh báo + mục tiêu có tiến độ |
| Dữ liệu tài chính là dữ liệu nhạy cảm | Auth bắt buộc, mọi truy vấn scope theo `userId` |

**Không làm (out of scope):** **PWA / app cài đặt — chỉ dùng trên web bằng trình duyệt** (kéo theo: không có thông báo đẩy, không chạy offline); **import CSV/sao kê ngân hàng** (nhập tay, có template nhập nhanh); **nhiều ví / phân loại ví — chỉ MỘT ví chung, không theo dõi tiền nằm ở tiền mặt hay ngân hàng**; **tài sản ròng / net worth — app quản lý thu chi, không phải bảng cân đối tài sản**; **giao dịch định kỳ tự sinh** (dùng template nhập nhanh thay thế); **đính kèm ảnh hóa đơn** (kéo theo: không cần upload file, không cần S3/R2); kết nối trực tiếp API ngân hàng; đầu tư/chứng khoán; chia tiền nhóm; đa người dùng chung một sổ (family sharing); **đa tiền tệ — chỉ dùng VND**.

---

## 2. Tech stack

| Tầng | Công nghệ |
|---|---|
| Frontend | **Next.js 16** (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (brand token trong `@theme`) |
| Form | React Hook Form + Zod (`zodResolver`) |
| Data fetching | TanStack Query v5 |
| State | Zustand (persist cho session) |
| UI phụ | lucide-react (icon), sonner (toast), Recharts (biểu đồ) |
| Backend | **NestJS 11** + TypeScript (kiến trúc module) |
| Database | **PostgreSQL 16** + **TypeORM 0.3** (`@nestjs/typeorm`) |
| Cache | **Redis 7** — cache thống kê, cache AI, hạn mức AI/ngày, whitelist refresh token |
| Auth | JWT (access + refresh) qua Passport, argon2 hash |
| Validation | Zod (schema dùng chung FE ↔ BE qua thư mục `shared/`) |
| AI | **Google Gemini** qua endpoint OpenAI-compatible. Đổi nhà cung cấp = sửa 3 biến `LLM_*` trong `.env`, không đụng code |
| Dev | Postgres + Redis **chạy local** (Homebrew, cổng mặc định 5432/6379) — không dùng Docker |
| Deploy FE | **Cloudflare Pages** — Next.js `output: 'export'` (bản tĩnh, không cần adapter Workers) |
| Deploy BE | Tính sau (Railway hoặc VPS) — cần HTTPS vì cookie production dùng `SameSite=None` |

Cấu trúc repo:

```
Spendly/
├── SPEC.md              ← file này
├── CLAUDE.md            ← hướng dẫn cho Claude Code
├── FE/                  ← Next.js app (App Router)
│   └── src/
│       ├── app/         (app)/ route group cho khu vực đã đăng nhập
│       ├── components/  ui/ · layout/ · <feature>/
│       ├── hooks/       useAuth · useFinance (TanStack Query)
│       ├── lib/         api/ (client + endpoint) · format.ts
│       ├── stores/      auth-store (zustand persist)
│       └── types/
├── BE/                  ← NestJS API (prefix /api/v1)
│   └── src/
│       ├── config/     env schema (Zod)
│       ├── common/     helper THUẦN: transformers/, entities/, filters/,
│       │               interceptors/, decorators/, pipes/
│       ├── shared/     module HẠ TẦNG có provider: redis/ (sau: queue/, mail/)
│       ├── database/   data-source.ts, migrations/, seeds/
│       └── modules/    MỘT thư mục cho MỖI domain — feature-first
│                       {auth,users,wallets,categories,transactions,
│                        budgets,goals,debts,stats,ai,export}/
│                       └── {*.module.ts, *.controller.ts, *.service.ts,
│                            entities/, dto/}
└── shared/              ← Zod schema + type dùng chung FE/BE
```

### Quy ước TypeORM (chốt từ đầu, tránh sửa sau)

- **`synchronize: false` ở mọi môi trường.** Mọi thay đổi schema đi qua migration (`typeorm migration:generate`), commit vào `src/database/migrations/`.
- Entity đặt trong `modules/<tên>/entities/`, đăng ký qua `TypeOrmModule.forFeature([...])` trong module tương ứng.
- Truy vấn qua `Repository` inject vào service; báo cáo/tổng hợp dùng **QueryBuilder** hoặc raw SQL — không kéo hết dữ liệu về Node rồi tính bằng JS.
- Giao dịch DB dùng `DataSource.transaction()` (hoặc `QueryRunner`), **không** dùng decorator `@Transaction` đã deprecated.
- `BaseEntity` chung chứa `id` (uuid) + `createdAt` + `updatedAt`, các entity khác `extends`.

### Vai trò của Redis (đừng chỉ cài rồi bỏ đó)

| Mục đích | Chi tiết |
|---|---|
| Cache thống kê | Kết quả `/stats/*` cache key `stats:{userId}:{from}:{to}:{groupBy}`, TTL 5 phút, **invalidate ngay khi user thêm/sửa/xóa giao dịch** |
| Cache kết quả AI | Key `ai:{userId}:{kind}:{inputHash}`, TTL dài (7–30 ngày) — dữ liệu chưa đổi thì không gọi lại API |
| Hạn mức AI | Đếm số lượt gọi AI mỗi ngày/user để không đụng trần quota free |
| ~~Job queue~~ | **KHÔNG dùng BullMQ.** Hai việc chạy nền (chốt kỳ ngân sách · sinh báo cáo AI kỳ đã đóng) dùng `@nestjs/schedule` cho gọn — thêm cả một hệ thống hàng đợi cho hai cron là thừa. |
| Refresh token | Whitelist refresh token để logout thu hồi được ngay |

---

## 3. Data model (PostgreSQL — TypeORM entity)

Quy ước chung:
- Khóa chính `id` kiểu **UUID** (`@PrimaryGeneratedColumn('uuid')`).
- **Toàn hệ thống chỉ dùng một loại tiền: VND.** Không có cột `currency` ở bất kỳ đâu, không quy đổi tỷ giá.
- Tiền lưu cột **`bigint`, đơn vị đồng** — **không dùng `float`/`double`**, tránh sai số làm tròn. VND không có phần thập phân nên số nguyên là vừa đủ.
- Ở tầng TypeScript, tiền là **`number`**. Driver `pg` trả cột `bigint` về dạng `string`, nên mọi cột tiền dùng chung `MoneyTransformer` (`string ↔ number`) đặt ở `common/transformers/money.transformer.ts`:

```ts
// BE/src/common/transformers/money.transformer.ts
import { ValueTransformer } from 'typeorm';

export const money: ValueTransformer = {
  to:   (v?: number | null) => (v == null ? v : Math.round(v).toString()),
  from: (v?: string | null) => (v == null ? v : Number(v)),
};
```

  Giới hạn an toàn của `number` là 9.007.199.254.740.991 đồng (~9 triệu tỷ) — thực tế không bao giờ chạm tới, đổi lại tránh được toàn bộ rắc rối `JSON.stringify` không serialize được `BigInt`. Cột DB vẫn là `bigint` nên nếu sau này cần đổi sang `BigInt`/`string` thì chỉ sửa transformer, **không phải migrate schema**.
- Mọi bảng thuộc về user đều có `userId` + index và quan hệ `onDelete: 'CASCADE'`.

### BaseEntity — lớp cha chung cho mọi entity
```ts
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;                    // khóa chính dạng UUID, VD "a3f5c1e2-..."

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;               // thời điểm tạo bản ghi, TypeORM tự set

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;               // thời điểm sửa lần cuối, TypeORM tự cập nhật
}
```

> **Về `icon` và `color`** (xuất hiện ở Category / Goal): đây là dữ liệu phục vụ hiển thị, không ảnh hưởng logic.
> - `icon` — tên icon của thư viện **lucide-react**, VD `"utensils"` (ăn uống), `"coffee"` (cà phê), `"car"` (di chuyển). FE tra tên này ra component icon để render.
> - `color` — mã màu hex, VD `"#22c55e"`. Dùng cho chấm màu cạnh tên, và **màu lát bánh trong biểu đồ tròn** — nhờ vậy màu của một danh mục luôn giống nhau ở mọi biểu đồ.

### User — người dùng
```ts
@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  email: string;                 // email đăng nhập, không trùng nhau

  @Column()
  passwordHash: string;          // mật khẩu đã băm bằng argon2id — KHÔNG BAO GIỜ lưu mật khẩu gốc,
                                 // và không bao giờ trả field này ra API

  @Column()
  name: string;                  // tên hiển thị, VD "Việt Anh"

  @Column({ nullable: true })
  avatarUrl?: string;            // link ảnh đại diện, có thể để trống

  @Column({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;              // múi giờ — quyết định "hôm nay" bắt đầu lúc mấy giờ khi tính báo cáo

  @Column({ type: 'int', default: 1 })
  monthStartDay: number;         // ngày bắt đầu chu kỳ tháng (1–28).
                                 // = 1  → tháng dương lịch bình thường
                                 // = 25 → "tháng" chạy từ 25 tháng này tới 24 tháng sau (theo ngày nhận lương)

  @Column({ type: 'bigint', nullable: true, transformer: money })
  monthlyIncome?: number;        // thu nhập hàng tháng ước tính — hỏi lúc onboarding, dùng để gợi ý
                                 // ngân sách 50/30/20 và để AI quy đổi "% trên thu nhập"

  @Column({ type: 'timestamptz', nullable: true })
  onboardedAt?: Date;            // null = chưa qua onboarding → FE điều hướng vào màn hình thiết lập

  // Số dư ban đầu nằm ở `Wallet` (quan hệ 1–1), không phải ở đây.
}
```

### Wallet — ví chung
```ts
@Entity('wallets')
@Unique(['userId'])              // CỐ Ý chỉ 1 ví cho mỗi user
export class Wallet extends BaseEntity {
  @Column('uuid') userId: string;
  @OneToOne(() => User, { onDelete: 'CASCADE' }) user: User;

  @Column({ default: 'Ví chính' })
  name: string;                  // tên hiển thị, chủ yếu để giao diện có gì đó mà gọi tên

  @Column({ type: 'bigint', default: 0, transformer: money })
  initialBalance: number;        // TỔNG TIỀN ĐANG CÓ lúc bắt đầu dùng app — hỏi lúc onboarding:
                                 // "Hiện tại bạn có tổng cộng bao nhiêu tiền?"
                                 // Cần vì lịch sử trước khi cài app không được ghi; không có nó thì
                                 // app chỉ biết CHÊNH LỆCH thu-chi chứ không biết đang cầm bao nhiêu.

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;              // mốc ứng với initialBalance; giao dịch từ mốc này mới được cộng dồn
}
```

**Chỉ một ví, không chia loại.** App không theo dõi tiền đang nằm ở tiền mặt hay ngân hàng hay Momo — chỉ cần biết tổng có bao nhiêu. Ví tạo tự động lúc đăng ký, `transaction.walletId` do BE tự điền nên người dùng không phải chọn ví khi nhập liệu.

Tách thành entity riêng thay vì để cột trên `User` vì số dư là khái niệm độc lập với hồ sơ; nếu sau này cần nhiều ví thì chỉ việc bỏ `@Unique(['userId'])`, không phải chuyển cột giữa các bảng.

**Ba con số trên dashboard** — đều tính ra, không lưu cột nào:

```
số tiền hiện có = wallet.initialBalance + Σthu − Σchi      [từ startedAt tới nay]
đã cam kết      = Σ goal.currentAmount  [status = ACTIVE]
tự do tiêu      = số tiền hiện có − đã cam kết
```

Không denormalize thành cột `balance` vì app chỉ một người dùng, số giao dịch nhỏ, một câu `SUM()` có index là đủ nhanh — đổi lại không bao giờ có chuyện số dư lệch khỏi lịch sử. Nếu chậm thì cache Redis, không thêm cột.

**Điều chỉnh số dư** — thực tế sẽ có lúc quên nhập vài khoản, khiến số app tính ra lệch với tiền thật. Khi đó user nhập số thực tế đang có, app tự tạo **một giao dịch bù** đúng bằng phần chênh lệch:

```
chênh lệch = số thực tế user khai − số app đang tính
> 0 → tạo giao dịch INCOME  (app tính thiếu, có khoản thu quên nhập)
< 0 → tạo giao dịch EXPENSE (app tính thừa, có khoản chi quên nhập)
```

Giao dịch bù dùng danh mục hệ thống **"Điều chỉnh số dư"** (`isSystem = true`) và **bị loại khỏi mọi thống kê + prompt AI** — nếu không, một lần điều chỉnh 2tr sẽ bị AI hiểu nhầm thành "tháng này bạn tiêu 2tr vào việc gì đó" và làm hỏng toàn bộ phân tích. Không cần entity mới, chỉ là một danh mục đặc biệt.

#### Ba cách tiền thay đổi — đừng dùng nhầm

`wallet.initialBalance` là **mốc xuất phát, đặt MỘT LẦN** lúc onboarding. Lương tháng sau về thì ghi giao dịch, **không** sửa `initialBalance`.

| Tình huống | Dùng | Tác động |
|---|---|---|
| Lương / thưởng / được cho tiền | `POST /transactions` (`income`) | Cộng số dư từ ngày giao dịch |
| **Khai sai** số dư lúc onboarding | `PATCH /wallet` → `initialBalance` | **Dịch chuyển toàn bộ lịch sử** |
| App **lệch** tiền thật do quên nhập | `POST /transactions/adjust-balance` | Bù tại một ngày cụ thể |

Hai dòng cuối dễ nhầm nhưng hậu quả khác hẳn:

```
Sửa initialBalance 12tr → 14tr
  → mọi kỳ quá khứ đều +2tr, báo cáo tháng 8/9/10 đều đổi số   ← viết lại lịch sử

adjust-balance ngày 13/09 (+2tr)
  → 1 giao dịch bù tại 13/09, báo cáo tháng 8 giữ nguyên       ← lịch sử còn đúng
```

`PATCH /wallet` chỉ dành cho trường hợp gõ nhầm lúc onboarding. Sai sót phát sinh trong quá trình dùng **luôn** phải xử lý bằng `adjust-balance`, vì nó xảy ra tại một thời điểm cụ thể chứ không phải từ đầu.

### Category — danh mục
```ts
export enum CategoryType {
  INCOME  = 'income',   // danh mục tiền vào
  EXPENSE = 'expense',  // danh mục tiền ra
}

export enum CategoryKind {   // phân loại theo khung 50/30/20 — đầu vào quan trọng cho phân tích AI
  NEED   = 'need',      // NHU CẦU thiết yếu: tiền nhà, điện nước, ăn cơ bản, đi làm  (mục tiêu ~50% thu nhập)
  WANT   = 'want',      // MONG MUỐN, cắt được: cà phê, xem phim, mua sắm không cần thiết  (~30%)
  SAVING = 'saving',    // TIẾT KIỆM / trả nợ                                            (~20%)
}

@Entity('categories')
@Index(['userId', 'type'])
export class Category extends BaseEntity {
  @Column('uuid')
  userId: string;                // danh mục này của ai

  @Column()
  name: string;                  // tên danh mục, VD "Ăn uống", "Lương"

  @Column({ type: 'enum', enum: CategoryType })
  type: CategoryType;            // thu hay chi — form nhập liệu lọc theo field này
                                 // (chọn "chi" thì chỉ hiện danh mục EXPENSE)

  @Column({ type: 'enum', enum: CategoryKind, default: CategoryKind.NEED })
  kind: CategoryKind;            // cần / muốn / tiết kiệm. Nhờ có nó, app trả lời được câu
                                 // "bao nhiêu % tiền tôi tiêu là thứ có thể cắt bỏ?"

  @Column()
  icon: string;                  // tên icon lucide-react, VD "utensils" (ăn uống), "car" (di chuyển)

  @Column()
  color: string;                 // mã màu hex — cũng là màu của danh mục này trong biểu đồ tròn

  @Column({ type: 'uuid', nullable: true })
  parentId?: string;             // ID danh mục cha, để làm danh mục 2 cấp.
                                 // VD "Ăn uống" (cha) → "Ăn ngoài" / "Đi chợ" (con).
                                 // null = danh mục cấp 1.

  @Column({ default: false })
  isDefault: boolean;            // true = danh mục hệ thống seed sẵn khi tạo tài khoản.
                                 // Dùng để chặn user xóa mất danh mục "Khác" — chỗ hứng giao dịch
                                 // khi một danh mục khác bị xóa.

  @Column({ default: false })
  isSystem: boolean;             // true = danh mục KỸ THUẬT, bị loại khỏi mọi thống kê và prompt AI.
                                 // Hiện chỉ dùng cho "Điều chỉnh số dư" — giao dịch bù chênh lệch
                                 // không phải khoản thu/chi thật nên không được tính vào phân tích.
                                 // Không hiện trong form nhập liệu thường.
}
```
**Seed khi tạo user** — cả hai chiều tiền, để nhập liệu được ngay mà không phải tự tạo danh mục:

| Loại | Danh mục |
|---|---|
| `EXPENSE` (chi) | Ăn uống · Di chuyển · Hóa đơn & tiện ích · Nhà ở · Mua sắm · Giải trí · Sức khỏe · Giáo dục · **Khác (chi)** |
| `INCOME` (thu) | Lương · Thưởng · Freelance · Đầu tư · Được tặng · **Khác (thu)** |

Hai danh mục "Khác" đặt `isDefault = true` (không cho xóa) — chúng là chỗ hứng giao dịch khi một danh mục khác bị xóa. Thêm một danh mục `isSystem = true` tên **"Điều chỉnh số dư"**, ẩn khỏi form nhập liệu và khỏi mọi thống kê.

Gợi ý `kind` mặc định: Ăn uống/Nhà ở/Hóa đơn/Sức khỏe/Di chuyển → `NEED`; Giải trí/Mua sắm → `WANT`; danh mục thu → `NEED` (không dùng tới, `kind` chỉ có ý nghĩa với danh mục chi).

### Transaction — giao dịch
```ts
export enum TxType {
  INCOME  = 'income',     // tiền vào
  EXPENSE = 'expense',    // tiền ra
}

@Entity('transactions')
@Index(['userId', 'date'])                  // cho màn hình danh sách + lọc theo khoảng ngày
@Index(['userId', 'categoryId', 'date'])    // cho biểu đồ chi theo danh mục
export class Transaction extends BaseEntity {
  @Column('uuid')
  userId: string;                // giao dịch này của ai

  @Column('uuid')
  categoryId: string;            // thuộc danh mục nào — BẮT BUỘC, vì toàn bộ phân tích
                                 // và gợi ý của AI đều dựa trên danh mục

  @Column({ type: 'enum', enum: TxType })
  type: TxType;                  // thu hay chi

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // số tiền, LUÔN LƯU SỐ DƯƠNG. Hướng tiền suy ra từ `type`,
                                 // không dùng số âm — tránh nhầm lẫn khi cộng dồn.

  @Column({ type: 'timestamptz' })
  date: Date;                    // thời điểm giao dịch xảy ra (do user chọn — có thể nhập bù cho hôm qua).
                                 // Khác với createdAt là lúc bấm lưu. Mọi báo cáo dùng field này.

  @Column({ nullable: true })
  note?: string;                 // ghi chú tự do, VD "Ăn trưa với team"

  @Column('text', { array: true, default: '{}' })
  tags: string[];                // nhãn phụ để lọc chéo danh mục, VD ["du-lịch-đà-lạt", "công-việc"].
                                 // Một giao dịch chỉ có 1 danh mục nhưng có nhiều tag.
}
```


### Budget — ngân sách
```ts
export enum BudgetPeriod { WEEKLY = 'weekly', MONTHLY = 'monthly' }

@Entity('budgets')
@Index(['userId', 'isActive'])
export class Budget extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  categoryId?: string;           // đặt hạn mức cho danh mục nào, VD "Ăn uống ≤ 3tr/tháng".
                                 // null = NGÂN SÁCH TỔNG, áp cho toàn bộ chi tiêu.

  @Column({ type: 'enum', enum: BudgetPeriod, default: BudgetPeriod.MONTHLY })
  period: BudgetPeriod;          // chu kỳ lặp lại của hạn mức: mỗi tuần hay mỗi tháng

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // hạn mức được tiêu trong một kỳ, VD 3000000

  @Column({ type: 'timestamptz' })
  startDate: Date;               // bắt đầu áp dụng từ khi nào

  @Column({ default: false })
  rollover: boolean;             // true = phần CHƯA TIÊU HẾT được cộng sang kỳ sau.
                                 // VD hạn mức 3tr, tháng này tiêu 2.5tr → tháng sau được 3.5tr.
                                 // false = mỗi kỳ reset về đúng `amount`.

  @Column({ type: 'float', default: 0.8 })
  alertThreshold: number;        // ngưỡng cảnh báo sớm, tính theo tỉ lệ. 0.8 = báo khi đã tiêu 80% hạn mức,
                                 // để còn kịp phanh trước khi vượt.

  @Column({ default: true })
  isActive: boolean;             // false = tạm tắt ngân sách này, không tính và không cảnh báo nữa
}
```

### BudgetPeriodResult — kết quả kỳ ngân sách đã đóng
```ts
@Entity('budget_period_results')
@Unique(['budgetId', 'periodStart'])   // job chạy 2 lần cũng không tạo bản ghi trùng
@Index(['userId', 'periodStart'])
export class BudgetPeriodResult extends BaseEntity {
  @Column('uuid') userId: string;

  @Column({ type: 'uuid', nullable: true })
  budgetId?: string;             // onDelete: 'SET NULL' — xóa ngân sách thì lịch sử VẪN CÒN

  @Column({ type: 'uuid', nullable: true }) categoryId?: string;
  @Column({ nullable: true })
  categoryName?: string;         // snapshot dạng text — danh mục có thể bị đổi tên/xóa sau này.
                                 // null = ngân sách tổng.

  @Column({ type: 'enum', enum: BudgetPeriod }) period: BudgetPeriod;
  @Column({ type: 'timestamptz' }) periodStart: Date;
  @Column({ type: 'timestamptz' }) periodEnd: Date;

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // hạn mức GỐC tại thời điểm đó (chưa cộng rollover)

  @Column({ type: 'bigint', default: 0, transformer: money })
  rolloverIn: number;            // mang sang TỪ kỳ trước, có dấu (âm = kỳ trước vượt)

  @Column({ type: 'bigint', transformer: money })
  effectiveAmount: number;       // = amount + rolloverIn, hạn mức thực tế của kỳ

  @Column({ type: 'bigint', transformer: money })
  spent: number;                 // đã tiêu thực tế (đã loại danh mục isSystem)

  @Column({ type: 'bigint', default: 0, transformer: money })
  rolloverOut: number;           // chuyển SANG kỳ sau = clamp(effectiveAmount − spent, ±cap)
}
```
Xem §4.4 để biết công thức rollover và cách job chốt kỳ hoạt động.

### Goal — mục tiêu
```ts
export enum GoalHorizon {
  SHORT = 'short',      // NGẮN HẠN, dưới 1 năm: mua laptop, đi du lịch
  LONG  = 'long',       // DÀI HẠN: quỹ dự phòng 6 tháng lương, tiền mua nhà
}

export enum GoalStatus {
  ACTIVE    = 'active',     // đang theo đuổi
  ACHIEVED  = 'achieved',   // đã đạt đủ số tiền 🎉
  PAUSED    = 'paused',     // tạm hoãn, giữ nguyên tiến độ
  CANCELLED = 'cancelled',  // bỏ hẳn
}

@Entity('goals')
@Index(['userId', 'status'])
export class Goal extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column()
  name: string;                  // tên mục tiêu, VD "Mua Macbook", "Quỹ dự phòng"

  @Column({ nullable: true })
  description?: string;          // mô tả thêm, lý do đặt mục tiêu

  @Column({ type: 'enum', enum: GoalHorizon })
  horizon: GoalHorizon;          // ngắn hạn / dài hạn — để tách 2 nhóm trên giao diện

  @Column({ type: 'bigint', transformer: money })
  targetAmount: number;          // SỐ TIỀN CẦN ĐẠT, VD 35000000

  @Column({ type: 'bigint', default: 0, transformer: money })
  currentAmount: number;         // ĐÃ GOM ĐƯỢC bao nhiêu.
                                 // Tiến độ hiển thị = currentAmount / targetAmount

  @Column({ type: 'timestamptz', nullable: true })
  deadline?: Date;               // hạn chót muốn đạt được. Có nó thì app tính được
                                 // "cần để dành X đồng/tháng mới kịp" và cảnh báo khi đang chậm tiến độ.

  @Column({ type: 'bigint', nullable: true, transformer: money })
  monthlyContribution?: number;  // số tiền DỰ ĐỊNH trích mỗi tháng — dùng để dự báo ngày hoàn thành

  @Column({ type: 'enum', enum: GoalStatus, default: GoalStatus.ACTIVE })
  status: GoalStatus;            // trạng thái (xem enum trên)

  @Column()
  icon: string;                  // tên icon lucide-react, VD "laptop", "plane", "shield"

  @Column()
  color: string;                 // mã màu hex cho thanh tiến độ

  @OneToMany(() => GoalContribution, (c) => c.goal)
  contributions: GoalContribution[];   // danh sách các lần nạp tiền vào mục tiêu này
}

@Entity('goal_contributions')    // LỊCH SỬ NẠP TIỀN — để biết đã bỏ vào lúc nào, bao nhiêu,
                                 // và vẽ được biểu đồ tiến độ theo thời gian thay vì chỉ một con số
export class GoalContribution extends BaseEntity {
  @ManyToOne(() => Goal, { onDelete: 'CASCADE' })
  goal: Goal;                    // thuộc mục tiêu nào; xóa mục tiêu thì lịch sử xóa theo

  @Column('uuid')
  goalId: string;

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // số tiền nạp lần này

  @Column({ type: 'timestamptz' })
  date: Date;                    // ngày nạp

  @Column({ nullable: true })
  note?: string;                 // ghi chú, VD "Tiền thưởng tết"
}
```

### Debt — khoản nợ
```ts
export enum DebtStrategy {
  SNOWBALL  = 'snowball',   // "quả cầu tuyết": dồn tiền trả KHOẢN NHỎ NHẤT trước.
                            // Tốn lãi hơn nhưng nhanh thấy kết quả → dễ giữ động lực.
  AVALANCHE = 'avalanche',  // "tuyết lở": dồn trả khoản LÃI SUẤT CAO NHẤT trước.
                            // Tối ưu về tiền — tổng lãi phải trả ít nhất.
}

@Entity('debts')
@Index(['userId', 'isPaid'])
export class Debt extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column()
  name: string;                  // tên khoản nợ, VD "Vay mua xe"

  @Column({ nullable: true })
  lender?: string;               // chủ nợ: tên ngân hàng, hoặc tên người quen

  @Column({ type: 'bigint', transformer: money })
  principal: number;             // TIỀN GỐC vay ban đầu, VD 200000000

  @Column({ type: 'bigint', transformer: money })
  remaining: number;             // CÒN NỢ BAO NHIÊU tại thời điểm hiện tại.
                                 // Mỗi lần ghi DebtPayment thì trừ bớt field này.

  @Column({ type: 'float' })
  interestRate: number;          // lãi suất %/NĂM, VD 9.5. Dùng để tính tổng lãi phải trả
                                 // và để xếp thứ tự ưu tiên khi dùng chiến lược AVALANCHE.

  @Column({ type: 'bigint', transformer: money })
  minPayment: number;            // số tiền TỐI THIỂU phải trả mỗi tháng theo hợp đồng

  @Column({ type: 'int' })
  dueDay: number;                // NGÀY ĐẾN HẠN trong tháng (1–28), VD 15 = phải trả trước ngày 15 hằng tháng.
                                 // Dùng để nhắc trước vài ngày, tránh trả trễ bị phạt.

  @Column({ type: 'enum', enum: DebtStrategy, default: DebtStrategy.AVALANCHE })
  strategy: DebtStrategy;        // chiến lược ưu tiên trả nợ (xem enum trên)

  @Column({ default: false })
  isPaid: boolean;               // true = đã trả xong, ẩn khỏi danh sách đang nợ

  @Column({ type: 'timestamptz' })
  startDate: Date;               // ngày bắt đầu vay
}

@Entity('debt_payments')         // LỊCH SỬ TRẢ NỢ — mỗi lần trả một bản ghi,
                                 // để đối chiếu `remaining` và vẽ biểu đồ nợ giảm dần
export class DebtPayment extends BaseEntity {
  @Column('uuid')
  debtId: string;                // trả cho khoản nợ nào

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // số tiền trả lần này

  @Column({ type: 'timestamptz' })
  date: Date;                    // ngày trả
}
```



### Contact — danh bạ bạn bè
```ts
@Entity('contacts')
@Unique(['userId', 'nameNormalized'])   // chống trùng do hoa/thường/khoảng trắng
@Index(['userId', 'isArchived'])
export class Contact extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column()
  name: string;                  // tên hiển thị đúng như user gõ, VD "Anh Tuấn"

  @Column()
  nameNormalized: string;        // `trim().toLowerCase()` — CHỈ để chống trùng.
                                 // KHÔNG bỏ dấu: "Tuấn" và "Tuan" có thể là hai người thật,
                                 // gộp nhầm thì công nợ sai và rất khó lần ra.

  @Column({ type: 'varchar', nullable: true })
  phone?: string | null;         // số điện thoại, để tiện nhắn đòi tiền

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;          // ghi chú tự do, VD "bạn cùng phòng"

  @Column({ default: '#64748b' })
  color: string;                 // màu avatar chữ cái đầu, cho dễ nhận mặt trong danh sách dài

  @Column({ default: false })
  isArchived: boolean;           // ẩn khỏi ô chọn người nhưng GIỮ lịch sử.
                                 // Xóa hẳn bị chặn khi công nợ ≠ 0.
}
```
**Đây KHÔNG phải tài khoản** — không đăng ký, không mời, không email, không đồng bộ. Chỉ là
sổ tên của riêng user. `id` là số nội bộ, người dùng không bao giờ nhìn thấy.

### SharedExpense — một lần chi chung (trả hộ / được trả hộ)
```ts
@Entity('shared_expenses')
@Index(['userId', 'date'])
export class SharedExpense extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  payerContactId?: string | null;  // NULL = BẠN là người trả.
                                   // Có giá trị = người đó trả hộ bạn.

  @Column({ type: 'bigint', transformer: money })
  totalAmount: number;             // tổng hóa đơn, VD 1000000

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;            // VD "Ăn tối sinh nhật Tuấn"

  @Column('uuid')
  categoryId: string;              // danh mục cho phần bạn THỰC ĂN

  @Column({ type: 'bigint', transformer: money, default: 0 })
  treatAmount: number;             // phần bạn MỜI — tiền bạn tiêu thật, không ai trả lại.
                                   // Ràng buộc: treatAmount ≤ phần của bạn.

  @Column({ type: 'uuid', nullable: true })
  treatCategoryId?: string | null; // bắt buộc khi treatAmount > 0.
                                   // Tách riêng để AI phân biệt "ăn nhiều" với "mời nhiều" —
                                   // hai vấn đề khác nhau, hai lời khuyên khác nhau.

  // Ba giao dịch do bản ghi này sinh ra (chỉ khi BẠN trả). FK RESTRICT — xóa giao dịch
  // trực tiếp bị chặn, phải xóa qua SharedExpense để không lệch số dư.
  @Column({ type: 'uuid', nullable: true })
  transactionIdMine?: string | null;   // phần thực ăn

  @Column({ type: 'uuid', nullable: true })
  transactionIdTreat?: string | null;  // phần mời

  @Column({ type: 'uuid', nullable: true })
  transactionIdLent?: string | null;   // phần cho mượn (danh mục hệ thống)
}

@Entity('shared_expense_shares')  // PHẦN CỦA TỪNG NGƯỜI trong một lần chi chung
@Unique(['sharedExpenseId', 'contactId'])
export class SharedExpenseShare extends BaseEntity {
  @Column('uuid')
  sharedExpenseId: string;

  @Column({ type: 'uuid', nullable: true })
  contactId?: string | null;     // NULL = phần của BẠN

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // BẤT BIẾN: Σ amount của mọi share = totalAmount.
                                 // Lệch một đồng là công nợ sai vĩnh viễn.
}
```

### Settlement — một lần trả tiền tất toán
```ts
export enum SettlementDirection {
  THEY_PAID_ME = 'they_paid_me', // họ trả lại tiền cho bạn  → giao dịch THU
  I_PAID_THEM  = 'i_paid_them',  // bạn trả lại tiền cho họ  → giao dịch CHI
}

@Entity('settlements')
@Index(['userId', 'contactId', 'date'])
export class Settlement extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column('uuid')
  contactId: string;

  @Column({ type: 'enum', enum: SettlementDirection })
  direction: SettlementDirection;

  @Column({ type: 'bigint', transformer: money })
  amount: number;                // LUÔN DƯƠNG — hướng suy ra từ `direction`,
                                 // theo đúng quy ước đã dùng cho Transaction.type

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;

  @Column('uuid')
  transactionId: string;         // tất toán LUÔN có tiền di chuyển → luôn sinh giao dịch
}
```

### AiInsight — kết quả phân tích AI
```ts
export enum InsightKind {
  WEEKLY       = 'weekly',        // báo cáo tuần
  MONTHLY      = 'monthly',       // báo cáo tháng
  ANOMALY      = 'anomaly',       // phát hiện chi tiêu bất thường
  FORECAST     = 'forecast',      // dự báo dòng tiền kỳ tới
  HEALTH_SCORE = 'health_score',  // điểm sức khỏe tài chính
}

@Entity('ai_insights')
@Unique(['userId', 'kind', 'inputHash'])     // cùng loại + cùng dữ liệu đầu vào → chỉ lưu 1 bản, không gọi API lại
@Index(['userId', 'kind', 'periodStart'])    // để tra nhanh "báo cáo tháng 7 đâu rồi"
export class AiInsight extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column({ type: 'enum', enum: InsightKind })
  kind: InsightKind;             // loại phân tích (xem enum trên)

  @Column({ type: 'timestamptz' })
  periodStart: Date;             // phân tích cho khoảng thời gian nào — từ ngày

  @Column({ type: 'timestamptz' })
  periodEnd: Date;               // — đến ngày

  @Column()
  inputHash: string;             // DẤU VÂN TAY của dữ liệu đã gửi cho AI (băm từ các con số tổng hợp).
                                 // Trước khi gọi API: băm dữ liệu hiện tại, nếu trùng hash đã có
                                 // → trả bản cũ luôn. Đây là cơ chế chính giúp không đụng trần quota.

  @Column('text')
  content: string;               // nội dung AI trả về, định dạng markdown để FE render đẹp

  @Column({ type: 'jsonb', nullable: true })
  structured?: {                 // bản CÓ CẤU TRÚC của cùng kết quả đó, để FE vẽ biểu đồ/thanh điểm
    healthScore: number;         // điểm sức khỏe tài chính 0–100
    breakdown: Record<string, number>;  // điểm thành phần, VD { tietKiem: 25, nganSach: 18, duPhong: 12 }
    suggestions: string[];       // danh sách việc nên làm, mỗi câu một mục
  };

  @Column()
  model: string;                 // tên model đã dùng — để biết kết quả cũ sinh ra từ đâu khi đổi model

  @Column({ type: 'int' })
  tokensUsed: number;            // số token đã tiêu — theo dõi mức dùng, biết khi nào sắp cạn quota free
}
```
Postgres là nơi lưu bền; Redis là lớp cache đọc phía trước (§2).

### ChatMessage — hội thoại với AI
```ts
@Entity('chat_messages')
@Index(['userId', 'conversationId', 'createdAt'])   // lấy đúng thứ tự tin nhắn của một cuộc trò chuyện
export class ChatMessage extends BaseEntity {
  @Column('uuid')
  userId: string;

  @Column('uuid')
  conversationId: string;        // gom nhiều tin nhắn thành MỘT CUỘC TRÒ CHUYỆN.
                                 // Cần vì mỗi lần hỏi tiếp, phải gửi lại các tin trước làm ngữ cảnh
                                 // thì AI mới hiểu được câu kiểu "thế còn tháng trước?".

  @Column()
  role: 'user' | 'assistant';    // ai nói câu này — 'user' là bạn, 'assistant' là AI

  @Column('text')
  content: string;               // nội dung tin nhắn
}
```

---

## 4. Tính năng

### 4.1 Auth & tài khoản
- Đăng ký / đăng nhập bằng email + mật khẩu (argon2id).
- JWT: access token 15 phút (giữ trong memory/zustand), refresh token 7 ngày (httpOnly cookie) + **whitelist trong Redis** để logout thu hồi được ngay.
- `JwtAuthGuard` đặt global (`APP_GUARD`); endpoint công khai đánh dấu bằng decorator `@Public()`.
- **Mọi query bắt buộc filter theo `userId` lấy từ token**, không bao giờ tin `userId` gửi từ client.
- Đổi mật khẩu, quên mật khẩu (gửi email — có thể để phase sau).
- **Onboarding sau khi đăng ký**: hỏi đúng 2 câu — *"Hiện tại bạn có tổng cộng bao nhiêu tiền?"* (→ `initialBalance`, `startedAt`) và *"Thu nhập hàng tháng khoảng bao nhiêu?"* (→ để gợi ý ngân sách 50/30/20). Cho phép bỏ qua và điền sau.
- Cài đặt cá nhân: múi giờ, ngày bắt đầu chu kỳ tháng, số dư ban đầu.

### 4.2 Nhập liệu dòng tiền

Mô hình cố ý giữ tối giản: **hai chiều tiền — thu và chi**, một ví chung, không theo dõi tiền nằm ở đâu. Một giao dịch = loại + số tiền + danh mục + ngày. Càng ít trường bắt buộc thì càng dễ duy trì thói quen nhập mỗi ngày.

| `type` | Tác động số dư | Ví dụ |
|---|---|---|
| `INCOME` | **cộng** | lương, thưởng tháng, freelance, được người khác cho tiền |
| `EXPENSE` | **trừ** | ăn uống, cà phê, xăng xe, hóa đơn |

`amount` **luôn lưu số dương** ở cả hai loại — hướng tiền suy ra từ `type`, không dùng số âm. Có cả số âm lẫn `type` là có hai nguồn sự thật, mọi phép cộng dồn đều rủi ro.

- CRUD giao dịch: loại (thu/chi), số tiền, danh mục, ngày, ghi chú, tag.
- **Nhập nhanh**: template giao dịch hay lặp (VD "Ăn trưa 50k"), 1 chạm là xong.
- **Điều chỉnh số dư**: khi số app tính lệch với tiền thật (do quên nhập), user khai số thực tế → app tạo giao dịch bù bằng danh mục hệ thống "Điều chỉnh số dư", loại khỏi thống kê và AI (§3).

### 4.3 Xem & phân tích
- **Dashboard**: **số tiền hiện có** (nổi bật nhất — `initialBalance` + Σthu − Σchi), rồi tổng thu / tổng chi / chênh lệch theo kỳ đang chọn (hôm nay · tuần này · tháng này · tùy chọn khoảng).
- **Biểu đồ**:
  - Tròn (donut): tỷ trọng chi theo danh mục.
  - Cột/đường: xu hướng thu–chi theo ngày trong tháng, hoặc theo tháng trong năm.
  - So sánh: tháng này vs tháng trước vs trung bình 3 tháng gần nhất.
  - **Calendar heatmap**: mức chi từng ngày trong tháng.
  - Tỷ lệ need/want/saving (so với khung 50/30/20).
- **Tần suất, không chỉ tổng tiền**: mỗi danh mục thống kê thêm **số lần giao dịch** và **số tiền trung bình mỗi lần**. Đây là dữ liệu để AI nói được "tuần này cà phê 11 lần" chứ không chỉ "cà phê 550k" — §4.7.
- **Danh sách giao dịch**: lọc theo khoảng ngày, danh mục, tag, khoảng số tiền; tìm kiếm theo ghi chú; nhóm theo ngày; phân trang cursor-based.
- **Export**: PDF (báo cáo tháng/năm) và Excel/CSV (dữ liệu thô), render qua job nền.

Toàn bộ tổng hợp dùng **QueryBuilder `GROUP BY` / raw SQL**, không kéo hết giao dịch về Node rồi tính bằng JS.

### 4.4 Ngân sách

Ngân sách là hạn mức **lặp lại mỗi kỳ**, không phải một khoảng thời gian chạy một lần rồi hết. "Ăn uống 3tr/tháng" nghĩa là tháng nào cũng 3tr, hết kỳ thì reset.

**Ranh giới kỳ:**

| `period` | Kỳ chạy từ → đến |
|---|---|
| `MONTHLY` | Theo `user.monthStartDay`. `= 1` → 01/08–31/08 · `= 25` → 25/07–24/08 (theo ngày nhận lương) |
| `WEEKLY` | Thứ Hai → Chủ nhật |

`budget.startDate` chỉ là mốc "từ lúc này ngân sách có hiệu lực", **không** định nghĩa ranh giới kỳ.

**Tạo ngân sách giữa kỳ** (đã chốt): `spent` tính **trọn kỳ**, kể cả phần đã tiêu trước khi tạo ngân sách. Tạo ngân sách 3tr vào 13/08 mà từ 01/08 đã tiêu 2,4tr thì hiện ngay **80%**. Lý do: con số phải nói đúng sự thật về tháng 8 — hiện 0% sẽ khiến user tưởng còn nguyên hạn mức. Đồng thời mọi kỳ tính giống nhau, không có ngoại lệ cho kỳ đầu.

- Đặt hạn mức theo danh mục hoặc tổng (`categoryId: null`), chu kỳ tuần/tháng.
- Thanh tiến độ theo màu: xanh (<70%) → vàng (70–100%) → đỏ (vượt).
- Cảnh báo khi chạm ngưỡng `alertThreshold` và khi vượt hạn mức.
- Gợi ý ngân sách mặc định theo khung **50/30/20** dựa trên thu nhập trung bình 3 tháng.

#### Rollover — cộng dồn chênh lệch (tùy chọn từng ngân sách)

`rollover = false` (mặc định): mỗi kỳ reset về đúng `amount`, dư thì mất.

`rollover = true`: chênh lệch chuyển sang kỳ sau **cả hai chiều** — dư thì cộng, **vượt thì trừ**. Chỉ cộng khi dư mà không trừ khi vượt sẽ biến ngân sách thành phần thưởng một chiều, dùng vài kỳ là hạn mức phồng lên và mất tác dụng kiểm soát.

```
effectiveAmount = amount + rolloverIn                  ← hạn mức thực tế của kỳ
rolloverOut     = clamp(effectiveAmount − spent, ±cap) ← chuyển sang kỳ sau
cap             = rolloverCapRatio × amount            ← mặc định 0.5 (±50%)
```

`rolloverIn` của kỳ N chính là `rolloverOut` của kỳ N−1. Kỳ đầu tiên `rolloverIn = 0`.

Ví dụ hạn mức gốc 3tr, `cap = ±1,5tr`:

| Kỳ | rolloverIn | effectiveAmount | spent | rolloverOut |
|---|---|---|---|---|
| T8 | 0 | 3.000k | 2.500k | **+500k** |
| T9 | +500k | 3.500k | 3.800k | **−300k** |
| T10 | −300k | 2.700k | 2.000k | **+700k** |
| T11 | +700k | 3.700k | — | — |

**Trần ±50%** để tiết kiệm nhiều kỳ liền không đẩy hạn mức lên gấp đôi gấp ba — khi đó cảnh báo gần như không bao giờ nổ và ngân sách hết ý nghĩa nhắc nhở. Với hạn mức 3tr, hạn mức thực tế luôn nằm trong [1,5tr – 4,5tr].

#### Lịch sử hạn mức — `BudgetPeriodResult`

`budget.amount` là hạn mức **hiện tại**, sửa là ghi đè. Nửa năm sau lương tăng, user đổi 3tr → 5tr thì báo cáo tháng 8 năm ngoái sẽ hiện 5tr — sai, và thông tin cũ mất vĩnh viễn.

Nên tách hai loại dữ liệu:

| Bảng | Vai trò | Tính chất |
|---|---|---|
| `budgets` | Hạn mức đang áp dụng | Sửa được tự do |
| `budget_period_results` | Kết quả các kỳ **đã đóng** | Chỉ ghi một lần, không sửa |

**Job chốt kỳ** — `BudgetsScheduler` (`@nestjs/schedule`), chạy **mỗi ngày lúc 00:00**, không phải cuối tháng vì `monthStartDay` khác nhau giữa các user:
1. Duyệt ngân sách `isActive`
2. Tính kỳ gần nhất **đã kết thúc**
3. Chưa có bản ghi cho kỳ đó → tính `spent` bằng `SUM()`, ghi snapshot kèm `rolloverIn`/`rolloverOut`
4. Đã có → bỏ qua

Ràng buộc `@Unique(['budgetId', 'periodStart'])` khiến job **idempotent**: chạy hai lần, hoặc chạy trễ vài ngày do máy tắt, đều không tạo bản ghi trùng. Bắt buộc với job ghi dữ liệu tài chính.

Bản ghi **tự chứa đủ thông tin**: snapshot cả `categoryName` dạng text (danh mục có thể bị đổi tên/xóa), và `budgetId` dùng `onDelete: 'SET NULL'` chứ **không** `CASCADE` — xóa ngân sách thì lịch sử vẫn còn, vì đó chính là lý do bảng này tồn tại.

**Vì sao cần job chạy nền thay vì tính lại khi cần?** Chi tiêu quá khứ thì lúc nào cũng tính lại được (giao dịch là dữ liệu bất biến), nhưng **hạn mức thì không** — `budget.amount` sửa là mất số cũ. Job phải chụp lại *trước khi* nó bị ghi đè.

Thêm nữa, **chuỗi rollover phụ thuộc hoàn toàn vào bảng này**: `layRolloverIn()` đọc `rolloverOut` của kỳ trước từ đây. Không chạy job → không có bản ghi → `rolloverIn = 0` → dư/vượt kỳ trước bốc hơi, tính năng rollover coi như không tồn tại.

Giá trị thật là cho AI: có bảng này thì AI nói được *"6 tháng qua bạn vượt ngân sách ăn uống 4/6 tháng — hạn mức 3tr có vẻ thấp hơn nhu cầu thực"*, và điểm `budgetAdherence` chấm được theo thời gian thay vì chỉ dựa vào kỳ hiện tại.

### 4.5 Mục tiêu
- Mục tiêu ngắn hạn / dài hạn: tên, số tiền cần, deadline, tiến độ %.
- Tính **số tiền cần tiết kiệm mỗi tháng** để kịp deadline, cảnh báo nếu tốc độ hiện tại không kịp.
- Nạp tiền vào mục tiêu: ghi tay từng lần qua `GoalContribution`.

#### Nạp tiền vào mục tiêu là "gắn nhãn", không phải "chi"

`POST /goals/:id/contribute` **không tạo `Transaction`**. Lý do: tiền chưa rời khỏi ví — bạn chỉ đang gắn nhãn cho nó. Nếu tạo giao dịch chi thì `số tiền hiện có` sẽ giảm trong khi tiền thật vẫn nguyên, và bạn phải bấm "Điều chỉnh số dư" mỗi tháng để bù lại con số lệch do chính app tạo ra.

Nhưng để không mất khả năng đối chiếu (đây là lỗ hổng nếu chỉ dừng ở đó — có thể nạp 50tr vào mục tiêu trong khi ví chỉ có 10tr), dashboard hiển thị **ba con số** và BE **chặn nạp vượt**:

```
Số tiền hiện có    31.000.000₫
Đã cam kết         14.000.000₫   ← Σ currentAmount của mục tiêu ACTIVE
─────────────────────────────
Tự do tiêu         17.000.000₫
```

- `POST /goals/:id/contribute` trả `409` nếu `đã cam kết + amount > số tiền hiện có`
- Số dư luôn khớp tiền thật → không phát sinh điều chỉnh số dư giả
- Tiền chỉ thực sự rời ví khi bạn **mua thứ đó** — lúc ấy ghi một giao dịch chi bình thường
- Trạng thái: đang chạy / đạt được / tạm dừng / hủy. Có ăn mừng khi đạt 100%.
- **Theo dõi trả nợ**: danh sách nợ + kế hoạch trả theo snowball (khoản nhỏ trước) hoặc avalanche (lãi cao trước), hiển thị ngày dự kiến hết nợ và tổng lãi phải trả.

### 4.6 Công nợ bạn bè (Danh bạ)

> Thiết kế đầy đủ: **`SHARED_EXPENSES.md`**. Mục này tóm tắt phần bắt buộc phải nhớ.

Ghi lại những lần trả hộ / được trả hộ khi đi ăn, đi chơi, rồi xem mỗi người đang nợ mình
(hoặc mình đang nợ họ) bao nhiêu.

**Nguyên tắc nền — chỉ ghi `Transaction` khi tiền THẬT SỰ rời/vào ví.** Cùng nguyên tắc đã
chốt ở `goals/contribute` (§4.5). Kết quả bất đối xứng nhưng đúng:

| Tình huống | Ví có đổi? | Ghi giao dịch? |
|---|---|---|
| **Bạn trả hộ** cả nhóm | có, giảm | **có** — tách tối đa 3 giao dịch |
| Họ trả lại bạn | có, tăng | có (thu, danh mục hệ thống) |
| **Họ trả hộ bạn** | **không** | **không** |
| Bạn trả lại họ | có, giảm | có (chi, danh mục THẬT) |

⚠️ Ghi khoản chi ngay lúc bạn ăn ké mà chưa trả sẽ làm số dư tính ra **thấp hơn tiền thật**.
Cái giá phải trả: bữa ăn ngày 10 mà bạn trả ngày 20 thì nằm ở ngày **20** trong thống kê.
Chấp nhận lệch ngày để số dư luôn khớp tiền thật.

**Bạn trả hộ → tách 3 giao dịch.** Bill 1.000.000₫: bạn ăn 250.000₫, mời thêm 250.000₫,
3 người kia gánh 500.000₫:

| Số tiền | Danh mục | Vào thống kê/AI? |
|---|---|---|
| 250.000₫ | Ăn uống *(danh mục chính)* | ✅ bạn ăn thật |
| 250.002₫ | Mời bạn bè *(danh mục thật, `kind = want`)* | ✅ bạn tiêu thật, không ai trả lại |
| 499.998₫ | **Trả hộ bạn bè** *(`isSystem = true`)* | ❌ tiền cho mượn |

Vì sao tách chứ không ghi một giao dịch rồi để thống kê tự trừ: `isSystem = false` **đã** là
bộ lọc có sẵn trong mọi query của `stats` và đã được test. Cách còn lại bắt thêm một phép trừ
vào **từng** query tổng hợp — chỗ dễ sai nhất dự án.

Vì sao tách tiếp phần "mời": gộp chung thì "Ăn uống" phình lên vì tiền mời người khác, AI sẽ
khuyên *ăn ít lại* trong khi vấn đề thật là *mời hơi nhiều*. Hai lời khuyên khác hẳn nhau.

**Công thức công nợ** — chỉ được viết ở **MỘT hàm duy nhất** (rải dấu +/− ra nhiều query là
chắc chắn sai dấu ở đâu đó):

```
Người X nợ bạn =
    Σ share(X)     trong các bill BẠN trả
  − Σ share(bạn)   trong các bill X trả
  − Σ settlement THEY_PAID_ME của X
  + Σ settlement I_PAID_THEM  của X
```

Dương = X nợ bạn · Âm = bạn nợ X. **Luôn tính bằng `SUM()`, KHÔNG lưu cột `balance` trên
`Contact`** — cùng lý do đã chốt cho số dư ví: denormalize là nguồn gốc của số lệch.

**Làm tròn**: chia đều phần nguyên, **phần lẻ dồn vào NGƯỜI TRẢ**. Không ai phải nợ một con
số lẻ khó chịu, và bất biến `Σ shares = totalAmount` luôn giữ.

**Thẻ số dư** thêm hai con số, song song `committedToGoals`:

| | |
|---|---|
| `owedToMe` | người khác đang giữ, sẽ về (**ngoài ví**) |
| `owedByMe` | vẫn trong ví nhưng đã có chủ |
| `freeToSpend` | `currentBalance − committedToGoals − owedByMe` |

⚠️ `owedToMe` **không** phải bước đầu của theo dõi tài sản ròng (§7 đã loại `Asset`). Nó là
hệ quả của những khoản chi đã ghi, không phải bảng cân đối. Đừng mở rộng thành nơi khai tài sản.

**AI** nhận công nợ như **thông tin, không bao giờ như chi tiêu**: *"đang bị nợ 2,4tr, 3 khoản
quá 30 ngày"*. Xếp vào chi tiêu là hỏng lời khuyên — đúng lỗi thiết kế này sinh ra để tránh.

⚠️ **`POST /transactions` chặn ghi vào danh mục `isSystem`.** Service công nợ phải gọi thẳng
repository, không đi qua endpoint public. Đây là chốt chặn cố ý, đừng nới ra.

### 4.7 AI — **trọng tâm của sản phẩm**

Ghi chép chỉ là phương tiện; giá trị thật nằm ở việc AI trả lời được câu **"khoản này có thực sự cần thiết không, và cắt thế nào?"**. Đây là phần phân biệt Spendly với một file Excel.

Prompt luôn **gửi dữ liệu đã tổng hợp** (số liệu + tần suất theo danh mục, xu hướng, ngân sách, mục tiêu), **không gửi danh sách giao dịch thô** — tiết kiệm token và giảm rủi ro lộ dữ liệu.

| Tính năng | Mô tả |
|---|---|
| **Đánh giá mức cần thiết** | Với mỗi danh mục `WANT`, AI xét **số tiền + tần suất + xu hướng** rồi kết luận nên giữ, nên giảm, hay nên cắt — kèm lý do và con số cụ thể |
| **Báo cáo tuần/tháng** (`GET /ai/report`) | Toàn cảnh: tóm tắt · tối đa 4 điểm nổi bật · tối đa 3 cảnh báo · **đúng 3 việc nên làm** xếp theo mức quan trọng. Khác `necessity-review` ở chỗ có so sánh kỳ trước, tình hình ngân sách, tiến độ mục tiêu và khoản nợ |
| Điểm sức khỏe tài chính | 0–100 từ tỷ lệ tiết kiệm, mức tuân thủ ngân sách, quỹ dự phòng, tỷ lệ nợ — kèm giải thích từng phần |
| Phát hiện bất thường | So sánh với thói quen của chính bạn (VD tháng này ăn ngoài tăng 2.4×) |
| Dự báo dòng tiền | Ước tính thu–chi tháng tới dựa trên lịch sử các tháng trước |
| Chatbot hỏi đáp | "Tháng này tôi tiêu ăn uống nhiều hơn bình thường không?" — có context tài chính của user |

#### Dữ liệu đưa vào prompt "đánh giá mức cần thiết"

Chất lượng lời khuyên phụ thuộc hoàn toàn vào việc gửi đúng số liệu. Với mỗi danh mục chi, gom đủ **5 chiều**:

| Chiều | Vì sao cần |
|---|---|
| Tổng tiền kỳ này | Quy mô khoản chi |
| **Số lần giao dịch** | Phân biệt "1 lần 500k" với "10 lần 50k" — hai vấn đề hoàn toàn khác nhau, cách cắt cũng khác |
| **Số tiền trung bình/lần** | Biết nên giảm *tần suất* hay giảm *mức chi mỗi lần* |
| So với trung bình 3 kỳ trước | Đây là bất thường hay thói quen cố hữu |
| `kind` (need/want/saving) | AI chỉ đề xuất cắt ở `WANT`, không bao giờ khuyên cắt tiền nhà hay thuốc men |
| % trên tổng thu nhập | Cùng 2tr cà phê, người thu nhập 10tr khác người thu nhập 50tr |

Ví dụ đầu ra mong muốn — **cụ thể, có số, có hành động**, không phải lời khuyên chung chung:

> ☕ **Cà phê — 550.000₫ tuần này, 11 lần (trung bình 50k/lần)**
> Tăng 68% so với 3 tuần trước (~327k). Đây là danh mục `muốn`, chiếm 7% thu nhập tuần.
> Bạn đi cà phê gần như mỗi ngày, nhiều hôm 2 lần. Vấn đề nằm ở **tần suất**, không phải giá mỗi ly.
> → **Gợi ý**: giữ 4 buổi/tuần (những buổi có hẹn bạn bè hoặc ngồi làm việc), còn lại pha ở nhà. Tiết kiệm ~350k/tuần ≈ **1,4tr/tháng** — bằng 40% mục tiêu "Mua Macbook" mỗi tháng.

**Nguyên tắc bắt buộc khi viết system prompt** (chống việc AI phán bừa hoặc lên lớp):
1. **Không bịa số.** Mọi con số trong câu trả lời phải lấy từ dữ liệu được cung cấp.
2. **Chỉ đề xuất cắt danh mục `WANT`.** Không bao giờ khuyên cắt `NEED` (tiền nhà, điện nước, thuốc men) hay `SAVING`.
3. **Gợi ý phải kèm số tiền tiết kiệm được** và, nếu có mục tiêu đang chạy, quy đổi ra **% tiến độ mục tiêu** — cho thấy việc cắt giảm phục vụ điều gì.
4. **Giọng điệu trung lập, không phán xét.** Đưa lựa chọn, không ra lệnh; không dùng từ mang tính đạo đức ("lãng phí", "hoang phí").
5. **Đủ dữ liệu mới nói.** Dưới 2 tuần dữ liệu thì báo "chưa đủ dữ liệu để so sánh" thay vì suy diễn.
6. Trả về **JSON có cấu trúc** (lưu vào `AiInsight.structured`) để FE render thành card, không phải một khối văn bản dài.

**Chọn nhà cung cấp:** ban đầu định dùng xAI Grok vì tưởng có free tier, nhưng thực tế **team mới của xAI phải nạp credit** mới gọi được (API trả `403 permission-denied`). Đã chuyển sang **Gemini** vì:
- **Tiếng Việt tốt hơn hẳn** — đầu ra là văn bản tư vấn đọc thẳng cho user, câu chữ tự nhiên quyết định user có tin và làm theo không. Groq chạy model mở (Llama/Qwen), tiếng Việt yếu hơn rõ rệt.
- Điểm mạnh của Groq là **tốc độ**, mà kiến trúc này không cần: báo cáo chạy theo lịch ở nền, và cache 2 lớp khiến phần lớn request không gọi API.
- Gemini hỗ trợ JSON có cấu trúc chặt chẽ, hợp với việc render card ở FE.

⚠️ **Model của Gemini bị khai tử theo thời gian** — `gemini-2.5-flash` trả `404 no longer available to new users`. Vì vậy dùng bí danh **`gemini-flash-latest`** (luôn trỏ bản flash mới nhất) thay vì ghim một phiên bản cụ thể: app cá nhân không có ai canh để cập nhật khi model cũ bị gỡ.

**Chọn `gemini-flash-lite-latest`, không phải bản thường.** Mọi phép tính đã làm ở BE — model chỉ cần diễn giải số liệu thành câu, không cần suy luận sâu. Đo thực tế trên cùng prompt báo cáo: **lite 3 giây, bản thường 79 giây**, chất lượng đầu ra tương đương. Bản thường còn hay trả `503 high demand` vào giờ cao điểm.

`LlmClient` cố ý **không gắn với nhà cung cấp nào** — mọi bên đều dùng chung giao thức OpenAI-compatible, nên đổi tiếp chỉ là sửa `LLM_BASE_URL` + `LLM_MODEL`.

**Kiểm soát chi phí / hạn mức free:**
1. **Job `AiScheduler` chạy 08:00 sáng giờ VN mỗi ngày** sinh báo cáo cho kỳ VỪA ĐÓNG (tuần và tháng), không gọi mỗi lần load trang.

   Job sinh **ba thứ** cho mỗi user (danh sách `VIEC_DINH_KY` trong `ai.scheduler.ts`): báo cáo tuần · báo cáo tháng · **đánh giá mức cần thiết của tuần vừa đóng**. Thêm loại phân tích định kỳ mới thì thêm một dòng ở đó.

   ⚠️ **Đây là nguồn DUY NHẤT tạo ra chúng.** FE chỉ ĐỌC qua `GET /ai/insights`; không màn hình nào được gọi `/ai/report` hay `/ai/necessity-review`. Trước đây `/ai` render sẵn báo cáo kỳ và tự gọi necessity-review, nên **chỉ cần mở trang là gọi AI** cho kỳ đang chạy — tốn quota cho thứ user chưa xin, và đẩy vào kho một bản dựng từ dữ liệu mới được vài ngày. Chỉ **chat** và **điểm sức khỏe tài chính** được gọi AI theo thao tác user.

   Vì sao cần job này: `GET /ai/report?period=week` luôn tính **tuần hiện tại** — không có cách nào xin báo cáo tuần trước. Nếu chỉ sinh khi user mở trang thì báo cáo một tuần chỉ tồn tại nếu tình cờ user vào app trong đúng tuần đó, kho báo cáo sẽ thủng lỗ chỗ.

   Job hỏi *"báo cáo kỳ trước đã có chưa?"* rồi mới sinh, nên **idempotent và tự bù**: máy tắt vài ngày, bật lại vẫn sinh đủ. Chưa cấu hình `LLM_API_KEY` thì bỏ qua im lặng.

   **Lịch chạy** (khai `timeZone` tường minh, không phụ thuộc máy chủ):

   | Giờ VN | Job | Vì sao giờ đó |
   |---|---|---|
   | 00:30 | Chốt kỳ ngân sách | Phải xong TRƯỚC báo cáo — báo cáo đọc `rolloverIn` của kỳ mới |
   | 08:00 | Sinh báo cáo kỳ đã đóng | Chừa buổi tối + sáng sớm để user ghi bù khoản chi Chủ nhật; và 08:00 là lúc mở app đọc, không phải lúc ngủ |

   Job **không bao giờ sinh nhầm kỳ chưa kết thúc**: nó luôn nhắm kỳ TRƯỚC kỳ hiện tại, mà kỳ hiện tại tính theo múi giờ của từng user. Chạy giờ nào thì "kỳ trước" cũng đã đóng — giờ chạy chỉ quyết định báo cáo xuất hiện sớm hay muộn. Hệ quả: tuần đang diễn ra **không bao giờ** bị đem ra sinh báo cáo, kể cả khi nó đã có giao dịch.

   **Kỳ trước rỗng (không giao dịch nào) thì không sinh gì cả.** `periodReport()` kiểm tra `income`/`expense` **trước** khi gọi LLM và ném `400` — nên không tốn quota, không lưu báo cáo trống. Scheduler nhận diện riêng trường hợp này và bỏ qua im lặng (không log cảnh báo, vì "chưa tiêu gì" là trạng thái bình thường chứ không phải lỗi). Ngày hôm sau vẫn thử lại: user nhập bù giao dịch của tuần đó thì báo cáo sẽ được sinh.
2. Cache 2 lớp theo `inputHash`: Redis (nóng) → Postgres `ai_insights` (bền). Dữ liệu không đổi → không gọi API.

   ⚠️ **`ai_insights` là KHO LƯU THEO KỲ, không phải nhật ký mọi lần gọi AI** — khóa duy nhất là `(userId, kind, periodStart)`, sinh lại một kỳ thì **ghi đè** bản cũ.

   Đặt khóa duy nhất trên `inputHash` là một lỗi đã trả giá: trong kỳ ĐANG chạy, mỗi lần user nhập thêm giao dịch rồi mở `/ai` là dữ liệu đổi → hash đổi → **thêm một bản ghi nữa cho cùng tuần đó**. Hậu quả kép: trang "Báo cáo chi tiêu" hiện 4–5 mục trùng tên một tuần, và job sáng Thứ Hai thấy "đã có báo cáo rồi" nên bỏ qua — bản dựng từ dữ liệu **dang dở giữa tuần** bị giữ lại vĩnh viễn làm báo cáo tổng kết.

   Kéo theo: job không hỏi *"đã có chưa?"* mà hỏi *"đã **CHỐT** chưa?"* — chốt = `updatedAt > periodEnd`, tức bản đó sinh ra **sau** khi kỳ đóng. Bản sinh giữa kỳ sẽ bị sinh lại đè lên. Suy ra từ `updatedAt` chứ **không thêm cột `isFinal`** (cột như vậy chỉ là bản sao của dữ kiện đã có và sẽ lệch ngay lần đầu ai đó quên cập nhật).
3. Giới hạn lượt chat/ngày bằng bộ đếm Redis có TTL.
4. Lỗi 429/5xx không retry ngay — job chạy lại vào ngày hôm sau (dự án **không dùng BullMQ**).
5. **Fallback**: khi API lỗi/hết quota, vẫn hiển thị thống kê rule-based và báo phần AI tạm chưa sẵn sàng.
6. `LLM_API_KEY` **chỉ nằm ở BE**, không bao giờ lộ ra FE.

### 4.8 Trải nghiệm & hạ tầng
- **Chạy trên trình duyệt, giao diện responsive** — dùng tốt trên cả điện thoại lẫn máy tính. Không đóng gói thành app cài đặt.
- **Dark mode** (theo hệ thống + chuyển tay).
- Giao diện tiếng Việt, **chỉ hiển thị VND**, định dạng số kiểu Việt Nam (`1.250.000 ₫`) qua một helper dùng chung.

---

## 5. API contract (NestJS, prefix `/api/v1`)

> 📄 **Chi tiết đầy đủ (request/response từng endpoint, mã lỗi, trạng thái làm tới đâu): [`API_ENDPOINTS.md`](API_ENDPOINTS.md).** Bảng dưới chỉ là mục lục — sửa endpoint thì phải cập nhật cả hai file.

| Module | Endpoint |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Users | `GET /users/me` · `PATCH /users/me` · `PATCH /users/me/password` · `POST /users/me/onboarding` |
| Categories | `GET /categories` · `POST /categories` · `PATCH /categories/:id` · `DELETE /categories/:id` |
| Transactions | `GET /transactions` (filter + cursor) · `GET /:id` · `POST /transactions` · `PATCH /:id` · `DELETE /:id` · `POST /transactions/adjust-balance` |
| Budgets | `GET /budgets` (kèm số đã tiêu) · `POST /budgets` · `PATCH /:id` · `DELETE /:id` · `GET /budgets/history` (kỳ đã đóng) |
| Goals | `GET /goals` · `POST /goals` · `PATCH /:id` · `DELETE /:id` · `POST /:id/contribute` |
| Debts | `GET /debts` · `POST /debts` · `PATCH /:id` · `POST /:id/payment` · `GET /debts/payoff-plan` |
| Stats | `GET /stats/balance` (số tiền hiện có) · `GET /stats/summary?from&to` · `GET /stats/by-category` (kèm số lần + TB/lần) · `GET /stats/trend?groupBy=day\|week\|month` · `GET /stats/calendar` |
| AI | `GET /ai/insights?kind` · `POST /ai/insights/generate` · `GET /ai/necessity-review` (đánh giá mức cần thiết) · `GET /ai/health-score` · `POST /ai/chat` |
| Export | `GET /export/pdf?from&to` · `GET /export/excel?from&to` |

Quy ước:
- Response `{ success, data, message? }` qua interceptor global; lỗi qua exception filter global, HTTP status đúng + `{ success: false, message }`.
- Validate input bằng **Zod schema trong `shared/`** (dùng chung FE ↔ BE qua một `ZodValidationPipe`) — không định nghĩa hai lần.
- Mỗi module NestJS gồm `*.module.ts` / `*.controller.ts` / `*.service.ts` / `entities/` / `dto/`. Controller chỉ nhận request và gọi service, **không chứa business logic**; entity không rò rỉ thẳng ra response — map qua DTO.

---

## 6. Lộ trình

| Giai đoạn | Nội dung |
|---|---|
| **P0 — Nền** | ✅ Postgres + Redis local, NestJS scaffold + TypeORM DataSource + entity + migration `InitSchema` · ⬜ auth JWT + guard global, seed danh mục mặc định, Next.js layout + design system |
| **P1 — Lõi** | Danh mục, CRUD giao dịch, danh sách + bộ lọc, dashboard ngày/tuần/tháng, biểu đồ cơ bản, thống kê tần suất, cache stats bằng Redis |
| **P2 — Kỷ luật** | Ngân sách + cảnh báo, mục tiêu ngắn/dài hạn, nhập nhanh, điều chỉnh số dư |
| **P3 — AI** | Tích hợp LLM (Gemini), **đánh giá mức cần thiết + gợi ý cắt giảm**, báo cáo tuần/tháng theo lịch, điểm sức khỏe tài chính, phát hiện bất thường, chatbot |
| **P4 — Mở rộng** | Theo dõi nợ + kế hoạch trả, export CSV/PDF |
| **P5 — Công nợ bạn bè** | Danh bạ, chia bill hai chiều, tất toán từng phần, `owedToMe`/`owedByMe` (§4.6 · `SHARED_EXPENSES.md`) |

---

## 7. Quyết định đã chốt

- **Công nợ bạn bè: chỉ ghi `Transaction` khi tiền THẬT SỰ rời/vào ví** (§4.6). Bạn trả hộ → ghi ngay; người khác trả hộ bạn → **không ghi gì**, chỉ ghi công nợ, tới lúc bạn trả lại mới sinh giao dịch. Bất đối xứng này là chủ ý: ghi sớm là số dư tính ra thấp hơn tiền thật. Đổi lại phải chấp nhận khoản chi hiện ở ngày tất toán chứ không phải ngày ăn.
- **Danh bạ (`Contact`) là thực thể hạng nhất, KHÔNG phải tài khoản.** Không đăng ký, không mời, không email, không đồng bộ — chỉ là sổ tên riêng của user. Nó vừa là nơi quản lý bạn bè vừa LÀ màn hình xem ai nợ bao nhiêu, nên không có trang "công nợ" thứ hai. Danh bạ và công nợ nằm CHUNG một module (`modules/friends/`) vì tách đôi sẽ thành phụ thuộc vòng: danh bạ cần số nợ, công nợ cần tên người.
- **KHÔNG tự gộp tên có dấu với không dấu.** "Tuấn" và "Tuan" có thể là hai người thật; gộp nhầm thì công nợ sai và rất khó lần ra. Chỉ chống trùng do hoa/thường/khoảng trắng (`nameNormalized`). Gộp hai người là thao tác thủ công.
- **Phần "mời" tách sang danh mục riêng và VẪN vào thống kê.** Đó là tiền tiêu thật, không ai trả lại. Gộp chung với "Ăn uống" thì AI khuyên *ăn ít lại* trong khi vấn đề thật là *mời hơi nhiều* — hai lời khuyên khác hẳn nhau.
- **Không lưu cột `balance` trên `Contact`** — công nợ luôn tính bằng `SUM()`, cùng lý do đã chốt cho số dư ví. Chậm thì cache Redis.
- **FE deploy dạng TĨNH lên Cloudflare Pages** (`output: 'export'`). App gọi API hoàn toàn từ client nên không cần SSR — đổi lại không dùng được route handler `app/api/*`, server action hay middleware.
- **Cookie refresh token ở production dùng `SameSite=None; Secure`.** FE (Cloudflare) và BE khác domain = cross-site, `Lax` sẽ khiến trình duyệt không gửi cookie và refresh luôn thất bại. Dev vẫn là `Lax` + `secure: false` vì localhost chạy HTTP.
- **`CORS_ORIGIN` nhận danh sách** phân tách bằng dấu phẩy — Cloudflare Pages có domain chính, `*.pages.dev` và preview mỗi lần deploy. Không dùng được `origin: '*'` vì đi kèm `credentials: true`.
- **KHÔNG rate-limit HTTP** (chống brute-force, throttle request). App cá nhân, một người dùng — chưa cần. Hạn mức AI/ngày VẪN CÓ, nhưng đó là để bảo vệ quota nhà cung cấp chứ không phải chống tấn công.
- **Chỉ một loại tiền: VND.** Không có cột `currency`, không quy đổi tỷ giá, không đa tiền tệ.
- Tiền: cột DB là **`bigint` đơn vị đồng**, tầng TS là **`number`**, nối với nhau bằng `MoneyTransformer` chung. Không dùng `float` ở bất kỳ đâu, không dùng `BigInt` trong code.
- **KHÔNG theo dõi tài sản ròng (net worth).** Không có `Asset`, không có `NetWorthSnapshot`, không có job chốt snapshot. Lý do: app này là công cụ **quản lý thu chi**, không phải bảng cân đối tài sản. Giá trị tài sản (xe, vàng, đất) phải khai tay và nhớ cập nhật định kỳ — trái với nguyên tắc "mọi thứ chạy tự động từ giao dịch nhập hằng ngày", và không đóng góp gì cho tính năng lõi là AI đánh giá chi tiêu.
- **KHÔNG import CSV/sao kê ngân hàng.** Nhập tay là đủ với app cá nhân; đổi lại không phải xử lý mapping cột, phát hiện trùng, hay job nền cho file lớn. Cột `importHash` đã bị xóa khỏi `transactions` (migration `DropImportHash`) — cần lại thì thêm mới.
- **KHÔNG làm PWA / app cài đặt.** Chỉ dùng trên web qua trình duyệt. Kéo theo: không service worker, không manifest, không thông báo đẩy, không chạy offline. Giao diện vẫn responsive để dùng tốt trên điện thoại.
- **KHÔNG có giao dịch định kỳ.** Không có `RecurringRule`, không có job tự sinh giao dịch. Khoản cố định (tiền nhà, subscription) vẫn nhập tay như mọi khoản khác — bù lại bằng **template nhập nhanh**. Ưu điểm: không bao giờ có giao dịch "ma" do job sinh sai hoặc chạy hai lần, và số liệu luôn phản ánh đúng cái đã thực sự xảy ra.
- **Đúng MỘT ví chung cho mỗi user** (`Wallet` + `@Unique(['userId'])`), không chia loại (tiền mặt / ngân hàng / ví điện tử). App không theo dõi tiền nằm ở đâu, chỉ cần tổng. Kéo theo: không có chuyển tiền nội bộ, không có `TxType.TRANSFER`. `transaction.walletId` do BE tự điền, client không gửi — người dùng không phải chọn ví khi nhập liệu.
- **Nạp tiền vào mục tiêu KHÔNG tạo giao dịch** — là "gắn nhãn", không phải "chi". Tiền chưa rời ví. Đối chiếu bằng ba con số *hiện có / đã cam kết / tự do tiêu*, và chặn `409` khi nạp vượt số tiền hiện có.
- Giao dịch **bắt buộc có `categoryId`** — toàn bộ phân tích và gợi ý AI đều dựa trên danh mục, giao dịch không danh mục là dữ liệu chết.
- **Số tiền hiện có luôn được TÍNH RA, không lưu thành cột**: `wallet.initialBalance + Σthu − Σchi`. Không denormalize → không bao giờ lệch khỏi lịch sử. Nếu chậm thì cache Redis, không thêm cột `balance`.
- **Danh mục `isSystem` (hiện chỉ có "Điều chỉnh số dư") bị loại khỏi mọi thống kê và prompt AI** — nó là bút toán kỹ thuật, không phải khoản thu/chi thật.
- Chu kỳ "tháng" theo `user.monthStartDay`, không mặc định cứng là ngày 1. Áp dụng cho **mọi** chỗ nói "tháng": ngân sách, thống kê, báo cáo AI.
- Ngân sách **lặp lại mỗi kỳ**; `budget.startDate` chỉ là mốc có hiệu lực, không phải ranh giới kỳ. Tạo giữa kỳ thì `spent` vẫn tính **trọn kỳ** — mọi kỳ tính giống nhau, không có ngoại lệ cho kỳ đầu.
- **`synchronize: false`** — schema chỉ đổi qua migration đã commit.
- Xóa danh mục **không** xóa giao dịch: giao dịch chuyển về "Khác".
- Thống kê theo danh mục phải trả **cả số lần giao dịch và số tiền trung bình mỗi lần**, không chỉ tổng tiền — vì đây là đầu vào để AI phân biệt "1 lần 500k" với "10 lần 50k".
- AI **chỉ được đề xuất cắt giảm ở danh mục `WANT`**, không bao giờ ở `NEED`/`SAVING`.
- Redis là **cache, không phải nơi lưu bền** — mất Redis thì app chậm đi chứ không mất dữ liệu. Cụ thể khi Redis chết: cache miss (tính lại từ Postgres), và **whitelist refresh token fail-open** — đăng ký / đăng nhập / refresh / logout đều vẫn chạy. Đánh đổi: mất khả năng *thu hồi* token trong lúc Redis chết, nhưng token vẫn phải có chữ ký hợp lệ và còn hạn mới qua được. Fail-closed sẽ khiến mọi người không đăng nhập được mỗi lần Redis chớp — với app cá nhân đó là hỏng hẳn.
- **Ngoại lệ không fail-open: `incrDaily()`** (đếm lượt gọi AI). Không đếm được mà vẫn cho gọi thì đốt sạch quota free — thà chặn.
- Hết quota AI thì mọi tính năng còn lại vẫn dùng bình thường.
