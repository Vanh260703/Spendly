# Công nợ bạn bè — thiết kế

> Trạng thái: **đã chốt thiết kế, chưa code.**
> Tính năng: ghi lại những lần trả hộ / được trả hộ khi đi ăn, đi chơi, rồi xem mỗi người
> đang nợ mình (hoặc mình đang nợ họ) bao nhiêu.

## 1. Vấn đề

Bạn trả 1.000.000₫ bữa ăn cho 4 người (bạn + 3 người bạn). Một khoản duy nhất nhưng kéo
ba con số về ba hướng khác nhau:

| | Con số đúng | Vì sao |
|---|---|---|
| Số dư ví | −1.000.000₫ | tiền đã rời ví thật |
| Chi tiêu của bạn | 250.000₫ | 750k kia là cho mượn, không phải bạn tiêu |
| Công nợ | +750.000₫ | chia cho 3 người |

Ghi thẳng 1.000.000₫ là chi "Ăn uống" thì số dư đúng nhưng **AI sẽ kết luận bạn tiêu ăn
uống quá đà và khuyên cắt** — lời khuyên sai sinh ra từ dữ liệu sai. Đây đúng loại lỗi mà
danh mục `isSystem` đã được tạo ra để chặn (xem SPEC §4.2, "Điều chỉnh số dư").

## 2. Nguyên tắc nền

> **Chỉ ghi `Transaction` khi tiền THẬT SỰ di chuyển khỏi/vào ví.**

Đây là hệ quả trực tiếp của quyết định đã chốt ở `goals/contribute` (SPEC §4.5): nạp mục
tiêu không tạo giao dịch vì tiền chưa rời ví. Áp cùng nguyên tắc ở đây cho ra kết quả bất
đối xứng nhưng đúng:

| Tình huống | Tiền có di chuyển? | Ghi `Transaction`? |
|---|---|---|
| **Bạn trả hộ** cả nhóm | Có — rời ví ngay | **Có**, ngay lúc đó |
| **Người khác trả hộ bạn** | Không — bạn chưa trả đồng nào | **Không** |
| Họ trả lại tiền cho bạn | Có — vào ví | **Có** |
| Bạn trả lại tiền cho họ | Có — rời ví | **Có** |

Bất đối xứng này là **chủ ý**, không phải thiếu sót. Ghi giao dịch chi lúc bạn ăn ké mà
chưa trả sẽ làm số dư tính ra thấp hơn tiền thật trong ví.

⚠️ **Hệ quả cần chấp nhận:** khi bạn ăn ké ngày 10 và trả lại ngày 20, khoản chi đó nằm ở
ngày **20** trong thống kê. Lệch ngày so với lúc ăn. Đây là cái giá của việc giữ số dư
luôn khớp tiền thật — và là lựa chọn đúng, vì số dư sai thì mọi thứ khác sai theo.

## 3. Mô hình tiền

### 3.1 Bạn trả hộ → tách thành tối đa 3 giao dịch

Bữa ăn 1.000.000₫: bạn ăn 250.000₫, mời thêm 250.000₫, 3 người kia gánh 500.000₫:

| Giao dịch | Số tiền | Danh mục | Vào thống kê/AI? |
|---|---|---|---|
| 1 | 250.000₫ | Ăn uống (danh mục chính bạn chọn) | ✅ có — bạn ăn thật |
| 2 | 250.002₫ | **Mời bạn bè** (danh mục thật, `kind = want`) | ✅ có — bạn tiêu thật, không ai trả lại |
| 3 | 499.998₫ | **"Trả hộ bạn bè"** (`isSystem = true`) | ❌ không — tiền cho mượn |

Giao dịch 2 chỉ sinh ra khi bạn khai có phần mời; không mời thì chỉ 2 giao dịch. **Bỏ qua
mọi giao dịch 0₫.**

Vì sao tách chứ không ghi một giao dịch rồi để thống kê tự trừ: `isSystem = false` **đã**
là bộ lọc có sẵn trong mọi query của module `stats` và đã được test. Cách còn lại bắt phải
thêm một phép trừ vào **từng** query tổng hợp — mà theo `CLAUDE.md`, `stats` là chỗ dễ sai
nhất dự án (`SUM()` trả về chuỗi, `transformer: money` không áp dụng cho raw query).

Số dư vẫn giảm đúng 1.000.000₫ vì cả hai đều là giao dịch chi.

**Trường hợp biên:** bạn trả hộ mà không ăn (phần bạn = 0) → chỉ tạo giao dịch cho phần cho
mượn. Đừng tạo giao dịch 0₫ ở bất kỳ nhánh nào.

### 3.2 Được trả lại → giao dịch thu vào cùng danh mục hệ thống

Số dư tăng đúng, mà thu nhập trong thống kê **không bị thổi phồng** — vì `isSystem` bị loại.

### 3.3 Người khác trả hộ bạn → không giao dịch nào

Chỉ ghi công nợ. Khi bạn trả lại họ mới sinh giao dịch chi, vào **danh mục thật** (Ăn uống),
vì đó mới là lúc bạn thực sự tiêu.

### 3.4 ⚠️ Danh mục hệ thống phải tạo ở tầng service

`POST /transactions` **chặn** ghi vào danh mục `isSystem` (xem `transactions.service.ts`,
lỗi *"Không thể ghi giao dịch vào danh mục hệ thống"*). Service công nợ phải gọi thẳng
repository, không đi qua đường public đó. Đây là chốt chặn cố ý — đừng nới nó ra.

Cần **2 danh mục hệ thống mới** (một thu, một chi), giống cách "Điều chỉnh số dư" phải có
cả hai chiều vì một `Category` chỉ mang được một `type`:

```
{ name: 'Trả hộ bạn bè', type: EXPENSE, kind: NEED, icon: 'users', color: '#94a3b8', isSystem: true }
{ name: 'Trả hộ bạn bè', type: INCOME,  kind: NEED, icon: 'users', color: '#94a3b8', isSystem: true }
```

⚠️ **`CATEGORY_ICONS` (FE) hiện KHÔNG có `users`** — đã kiểm tra. Dùng luôn sẽ âm thầm rơi
về `circle-ellipsis` chứ không báo lỗi. Phải thêm `users` vào bảng icon cùng lúc, và thêm
`gift` là đã có sẵn cho "Mời bạn bè".

Cần migration **backfill cho tài khoản đã tồn tại**, không chỉ thêm vào seed đăng ký mới.

## 4. Data model

Module mới `BE/src/modules/friends/` — **một module cho cả Danh bạ lẫn công nợ**, vì công
thức tính nợ buộc chúng dính nhau. Tách `contacts/` riêng sẽ thành phụ thuộc vòng: trang
Danh bạ cần số nợ (→ shared-expenses), mà shared-expenses cần tên người (→ contacts). Hai
controller trong cùng module: `contacts.controller.ts` (`/contacts`) và
`shared-expenses.controller.ts`.

**Không dùng lại `Debt`** — `Debt` có
`interestRate`, `minPayment`, `dueDay`, chiến lược snowball/avalanche; áp mấy thứ đó lên
một bữa ăn 150k là vô nghĩa.

### `Contact` — Danh bạ

**Thực thể hạng nhất, có màn hình riêng `/contacts`.** Không phải tài khoản: không đăng ký,
không mời, không email, không đồng bộ — chỉ là sổ tên của riêng bạn.

```
userId · name · nameNormalized · phone? · note? · color · isArchived
@Unique(['userId', 'nameNormalized'])
```

**Danh bạ chính là màn hình trả lời câu hỏi gốc** *"xem đến ai là biết người đó nợ bao
nhiêu"*: mỗi dòng là một người kèm số công nợ (dương = họ nợ bạn, âm = bạn nợ họ), bấm vào
ra lịch sử từng bữa và nút tất toán. Không cần thêm một trang "công nợ" riêng.

Hai đường tạo, **bắt buộc có cả hai**:

| Đường | Khi nào |
|---|---|
| Chủ động thêm ở `/contacts` (nút **"Thêm người"** → `ContactForm`) | quản lý trước danh sách bạn bè quanh mình |
| Gõ tên mới ngay trong form chia bill → **tự tạo** | đang ghi bữa ăn, không muốn rời màn hình |

Người mới **luôn bắt đầu ở mức 0₫** — không có ô "nợ ban đầu" và sẽ không thêm. `Contact`
không có cột `balance`; con số do `tinhCongNo()` tính bằng `SUM()` trên `SharedExpense` +
`Settlement`, nên "chưa ai nợ ai" là trạng thái mặc định tự nhiên, không phải giá trị phải
khởi tạo. Muốn khai một khoản nợ có từ trước thì ghi nó thành một lần chi chung đúng ngày.

⚠️ **Không được bắt vào Danh bạ tạo người trước rồi mới ghi được bữa ăn.** Danh bạ trống mà
form chia bill chỉ có ô select thì người dùng kẹt cứng ngay lần đầu dùng. Ô chọn người phải
là kiểu *combobox*: chọn từ danh bạ, hoặc gõ tên mới và tạo tại chỗ.

Chi tiết khác:
- `nameNormalized` = `trim` + `lowercase`, chỉ để chống trùng do hoa/thường/khoảng trắng.
- ⚠️ **KHÔNG tự gộp có dấu / không dấu** ("Tuấn" vs "Tuan") — có thể là hai người thật.
  Gộp nhầm thì công nợ sai và rất khó lần ra. Để một thao tác "gộp hai người" thủ công.
- `color` để hiển thị avatar chữ cái đầu cho dễ nhận mặt trong danh sách dài.
- Đổi tên sửa một chỗ, toàn bộ lịch sử đúng theo — đây là lý do phải có bảng riêng thay vì
  lưu chuỗi tên vào từng dòng (lưu chuỗi thì "Tuấn"/"tuấn"/"anh Tuấn" thành 3 người và số
  nợ bị xé nhỏ, hỏng đúng thứ tính năng này sinh ra để làm).

### `SharedExpense` — một lần chi chung

```
userId · payerContactId?  ← NULL = BẠN trả; có giá trị = người đó trả
totalAmount · date · note?
categoryId                ← danh mục cho phần bạn THỰC ĂN
treatAmount               ← phần bạn MỜI, mặc định 0
treatCategoryId?          ← bắt buộc khi treatAmount > 0
transactionIdMine?        ← giao dịch phần thực ăn
transactionIdTreat?       ← giao dịch phần mời
transactionIdLent?        ← giao dịch phần cho mượn
```

Ràng buộc: **`treatAmount ≤ share(bạn)`**. Phần thực ăn = `share(bạn) − treatAmount`.

### `SharedExpenseShare` — phần của từng người

```
sharedExpenseId · contactId?  ← NULL = phần của BẠN
amount
```

Ràng buộc bắt buộc: **`Σ amount của mọi share = totalAmount`**. Lệch một đồng là công nợ
sai vĩnh viễn. Kiểm ở service, không tin client.

### `Settlement` — một lần trả tiền tất toán

```
userId · contactId · direction ('THEY_PAID_ME' | 'I_PAID_THEM')
amount · date · note? · transactionId
```

`amount` luôn dương, hướng suy ra từ `direction` — theo đúng quy ước đã dùng cho
`Transaction.type`.

## 5. Cách tính công nợ

```
Người X nợ bạn =
    Σ share(X)  trong các bill BẠN trả
  − Σ share(bạn) trong các bill X trả
  − Σ settlement THEY_PAID_ME của X
  + Σ settlement I_PAID_THEM của X
```

Dương = X nợ bạn. Âm = bạn nợ X.

⚠️ **Luôn tính bằng `SUM()`, KHÔNG lưu thành cột `balance` trên `Contact`.** Cùng lý do đã
chốt cho số dư ví: denormalize là nguồn gốc của số lệch. Chậm thì cache Redis.

⚠️ Công thức này chỉ được viết ở **một chỗ duy nhất** (một hàm trong service, giống vai trò
của `common/utils/period.ts` với khoảng thời gian). Rải dấu +/− ra nhiều query là chắc chắn
có chỗ sai dấu.

## 6. Làm tròn

1.000.000 / 3 = 333.333,33 — nhưng tiền là số nguyên đồng.

**Quy tắc: chia đều phần nguyên, phần lẻ dồn vào NGƯỜI TRẢ.** Người trả chịu thiệt vài
đồng, không ai phải nợ một số lẻ khó chịu. Bất biến `Σ shares = totalAmount` luôn giữ.

## 6b. Chia KHÔNG đều — và ranh giới "mời" vs "cho mượn"

Mô hình **không giả định chia đều**. Ràng buộc duy nhất là `Σ shares = totalAmount`.

Ví dụ đã gặp: bill 1.000.000₫, bạn trả hết và **nhận 500.000₫ về mình** (mời), 3 người kia
gánh 500.000₫ còn lại:

| Ai | Phần |
|---|---|
| A · B · C | 166.666₫ mỗi người |
| Bạn | 500.002₫ (nhận 2₫ lẻ) |
| | = 1.000.000₫ ✓ |

→ Chi 500.002₫ (Ăn uống, vào thống kê) + chi 499.998₫ (Trả hộ bạn bè, không vào thống kê).

⚠️ **Phần "mời" là CHI TIÊU THẬT, không phải cho mượn.** Bạn chỉ ăn ~250.000₫ nhưng nhận
500.000₫ — 250.000₫ chênh ra là tiền bạn tiêu và không ai trả lại. Nó **phải** nằm trong
thống kê và prompt AI. Mời 2tr/tháng là một thói quen chi tiêu đáng biết; AI im lặng về nó
là bỏ sót thứ quan trọng.

Ranh giới của toàn bộ thiết kế nằm đúng ở đây:

| | Bản chất | Vào thống kê? |
|---|---|---|
| Phần bạn ăn **+ phần bạn mời** | tiền bạn tiêu | ✅ có |
| Phần người khác sẽ trả lại | tiền cho mượn | ❌ không |

**Đã chốt — làm ở P0:** một bill tách được thành *phần thực ăn* và *phần mời*, mỗi phần một
danh mục riêng. Form có ô "tôi mời thêm" (mặc định 0) + ô chọn danh mục cho phần mời.

Vì sao đáng làm chứ không gộp chung một danh mục: gộp thì "Ăn uống" của bạn phình lên vì
tiền mời người khác, và AI sẽ khuyên bạn *ăn ít lại* trong khi vấn đề thật là *bạn mời hơi
nhiều*. Hai lời khuyên khác hẳn nhau. Tách ra thì AI nói được:

> "Ăn uống cho bản thân 1,2tr — bình thường. Mời bạn bè 2tr, tăng 60% so với 3 tháng trước."

Kèm theo: thêm **"Mời bạn bè"** (`EXPENSE`, `kind = want`, icon `gift`) vào danh mục mặc
định, backfill cho tài khoản đã có trong cùng migration với 2 danh mục hệ thống.

## 7. Ảnh hưởng tới thẻ số dư

Thêm hai con số, song song với `committedToGoals` đã có:

| Con số | Nghĩa |
|---|---|
| `currentBalance` | tiền thật trong ví |
| `committedToGoals` | vẫn trong ví nhưng đã gắn nhãn mục tiêu |
| `owedToMe` | người khác đang giữ, sẽ về (**ngoài ví**) |
| `owedByMe` | vẫn trong ví nhưng đã có chủ |
| `freeToSpend` | `currentBalance − committedToGoals − owedByMe` |

⚠️ `owedToMe` **không** phải bước đầu của theo dõi tài sản ròng (SPEC §7 đã loại bỏ
`Asset`/`NetWorthSnapshot`). Nó là hệ quả của những khoản chi bạn đã ghi, không phải một
bảng cân đối tài sản. **Đừng** mở rộng nó thành nơi khai báo tài sản.

## 8. AI

Công nợ **được đưa vào prompt như thông tin, KHÔNG BAO GIỜ như chi tiêu**:

> "Bạn đang bị nợ 2.400.000₫, trong đó 3 khoản quá 30 ngày."

Xếp nó vào chi tiêu là hỏng lời khuyên — đúng lỗi mà toàn bộ thiết kế này sinh ra để tránh.

## 9. Trường hợp biên phải xử lý

1. **Trả từng phần** — nợ 750k, trả trước 300k. `Settlement` là nhiều dòng, không phải cờ
   "đã trả".
2. **Trả dư** — trả 800k cho khoản nợ 750k → công nợ thành −50k (bạn nợ lại họ). Cho phép,
   không chặn.
3. **Xóa `SharedExpense`** → phải xóa kèm các `Transaction` nó đã sinh, trong cùng một
   transaction DB. Bỏ sót là số dư lệch.
4. **Xóa `Transaction`** đang được `SharedExpense` trỏ tới → chặn ở DB (`RESTRICT`), như
   cách `transactions.categoryId` đang làm.
5. **Xóa người trong Danh bạ** còn công nợ khác 0 → chặn, nêu rõ số nợ. Cho `isArchived` để ẩn khỏi ô chọn mà vẫn giữ lịch sử.
6. **Gộp hai người** → chuyển toàn bộ share + settlement sang một người, xóa người kia.

## 10. Phạm vi

**P0 (làm ngay):**
- **Danh bạ** — trang `/contacts`: CRUD, avatar chữ cái đầu, ô tìm kiếm, **mỗi người kèm số
  công nợ**; bấm vào ra lịch sử + nút tất toán. Nút chính của trang là **"Thêm người"**
- **Chia bill nằm trong modal "Ghi khoản"** (tab thứ hai), không phải nút riêng ở `/contacts`
- Ô chọn người kiểu **combobox**: chọn từ danh bạ hoặc gõ tên mới tạo tại chỗ
- `SharedExpense` + shares, **cả hai chiều**, chia đều hoặc nhập tay từng phần
- **Tách phần "mời" sang danh mục riêng** (ô "tôi mời thêm" + ô chọn danh mục)
- `Settlement` cả hai chiều, trả từng phần
- `owedToMe` / `owedByMe` trong thẻ số dư
- 2 danh mục hệ thống + danh mục "Mời bạn bè" + migration backfill
- Thêm icon `users` vào `CATEGORY_ICONS`
- Điều hướng: `Danh bạ` vào `NAV_PHU` (sau nút "Thêm") — tab bar mobile chỉ chứa được ~5 mục

**Để sau:**
- **Nhóm** ("Team bóng đá") — chọn một phát ra đủ người. P0 thay bằng cách rẻ hơn: form
  chia bill **gợi ý sẵn nhóm người của lần gần nhất**, được ~90% lợi ích mà không thêm
  entity nào. Thêm `Group` sau không vướng migration.
- Gộp hai người
- Nhắc nợ quá hạn
- Đưa công nợ vào báo cáo kỳ của AI

## 11. Quyết định đã chốt

| Quyết định | Lý do |
|---|---|
| Danh bạ là thực thể hạng nhất, có trang riêng | vừa là nơi quản lý bạn bè, vừa LÀ màn hình xem ai nợ bao nhiêu — không cần trang "công nợ" thứ hai |
| Bảng riêng, không lưu chuỗi tên vào từng dòng | "Tuấn"/"tuấn"/"anh Tuấn" sẽ thành 3 người, số nợ bị xé nhỏ |
| Vẫn cho tạo tại chỗ khi gõ tên mới | danh bạ trống mà form chỉ có ô select thì kẹt cứng ngay lần đầu dùng |
| Chia bill là **tab trong modal "Ghi khoản"**, không phải nút ở `/contacts` | chia bill là một cách GHI CHÉP dòng tiền, thuộc về chỗ ghi chép; `/contacts` là nơi quản lý người và xem công nợ |
| Người mới bắt đầu ở **0₫**, không có ô "nợ ban đầu" | công nợ luôn tính bằng `SUM()` — thêm ô đó là quay lại denormalize, đúng thứ đã loại bỏ |
| Danh bạ + công nợ chung MỘT module | tách đôi thành phụ thuộc vòng: danh bạ cần số nợ, công nợ cần tên người |
| Không tự gộp có dấu/không dấu | có thể là hai người thật; gộp nhầm rất khó lần ra |
| Tách 2 giao dịch thay vì trừ trong stats | tái dùng bộ lọc `isSystem` đã có và đã test; không đụng vào `stats` |
| Ăn ké chưa trả → không tạo giao dịch | tiền chưa rời ví; ghi sớm là số dư sai |
| Không lưu cột `balance` trên `Person` | denormalize là nguồn gốc của số lệch (cùng lý do với số dư ví) |
| Không dùng lại `Debt` | `interestRate`/`minPayment`/`dueDay`/snowball vô nghĩa với bữa ăn 150k |
| Phần lẻ dồn vào người trả | giữ bất biến `Σ shares = totalAmount` |
| Tách phần "mời" sang danh mục riêng | gộp chung thì AI khuyên "ăn ít lại" trong khi vấn đề thật là "mời hơi nhiều" — hai lời khuyên khác hẳn nhau |
| Phần "mời" VÀO thống kê | đó là tiền bạn tiêu thật, không ai trả lại; giấu đi là bỏ sót một thói quen chi tiêu đáng biết |
| Chưa làm `Group` ở P0 | gợi ý nhóm gần nhất đã đủ, thêm sau không vướng migration |
