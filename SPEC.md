# SPEC.md

Bản đặc tả sản phẩm — mô tả **app hiện tại thực sự làm gì**.

Lịch sử ngắn: sau một đợt tái kiến trúc lớn, app từng bị rút xuống chỉ còn hai việc (dòng
tiền + công nợ), bỏ AI/ngân sách/mục tiêu/ví/đăng nhập, chuyển sang mô hình kéo giao dịch từ
SePay. Sau đó **AI, ngân sách, mục tiêu, khoản nợ đã được phục hồi** — nhưng có chọn lọc:
giữ lại mô hình kéo SePay (không quay lại nhập tay/webhook), giữ bỏ đăng nhập và `Wallet`,
và AI phục hồi với phạm vi **hẹp hơn bản gốc** (xem §1, §4.6).

**Quan hệ với `CLAUDE.md`**: file đó là tài liệu làm việc — quy tắc bắt buộc, bẫy đã trả
giá, lệnh chạy dự án. File này là đặc tả — app làm gì, vì sao làm vậy, dữ liệu trông ra sao.
Đổi tính năng/data model/API thì cập nhật **cả hai cùng lúc**, đừng để một file lệch khỏi
thực tế mà file kia không hay.

## 1. App này làm gì

**Hai việc lõi, không đổi:**

1. **Nhìn thấy dòng tiền luân chuyển** — app **chủ động kéo** giao dịch từ SePay về theo
   chu kỳ. Không gõ tay, không webhook.
2. **Ghi log ai nợ mình** — trả hộ cả nhóm thì biết từng người nợ bao nhiêu; ghi cả chiều
   mình nợ người khác.

**Bốn việc hỗ trợ, phục hồi từ bản trước:**

3. **Đặt hạn mức chi** theo danh mục hoặc tổng, có cộng dồn chênh lệch qua kỳ (§4.6a).
4. **Đặt mục tiêu để dành** — gắn nhãn tiền chứ không rút ra khỏi tài khoản (§4.6b).
5. **Theo dõi khoản vay** (ngân hàng/người quen) và mô phỏng kế hoạch trả nợ (§4.6c).
6. **AI đọc số liệu và đưa nhận định** — CHỈ dạng lệnh/phân tích tài chính đã tổng hợp sẵn
   ở BE (đánh giá mức cần thiết, báo cáo kỳ, điểm sức khỏe tài chính). **Không có chat** —
   người dùng không hỏi-đáp tự do với AI (§4.7).

Vẫn **không có**: đăng nhập/nhiều người dùng, `Wallet`/số dư khai tay, nhập giao dịch bằng
tay, AI dạng chat, giới hạn số lượt gọi AI/ngày (§4.7 giải thích vì sao không cần). App
phục vụ **đúng một người dùng**, chạy trên tài khoản ngân hàng của chính họ.

## 2. Tech stack

- **`FE/`** — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4. Deploy dạng
  tĩnh (`output: 'export'`), không có route handler, không server action.
- **`BE/`** — NestJS 11 + TypeORM + PostgreSQL. API prefix `/api/v1`.
- **Không có Redis, không có hàng đợi.** Cron của `@nestjs/schedule` chạy ngay trong tiến
  trình BE (chốt kỳ ngân sách, sinh báo cáo AI định kỳ) — toàn bộ trạng thái nằm trong
  Postgres, không có tầng cache/hạ tầng nào khác chen giữa.

### Vì sao không cần đăng nhập

App chỉ phục vụ một người, trên một tài khoản ngân hàng của chính họ. `SingleUserGuard`
(`common/guards/`) gắn sẵn `userId` của dòng `User` duy nhất vào mọi request — **guard này
không bảo vệ gì cả**, ai gọi được API là đọc được toàn bộ dữ liệu ngân hàng. An toàn phụ
thuộc hoàn toàn vào việc API **không lộ ra Internet** (xem §8).

`userId` vẫn còn ở mọi bảng, mọi query — cố ý giữ lại để ngày nào cần nhiều người dùng thật
thì chỉ phải thay đúng một guard, không phải sửa schema.

## 3. Data model

```
users            — đúng MỘT dòng (SingleUserService seed lúc khởi động)
bank_accounts    — tài khoản ngân hàng liên kết qua SePay
categories       — danh mục thu/chi, có 2 danh mục HỆ THỐNG, có `kind` (need/want/saving)
transactions     — bản sao nguyên vẹn của sổ ngân hàng (chỉ đọc, không cắt/sửa)
contacts         — danh bạ bạn bè (không phải tài khoản)
shared_expenses        — một lần chi chung
shared_expense_shares  — phần của từng người trong một lần chi chung
settlements      — một lần trả nợ (không sinh giao dịch)

budgets                — hạn mức chi theo danh mục hoặc tổng (§4.6a)
budget_period_results  — snapshot kết quả MỖI KỲ đã đóng (hạn mức + đã tiêu tại thời điểm đó)
goals                  — mục tiêu để dành (§4.6b)
goal_contributions      — lịch sử nạp tiền vào một mục tiêu
debts                   — khoản vay (§4.6c)
debt_payments            — lịch sử trả nợ
ai_insights             — kết quả AI đã sinh, MỘT bản/(user, loại, kỳ) — xem §4.7
```

### `User`

Luôn có đúng một dòng — `SingleUserService` tạo lúc app khởi động, đọc DB thấy nhiều dòng
thì lấy **dòng cũ nhất**. Không có `email`/`passwordHash`. Giữ `timezone` và
`monthStartDay` (1–28; VD 25 = "tháng" chạy từ 25 tới 24 tháng sau) — hai giá trị này chi
phối mọi phép tính theo kỳ.

`monthlyIncome` (nullable) — thu nhập hàng tháng ước tính, khai qua `.env` (`MONTHLY_INCOME`)
giống mọi cài đặt khác của app single-user. Dùng để AI quy đổi "khoản này chiếm bao nhiêu %
thu nhập" và tính `debtToIncome` cho điểm sức khỏe tài chính (§4.7). Để trống thì AI vẫn
chạy, chỉ bỏ qua phần quy đổi đó — không phải trường bắt buộc.

### `BankAccount`

```ts
accountNumber   // UNIQUE toàn cục — khóa tra "giao dịch này về của ai"
bankName
nickname        // tên tự đặt, VD "Tài khoản chính"
currentBalance  // bigint — bản SAO của accumulated mới nhất SePay trả, KHÔNG tự cộng trừ
lastSyncedAt    // im lặng quá lâu = liên kết SePay hỏng
```

**Ngân hàng là nguồn sự thật.** `currentBalance` chép thẳng từ `accumulated` của giao dịch
mới nhất — đây **không mâu thuẫn** với quy tắc "không lưu cột balance tự tính" (khoản đó
chặn việc app tự cộng dồn rồi lệch khỏi lịch sử của chính nó). Ở đây con số do ngân hàng
cấp, app chỉ chép lại; tự cộng trừ mới là sai vì app không thấy hết mọi biến động (phí,
lãi, giao dịch trước khi liên kết).

Liên kết khai qua `.env` (`BANK_ACCOUNT_NUMBER`), **không có UI liên kết** — một người một
tài khoản, giá trị gần như không đổi.

### `Category`

```ts
type       // income | expense
kind       // need | want | saving — khung 50/30/20, xem giải thích dưới
icon       // tên icon lucide-react
color      // hex, cũng là màu trong biểu đồ
parentId   // danh mục 2 cấp, null = cấp 1
isDefault  // seed sẵn lúc tạo user
isSystem   // ĐỌC KỸ MỤC 5 — loại khỏi thống kê theo cách khác nhau tùy danh mục
```

**`kind`** quyết định AI được phép đề xuất cắt giảm ở đâu (§4.7): AI **chỉ** đụng vào
`want`, tuyệt đối không đề xuất cắt `need` (tiền nhà, điện nước, thuốc men...) hay `saving`.
Danh mục hệ thống (`isSystem`) có `kind` nhưng giá trị đó KHÔNG có ý nghĩa thực tế — chúng
bị loại khỏi phân tích AI trước khi `kind` được xét tới (xem `default-categories.ts`).

### `Transaction` — trái tim của app

```ts
bankAccountId
categoryId    // BẮT BUỘC — mọi giao dịch phải có danh mục, kể cả "Chưa phân loại"
type          // income | expense
amount        // bigint, LUÔN DƯƠNG — chiều tiền suy từ `type`
date          // thời điểm XẢY RA, khác createdAt
sepayId       // id bên SePay — khóa chống trùng, NULL với dòng con khi tách hóa đơn
referenceCode
reviewedAt    // NULL = chưa xét xong có phần trả hộ ai không
tags          // text[]
```

`@Unique(['userId', 'sepayId'])` — Postgres không coi hai NULL là trùng, nên các dòng phát
sinh từ tách hóa đơn (`sepayId = null`) không bị ràng buộc này chặn.

**⚠️ Bảng này chỉ đọc từ phía nghiệp vụ chia bill.** Không có `POST /transactions` cho
người dùng nhập tay. Giao dịch chỉ đến từ **hai nguồn**: đồng bộ SePay, hoặc tách một giao
dịch có sẵn khi chia bill (xem §6).

### `Contact` — danh bạ, KHÔNG phải tài khoản

Không đăng ký, không mời, không email. Chỉ là sổ tên riêng của user.

```ts
name             // giữ nguyên như user gõ, VD "Anh Tuấn"
nameNormalized   // trim+lowercase, CHỈ để chống trùng — KHÔNG bỏ dấu
phone, note, color
qrImage          // data URI base64, lưu THẲNG trong DB — KHÔNG dùng dịch vụ ảnh ngoài
isArchived
```

Vì sao `qrImage` nằm thẳng trong Postgres thay vì một dịch vụ lưu ảnh: danh bạ chỉ vài
người, mỗi ảnh vài chục KB. Ảnh nằm trong DB thì tự đi theo `docker/backup.sh` — không có
chuyện khôi phục xong ảnh mất hết vì quên backup một nơi khác. `qrImage` **không** được trả
trong danh sách danh bạ (`GET /contacts`), chỉ trả ở endpoint chi tiết — tránh gửi lại vài
chục KB × N người mỗi lần mở trang.

Vì sao có bảng riêng thay vì lưu chuỗi tên vào từng dòng chia bill: "Tuấn"/"tuấn"/"anh
Tuấn" sẽ thành ba người khác nhau, công nợ bị xé nhỏ và không cộng lại được.

**Cố ý KHÔNG gộp tên có dấu với không dấu** — "Tuấn" và "Tuan" có thể là hai người thật; gộp
nhầm thì công nợ sai và rất khó lần ra. Gộp là thao tác thủ công.

### `SharedExpense` + `SharedExpenseShare` — một lần chi chung

```ts
payerContactId   // NULL = BẠN trả · có giá trị = người đó trả hộ bạn
transactionId    // tham chiếu tới Transaction đã tách, SET NULL khi xóa giao dịch gốc
totalAmount
shares[]         // Σ amount của mọi share PHẢI = totalAmount, kiểm ở service
```

`@Unique(['transactionId'])` — một giao dịch ngân hàng chỉ được chia đúng một lần.

### `Settlement` — một lần trả nợ

```ts
direction   // they_paid_me | i_paid_them
amount      // LUÔN DƯƠNG, chiều suy từ direction
```

**Không sinh `Transaction`.** Trả nợ qua chuyển khoản thì ngân hàng đã báo về rồi (tạo thêm
là đếm tiền hai lần); trả tiền mặt thì không có gì để ngân hàng báo. Bảng này chỉ ghi công
nợ đã dịch chuyển bao nhiêu. Cho phép trả từng phần và trả dư (công nợ đổi dấu) — không
chặn, vì đời thật vẫn xảy ra vậy.

## 4. Nguyên tắc kiến trúc — không được làm sai

### 4.1 Ngân hàng là nguồn sự thật, `transactions` chỉ đọc

Không có `POST /transactions`. Sổ giao dịch là bản sao nguyên vẹn của những gì SePay báo
về — app không được cắt nhỏ, đổi số tiền, hay thêm dòng tùy tiện vào đó. Cần đối chiếu với
sao kê lúc có tranh chấp thì bảng này phải khớp 100%.

### 4.2 Chia bill = TÁCH giao dịch, không tạo giao dịch mới

Đây là chỗ dễ sai nhất, hậu quả là **mất tiền trên sổ**.

Ngân hàng đã báo khoản chi 1.000.000₫. Tạo thêm dòng cho phần chia là đếm hai lần — số dư
app thấp hơn thực tế đúng một hóa đơn. Đúng cách:

```
Giao dịch gốc  1.000.000₫  (từ SePay)
        │
        ▼ ghi vào shared_expenses + shared_expense_shares
        │  (transactions KHÔNG bị sửa, chỉ tham chiếu qua transactionId)
        ▼
  "ai nợ bạn bao nhiêu" tính từ shared_expense_shares + settlements,
  KHÔNG tính từ transactions
```

`shared_expenses`/`settlements` trả lời "ai nợ tôi bao nhiêu"; `transactions` trả lời "ngân
hàng đã ghi nhận những gì". Hai câu hỏi khác nhau, hai bảng riêng — không trộn.

Chiều ngược lại (**người khác trả hộ bạn**) → **không giao dịch nào cả**, tiền chưa rời tài
khoản của bạn. Khoản chi chỉ xuất hiện lúc bạn tất toán (ghi một `Settlement` hướng
`i_paid_them`, kèm một `Transaction` chi thật nếu trả qua chuyển khoản).

### 4.3 Hai danh mục hệ thống, đối xử KHÁC NHAU

```ts
SYSTEM_CATEGORY.TRA_HO_BAN_BE     // "Trả hộ bạn bè"
SYSTEM_CATEGORY.CHUA_PHAN_LOAI    // "Chưa phân loại"
```

| Danh mục | Vào tổng thu/chi? | Vào biểu đồ theo danh mục? |
|---|---|---|
| `Trả hộ bạn bè` | ❌ tiền cho mượn, sẽ về | ❌ |
| `Chưa phân loại` | ✅ **có** — tiền đã đi thật | ❌ lát bánh vô nghĩa |

Lọc `isSystem = false` cho cả hai là **sai**: mọi giao dịch từ ngân hàng đều bắt đầu ở
trạng thái "Chưa phân loại", nên tổng chi sẽ gần bằng 0 cho tới khi gán hết nhãn — con số
sai mà trông vẫn hợp lý. `StatsService.baseQuery(userId, range, boQuaChuaPhanLoai)` là chỗ
duy nhất quyết định lọc kiểu nào; tra danh mục hệ thống phải so cả `name`, không chỉ
`isSystem: true` (có nhiều hơn một).

### 4.4 Đồng bộ SePay — kéo, không phải chờ đẩy

App gọi `GET /userapi/transactions/list` của SePay theo chu kỳ. Ba đường kích hoạt: nút
Đồng bộ trên giao diện · cron định kỳ · `POST /sepay/sync` kèm `{"tuNgay": "..."}` để nạp
lịch sử cũ.

Vì sao kéo thay vì webhook: webhook mà app đang tắt là **mất luôn**, không cách nào biết
mình bỏ lỡ gì. Kéo thì hỏi lúc nào cũng ra đủ — và app **không cần lộ ra Internet**.

Bốn chốt chặn bắt buộc trong `sepay-sync.service.ts` / `sepay-api.client.ts` /
`sepay.normalizer.ts`:

- **Chống trùng** `@Unique(['userId', 'sepayId'])` — chạy đồng bộ thừa vẫn an toàn.
- **Mọi số SePay trả về là CHUỖI** (`"50000.00"`) — cộng thẳng là nối chuỗi. Chuẩn hóa ở
  `sepay.normalizer.ts`, hàm `chuanHoa()` — chỗ DUY NHẤT được đổi hình dạng dữ liệu.
- **Chiều tiền suy từ hai cột riêng** `amount_in`/`amount_out`, không có cờ `in`/`out`.
- **Phân trang**: SePay trả tối đa **5000 dòng/lần**. Chạm trần nghĩa là còn nữa, phải xin
  tiếp với `since_id` mới — thiếu bước này thì lần nạp lịch sử đầu lặng lẽ dừng ở 5000.
- **Múi giờ**: `transaction_date` là chuỗi `"2026-08-26 21:15:00"` không có múi giờ.
  `new Date()` hiểu theo giờ máy chủ — container chạy UTC nên giao dịch 7h sáng rơi sang
  ngày hôm trước. Xử lý trong `doiSangUtc()`.

**Giới hạn 3 lần gọi/giây**; vượt thì `429` kèm header `x-sepay-userapi-retry-after`. Tôn
trọng header đó, chỉ thử lại đúng một lần — 429 lặp lại nghĩa là có thứ khác đang gọi song
song.

**Số dư đặt MỘT LẦN cuối đợt**, theo `accumulated` của giao dịch có `sepayId` lớn nhất —
không đặt theo từng dòng khi đang nạp lịch sử, nếu không số dư sẽ nhảy ngược về quá khứ.

`SEPAY_API_TOKEN` **toàn quyền** — SePay chưa hỗ trợ phân quyền API. Không commit, không
đưa sang FE.

### 4.5 Công nợ — công thức chỉ viết ở MỘT chỗ

`FriendsService.tinhCongNo()` — bốn số hạng cộng trừ đan nhau; rải dấu +/− ra nhiều query
là chắc chắn sai dấu ở đâu đó, mà sai dấu công nợ thì con số vẫn "trông hợp lý" nên không ai
phát hiện:

```
X nợ bạn =  Σ share(X)   trong hóa đơn BẠN trả       (họ mượn bạn)
          − Σ share(bạn) trong hóa đơn X trả         (bạn mượn họ)
          − Σ settlement they_paid_me của X          (họ đã trả lại)
          + Σ settlement i_paid_them  của X          (bạn đã trả lại)
```

Luôn `SUM()` trực tiếp từ `shared_expense_shares` + `settlements`, **không** lưu cột
`balance` trên `Contact`. Bất biến khi chia bill: `Σ shares = totalAmount`; làm tròn thì
phần lẻ dồn vào người trả.

### 4.6 Ngân sách · Mục tiêu · Khoản nợ — không đụng `BankAccount`/`Wallet`

Ba tính năng này không tạo `Transaction`, không đọc/sửa số dư ngân hàng trực tiếp (trừ một
chỗ: `Goal.contribute()` ĐỌC `TransactionsService.getBalance()` để chặn nạp vượt số tiền
đang có — không viết vào đó). Restore từ bản gốc chỉ cần đổi tham chiếu `Wallet` cũ sang
`BankAccount` hiện tại ở đúng một điểm này.

**a) `Budget`** — hạn mức chi cho một `categoryId` (null = áp cho toàn bộ chi tiêu),
lặp theo `period` (weekly/monthly). `rollover = true` thì chênh lệch cộng/trừ sang kỳ sau,
**cả hai chiều** (dư thì cộng thêm, vượt thì bị trừ bớt) — chỉ cộng khi dư mà không trừ khi
vượt sẽ biến ngân sách thành phần thưởng một chiều, tiêu lố không phải trả giá. Phần
cộng/trừ bị chặn ở `±rolloverCapRatio × amount` (mặc định ±50%), nếu không tiết kiệm vài kỳ
liền sẽ đẩy hạn mức phồng lên vô hạn và mất tác dụng kiểm soát.

`BudgetsScheduler` chạy **mỗi ngày lúc 00:30 giờ VN**, chốt các kỳ ĐÃ KẾT THÚC mà chưa có
`BudgetPeriodResult` — snapshot này giữ lại hạn mức TẠI THỜI ĐIỂM ĐÓ, vì sửa `budget.amount`
sau này sẽ ghi đè và làm mất thông tin "lúc đó hạn mức là bao nhiêu". Idempotent nhờ
`UNIQUE(budgetId, periodStart)`.

**b) `Goal`** — mục tiêu để dành, có `targetAmount`/`currentAmount`/`deadline` tùy chọn.
`contribute()` là **gắn nhãn, không phải chi tiêu**: không sinh `Transaction`, tiền vẫn nằm
trong tài khoản, chỉ đổi `currentAmount`. Chặn nạp vượt tổng tiền tự do đang có (so với
`Σ currentAmount` của mọi mục tiêu ACTIVE, đọc từ `TransactionsService.getBalance()`).
`requiredMonthly`/`onTrack` do BE tính lại mỗi lần đọc (còn thiếu ÷ số kỳ còn lại theo mốc
lịch, dùng `floor` thận trọng chứ không `ceil`) — không lưu cứng, vì kỳ nào không nạp thì số
cần nạp phải tự đội lên ở kỳ sau.

**c) `Debt`** — khoản vay (ngân hàng hoặc người quen), khác hẳn "công nợ bạn bè" ở §4.5:
đây là nợ CÁ NHÂN có lãi suất, không liên quan `Contact`/`shared_expenses`. `pay()` ghi
`DebtPayment` + trừ `remaining` trong một transaction. `payoffPlan()` mô phỏng lịch trả theo
tháng với hai chiến lược: **snowball** (trả khoản CÒN NỢ ÍT NHẤT trước — tốn lãi hơn nhưng
nhanh thấy kết quả) và **avalanche** (trả khoản LÃI CAO NHẤT trước — tổng lãi ít nhất);
khoản trả xong giải phóng dòng tiền dồn cho khoản tiếp theo.

### 4.7 AI — phạm vi hẹp, không chat, không đếm lượt

**Chỉ có 5 điểm vào**, tất cả là lệnh/phân tích đã tổng hợp sẵn ở BE — **không có chat**,
không hỏi-đáp tự do:

```
GET  /ai/necessity-review   Đánh giá mức cần thiết — chỉ xét danh mục kind="want"
GET  /ai/report              Báo cáo tổng kết kỳ — dòng tiền + ngân sách + mục tiêu + nợ
GET  /ai/health-score        Điểm sức khỏe tài chính 0-100
GET  /ai/insights            CHỈ ĐỌC — không gọi AI, dùng để hiện lại bản đã sinh
POST /ai/insights/generate   Sinh theo `kind` chỉ định (dùng nội bộ bởi 3 route trên)
```

**Vì sao không cần giới hạn lượt gọi/ngày**: `ai_insights` khóa **`UNIQUE(userId, kind,
periodStart)`** — một kỳ chỉ có đúng một bản, sinh lại thì `upsert` GHI ĐÈ, không đẻ thêm
dòng. Trước khi gọi LLM thật, `AiService.sinhInsight()` băm dữ liệu đầu vào (`inputHash`) và
tra Postgres: dữ liệu tài chính của một kỳ không đổi liên tục (chỉ đổi khi có giao dịch mới
hoặc gán lại danh mục), nên phần lớn lượt gọi trùng đã bị chặn ở tầng cache này — không cần
thêm một lớp đếm lượt/ngày phía trên. Người dùng tự quản lý mức dùng LLM_API_KEY của mình.

**`AiScheduler`** sinh tự động cho kỳ VỪA ĐÓNG, chạy **08:00 sáng giờ VN mỗi ngày** — không
phải nửa đêm, vì người ta hay ghi bù giao dịch Chủ nhật vào sáng Thứ Hai, và không phải lúc
kỳ vừa đóng vì `monthStartDay` khác nhau giữa các cấu hình nên "cuối kỳ" không phải một mốc
chung. Chỉ sinh 3 loại theo cron: `weekly`, `monthly`, `necessity` (kỳ tuần). **`health-score`
không nằm trong cron** — nó là một số tính từ dữ liệu THÁNG HIỆN TẠI, hợp lệ để xem bất cứ
lúc nào, nên sinh trực tiếp mỗi khi có người mở, cache `inputHash` vẫn chặn gọi trùng.

**Trang `/ai` không tự gọi AI sinh báo cáo mới** — nó đọc `GET /ai/insights?kind=necessity`
(chỉ query DB) để tránh việc mở trang giữa kỳ vô tình tốn quota và ghi vào kho một bản dựng
từ dữ liệu mới vài ngày, đè lên chỗ mà cron sẽ chốt đúng vào cuối kỳ.

**Luật bất di bất dịch cho mọi prompt** (`SYSTEM_PROMPT` trong `ai-prompt.builder.ts`):
không bịa số (mọi số phải lấy từ dữ liệu BE tổng hợp sẵn), chỉ đề xuất cắt ở `kind="want"`,
mỗi gợi ý kèm số tiền tiết kiệm được/tháng, giọng trung lập không phán xét (cấm "lãng phí",
"hoang phí"), và phải nói "chưa đủ dữ liệu" khi `daysOfData < 14` thay vì suy diễn xu hướng.

`LlmClient` nói giao thức **OpenAI-compatible** (đổi nhà cung cấp chỉ sửa 3 biến
`LLM_PROVIDER`/`LLM_BASE_URL`/`LLM_MODEL`), để trống `LLM_API_KEY` thì app vẫn chạy, mọi
endpoint AI trả `503` kèm lý do cụ thể (thiếu key/hết credit/model sai) thay vì làm sập.

## 5. Thống kê — `StatsService`

Nguồn cho cả trang "Tổng quan" của FE.

| Endpoint | Trả về |
|---|---|
| `GET /stats/balance` | Số dư hiện tại + đã cam kết cho mục tiêu + tổng công nợ hai chiều |
| `GET /stats/summary` | Tổng thu/chi một kỳ, kèm `byKind`/`kindRatio` và so sánh kỳ trước |
| `GET /stats/by-category` | Chi theo danh mục — loại "Chưa phân loại", có kèm `kind` |
| `GET /stats/anomalies` | Khoản chi bất thường so với thói quen |
| `GET /stats/trend` | Chuỗi thời gian theo ngày/tuần/tháng |
| `GET /stats/calendar` | Lịch nhiệt theo ngày |

`byKind`/`kindRatio` (need/want/saving) là đầu vào chính cho khung 50/30/20 và cho AI (§4.7)
— tính từ `baseQuery(userId, range, boQuaChuaPhanLoai: true)`, loại cả "Chưa phân loại" vì
`kind` của nó không mang ý nghĩa thật. `committedToGoals` = `Σ currentAmount` của mọi
`Goal` đang ACTIVE; `freeToSpend = currentBalance − committedToGoals − owedByMe`.

### So sánh kỳ trước — phải biết khi nào KHÔNG so được

SePay chỉ ghi giao dịch từ lúc tài khoản được liên kết, không lấy ngược lịch sử ngân hàng.
Kỳ trước có thể chỉ chứa vài ngày cuối trong khi kỳ này chạy trọn — so hai cái đó ra
"chi nhiều hơn 550%" là **bịa**, phần lớn chênh lệch đến từ việc kỳ trước thiếu dữ liệu.
`getSummary()` so ngày giao dịch cũ nhất với đầu kỳ trước; thiếu dữ liệu thì trả
`changePercent: null` kèm cờ `previousPeriodPartial: true` để FE nói rõ lý do thay vì hiện
một con số sai mà vẫn trông hợp lý.

### Phát hiện bất thường — mốc là TRUNG VỊ

`getAnomalies()` dùng trung vị chi tiêu trong khoảng đang xem làm mốc, không dùng trung
bình — trung bình bị chính khoản bất thường kéo lên nên càng có outlier lớn thì ngưỡng
càng cao và outlier càng dễ lọt lưới. Ngưỡng báo: gấp **10 lần trung vị**, tối thiểu
**200.000₫** (sàn tuyệt đối, chặn trường hợp tiêu vặt), và cần tối thiểu **10 giao dịch**
mới đủ để trung vị có ý nghĩa. Cố ý **không** loại "Chưa phân loại" khỏi phép tính này
(khác với by-category) — một khoản lớn chưa gán nhãn càng đáng xem; "Trả hộ bạn bè" thì
loại vì đó là tiền cho mượn, báo động vì nó là báo sai.

## 6. API — tóm tắt route

```
GET    /users/me                       Hồ sơ (chỉ đọc — sửa qua .env)
GET    /bank-accounts                  Tài khoản ngân hàng (chỉ đọc)

GET    /categories
POST   /categories
PATCH  /categories/:id
DELETE /categories/:id

GET    /transactions                   Cursor-based, lọc q/from/to/categoryId/unreviewed...
GET    /transactions/unreviewed-count
GET    /transactions/:id
PATCH  /transactions/:id               Đổi danh mục, đánh dấu đã xét
DELETE /transactions/:id

GET    /sepay/status                   Đã cấu hình SEPAY_API_TOKEN chưa
POST   /sepay/sync                     {"tuNgay"?: "yyyy-mm-dd"} — bỏ trống = tăng dần

GET    /contacts
POST   /contacts
GET    /contacts/:id                   Chỉ endpoint này trả qrImage
PATCH  /contacts/:id
DELETE /contacts/:id                   Chặn khi công nợ ≠ 0

GET    /shared-expenses
POST   /shared-expenses
DELETE /shared-expenses/:id

POST   /settlements
DELETE /settlements/:id

GET    /stats/balance
GET    /stats/summary
GET    /stats/by-category
GET    /stats/anomalies
GET    /stats/trend
GET    /stats/calendar

GET    /budgets                        Kèm progress kỳ hiện tại, FE không phải tự tính
GET    /budgets/history                Snapshot các kỳ ĐÃ ĐÓNG — đặt trước :id trong route
POST   /budgets
PATCH  /budgets/:id
DELETE /budgets/:id

GET    /goals
POST   /goals
GET    /goals/:id
PATCH  /goals/:id
DELETE /goals/:id
POST   /goals/:id/contribute           Gắn nhãn tiền — KHÔNG sinh Transaction
GET    /goals/:id/contributions

GET    /debts
GET    /debts/payoff-plan?strategy&extraPayment   Đặt trước :id trong route
POST   /debts
GET    /debts/:id
PATCH  /debts/:id
POST   /debts/:id/payment
GET    /debts/:id/payments

GET    /ai/necessity-review
GET    /ai/report
GET    /ai/health-score
GET    /ai/insights                    CHỈ ĐỌC — dùng ở FE, không tự sinh
POST   /ai/insights/generate

GET    /export/excel
```

Không có route nào dưới `@Public()` — mọi endpoint đều đi qua `SingleUserGuard` (không
chặn, chỉ gắn danh tính). Xem §8 về việc app không được lộ ra Internet.

## 7. Frontend

`AppShell` tách hai nhóm điều hướng (`NAV_CHINH`/`NAV_PHU`): nhóm chính là việc làm HẰNG
NGÀY (dòng tiền, công nợ, trợ lý AI) — luôn hiện trên tab bar mobile; nhóm phụ là việc
THỈNH THOẢNG mới đụng (ngân sách, mục tiêu, nợ, báo cáo, danh mục) — gộp sau nút "Thêm" trên
mobile (tab bar chỉ chứa được ~4 mục trước khi vùng bấm quá hẹp), hiện đầy đủ ở sidebar
desktop vì không bị giới hạn không gian.

```
FE/src/app/(app)/
├── transactions/page.tsx    Dòng tiền — màn hình mặc định (/ redirect vào đây)
├── contacts/page.tsx        Công nợ / Danh bạ
├── budgets/page.tsx         Ngân sách
├── goals/page.tsx           Mục tiêu
├── debts/page.tsx           Khoản nợ
├── ai/page.tsx              Trợ lý AI — health-score + necessity-review, KHÔNG có chat
├── reports/page.tsx         Kho báo cáo tuần/tháng đã sinh (chỉ đọc `GET /ai/insights`)
└── categories/page.tsx      Quản lý danh mục — tạo/sửa/xóa, gán `kind`
```

### `/transactions` — cấu trúc tab, không phải chồng card

Bản thiết kế hiện tại (viết lại toàn bộ, thay cho bản xếp Card cuộn dài trước đó):

1. **Hero số dư tràn viền** (`-mx-4 md:-mx-6`, phá khung padding của `<main>`) — gradient
   theo màu brand, không phải Card nằm lọt trong cột nội dung. Có nút ẩn/hiện số dư
   (`Eye`/`EyeOff`, nhớ trạng thái qua `localStorage`) và nút Đồng bộ.
2. **Khoảng ngày dùng chung cho cả hai tab** (`DateRangeFilter`), đặt ngay dưới hero, ngoài
   phạm vi tab.
3. **`Segmented` tab**: "Tổng quan" ↔ "Giao dịch" — hai việc khác nhau (xem xu hướng / tra
   một khoản cụ thể), không bắt cuộn qua biểu đồ mới tới được sổ giao dịch.
   - **Tổng quan**: cặp Tiền vào/Tiền ra (một khối chia đôi bằng gạch dọc, không phải hai
     Card riêng) → cảnh báo bất thường (danh sách vạch màu trái, không đóng khung) →
     `CashflowChart` → `CategoryBreakdown` (cả hai không bọc Card, chỉ tiêu đề + gạch
     phân cách).
   - **Giao dịch**: `TransactionFilters` (tìm + toggle "chưa xét", chỉ có nghĩa ở tab này)
     → `TransactionList` — dòng chảy liên tục theo ngày, vạch trái thay viền ô, **không
     dùng `<table>`**.

Trạng thái khoảng-ngày và tìm-kiếm/chưa-xét nằm ở **URL query**, đồng bộ qua
`URLSearchParams` chung — F5 không mất bộ lọc. Tab thì nằm ở `useState` cục bộ nhưng **đồng
bộ một chiều từ URL lúc mount** (`DongBoTabTuUrl`): có `?unreviewed=1` hoặc `?q=...` trong
URL thì tự chuyển sang tab "Giao dịch", để link kiểu *"Xem N khoản chưa xét"* từ
`CategoryBreakdown` mở đúng chỗ. ⚠️ Đọc URL trong `useEffect`, không phải trong initializer
của `useState` — đọc `window.location` ngay lúc khởi tạo state sẽ làm HTML server và lần
render đầu ở client khác nhau (lỗi hydration mismatch).

### Hệ thống thiết kế — `components/ui/`

Tách theo từng file (không còn 1 file dồn hết), dùng `class-variance-authority` cho mọi
component có biến thể — thêm variant mới là thêm một dòng, không phải sửa type tay:

```
button.tsx      Button       primary/secondary/ghost/danger/outline
badge.tsx       Badge        chip trạng thái/số đếm — tone theo Ý NGHĨA, không theo màu thô
card.tsx        Card, CardTitle
stat.tsx        Stat         mẫu "nhãn + số lớn [+ dòng phụ]", dùng lặp khắp app
avatar.tsx      Avatar       vòng tròn màu + chữ cái đầu
segmented.tsx   Segmented    tab điều hướng phân đoạn
input.tsx       Field, Input, Select, Textarea
modal.tsx       Modal
progress.tsx    Progress
state.tsx       EmptyState, ErrorState, Skeleton
```

Token trong `globals.css` (`@theme` — Tailwind v4, không còn `tailwind.config.js`):

- Thang trung tính 11 bậc (`--color-neutral-50..950`) — mọi sắc xám trong app lấy từ đây,
  không tự chế hex mới.
- Elevation 4 bậc (`--shadow-sm/md/lg/brand`) — `.elevation-*` là class dùng chung, đừng
  viết `box-shadow` tay ở nơi khác.
- Bo góc theo VAI TRÒ (`--radius-control/surface/sheet`), không phải theo số đo cụ thể.
- `--color-income`/`--color-expense` dùng NHẤT QUÁN toàn app cho chiều tiền — không dùng
  `green-500`/`red-500` rời rạc ở bất kỳ đâu khác.

⚠️ **Không dùng path alias `@/` ở BE** (dùng ở FE bình thường) — `tsc` biên dịch BE không
rewrite đường dẫn nên `require("@/...")` chết lúc runtime.

## 8. Vận hành

### Cấu hình — `BE/.env`, không có màn hình cài đặt

```bash
BANK_ACCOUNT_NUMBER=...   # phải khớp CHÍNH XÁC số SePay dùng
BANK_NAME=TPBANK
TIMEZONE=Asia/Ho_Chi_Minh
MONTH_START_DAY=1
MONTHLY_INCOME=           # để trống thì AI bỏ qua phần quy đổi %, không chặn boot
SEPAY_API_URL=https://my.sepay.vn
SEPAY_API_TOKEN=...       # my.sepay.vn → Cấu hình Công ty → API Access — TOÀN QUYỀN, giữ kín

# AI — OpenAI-compatible, để trống LLM_API_KEY thì app vẫn chạy, các endpoint /ai/* trả 503
LLM_PROVIDER=Gemini
LLM_API_KEY=
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-flash-lite-latest
```

⚠️ Cố ý **không có** biến giới hạn lượt gọi AI/ngày — lý do ở §4.7 (cache `inputHash` theo
kỳ đã là chốt chặn thật, người dùng tự quản lý mức dùng key của mình).

`SingleUserService` đọc và đồng bộ lúc khởi động, idempotent — sửa file rồi restart là
xong.

### Vì sao không cần mở ra Internet

Từ khi chuyển sang kéo (§4.4), app không còn cần nhận webhook nên **không cần lộ ra
Internet nữa**. Vì `SingleUserGuard` không chặn ai (§2), mở tunnel/port ra ngoài mà không
thêm một lớp xác thực khác là để lộ toàn bộ dữ liệu ngân hàng cho bất kỳ ai gõ đúng URL.
Chỉ mở khi có lý do rõ ràng (VD dùng từ điện thoại ngoài mạng nhà), và phải thêm chặn ở
tầng khác (Cloudflare Access, Tailscale, Basic Auth ở reverse proxy...).

### Docker

```
docker compose up -d --build     dựng và chạy (postgres + be + fe, KHÔNG có redis)
docker compose logs -f be        xem log API, kết quả đồng bộ in ở đây
sh docker/backup.sh              sao lưu DB — bao gồm cả ảnh QR base64
sh docker/restore.sh <file>      phục hồi, GHI ĐÈ toàn bộ
```

`docker-compose.yml` ghi đè `PORT`/`DB_*`/`CORS_ORIGIN` qua khối `environment:` — sửa các
biến này trong `.env` **không có tác dụng** khi chạy bằng Docker, chỉ có hiệu lực khi chạy
`npm run start:dev` trực tiếp trên máy.

## 9. Tồn đọng đã biết — cố ý chưa dọn

- Một vài comment cũ trong entity (`bank-account.entity.ts`, `category.entity.ts`) còn nhắc
  tới "webhook" hoặc "Điều chỉnh số dư" — hành vi thật đã đổi sang kéo (§4.4) và
  `adjust-balance` đã bị gỡ; comment chưa cập nhật theo, đừng tin theo nghĩa đen.
- **`transactions/dto/*.ts` vẫn khai `createTransactionSchema` và `adjustBalanceSchema`**
  nhưng **không controller nào import** — đã kiểm chứng bằng grep, 0 kết quả. Bảng ở §6 mô
  tả đúng thực tế (không có `POST /transactions`); đừng để hai schema này đánh lừa rằng
  tính năng nhập tay còn tồn tại.
