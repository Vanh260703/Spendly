# API Endpoints — Spendly

Hợp đồng API giữa FE và BE. **`SPEC.md` là source of truth về nghiệp vụ**; file này mô tả chi tiết từng endpoint.

> ⚠️ Khi thêm/sửa endpoint: cập nhật file này **cùng lúc** với code, và đánh dấu lại trạng thái ✅.

---

## Quy ước chung

**Base URL**: `http://localhost:3001/api/v1`

**Trạng thái**: ⬜ chưa làm · 🚧 đang làm · ✅ xong

**Xác thực**: `JwtAuthGuard` đặt global — **mọi endpoint đều cần token** trừ những cái đánh dấu 🔓 (`@Public()`).
```
Authorization: Bearer <access_token>
```
Refresh token nằm trong **httpOnly cookie**, không đọc được bằng JS. Request cần gửi kèm `credentials: 'include'`.

**Response thành công** — interceptor global bọc lại:
```json
{ "success": true, "data": { ... } }
```

**Response lỗi** — exception filter global:
```json
{ "success": false, "message": "Số tiền phải lớn hơn 0", "statusCode": 400 }
```

| Mã | Khi nào |
|---|---|
| `400` | Body/query không qua được Zod schema |
| `401` | Thiếu token, token hết hạn hoặc sai |
| `403` | Token hợp lệ nhưng tài nguyên không thuộc về user này |
| `404` | Không tìm thấy tài nguyên |
| `409` | Xung đột: email đã tồn tại, xóa danh mục còn giao dịch... |
| `429` | Vượt hạn mức gọi AI trong ngày (không có rate-limit HTTP chung) |
| `503` | AI hết quota / lỗi nhà cung cấp — FE hiển thị fallback thống kê thường |

**Tiền tệ**: mọi số tiền là **`number`, đơn vị đồng (VND), luôn dương**. Hướng tiền suy ra từ `type`. Không có `currency` ở bất kỳ đâu.

**Ngày giờ**: ISO 8601 string (`"2026-08-12T10:30:00.000Z"`).

**Phân trang**: cursor-based. Response trả `nextCursor` (null nếu hết).

---

## 1. Auth — `/auth`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 1.1 | `POST` | `/auth/register` 🔓 | Đăng ký + tạo ví chung + seed danh mục mặc định | ✅ |
| 1.2 | `POST` | `/auth/login` 🔓 | Đăng nhập | ✅ |
| 1.3 | `POST` | `/auth/refresh` 🔓 | Lấy access token mới từ refresh cookie | ✅ |
| 1.4 | `POST` | `/auth/logout` | Thu hồi refresh token khỏi whitelist Redis | ✅ |
| 1.5 | `GET` | `/auth/me` | Thông tin user đang đăng nhập | ✅ |

### 1.1 `POST /auth/register`
Trong **một DB transaction**: tạo user, tạo **ví chung** ("Ví chính", `initialBalance = 0`), và **seed danh mục mặc định** (xem SPEC §3) để user nhập liệu được ngay.

```jsonc
// Request
{ "email": "toi@example.com", "password": "matkhau123", "name": "Việt Anh" }

// 201 Created
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "toi@example.com", "name": "Việt Anh", "onboardedAt": null },
    "accessToken": "eyJhbGc..."
  }
}
```
Refresh token được set vào httpOnly cookie. `onboardedAt: null` → FE điều hướng sang màn hình onboarding.

**Lỗi**: `409` nếu email đã tồn tại.

### 1.2 `POST /auth/login`
```jsonc
// Request
{ "email": "toi@example.com", "password": "matkhau123" }
// 200 — cùng dạng data với register
```
**Lỗi**: `401` nếu sai email hoặc mật khẩu (thông báo giống nhau cho cả hai trường hợp, tránh lộ email nào đã đăng ký).

### 1.3 `POST /auth/refresh`
Không có body — đọc refresh token từ cookie, đối chiếu whitelist trong Redis.
```jsonc
// 200
{ "success": true, "data": { "accessToken": "eyJhbGc..." } }
```
**Lỗi**: `401` nếu cookie thiếu, token hết hạn, hoặc đã bị thu hồi (đã logout).

### 1.4 `POST /auth/logout`
Xóa refresh token khỏi whitelist Redis + clear cookie. Trả `204 No Content`.

### 1.5 `GET /auth/me`
Trả về user hiện tại (không bao giờ có `passwordHash`).

---

## 2. Users — `/users`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 2.1 | `GET` | `/users/me` | Hồ sơ + cài đặt | ✅ |
| 2.2 | `PATCH` | `/users/me` | Sửa hồ sơ / cài đặt | ✅ |
| 2.3 | `PATCH` | `/users/me/password` | Đổi mật khẩu | ✅ |
| 2.4 | `POST` | `/users/me/onboarding` | Thiết lập ban đầu | ✅ |

### 2.1 `GET /users/me`
```jsonc
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "toi@example.com",
    "name": "Việt Anh",
    "avatarUrl": null,
    "timezone": "Asia/Ho_Chi_Minh",
    "monthStartDay": 1,          // 25 = chu kỳ tính theo ngày nhận lương
    "monthlyIncome": 20000000,
    "onboardedAt": "2026-08-01T03:12:00.000Z",
    "wallet": {                  // ví chung, quan hệ 1–1
      "id": "uuid",
      "name": "Ví chính",
      "initialBalance": 12000000,
      "startedAt": "2026-08-01T00:00:00.000Z"
    }
  }
}
```

### 2.2 `PATCH /users/me`
Sửa từng phần: `name`, `avatarUrl`, `timezone`, `monthStartDay` (1–28), `monthlyIncome`.

Số dư ban đầu và tên ví nằm ở `Wallet` — sửa qua `PATCH /wallet`.

### 2.3 `PATCH /users/me/password`
```jsonc
{ "currentPassword": "cu123", "newPassword": "moi456" }
```
Đổi mật khẩu **thu hồi toàn bộ refresh token** đang có → các thiết bị khác bị đăng xuất.

### 2.4 `POST /users/me/onboarding`
Hai câu hỏi sau khi đăng ký (SPEC §4.1). Ghi `initialBalance` + `startedAt` vào **ví**, `monthlyIncome` + `onboardedAt` vào **user**, trong cùng một DB transaction.
```jsonc
{ "initialBalance": 12000000, "monthlyIncome": 20000000 }
```

---

## 2b. Wallet — `/wallet`

**Mỗi user có đúng MỘT ví chung**, tạo tự động lúc đăng ký. Không chia loại (tiền mặt / ngân hàng / ví điện tử) — app chỉ cần biết tổng tiền, không cần biết tiền nằm ở đâu. Vì thế endpoint là số ít `/wallet`, không có `:id`, và không có `POST`/`DELETE`.

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 2b.1 | `GET` | `/wallet` | Thông tin ví | ✅ |
| 2b.2 | `PATCH` | `/wallet` | Sửa tên / số dư ban đầu | ✅ |

```jsonc
// GET /wallet
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Ví chính",
    "initialBalance": 12000000,
    "startedAt": "2026-08-01T00:00:00.000Z"
  }
}
```

`transaction.walletId` **do BE tự điền** — client không gửi lên, người dùng không phải chọn ví khi nhập liệu.

Số dư hiện tại không nằm ở đây mà ở [`GET /stats/balance`](#81-get-statsbalance), vì nó là giá trị tính ra chứ không phải cột lưu sẵn.

### 2b.2 `PATCH /wallet`
```jsonc
{ "name": "Ví chính", "initialBalance": 12000000, "startedAt": "2026-08-01T00:00:00.000Z" }
```

⚠️ **`initialBalance` là mốc xuất phát, đặt MỘT LẦN lúc onboarding.** Lương tháng sau về thì ghi `POST /transactions` loại `income`, **không** sửa field này.

Sửa `initialBalance` sẽ **dịch chuyển toàn bộ lịch sử** — mọi kỳ trong quá khứ đều đổi số dư. Chỉ dùng khi gõ nhầm lúc onboarding.

Nếu app lệch tiền thật do quên nhập vài khoản → dùng [`POST /transactions/adjust-balance`](#46-post-transactionsadjust-balance) để bù tại một ngày cụ thể, giữ nguyên báo cáo các kỳ trước.

---

## 3. Categories — `/categories`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 3.1 | `GET` | `/categories` | Danh sách danh mục | ✅ |
| 3.2 | `POST` | `/categories` | Tạo mới | ✅ |
| 3.3 | `PATCH` | `/categories/:id` | Sửa | ✅ |
| 3.4 | `DELETE` | `/categories/:id` | Xóa (chuyển giao dịch về "Khác") | ✅ |

### 3.1 `GET /categories`
Query: `type` (`income`|`expense`), `kind` (`need`|`want`|`saving`).

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "uuid", "name": "Cà phê", "type": "expense", "kind": "want",
      "icon": "coffee", "color": "#a16207",
      "parentId": null, "isDefault": false
    }
  ]
}
```
**Không bao giờ trả danh mục `isSystem: true`** ("Điều chỉnh số dư") ở endpoint này — nó không phải danh mục để user chọn.

### 3.2 `POST /categories`
```jsonc
{ "name": "Cà phê", "type": "expense", "kind": "want", "icon": "coffee", "color": "#a16207", "parentId": null }
```
`kind` quyết định AI có được phép đề xuất cắt giảm hay không — chỉ `want` mới bị đề xuất cắt.

### 3.4 `DELETE /categories/:id`
Giao dịch **không bị xóa** — được chuyển hết về danh mục "Khác" cùng `type`, trong một DB transaction.

**Lỗi**: `409` nếu danh mục có `isDefault: true` (không cho xóa "Khác") hoặc `isSystem: true`.

---

## 4. Transactions — `/transactions`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 4.1 | `GET` | `/transactions` | Danh sách + lọc + cursor | ✅ |
| 4.2 | `POST` | `/transactions` | Thêm giao dịch | ✅ |
| 4.3 | `PATCH` | `/transactions/:id` | Sửa | ✅ |
| 4.4 | `DELETE` | `/transactions/:id` | Xóa | ✅ |
| 4.7 | `GET` | `/transactions/:id` | Chi tiết một giao dịch | ✅ |
| 4.6 | `POST` | `/transactions/adjust-balance` | Điều chỉnh số dư | ✅ |

### 4.1 `GET /transactions`
| Query | Kiểu | Mô tả |
|---|---|---|
| `from` / `to` | ISO date | Khoảng ngày (theo `transaction.date`, không phải `createdAt`) |
| `categoryId` | uuid | Lọc theo danh mục |
| `type` | `income`\|`expense` | |
| `tags` | csv | VD `tags=du-lich,cong-viec` |
| `minAmount` / `maxAmount` | number | Khoảng số tiền |
| `q` | string | Tìm trong `note` |
| `cursor` | string | Con trỏ trang tiếp |
| `limit` | number | Mặc định 50, tối đa 200 |

```jsonc
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid", "type": "expense", "amount": 50000,
        "date": "2026-08-12T03:20:00.000Z",
        "note": "Cà phê sáng", "tags": [],
        "category": { "id": "uuid", "name": "Cà phê", "icon": "coffee", "color": "#a16207", "kind": "want" }
      }
    ],
    "nextCursor": "eyJkYXRlIjoi..."
  }
}
```
Giao dịch thuộc danh mục `isSystem` (điều chỉnh số dư) **có** xuất hiện ở đây (để user thấy được lịch sử), nhưng bị loại khỏi mọi endpoint `/stats/*` và prompt AI.

### 4.2 `POST /transactions`

Hai loại giao dịch — `type` quyết định tiền cộng hay trừ:

```jsonc
// CHI — trừ khỏi số dư
{
  "type": "expense",
  "amount": 50000,          // LUÔN DƯƠNG
  "categoryId": "<Cà phê>", // BẮT BUỘC
  "date": "2026-08-12T03:20:00.000Z",
  "note": "Cà phê sáng",
  "tags": []
}

// THU — cộng vào số dư
{
  "type": "income",
  "amount": 5000000,        // cũng LUÔN DƯƠNG
  "categoryId": "<Thưởng>",
  "date": "2026-08-12T03:20:00.000Z",
  "note": "Thưởng quý 3"
}
```

⚠️ **`amount` luôn lưu số dương ở cả hai loại.** Hướng tiền suy ra từ `type`, **không dùng số âm** — nếu vừa có số âm vừa có `type` thì sẽ có hai nguồn sự thật và mọi phép cộng dồn đều rủi ro.

Danh mục thu nhập được seed sẵn lúc đăng ký: **Lương · Thưởng · Freelance · Đầu tư · Được tặng · Khác (thu)**.

**Lỗi**: `400` nếu `amount <= 0`, hoặc `type` không khớp `category.type` (VD ghi `income` nhưng chọn danh mục "Ăn uống").

### 4.6 `POST /transactions/adjust-balance`
Khi số app tính lệch với tiền thật (do quên nhập). User khai số thực tế, app tạo **giao dịch bù** đúng bằng chênh lệch.

```jsonc
// Request
{ "actualBalance": 14100000, "note": "Đối soát cuối tháng 8" }

// 201
{
  "success": true,
  "data": {
    "calculatedBalance": 15750000,   // app đang tính
    "actualBalance": 14100000,       // user khai
    "difference": -1650000,          // âm → tạo giao dịch EXPENSE bù
    "transaction": { "id": "uuid", "type": "expense", "amount": 1650000 }
  }
}
```
Giao dịch bù dùng danh mục hệ thống **"Điều chỉnh số dư"** (`isSystem: true`) và **bị loại khỏi mọi thống kê + prompt AI** — nếu không, AI sẽ hiểu nhầm thành khoản chi thật và đưa lời khuyên sai.

---

## 5. Budgets — `/budgets`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 5.1 | `GET` | `/budgets` | Danh sách + số đã tiêu kỳ này | ✅ |
| 5.2 | `POST` | `/budgets` | Tạo hạn mức | ✅ |
| 5.3 | `PATCH` | `/budgets/:id` | Sửa | ✅ |
| 5.4 | `DELETE` | `/budgets/:id` | Xóa (lịch sử kỳ cũ vẫn giữ) | ✅ |
| 5.5 | `GET` | `/budgets/history` | Kết quả các kỳ **đã đóng** | ✅ |

### 5.1 `GET /budgets`
Trả kèm **số đã tiêu trong kỳ hiện tại** — FE không phải tự tính.
```jsonc
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "category": { "id": "uuid", "name": "Ăn uống", "icon": "utensils", "color": "#f97316" },
      "period": "monthly",
      "amount": 3000000,          // hạn mức GỐC
      "rolloverIn": 500000,       // mang sang từ kỳ trước (âm = kỳ trước vượt)
      "effectiveAmount": 3500000, // = amount + rolloverIn — hạn mức THỰC TẾ kỳ này
      "spent": 2400000,
      "remaining": 1100000,       // = effectiveAmount − spent
      "progress": 0.686,          // spent / effectiveAmount
      "status": "ok",             // ok (<0.7) | warning (0.7–1) | exceeded (>1)
      "rollover": true,
      "rolloverCapRatio": 0.5,
      "alertThreshold": 0.8,
      "periodStart": "2026-08-01T00:00:00.000Z",
      "periodEnd": "2026-08-31T23:59:59.999Z"
    }
  ]
}
```

**Rollover** (`rollover: true`) — chênh lệch chuyển sang kỳ sau **cả hai chiều**: dư thì cộng, **vượt thì trừ**. Chặn ở `±rolloverCapRatio × amount` (mặc định ±50%).
```
effectiveAmount = amount + rolloverIn
rolloverOut     = clamp(effectiveAmount − spent, ±cap)   → thành rolloverIn của kỳ sau
```
`rollover: false` → `rolloverIn` luôn 0, `effectiveAmount === amount`.

`progress` tính trên `effectiveAmount`, **không** phải `amount`.
**Ranh giới kỳ** — ngân sách lặp lại mỗi kỳ, `budget.startDate` chỉ là mốc có hiệu lực chứ không định nghĩa kỳ:

| `period` | Kỳ chạy từ → đến |
|---|---|
| `monthly` | Theo `user.monthStartDay`. `= 1` → 01/08–31/08 · `= 25` → 25/07–24/08 |
| `weekly` | Thứ Hai → Chủ nhật |

**`spent` luôn tính trọn kỳ**, kể cả phần tiêu trước khi ngân sách được tạo. Tạo ngân sách 3tr vào 13/08 mà từ 01/08 đã tiêu 2,4tr → trả về `spent: 2400000`, `progress: 0.8`. Đây là chủ ý: con số phải nói đúng sự thật về tháng đó, và mọi kỳ tính giống nhau.

`categoryId: null` = ngân sách tổng, áp cho toàn bộ chi tiêu.

### 5.4 `DELETE /budgets/:id`
Xóa ngân sách **không xóa lịch sử** — các bản ghi trong `budget_period_results` vẫn còn (FK `SET NULL`), nên báo cáo cũ và điểm `budgetAdherence` không bị mất dữ liệu.

### 5.5 `GET /budgets/history`
Kết quả các kỳ **đã đóng**, đọc thẳng từ `budget_period_results` — nhanh hơn hẳn `/budgets` vì không phải quét lại giao dịch cũ.

Query: `from`, `to`, `categoryId`, `budgetId`.

```jsonc
{
  "success": true,
  "data": [
    {
      "periodStart": "2026-08-01T00:00:00.000Z",
      "periodEnd": "2026-08-31T23:59:59.999Z",
      "period": "monthly",
      "categoryName": "Ăn uống",   // snapshot text — đúng tên tại thời điểm đó
      "amount": 3000000,           // hạn mức LÚC ĐÓ, không phải hạn mức hiện tại
      "rolloverIn": 0,
      "effectiveAmount": 3000000,
      "spent": 2400000,
      "rolloverOut": 600000,
      "adherence": true            // spent <= effectiveAmount
    }
  ]
}
```

**Vì sao cần bảng riêng thay vì tính lại:** `budget.amount` sửa là ghi đè. Nửa năm sau lương tăng, đổi hạn mức 3tr → 5tr thì báo cáo tháng 8 năm ngoái sẽ hiện 5tr — sai, và số cũ mất vĩnh viễn. Snapshot chốt lại `amount` tại thời điểm kỳ đóng nên lịch sử luôn đúng.

Job chốt kỳ chạy **mỗi ngày** (không phải cuối tháng — `monthStartDay` khác nhau giữa các user) và **idempotent** nhờ `UNIQUE(budgetId, periodStart)`.

---

## 6. Goals — `/goals`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 6.1 | `GET` | `/goals` | Danh sách mục tiêu + tiến độ | ✅ |
| 6.2 | `POST` | `/goals` | Tạo mục tiêu | ✅ |
| 6.3 | `PATCH` | `/goals/:id` | Sửa / đổi trạng thái | ✅ |
| 6.4 | `DELETE` | `/goals/:id` | Xóa (cascade lịch sử nạp) | ✅ |
| 6.5 | `POST` | `/goals/:id/contribute` | Nạp tiền vào mục tiêu | ✅ |

### 6.1 `GET /goals`
Query: `horizon` (`short`|`long`), `status`.
```jsonc
{
  "success": true,
  "data": [
    {
      "id": "uuid", "name": "Mua Macbook", "horizon": "short",
      "targetAmount": 35000000, "currentAmount": 14000000,
      "progress": 0.4,
      "deadline": "2027-02-01T00:00:00.000Z",
      "monthlyContribution": 3500000,
      "requiredMonthly": 3818181,   // cần bao nhiêu/tháng để kịp deadline
      "onTrack": false,             // monthlyContribution < requiredMonthly
      "status": "active",
      "icon": "laptop", "color": "#0ea5e9"
    }
  ]
}
```
`requiredMonthly` và `onTrack` do BE tính — đây là giá trị thật của tính năng, đừng để FE tự tính.

### 6.5 `POST /goals/:id/contribute`
```jsonc
{ "amount": 2000000, "date": "2026-08-12T00:00:00.000Z", "note": "Thưởng dự án" }
```
Tạo `GoalContribution` + cộng vào `goal.currentAmount` trong **cùng một DB transaction**. Đạt `targetAmount` thì tự chuyển `status: "achieved"`.

⚠️ **KHÔNG tạo `Transaction`.** Nạp tiền vào mục tiêu là **gắn nhãn**, không phải **chi** — tiền vẫn nằm trong ví, chỉ là đã có chủ. Nếu sinh giao dịch chi thì `currentBalance` sẽ tụt trong khi tiền thật không đổi, và user phải bấm "Điều chỉnh số dư" mỗi tháng để bù con số lệch do chính app tạo ra.

Đối chiếu bằng ba con số ở [`GET /stats/balance`](#81-get-statsbalance): `currentBalance` / `committedToGoals` / `freeToSpend`.

**Lỗi**: `409` nếu `committedToGoals + amount > currentBalance` — chặn việc cam kết nhiều hơn số tiền đang có.

Tiền chỉ thực sự rời ví khi bạn **mua thứ đó** — lúc ấy ghi một giao dịch chi bình thường.

---

## 7. Debts — `/debts`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 7.1 | `GET` | `/debts` | Danh sách khoản nợ | ✅ |
| 7.2 | `POST` | `/debts` | Thêm khoản nợ | ✅ |
| 7.3 | `PATCH` | `/debts/:id` | Sửa | ✅ |
| 7.4 | `POST` | `/debts/:id/payment` | Ghi một lần trả nợ | ✅ |
| 7.5 | `GET` | `/debts/payoff-plan` | Kế hoạch trả nợ | ✅ |

### 7.4 `POST /debts/:id/payment`
```jsonc
{ "amount": 5000000, "date": "2026-08-15T00:00:00.000Z" }
```
Tạo `DebtPayment` + trừ `debt.remaining` trong cùng transaction. `remaining <= 0` → `isPaid: true`.

### 7.5 `GET /debts/payoff-plan`
Query: `strategy` (`snowball`|`avalanche`), `extraPayment` (số tiền trả thêm mỗi tháng).
```jsonc
{
  "success": true,
  "data": {
    "strategy": "avalanche",
    "order": [
      { "debtId": "uuid", "name": "Thẻ tín dụng", "interestRate": 24, "payoffDate": "2027-03-01", "totalInterest": 4200000 },
      { "debtId": "uuid", "name": "Vay mua xe",   "interestRate": 9.5, "payoffDate": "2029-06-01", "totalInterest": 31000000 }
    ],
    "debtFreeDate": "2029-06-01",
    "totalInterest": 35200000
  }
}
```
`snowball` xếp theo `remaining` tăng dần (nhanh thấy kết quả), `avalanche` theo `interestRate` giảm dần (tốn ít lãi nhất).

---

## 8. Stats — `/stats`

Nguồn dữ liệu cho dashboard **và cho prompt AI**. Tất cả dùng SQL `GROUP BY`, cache Redis TTL 5 phút, **invalidate ngay khi có thêm/sửa/xóa giao dịch**.

> ⚠️ Mọi endpoint ở đây **loại trừ danh mục `isSystem`** (điều chỉnh số dư).

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 8.1 | `GET` | `/stats/balance` | Số tiền hiện có | ✅ |
| 8.2 | `GET` | `/stats/summary` | Tổng thu/chi/chênh lệch một kỳ | ✅ |
| 8.3 | `GET` | `/stats/by-category` | Theo danh mục + **tần suất** | ✅ |
| 8.4 | `GET` | `/stats/trend` | Xu hướng theo ngày/tuần/tháng | ✅ |
| 8.5 | `GET` | `/stats/calendar` | Heatmap chi theo ngày | ✅ |

### 8.1 `GET /stats/balance`
```jsonc
{
  "success": true,
  "data": {
    "currentBalance": 31000000,    // = wallet.initialBalance + Σthu − Σchi
    "committedToGoals": 14000000,  // Σ currentAmount của mục tiêu ACTIVE
    "freeToSpend": 17000000,       // = currentBalance − committedToGoals
    "initialBalance": 12000000,
    "totalIncome": 20000000,
    "totalExpense": 1000000,
    "since": "2026-08-01T00:00:00.000Z"
  }
}
```
**Luôn tính ra bằng `SUM()`, không lưu thành cột** — không bao giờ lệch khỏi lịch sử (SPEC §7).

`committedToGoals` là tiền **vẫn nằm trong ví** nhưng đã gắn nhãn cho mục tiêu. `freeToSpend` mới là số thực sự tiêu được.

### 8.2 `GET /stats/summary`
Query: `from`, `to`, hoặc `period` (`today`|`week`|`month`).
```jsonc
{
  "success": true,
  "data": {
    "from": "2026-08-01T00:00:00.000Z", "to": "2026-08-31T23:59:59.999Z",
    "income": 20000000, "expense": 8250000, "net": 11750000,
    "byKind": { "need": 5100000, "want": 2150000, "saving": 1000000 },
    "kindRatio": { "need": 0.62, "want": 0.26, "saving": 0.12 },   // so với khung 50/30/20
    "comparison": {
      "previousPeriodExpense": 7100000,
      "changePercent": 0.162,        // +16.2% so với kỳ trước
      "avg3PeriodsExpense": 7450000
    }
  }
}
```

### 8.3 `GET /stats/by-category` — **quan trọng nhất cho AI**
Query: `from`, `to`, `type` (mặc định `expense`).

Trả **cả tần suất**, không chỉ tổng tiền. Đây là thứ giúp AI phân biệt "1 lần 500k" với "10 lần 50k" — hai vấn đề khác nhau, cách cắt cũng khác.
```jsonc
{
  "success": true,
  "data": [
    {
      "category": { "id": "uuid", "name": "Cà phê", "icon": "coffee", "color": "#a16207", "kind": "want" },
      "total": 550000,
      "count": 11,                  // SỐ LẦN giao dịch
      "average": 50000,             // trung bình mỗi lần
      "percentOfExpense": 0.067,    // % trên tổng chi
      "percentOfIncome": 0.0275,    // % trên thu nhập
      "vsPrevious3Avg": 0.68        // +68% so với trung bình 3 kỳ trước
    }
  ]
}
```

### 8.4 `GET /stats/trend`
Query: `from`, `to`, `groupBy` (`day`|`week`|`month`).
```jsonc
{
  "success": true,
  "data": [
    { "bucket": "2026-08-01", "income": 20000000, "expense": 320000 },
    { "bucket": "2026-08-02", "income": 0,        "expense": 185000 }
  ]
}
```
Bucket rỗng vẫn được trả về (giá trị 0) để biểu đồ không bị đứt đoạn.

### 8.5 `GET /stats/calendar`
Query: `month` (`2026-08`).
```jsonc
{
  "success": true,
  "data": {
    "days": [{ "date": "2026-08-12", "expense": 235000, "count": 4 }],
    "max": 890000   // để FE chuẩn hóa độ đậm màu heatmap
  }
}
```

---

## 9. AI — `/ai`

**Trọng tâm sản phẩm** (SPEC §4.7). Prompt chỉ nhận **dữ liệu đã tổng hợp**, không bao giờ gửi danh sách giao dịch thô.

Kiểm soát quota Grok free: cache 2 lớp theo `inputHash` (Redis → bảng `ai_insights`), giới hạn lượt/ngày bằng Redis, chạy theo lịch qua BullMQ.

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 9.1 | `GET` | `/ai/necessity-review` | **Đánh giá mức cần thiết + gợi ý cắt giảm** | ✅ |
| 9.6 | `GET` | `/ai/report?period=week\|month` | **Báo cáo kỳ**: tóm tắt · điểm nổi bật · cảnh báo · 3 việc nên làm | ✅ |
| 9.2 | `GET` | `/ai/insights` | Lấy insight đã sinh (từ cache) | ✅ |
| 9.3 | `POST` | `/ai/insights/generate` | Ép sinh mới | ✅ |
| 9.4 | `GET` | `/ai/health-score` | Điểm sức khỏe tài chính | ✅ |
| 9.5 | `POST` | `/ai/chat` | Hỏi đáp có ngữ cảnh tài chính | ✅ |

### 9.1 `GET /ai/necessity-review`
Query: `period` (`week`|`month`, mặc định `week`).

Với mỗi danh mục `want`, AI xét **tiền + tần suất + xu hướng** rồi kết luận nên giữ / giảm / cắt.

⚠️ **FE KHÔNG gọi endpoint này.** Nó SINH bản mới cho kỳ đang chạy — gọi lúc user mở trang là tốn quota cho câu trả lời không ai xin, và đẩy vào kho một bản dựng từ dữ liệu vài ngày. Bản phân tích do `AiScheduler` sinh 08:00 sáng cho tuần vừa khép lại; FE đọc qua `GET /ai/insights?kind=necessity`. Endpoint giữ lại để gọi thủ công khi cần chạy bù.
```jsonc
{
  "success": true,
  "data": {
    "periodStart": "2026-08-06T00:00:00.000Z",
    "periodEnd": "2026-08-12T23:59:59.999Z",
    "summary": "Tuần này bạn tiêu 1.240.000₫, trong đó 44% là khoản có thể cắt.",
    "suggestions": [
      {
        "categoryId": "uuid",
        "categoryName": "Cà phê",
        "verdict": "reduce",            // keep | reduce | cut
        "total": 550000,
        "count": 11,
        "reason": "Tăng 68% so với 3 tuần trước. Bạn đi gần như mỗi ngày, nhiều hôm 2 lần — vấn đề nằm ở tần suất, không phải giá mỗi ly.",
        "action": "Giữ 4 buổi/tuần, còn lại pha ở nhà.",
        "monthlySaving": 1400000,
        "goalImpact": { "goalName": "Mua Macbook", "percentOfMonthlyTarget": 0.4 }
      }
    ],
    "cached": true,
    "generatedAt": "2026-08-12T09:00:00.000Z"
  }
}
```
**Ràng buộc bắt buộc**: chỉ đề xuất cắt danh mục `want`, không bao giờ `need`/`saving`. Mọi con số phải lấy từ dữ liệu thật, không bịa. Giọng trung lập, không dùng từ phán xét.

**Lỗi**: `503` nếu hết quota → FE hiển thị `/stats/by-category` thuần và báo "AI tạm chưa sẵn sàng". `400` nếu dưới 2 tuần dữ liệu (chưa đủ để so sánh).

### 9.2 `GET /ai/insights`
Query: `kind` (`weekly`|`monthly`|`necessity`|`anomaly`|`forecast`|`health_score`), `limit`.

Chỉ đọc từ DB/cache, **không gọi API xAI** → luôn nhanh và miễn phí.

### 9.3 `POST /ai/insights/generate`
```jsonc
{ "kind": "weekly", "force": false }
```
`force: false` (mặc định) → nếu `inputHash` trùng thì trả bản cũ, không tốn quota. `force: true` → gọi lại API thật.

**Lỗi**: `429` nếu vượt `AI_DAILY_LIMIT`.

### 9.4 `GET /ai/health-score`
```jsonc
{
  "success": true,
  "data": {
    "score": 72,
    "breakdown": {
      "savingRate": 22,      // trên 30
      "budgetAdherence": 18, // trên 25
      "emergencyFund": 12,   // trên 25
      "debtRatio": 20        // trên 20
    },
    "explanation": "Tỷ lệ tiết kiệm tốt (24% thu nhập). Điểm trừ lớn nhất là quỹ dự phòng...",
    "cached": true
  }
}
```

### 9.5 `POST /ai/chat`
```jsonc
{ "conversationId": "uuid | null", "message": "Tháng này tôi tiêu ăn uống nhiều hơn bình thường không?" }
```
`conversationId: null` → tạo cuộc trò chuyện mới. BE tự đính kèm context tài chính đã tổng hợp vào prompt.

**Lỗi**: `429` khi vượt hạn mức chat/ngày.

---

## 10. Export — `/export`

| # | Method | Path | Việc | Trạng thái |
|---|---|---|---|---|
| 10.1 | `GET` | `/export/excel` | Xuất dữ liệu thô | ✅ |
| 10.2 | `GET` | `/export/pdf` | Báo cáo tháng/năm | ⬜ (hoãn — cần nhúng font tiếng Việt) |

Query: `from`, `to`. Trả file trực tiếp (`Content-Disposition: attachment`), hoặc `202` + `jobId` nếu khoảng thời gian lớn (render qua job nền).

---

## 11. Danh bạ & công nợ — `/contacts`, `/shared-expenses`

> Nghiệp vụ: **SPEC §4.6** · thiết kế đầy đủ: **`SHARED_EXPENSES.md`**

| # | Method | Path | Việc | ✔ |
|---|---|---|---|---|
| 11.1 | `GET` | `/contacts` | Danh bạ kèm **công nợ từng người** | ✅ |
| 11.2 | `POST` | `/contacts` | Thêm người (hoặc trả về người đã có cùng tên) | ✅ |
| 11.3 | `PATCH` | `/contacts/:id` | Sửa tên / SĐT / ghi chú / **ảnh QR** / lưu trữ | ✅ |
| 11.4 | `DELETE` | `/contacts/:id` | Xóa — **chặn khi công nợ ≠ 0** | ✅ |
| 11.5 | `GET` | `/contacts/:id` | Chi tiết + lịch sử chia bill & tất toán | ✅ |
| 11.6 | `POST` | `/shared-expenses` | Ghi một lần chi chung (hai chiều) | ✅ |
| 11.7 | `GET` | `/shared-expenses` | Danh sách các lần chi chung | ✅ |
| 11.8 | `DELETE` | `/shared-expenses/:id` | Xóa — **xóa kèm giao dịch đã sinh** | ✅ |
| 11.9 | `POST` | `/settlements` | Ghi một lần tất toán (hai chiều) | ✅ |
| 11.10 | `DELETE` | `/settlements/:id` | Xóa lần tất toán — xóa kèm giao dịch | ✅ |

---

### 11.1 `GET /contacts`
Query: `includeArchived` (mặc định `false`), `q` (tìm theo tên).

`balance` **dương = họ nợ bạn**, **âm = bạn nợ họ**. Luôn tính bằng `SUM()`, không đọc cột.

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Anh Tuấn",
      "phone": "0901234567",
      "note": "bạn cùng phòng",
      "color": "#f97316",
      "isArchived": false,
      "balance": 416666,          // họ nợ bạn 416.666₫
      "lastActivityAt": "2026-08-16T12:00:00.000Z"
    },
    { "id": "uuid", "name": "Linh", "balance": -100000 }  // bạn nợ Linh 100.000₫
  ]
}
```

### 11.2 `POST /contacts`
```jsonc
{
  "name": "Anh Tuấn",
  "phone": "0901234567",
  "note": "bạn cùng phòng",
  // Ảnh QR chuyển tiền — cả hai đều tùy chọn, do FE upload lên Cloudinary trước rồi gửi kết quả về
  "qrImage": "https://res.cloudinary.com/<cloud>/image/upload/v1/spendly/contact-qr/abc.jpg",
  "qrImagePublicId": "spendly/contact-qr/abc"
}
```
⚠️ `qrImage` **chỉ nhận URL `https://res.cloudinary.com/`** — không nhận base64, không nhận domain khác. Mở cho domain tùy ý thì field này thành chỗ nhúng ảnh từ bất kỳ đâu, và BE cũng không dọn được ảnh cũ.

`qrImagePublicId` chỉ để BE **xóa** ảnh khi user thay QR hoặc xóa người; nó **không** xuất hiện trong response.

**Tên đã tồn tại** (so theo `trim` + `lowercase`) → trả về người đã có với `200`, **không** báo `409`. Ô chọn người trong form chia bill dựa vào hành vi này để "gõ tên mới là tạo tại chỗ".

⚠️ **KHÔNG gộp có dấu với không dấu** — "Tuấn" và "Tuan" là hai người khác nhau.

### 11.4 `DELETE /contacts/:id`
- Công nợ ≠ 0 → `409` *"Tuấn còn nợ bạn 416.666₫. Hãy tất toán trước khi xóa."*
- Còn lịch sử nhưng công nợ = 0 → xóa được, lịch sử `SET NULL`
- Muốn ẩn mà giữ lịch sử → `PATCH` với `isArchived: true`

### 11.5 `GET /contacts/:id`
```jsonc
{
  "success": true,
  "data": {
    "contact": { "id": "uuid", "name": "Anh Tuấn", "balance": 416666 },
    "history": [
      {
        "kind": "shared_expense",
        "id": "uuid",
        "date": "2026-08-16T00:00:00.000Z",
        "note": "Ăn tối sinh nhật",
        "totalAmount": 1000000,
        "iPaid": true,             // bạn là người trả
        "myShare": 500002,
        "theirShare": 166666,      // phần của RIÊNG người này
        "effect": 166666           // tác động lên công nợ (dương = họ nợ thêm)
      },
      {
        "kind": "settlement",
        "id": "uuid",
        "date": "2026-08-18T00:00:00.000Z",
        "direction": "they_paid_me",
        "amount": 100000,
        "effect": -100000
      }
    ]
  }
}
```

### 11.6 `POST /shared-expenses`

**Bạn trả hộ** (bill 1.000.000₫, bạn ăn 250.000₫ + mời 250.000₫, 3 người chia 500.000₫):
```jsonc
{
  "payerContactId": null,          // null = BẠN trả
  "totalAmount": 1000000,
  "date": "2026-08-16",
  "note": "Ăn tối sinh nhật",
  "categoryId": "uuid-an-uong",
  "treatAmount": 250000,           // phần bạn MỜI
  "treatCategoryId": "uuid-moi-ban-be",
  "shares": [
    { "contactId": null, "amount": 500002 },   // null = phần của BẠN
    { "contactId": "uuid-a", "amount": 166666 },
    { "contactId": "uuid-b", "amount": 166666 },
    { "contactId": "uuid-c", "amount": 166666 }
  ]
}
```

**Người khác trả hộ bạn**: `payerContactId` = id người đó. Khi đó `treatAmount` phải là `0` và **không giao dịch nào được sinh** — tiền chưa rời ví bạn.

Sinh ra tối đa **3 giao dịch** (bỏ qua nhánh 0₫):

| Số tiền | Danh mục | Vào thống kê? |
|---|---|---|
| `myShare − treatAmount` | `categoryId` | ✅ |
| `treatAmount` | `treatCategoryId` | ✅ |
| `Σ shares của người khác` | **"Trả hộ bạn bè"** (`isSystem`) | ❌ |

**Lỗi:**
| Mã | Khi nào |
|---|---|
| `400` | `Σ shares ≠ totalAmount` — *"Tổng các phần (999.998₫) phải bằng hóa đơn (1.000.000₫)"* |
| `400` | `treatAmount > myShare` |
| `400` | `treatAmount > 0` mà thiếu `treatCategoryId` |
| `400` | `payerContactId ≠ null` mà `treatAmount > 0` |
| `400` | `categoryId` trỏ vào danh mục `isSystem` |
| `404` | `contactId` không thuộc về user |

💡 **Chia đều**: FE tự tính rồi gửi `shares` tường minh. Quy tắc làm tròn — chia đều phần nguyên, **phần lẻ dồn vào NGƯỜI TRẢ**, để bất biến `Σ shares = totalAmount` luôn giữ.

### 11.8 `DELETE /shared-expenses/:id`
Xóa **kèm cả 3 giao dịch** đã sinh, trong **cùng một transaction DB**. Bỏ sót là số dư lệch vĩnh viễn.

### 11.9 `POST /settlements`
```jsonc
{
  "contactId": "uuid",
  "direction": "they_paid_me",   // hoặc "i_paid_them"
  "amount": 100000,
  "date": "2026-08-18",
  "categoryId": "uuid"           // CHỈ khi direction = i_paid_them (danh mục THẬT)
}
```

| `direction` | Giao dịch sinh ra | Danh mục |
|---|---|---|
| `they_paid_me` | **thu** | "Trả hộ bạn bè" (`isSystem`) — không thổi phồng thu nhập |
| `i_paid_them` | **chi** | danh mục THẬT do user chọn — đây mới là lúc bạn thực sự tiêu |

Cho phép **trả từng phần** (nhiều bản ghi) và **trả dư** (công nợ đổi dấu). Không chặn.

---

## 12. Upload ảnh — `/uploads`

> Hạ tầng: `shared/cloudinary/` · dùng bởi ảnh QR trong danh bạ (§11)

| # | Method | Path | Việc | ✔ |
|---|---|---|---|---|
| 12.1 | `GET` | `/uploads/signature` | Cấp chữ ký để FE upload thẳng lên Cloudinary | ✅ |

### 12.1 `GET /uploads/signature`
```jsonc
{
  "success": true,
  "data": {
    "cloudName": "spendly",
    "apiKey": "123456789012345",
    "timestamp": 1787021843,
    "signature": "a1b2c3...",
    "folder": "spendly/contact-qr"
  }
}
```

**File KHÔNG đi qua BE.** FE xin chữ ký ở đây rồi `POST` thẳng lên `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`. Lý do: FE build tĩnh nên không có route handler để proxy, mà đẩy file qua BE thì tốn gấp đôi băng thông cho cùng một tấm ảnh. `CLOUDINARY_API_SECRET` chỉ nằm ở BE.

⚠️ **FE phải gửi lên đúng những tham số đã được ký** (`timestamp`, `folder`) — thừa hoặc thiếu một cái là Cloudinary trả `401 Invalid Signature` mà không nói lệch ở đâu.

- **Cần đăng nhập** (không `@Public()`) — nếu không thì ai cũng upload được vào account và đốt sạch quota
- Chưa cấu hình 3 biến `CLOUDINARY_*` → `503` kèm tên biến còn thiếu; phần còn lại của app vẫn chạy bình thường

## Tổng kết

| Nhóm | Số endpoint | Xong |
|---|---|---|
| Auth | 5 | **5** |
| Users | 4 | **4** |
| Wallet | 2 | **2** |
| Categories | 4 | **4** |
| Transactions | 5 | **5** |
| Budgets | 5 | **5** |
| Goals | 5 | **5** |
| Debts | 5 | **5** |
| Stats | 5 | **5** |
| AI | 6 | **6** |
| Export | 2 | **1** |
| Danh bạ & công nợ | 10 | **10** |
| Upload ảnh | 1 | **1** |
| **Tổng** | **60** | **58** |

Thứ tự làm theo lộ trình (SPEC §6): **Auth → Categories → Transactions → Stats → Budgets/Goals → AI → Debts/Export**.
