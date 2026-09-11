# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Project

**Spendly** — app web cá nhân. Hai việc lõi:

1. **Nhìn thấy dòng tiền luân chuyển** — app **chủ động kéo** giao dịch từ SePay về, không gõ tay.
2. **Ghi log ai nợ mình** — trả hộ cả nhóm thì biết từng người nợ bao nhiêu.

Cộng bốn việc hỗ trợ (phục hồi từ bản trước, phạm vi có chọn lọc — xem bảng "Đã GỠ BỎ"):
đặt hạn mức chi (**ngân sách**), đặt **mục tiêu** để dành, theo dõi **khoản nợ** cá nhân, và
**AI đọc số liệu đưa nhận định** (đánh giá mức cần thiết / báo cáo kỳ / điểm sức khỏe tài
chính — KHÔNG chat). Chi tiết đầy đủ: `SPEC.md` §1, §4.6, §4.7.

UI copy, comment và commit message viết bằng **tiếng Việt**.

- `FE/` — Next.js 16 App Router + React 19 + TypeScript + Tailwind v4. Deploy tĩnh (`output: 'export'`).
- `BE/` — NestJS 11 + TypeORM + PostgreSQL. API prefix `/api/v1`. Không Redis, không hàng đợi.

### ⚠️ Đã GỠ BỎ — đừng thêm lại

| Thứ | Vì sao gỡ |
|---|---|
| **Auth** (đăng ký/đăng nhập/JWT/refresh token) | app chỉ phục vụ một người |
| **`Wallet` + `initialBalance`** | số dư do ngân hàng cấp, không khai tay |
| **Nhập giao dịch bằng tay** + `adjust-balance` | ngân hàng là nguồn sự thật |
| **AI dạng chat** (`POST /ai/chat`, `chat_messages`) | AI giờ chỉ ở dạng lệnh/phân tích tài chính đã tổng hợp sẵn — không hỏi-đáp tự do |
| **Giới hạn lượt gọi AI/ngày** (`AI_DAILY_LIMIT`, Redis đếm lượt) | cache `inputHash` theo kỳ (SPEC §4.7) đã là chốt chặn thật; user tự quản lý mức dùng key của mình |
| Import CSV · PWA · rate-limit HTTP | quyết định cũ, vẫn giữ nguyên |

⚠️ **AI, Ngân sách, Mục tiêu, Khoản nợ, `CategoryKind` đã được PHỤC HỒI** — nếu thấy tài
liệu cũ hay commit message nói chúng "đã gỡ", đó là mô tả một giai đoạn TRƯỚC, không phải
hiện tại. Đọc `SPEC.md` để biết trạng thái thật.

## Working rules (từ user — bắt buộc theo)

0. **Toàn quyền quyết định — ĐỪNG HỎI.** Gặp ngã rẽ kỹ thuật thì tự chọn phương án tốt nhất rồi làm tiếp. Ngoại lệ cần báo trước: việc **phá hủy hoặc không hoàn tác được** (xóa dữ liệu thật, `git push`, gọi API tốn tiền, publish ra ngoài).
1. **Bàn bạc và lên kế hoạch trước khi code.** Mặc định là brainstorm, nêu trade-off, viết design doc. Chỉ code khi user nói rõ. Đã bảo code thì làm liền mạch tới xong.
2. **Chốt quyết định thành file Markdown ở repo root** và cập nhật `CLAUDE.md`.
3. **Giao tiếp với user bằng tiếng Việt.**
4. Đổi tính năng / data model / API → **cập nhật tài liệu cùng lúc với code**.

## Kiến trúc — những điều KHÔNG được làm sai

### 1. Ngân hàng là nguồn sự thật

**Số dư = `BankAccount.currentBalance`**, chép thẳng từ `accumulated` của giao dịch mới nhất SePay trả về. **Không tự cộng trừ.**

⚠️ Điều này KHÔNG mâu thuẫn với quy tắc "không lưu cột balance". Quy tắc đó chặn việc app tự cộng dồn rồi lệch khỏi lịch sử của chính nó. Ở đây con số do ngân hàng cấp — app chỉ chép lại. Tự tính mới là sai, vì ta không thấy hết mọi biến động (phí, lãi, giao dịch trước khi liên kết).

**Giao dịch chỉ đến từ HAI nguồn**: đồng bộ SePay, hoặc tách một giao dịch ngân hàng khi chia bill. Không có `POST /transactions`.

### 2. ⚠️ Chia bill = TÁCH giao dịch, không tạo mới

Đây là chỗ dễ sai nhất và hậu quả là **mất tiền trên sổ**.

Ngân hàng đã báo khoản chi 1.000.000₫. Tạo thêm 3 giao dịch cho phần chia là **đếm hai lần** — số dư app thấp hơn thực tế đúng một hóa đơn. Thay vào đó:

```
Giao dịch gốc  1.000.000₫  →  thu nhỏ còn  250.002₫  (phần thực ăn)
                             + thêm dòng   250.000₫  (phần mời)
                             + thêm dòng   499.998₫  (cho mượn, danh mục hệ thống)
                                         ─────────────
                                           1.000.000₫  ← TỔNG KHÔNG ĐỔI
```

Dòng gốc **giữ nguyên `sepayId`** nên chống trùng tiếp tục hoạt động. Xóa chia bill thì **khôi phục** dòng gốc chứ không xóa nó.

Chiều ngược lại (**người khác trả hộ bạn**) → **KHÔNG giao dịch nào**: tiền chưa rời tài khoản. Khoản chi chỉ xuất hiện lúc bạn tất toán. Bất đối xứng này là chủ ý.

### 3. ⚠️ Hai danh mục hệ thống, đối xử KHÁC NHAU

| Danh mục | Vào TỔNG chi? | Vào biểu đồ danh mục? |
|---|---|---|
| `Trả hộ bạn bè` | ❌ tiền cho mượn, sẽ về | ❌ |
| `Chưa phân loại` | ✅ **CÓ** — tiền đã đi thật | ❌ lát bánh vô nghĩa |

Lọc `isSystem = false` cho cả hai là **sai**: mọi giao dịch từ ngân hàng đều BẮT ĐẦU ở trạng thái chưa phân loại, nên tổng chi sẽ gần bằng 0 cho tới khi gán hết nhãn — con số sai mà trông vẫn hợp lý. Xem `StatsService.baseQuery(userId, range, boQuaChuaPhanLoai)`.

Tra danh mục hệ thống phải lọc **cả `name`**, không chỉ `isSystem: true` — có nhiều hơn một. Dùng hằng số `SYSTEM_CATEGORY`.

### 4. Đồng bộ SePay — KÉO, không phải chờ đẩy

App gọi `GET /userapi/transactions/list` của SePay theo chu kỳ. Ba đường kích hoạt: **nút
Đồng bộ** trên giao diện · **cron 3 giờ/lần** · `POST /sepay/sync` với `{"tuNgay":"..."}` để
nạp lịch sử cũ.

Vì sao kéo thay vì webhook: webhook mà app đang tắt là **mất luôn** và không có cách nào
biết mình bỏ lỡ gì. Kéo thì hỏi lúc nào cũng ra đủ — và app **không cần lộ ra Internet**,
nên không cần tunnel.

**Bốn chốt chặn bắt buộc:**

- **Chống trùng** `@Unique(['userId', 'sepayId'])`. Chạy đồng bộ thừa là bình thường.
- ⚠️ **Dữ liệu API khác hình dạng webhook cũ**: chiều tiền suy từ **hai cột riêng**
  `amount_in`/`amount_out` (không có cờ `in`/`out`), và **mọi số là CHUỖI** (`"50000.00"`).
  Cộng thẳng là nối chuỗi. Chuẩn hóa ở `sepay.normalizer.ts` — chỗ DUY NHẤT được đổi hình dạng.
- ⚠️ **Phân trang**: SePay trả tối đa **5000 dòng/lần**. Chạm trần nghĩa là còn nữa, phải xin
  tiếp với `since_id` mới. Thiếu bước này thì lần nạp lịch sử đầu **lặng lẽ dừng ở 5000**.
- ⚠️ **Múi giờ**: `transaction_date` là chuỗi `"2026-08-26 21:15:00"` KHÔNG có múi giờ.
  `new Date()` hiểu theo giờ máy chủ — container chạy UTC nên giao dịch 7h sáng rơi sang
  **ngày hôm trước**.

**Số dư đặt MỘT LẦN cuối đợt**, theo `accumulated` của giao dịch có `sepayId` lớn nhất —
không đặt theo từng dòng. Nạp lịch sử cũ mà ghi đè theo giao dịch năm ngoái là số dư nhảy
ngược về quá khứ.

⚠️ **Giới hạn 3 lần gọi/giây**; vượt thì `429` kèm header `x-sepay-userapi-retry-after`.
Tôn trọng header đó, đừng tự đoán thời gian chờ.

⚠️ `SEPAY_API_TOKEN` **toàn quyền** — SePay chưa hỗ trợ phân quyền. Chỉ ở BE, không commit.

### 5. Công nợ — công thức chỉ được viết MỘT chỗ

`FriendsService.tinhCongNo()`. Bốn số hạng cộng trừ đan nhau; rải dấu +/− ra nhiều query là chắc chắn sai dấu ở đâu đó, mà sai dấu công nợ thì con số vẫn "trông hợp lý" nên không ai phát hiện.

Luôn `SUM()`, **không** lưu cột `balance` trên `Contact`. Bất biến khi chia bill: **`Σ shares = totalAmount`**; làm tròn thì **phần lẻ dồn vào người trả**.

### 6. Không còn auth — hệ quả

`SingleUserGuard` (`common/guards/`) gắn người dùng duy nhất vào mọi request. **Nó không bảo vệ gì cả.** `userId` vẫn còn ở mọi bảng và mọi query — giữ vậy để ngày cần auth trở lại chỉ phải thay đúng một guard.

⚠️ **Mọi endpoint đều mở.** Ai gọi được API là đọc được toàn bộ dữ liệu ngân hàng. Từ khi chuyển sang kéo thì app **không cần lộ ra Internet nữa** — đừng mở tunnel trừ khi có lý do, và nếu mở thì phải thêm lại một lớp chặn.

`SingleUserService` tạo user + seed danh mục lần đầu app khởi động. DB có nhiều dòng thì lấy **dòng cũ nhất**.

## Quy ước code

### Cấu trúc — feature-first, không phải type-first

```
BE/src/
├── config/            env schema (Zod)
├── common/            helper THUẦN, stateless — entities/ transformers/ decorators/
│                      filters/ interceptors/ pipes/ guards/ utils/
├── database/          data-source, migrations/
└── modules/           MỘT thư mục cho MỖI domain
    ├── users/ categories/ transactions/ stats/ export/
    ├── bank-accounts/    tài khoản ngân hàng liên kết qua SePay
    ├── sepay/            kéo giao dịch từ SePay (client · normalizer · sync)
    ├── friends/          danh bạ + công nợ (CHUNG một module: tách đôi thành phụ thuộc vòng)
    ├── budgets/          hạn mức chi + scheduler chốt kỳ (SPEC §4.6a)
    ├── goals/            mục tiêu để dành (SPEC §4.6b)
    ├── debts/            khoản vay cá nhân + kế hoạch trả nợ (SPEC §4.6c)
    └── ai/               necessity-review/report/health-score + scheduler (SPEC §4.7) — KHÔNG chat
```

⚠️ **Không còn thư mục `shared/`.** Redis từng nằm ở `shared/redis/` để cache AI + đếm lượt
gọi/ngày — cả hai lý do đó không còn (SPEC §4.7), nên toàn bộ `shared/` đã bị xóa, không chỉ
phần rate-limit. Đừng thêm lại module hạ tầng có provider+vòng đời trừ khi có nhu cầu MỚI
thật sự cần nó (không phải để cache một thứ Postgres đã đủ nhanh).

Phụ thuộc một chiều: `modules/ → common/ → config/`.

⚠️ **Không dùng path alias `@/` ở BE** — `tsc` không rewrite đường dẫn nên `require("@/...")` chết lúc runtime.

### TypeORM

- **`synchronize: false` ở mọi môi trường.** Đổi schema → sinh migration và commit.
- ⚠️ **Cột nullable phải khai `type` tường minh**: `@Column({ type: 'varchar', nullable: true }) x?: string | null`. Union `string | null` bị đọc thành `Object` → crash lúc boot.
- **Tiền: DB `bigint` (đồng), TS `number`**, nối bằng `transformer: money`. Không `float`, không `BigInt`.
- ⚠️ **`transformer: money` KHÔNG áp dụng cho raw query.** `getRawMany()` trả `SUM()` về dạng **chuỗi** — phải `Number()` thủ công, nếu không thành nối chuỗi.
- **Phân trang CURSOR, không `OFFSET`.** Mẫu: `modules/transactions/dto/transaction.dto.ts`.
- **Entity KHÔNG trả thẳng ra response** — map qua hàm DTO liệt kê tường minh. Cấm `{ ...entity }`: đó là danh sách đen, cột mới tự động lọt ra API.
- ⚠️ **`CREATE EXTENSION "uuid-ossp"` nằm trong `InitSchema`.** Mọi bảng dùng `uuid_generate_v4()` mà Postgres không bật sẵn — DB mới toanh sẽ chết ở câu `CREATE TABLE` đầu tiên.
- ⚠️ Postgres không coi hai `NULL` là trùng. Khóa duy nhất có cột nullable cần `NULLS NOT DISTINCT` (xem `shared_expense_shares`).

### Chu kỳ thời gian

Chu kỳ "tháng" theo `user.monthStartDay`. **Helper duy nhất: `common/utils/period.ts`** (`resolvePeriod`, `shiftRange`). Mọi phép tính trong múi giờ của user — tính theo UTC sẽ đẩy giao dịch 7h sáng sang hôm trước.

### Frontend

- ⚠️ **Next.js 16**, khác training data cũ. `params`/`searchParams` là **Promise**. Đọc guide trong `FE/node_modules/next/dist/docs/`.
- **`page.tsx` là file mỏng** — chỉ render shell + feature component.
- Luồng chuẩn: `page.tsx` → `components/<feature>/*` → `hooks/use<Domain>.ts` (TanStack Query) → `lib/api/<domain>.ts` → BE.
- **Mọi ô nhập tiền dùng `<MoneyInput>`**, không `<Input type="number">`. Nó giữ vị trí con trỏ bằng cách đếm **chữ số** trước con trỏ, không đếm ký tự.
- **`lib/format.ts` là nơi DUY NHẤT format tiền/ngày.** `toDateInputValue()` cho input date, không `toISOString().slice(0,10)` (lệch múi giờ).
- **Icon danh mục dùng `<CategoryIcon>`** — bảng liệt kê tường minh, không `import * as Icons`.
- ⚠️ **Mọi component đọc dữ liệu PHẢI xử lý `isError` riêng, KHÔNG gộp vào trạng thái rỗng.** API lỗi mà hiện "chưa có giao dịch nào" là user tưởng mất sạch dữ liệu. Dùng `<ErrorState onRetry={refetch} />`.
- Design token trong `globals.css` `@theme`: `bg-brand`, `text-income/expense`, `bg-ok/warning/exceeded`.

### Cấu hình — nằm ở `BE/.env`, không có màn hình cài đặt

```bash
BANK_ACCOUNT_NUMBER=...   # ⚠️ khớp CHÍNH XÁC số SePay dùng, sai là không tra ra chủ
BANK_NAME=TPBANK
TIMEZONE=Asia/Ho_Chi_Minh
MONTH_START_DAY=1
SEPAY_API_TOKEN=...       # my.sepay.vn → Cấu hình Công ty → API Access
```

`SingleUserService` đọc và đồng bộ lúc khởi động, **idempotent**. Sửa file rồi restart là
xong. ⚠️ Đổi `BANK_ACCOUNT_NUMBER` sẽ tạo tài khoản THỨ HAI, không ghi đè — giao dịch cũ vẫn
thuộc số cũ.

## Commands

| Vị trí | Command | Việc |
|---|---|---|
| root | `docker compose up -d --build` | chạy cả stack |
| root | `docker compose logs -f be` | xem log API (kết quả đồng bộ in ở đây) |
| root | `sh docker/backup.sh` | sao lưu DB ra file |
| root | `sh docker/restore.sh <file>` | phục hồi (**ghi đè**) |
| `BE/` | `npm run start:dev` | API dev tại http://localhost:3001/api/v1 |
| `BE/` | `npm run typecheck` | `tsc --noEmit` |
| `BE/` | `npm run migration:generate -- src/database/migrations/<Tên>` | sinh migration |
| `BE/` | `npm run migration:run` | chạy migration |
| `BE/` | `npm test` | test e2e (Postgres THẬT, DB `spendly_test`) |
| `FE/` | `npm run dev` · `npm run build` | web tại http://localhost:3000 |

### Docker — những chỗ đã trả giá

- ⚠️ **Postgres 18 đổi quy ước**: volume mount ở `/var/lib/postgresql`, **không** phải `/var/lib/postgresql/data`.
- ⚠️ **`healthcheck` + `condition: service_healthy` bắt buộc** — `depends_on` trần chỉ đợi container *chạy*, không đợi Postgres *nhận lệnh*.
- ⚠️ **`docker compose up --build` KHÔNG tự tạo lại container.** Sửa code xong phải `--force-recreate`, nếu không container vẫn chạy image cũ. Triệu chứng dễ nhầm: route mới trả **404**.
- ⚠️ **Volume `pgdata` không đi theo git.** Máy mới = DB trắng. Dùng `docker/backup.sh` + `restore.sh`.
- **`NEXT_PUBLIC_API_URL` là build ARG** — đổi phải build lại image. Phải là `localhost:3001` (trình duyệt gọi từ ngoài mạng compose), không phải `http://be:3001`.
- Cổng Postgres không mở ra máy thật (5432 bị Homebrew chiếm) — cần truy cập từ ngoài thì mở tạm, xong nhớ đóng lại (đã có bài học: quên kiểm tra cổng trống trước khi mở từng làm rớt container Postgres đang chạy).
- ⚠️ **Chạy Docker và `npm run start:dev` cùng lúc đá nhau ở cổng 3001.**

## Test

Chạy trên **Postgres THẬT**, DB riêng `spendly_test`. **Cố ý không mock** — mọi bug đắt nhất của dự án đều nằm ở ranh giới hạ tầng (`bigint` trả về chuỗi, TypeORM không suy được kiểu cột nullable). Mock đi thì test xanh mà app vẫn hỏng.

`test/utils/test-app.ts` dựng app qua `configureApp()` — **cùng hàm cấu hình với `main.ts`**.

Tạo giao dịch trong test phải đi qua đường đồng bộ SePay — đúng đường mà đời thật đi. Phần `sepay.normalizer.ts` là hàm THUẦN nên test được không cần mạng. Test AI thì mock `LlmClient` (gọi mạng thật ra ngoài là đốt quota mỗi lần chạy CI), không mock Postgres/`AiService`.

⚠️ **Đang có 5 spec viết theo mô hình CŨ và đang đỏ.** Chúng gọi `POST /transactions`, `GET /wallet`, đăng nhập — những thứ đã gỡ. Phải viết lại (giả lập SePay API trả về) trước khi tin vào kết quả `npm test`. Chưa có test nào cho `budgets`/`goals`/`debts`/`ai` — cần viết mới, không phải sửa từ 5 spec cũ.

## Docs

Hai file, hai vai trò khác nhau — đổi tính năng/data model/API thì cập nhật **cả hai cùng
lúc với code**, đừng để một file lệch khỏi thực tế mà file kia không hay:

- **`SPEC.md`** — đặc tả: app làm gì, vì sao làm vậy (2 việc app làm, data model đầy đủ,
  nguyên tắc kiến trúc, tóm tắt API, cấu trúc FE). Đọc trước khi làm quen với dự án.
- **`CLAUDE.md`** (file này) — tài liệu làm việc: quy tắc bắt buộc, bẫy đã trả giá, lệnh
  chạy dự án. Đọc trước khi CODE trong repo.
- `SHARED_EXPENSES.md` — đào sâu riêng tính năng công nợ: mô hình tiền hai chiều, công thức
  công nợ, quy tắc làm tròn, trường hợp biên. Đọc khi cần sửa phần đó.

`API_ENDPOINTS.md`, `REDESIGN.md` đã xóa từ đợt viết lại trước — mô tả app cũ (AI, ngân
sách, mục tiêu, ví, auth, webhook) nên giữ lại chỉ gây hiểu nhầm. `SPEC.md` cũ cũng bị xóa
cùng đợt đó nhưng đã viết lại (bản hiện tại phản ánh đúng kiến trúc SePay + công nợ). Bản
cũ lấy lại được từ git nếu cần đối chiếu lịch sử: `git log --all --oneline -- SPEC.md`.
