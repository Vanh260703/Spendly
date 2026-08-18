# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Spendly** — ứng dụng web quản lý tài chính cá nhân: ghi chép dòng tiền, xem chi tiêu theo ngày/tuần/tháng, lập ngân sách, đặt mục tiêu ngắn/dài hạn, và dùng **AI (Gemini)** để đánh giá tình hình tài chính + tư vấn chi tiêu.

**`SPEC.md` ở repo root là source of truth** — đọc trước khi làm bất kỳ việc gì liên quan tới tính năng, data model, hay API. UI copy, comment và commit message viết bằng **tiếng Việt**.

- `FE/` — Next.js 16 App Router + React 19 + TypeScript + Tailwind v4. **Deploy tĩnh lên Cloudflare Pages** (`output: 'export'`).
- `BE/` — NestJS 11 + TypeORM + PostgreSQL + Redis. API prefix `/api/v1`.
- `shared/` — Zod schema + type dùng chung FE ↔ BE.

Trạng thái: **BE xong 47/49 endpoint · 174 test e2e xanh · FE xong khung chính** (auth, onboarding, dashboard, giao dịch, ngân sách, mục tiêu, nợ, AI).

## Working rules (từ user — bắt buộc theo)

0. **Toàn quyền quyết định — ĐỪNG HỎI.** User đã ủy quyền đầy đủ. Gặp ngã rẽ kỹ thuật thì **tự chọn phương án tốt nhất rồi làm tiếp**, không dùng `AskUserQuestion`, không xin xác nhận, không dừng lại chờ duyệt. Nêu quyết định + lý do **sau khi đã làm xong**, và ghi vào `SPEC.md` §7. Ngoại lệ duy nhất cần báo trước: việc **phá hủy hoặc không hoàn tác được** (xóa DB/dữ liệu thật, `git push`, gọi API tốn tiền/quota thật, publish ra ngoài).
1. **Bàn bạc và lên kế hoạch trước khi code.** Mặc định là brainstorm phương án, nêu trade-off, viết design doc trước. Chỉ bắt đầu viết code khi user nói rõ là code ("đừng code vội", "brainstorm trước đã"). Khi đã bảo code rồi thì làm liền mạch tới xong, theo quy tắc 0.
2. **Chốt quyết định thành file Markdown ở repo root.** Khi bàn về kiến trúc, edge case, hay quyết định kỹ thuật → đề xuất lưu lại thành doc và cập nhật `SPEC.md`.
3. **Giao tiếp với user bằng tiếng Việt.**
4. Thay đổi tính năng / data model / API → **cập nhật `SPEC.md` cùng lúc với code**, không để doc lệch khỏi thực tế.

## Stack conventions — đọc trước khi viết code

### Cấu trúc thư mục — bắt buộc theo pattern hiện đại

**Feature-first, không phải type-first.** Gom theo *nghiệp vụ*, không gom theo *loại file*. Không bao giờ tạo `src/controllers/`, `src/services/`, `src/entities/` ở cấp cao nhất — thêm một tính năng mà phải sửa 5 thư mục khác nhau là dấu hiệu cấu trúc sai.

```
BE/src/
├── config/            env schema (Zod), hằng số cấu hình
├── common/            helper THUẦN, không trạng thái, không kết nối ngoài
│   ├── entities/      BaseEntity
│   ├── transformers/  MoneyTransformer
│   ├── decorators/    @Public(), @CurrentUser()
│   ├── filters/       exception filter global
│   ├── interceptors/  response envelope
│   └── pipes/         ZodValidationPipe
├── shared/            module HẠ TẦNG có provider + vòng đời
│   ├── redis/         {module, service, constants, index}.ts
│   └── cloudinary/    {module, service, index}.ts — lưu ảnh QR danh bạ
├── database/          data-source, migrations/, seeds/
└── modules/           MỘT thư mục cho MỖI domain
    └── <domain>/
        ├── entities/  <domain>.entity.ts
        ├── dto/
        ├── <domain>.module.ts
        ├── <domain>.controller.ts   ← chỉ nhận request + gọi service
        └── <domain>.service.ts      ← toàn bộ business logic
```

**Phân biệt `common/` và `shared/`** — hay bị nhầm:

| | `common/` | `shared/` |
|---|---|---|
| Chứa gì | Helper thuần, stateless | Module có provider, giữ kết nối/vòng đời |
| Ví dụ | `MoneyTransformer`, `BaseEntity`, guard, pipe | `RedisModule`, sau này `QueueModule`, `MailModule` |
| Có `@Module()` không | Không | Có |

**Quy tắc phụ thuộc — một chiều, không được vi phạm:**
```
modules/  →  shared/  →  common/  →  config/
```
`common/` không bao giờ import từ `shared/` hay `modules/`. Vi phạm sẽ tạo circular dependency mà NestJS chỉ báo lỗi lúc runtime.

Thêm quy ước: mỗi thư mục trong `shared/` có **`index.ts` barrel** để import gọn (`from './shared/redis'`); `modules/` **không** dùng barrel (dễ gây circular import giữa các domain).

⚠️ **Không dùng path alias `@/`** — `tsc` không rewrite đường dẫn khi build nên `require("@/...")` chết lúc runtime. Dùng import tương đối.

### Backend (NestJS + TypeORM)

- **Cấu trúc module**: mỗi domain một module trong `src/modules/<tên>/` gồm `*.module.ts` / `*.controller.ts` / `*.service.ts` / `entities/` / `dto/`. Controller **chỉ** nhận request và gọi service — business logic nằm hết ở service.
- **`synchronize: false` ở mọi môi trường.** Đổi schema → sinh migration (`typeorm migration:generate`) và commit vào `src/database/migrations/`. Không bao giờ để TypeORM tự sync.
- **Chỉ một loại tiền: VND.** Không tạo cột `currency`, không quy đổi tỷ giá, không đa tiền tệ ở bất kỳ đâu.
- ⚠️ **Cột nullable phải khai `type` tường minh**: `@Column({ type: 'varchar', nullable: true }) x?: string | null`. TypeORM suy kiểu cột từ metadata TS, mà union `string | null` bị đọc thành `Object` → app crash lúc boot với `DataTypeNotSupportedError`. Đồng thời phải khai `| null` vì TypeORM **trả về `null`**, không phải `undefined` — thiếu nó thì mọi `update()` với giá trị null đều lỗi type.
- **Tiền: cột DB là `bigint` (đơn vị đồng), tầng TS là `number`.** Không dùng `float`/`double` ở DB, không dùng `BigInt` trong code. Driver `pg` trả `bigint` về dạng `string` nên **mọi cột tiền bắt buộc gắn `transformer: money`** (`common/transformers/money.transformer.ts`) — quên là dính lỗi cộng chuỗi (`"17000000" + 5000`).
- **Phân trang dùng CURSOR, không `OFFSET`** — offset làm nhảy/lặp bản ghi khi user thêm giao dịch trong lúc cuộn (thao tác thường xuyên nhất của app này). Cursor mã hóa cặp `(date, id)`; chỉ dùng `date` sẽ sót/lặp vì nhiều giao dịch trùng ngày. Mẫu: `modules/transactions/dto/transaction.dto.ts`.
- **Tổng hợp/báo cáo dùng QueryBuilder `GROUP BY` hoặc raw SQL**, không `find()` hết rồi `reduce` trong Node. Thống kê theo danh mục phải trả **cả `SUM(amount)`, `COUNT(*)` và `AVG(amount)`** — tần suất quan trọng ngang tổng tiền (xem AI bên dưới).
- ⚠️ **`transformer: money` KHÔNG áp dụng cho raw query.** `getRawMany()` trả `SUM(amount)` về dạng **chuỗi** (`"115000"`), phải `Number()` thủ công. Đây là chỗ module `stats` dễ sai nhất — cộng thẳng sẽ ra nối chuỗi. Đã kiểm chứng bằng `npm run verify:money`.
- **Bảo mật (dữ liệu tài chính cá nhân)**: `JwtAuthGuard` global qua `APP_GUARD`, endpoint công khai đánh dấu `@Public()`. **Mọi query bắt buộc filter theo `userId` lấy từ JWT** — không bao giờ tin `userId` client gửi lên.
- **Entity KHÔNG trả thẳng ra response — map qua hàm DTO liệt kê tường minh từng field** (mẫu: `modules/users/dto/user-profile.dto.ts` → `toUserProfile()`). Cấm `{ ...entity }` và `delete entity.x`: đó là danh sách đen, thêm cột mới vào entity là nó tự động lọt ra API và không ai nhận ra cho tới khi lộ dữ liệu. Liệt kê tường minh = danh sách trắng, cột mới muốn ra ngoài phải khai.
- `select: false` trên cột nhạy cảm (`passwordHash`) là lớp phòng thủ **thứ hai**, không phải thứ nhất — một `addSelect` ở đâu đó là mất tác dụng.

### AI — `src/modules/ai/`

**Tách 3 lớp** để test được mà không đốt quota free của nhà cung cấp:
- `ai-prompt.builder.ts` — **thuần, không I/O**: `SYSTEM_PROMPT`, dựng prompt, `hashInput()`. Test trực tiếp.
- ⚠️ **`buildFinancialContext()` (dữ liệu thuần) tách khỏi `buildNecessityPrompt()` (dữ liệu + chỉ thị trả JSON).** Chat PHẢI dùng cái đầu. Đã từng bị: chat dùng chung `buildNecessityPrompt` nên thừa hưởng câu "trả về JSON, không thêm chữ nào ngoài JSON" — user hỏi "tháng này tôi tiêu cà phê nhiều không?" mà nhận về khối JSON thô.
- `llm.client.ts` — chỉ lo gọi mạng. Chưa có `LLM_API_KEY` → ném `503`, app vẫn chạy. Lỗi HTTP được **dịch thành câu nói rõ phải làm gì** (401 sai key · 403 chưa nạp credit · 404 sai tên model · 429 hết lượt) thay vì báo chung chung.
- `ai.service.ts` — gom dữ liệu + cache 2 lớp (`Redis` → bảng `ai_insights`) theo `inputHash`.

⚠️ **`.env.test` để `LLM_API_KEY` TRỐNG** — test tự động mà bắn thật vào API là đốt sạch quota trong một lần chạy. Test kiểm chứng prompt builder + đường fallback `503`, không kiểm chứng câu trả lời của AI.

`SYSTEM_PROMPT` khóa các ràng buộc ở SPEC §4.7: không bịa số · chỉ cắt `want` · gợi ý kèm số tiền tiết kiệm · giọng trung lập · dưới 14 ngày dữ liệu thì nói "chưa đủ dữ liệu". **Sửa prompt phải chạy lại test prompt builder.**

### Redis — `src/shared/redis/` (đã dựng xong, `npm run verify:redis`)

Inject `RedisService` là dùng được ngay — `RedisModule` đánh dấu `@Global()`.

| Việc | API |
|---|---|
| Cache stats | `remember(RedisKeys.stats(...), RedisTtl.STATS, factory)` |
| Invalidate khi có giao dịch mới | `delByPrefix(RedisKeys.statsPrefix(userId))` |
| Cache AI | `remember(RedisKeys.aiInsight(uid, kind, hash), RedisTtl.AI_INSIGHT, …)` |
| Rate limit AI | `incrDaily(RedisKeys.aiDailyCount(uid, yyyymmdd), RedisTtl.AI_DAILY)` |
| Refresh token | `allowRefreshToken()` / `isRefreshTokenAllowed()` / `del()` |
| ~~Job queue~~ | **Không dùng BullMQ.** Hai cron dùng `@nestjs/schedule`, khai `timeZone: 'Asia/Ho_Chi_Minh'` tường minh: `budgets.scheduler.ts` (chốt kỳ, **00:30**) → `ai.scheduler.ts` (sinh báo cáo, **08:00**) |

**Bắt buộc:**
- **Không viết chuỗi key thẳng trong service** — thêm vào `RedisKeys` (`redis.constants.ts`). Gõ sai key là lỗi im lặng: app vẫn đúng, chỉ chậm và đốt quota AI.
- **Ưu tiên `remember()`** thay vì tự `get` rồi `set`.
- **TTL luôn bắt buộc** — key cache không hạn sẽ rò rỉ bộ nhớ.
- Xóa hàng loạt dùng `delByPrefix()` (chạy `SCAN`), **không bao giờ `KEYS`** — `KEYS` chặn toàn bộ Redis trong lúc quét.

**Redis là cache, không phải nơi lưu bền.** Mất Redis thì app CHẬM ĐI chứ không GÃY: `get()` trả `null` (coi như miss), `set()` im lặng bỏ qua — đã kiểm chứng bằng `npm run verify:redis`.

**Whitelist refresh token cũng fail-open** khi Redis chết (`isRefreshTokenAllowed()` trả `true`). Đây là chủ ý, đã trả giá một lần: trước đó nó ném lỗi thẳng, khiến `POST /auth/register` trả **500 trong khi user đã được tạo trong DB** — user thử lại nhận `409 email đã tồn tại`, login cũng lỗi, tài khoản kẹt hoàn toàn. **Bất kỳ thao tác Redis nào nằm trên đường đi của auth đều phải suy giảm êm.**

Ngoại lệ duy nhất được phép ném lỗi: `incrDaily()` — không đếm được lượt gọi mà vẫn cho gọi AI thì đốt sạch quota free.

### Deploy — Cloudflare Pages (FE)

`next.config.ts` đặt `output: 'export'` + `trailingSlash: true`. Hệ quả **bắt buộc nhớ**:
- **Không có** route handler `app/api/*`, server action, middleware, `next/image` tối ưu động. Mọi dữ liệu lấy từ BE qua client fetch.
- Build ra `out/` — trỏ Cloudflare Pages vào thư mục này.
- `NEXT_PUBLIC_API_URL` là biến **build-time**: đổi giá trị phải build lại, không sửa runtime được.

Kéo theo ở BE: cookie refresh token production dùng **`SameSite=None; Secure`** (FE và BE khác domain = cross-site; `Lax` thì trình duyệt không gửi cookie và refresh luôn 401). `CORS_ORIGIN` nhận **danh sách** phân tách dấu phẩy cho domain chính + `*.pages.dev` + preview.

### Frontend (Next.js 16)

- ⚠️ **Đây là Next.js 16**, khác với training data cũ. Trước khi viết code routing/layout/server, đọc guide trong `FE/node_modules/next/dist/docs/`. Gotcha đã biết: `params` và `searchParams` là **Promise** — phải `await`; có global helper `PageProps<'/route'>` / `LayoutProps` (không cần import).
- **`page.tsx` là file mỏng**: chỉ render shell + feature component, không chứa logic.
- **Mọi form dùng React Hook Form + Zod (`zodResolver`) + TanStack Query `useMutation`**, loading lấy từ `mutation.isPending`. Không `fetch` + `useState` tự chế trong component form.
- Luồng chuẩn: `page.tsx` → `components/<feature>/*` → `hooks/use<Domain>.ts` (TanStack Query) → `lib/api/<domain>.ts` (fetch wrapper, throw `ApiError`) → BE.
- Toast (sonner) đặt trong `onSuccess`/`onError` của hook, không rải trong component.
- **Mọi ô nhập tiền dùng `<MoneyInput>`, KHÔNG dùng `<Input type="number">`.** Input number không hiển thị được dấu phân cách nghìn, mà `4500000` thì gần như không đọc nổi có mấy chữ số — người dùng phải đếm bằng mắt và rất dễ nhập nhầm một số 0. `MoneyInput` là `type="text"` + `inputMode="numeric"` (vẫn ra bàn phím số trên điện thoại), format khi gõ, và **giữ nguyên vị trí con trỏ** bằng cách đếm số CHỮ SỐ trước con trỏ chứ không đếm ký tự (dấu chấm chèn vào làm mọi vị trí lệch đi). Giá trị trả ra luôn là `number`. Với react-hook-form phải bọc `<Controller>` vì nó là controlled component.
- Ô KHÔNG phải tiền (lãi suất %, ngày trong tháng) thì vẫn dùng `type="number"` bình thường.
- **`lib/format.ts` là nơi DUY NHẤT format tiền/ngày** — `formatMoney`, `formatMoneyShort` (cho biểu đồ), `formatDayLabel`. Không `toLocaleString` rải rác trong component.
- **`toDateInputValue()` cho input date**, không dùng `toISOString().slice(0,10)` — cái đó quy về UTC nên lệch ngày với người dùng ở VN.
- **Icon danh mục dùng `<CategoryIcon icon={...} color={...} />`** (`components/ui/CategoryIcon.tsx`), không hiển thị chữ cái đầu của tên. Bảng icon **liệt kê tường minh** ~42 icon chứ không `import * as Icons from 'lucide-react'` — lucide có hàng nghìn icon, import cả gói làm phình bundle. Thêm icon mới thì thêm vào `CATEGORY_ICONS`, picker trong `CategoryForm` tự cập nhật theo. Tên icon lạ → tự rơi về `circle-ellipsis`, không làm vỡ giao diện.
- Design token trong `globals.css` `@theme`: `bg-brand`, `text-income`, `text-expense`, `bg-ok/warning/exceeded`. Không dùng `green-500`/`red-500` rời rạc.
- ⚠️ **Màn hình KHÔNG BAO GIỜ gọi endpoint SINH nội dung AI.** Báo cáo kỳ và đánh giá mức cần thiết đều do `AiScheduler` sinh sau khi kỳ đóng (`VIEC_DINH_KY`); FE chỉ **đọc** qua `GET /ai/insights` — endpoint này chỉ truy DB nên nhanh, miễn phí, không đẻ bản ghi. Trang `/ai` từng render `<PeriodReport />` và tự gọi `necessity-review`, nên chỉ cần ghé qua là gọi AI cho kỳ ĐANG chạy: tốn quota cho câu trả lời không ai xin, và đẩy vào kho một bản dựng từ dữ liệu mới được vài ngày. Ngoại lệ duy nhất được phép gọi AI theo thao tác user: **chat** và **điểm sức khỏe tài chính**.
- ⚠️ **Fallback hiển thị `content` thô CHỈ được bật khi `structured === null`** (AI trả sai JSON), **không phải khi mảng kết quả rỗng**. Đã từng bị ở trang `/ai`: điều kiện là `!suggestions.length` nên khi kỳ đó không có khoản nào đáng cắt — một kết quả TỐT — nó đổ nguyên chuỗi JSON thô ra màn hình. Mảng rỗng phải có thông điệp riêng ("Không có khoản nào cần cắt giảm").
- ⚠️ **Mọi component đọc dữ liệu PHẢI xử lý `isError` riêng, KHÔNG gộp vào trạng thái rỗng.** Đã từng bị: `TransactionList` chỉ có nhánh `isLoading` + `items.length === 0`, nên API lỗi 500 lại hiển thị "Chưa có giao dịch nào" — user có dữ liệu mà tưởng mất sạch, và không có manh mối gì để lần ra. Dùng `<ErrorState onRetry={refetch} />`. Với `BalanceCards` còn tệ hơn: hiện "0₫" như thể hết tiền.
- **Token refresh gộp chung một lần gọi** (`lib/api/client.ts`): mở dashboard bắn 5–6 query song song, nếu mỗi cái tự refresh thì 5 cái sau thất bại vì refresh token **xoay vòng** — user bị đá ra đăng nhập oan.

### Zod schema dùng chung

Schema validate đặt ở `shared/`, FE dùng qua `zodResolver`, BE dùng qua `ZodValidationPipe`. **Không định nghĩa schema hai lần** ở hai bên.

## AI — đây là trọng tâm sản phẩm

Ghi chép chỉ là phương tiện. Giá trị thật của app là trả lời được **"khoản này có cần thiết không, cắt thế nào?"** — VD "tuần này cà phê 11 lần, 550k, tăng 68%; giữ 4 buổi/tuần thì tiết kiệm 1,4tr/tháng". Xem §4.7 của `SPEC.md` để biết định dạng đầu ra mong muốn.

- **`LlmClient` không gắn với nhà cung cấp nào** — dùng giao thức OpenAI-compatible, đổi Gemini ↔ Groq ↔ OpenAI ↔ xAI chỉ là sửa `LLM_BASE_URL` + `LLM_MODEL` + `LLM_API_KEY` trong `.env`, **không sửa code**.
- Hiện dùng **`gemini-flash-lite-latest`**. Hai lựa chọn cố ý ở đây:
  - **Bản LITE** chứ không phải `gemini-flash-latest`: BE đã tính sẵn mọi con số, model chỉ diễn giải thành câu. Đo thực tế cùng prompt báo cáo — **lite 3s, bản thường 79s**, chất lượng như nhau; bản thường còn hay trả `503 high demand`.
  - **Bí danh `-latest`** chứ không ghim phiên bản: Google gỡ model cũ theo thời gian (`gemini-2.5-flash` đã trả `404 no longer available to new users`), mà app cá nhân không có ai canh cập nhật.
- Gọi LLM cho tác vụ JSON luôn kèm `reasoningEffort: 'low'` + `timeoutMs: 120_000` — bỏ ra là dễ vượt timeout. Lý do chọn: đầu ra là văn bản tiếng Việt đọc thẳng cho user, Gemini viết tự nhiên hơn hẳn model mở trên Groq. Tốc độ của Groq không giúp gì vì báo cáo chạy nền + cache 2 lớp.
- ⚠️ **xAI Grok KHÔNG còn free tier cho team mới** — trả `403 permission-denied` cho tới khi nạp credit. Đừng quay lại xAI trừ khi user đã nạp.
- `LLM_API_KEY` **chỉ nằm ở BE**, không bao giờ để lộ ra FE hay commit vào repo.
- Prompt gửi **dữ liệu đã tổng hợp**, không gửi giao dịch thô. Mỗi danh mục phải đủ 5 chiều: **tổng tiền · số lần · TB mỗi lần · so với 3 kỳ trước · `kind` (need/want/saving) · % trên thu nhập**. Thiếu tần suất thì AI chỉ nói được chung chung.
- **Quy tắc bắt buộc trong system prompt**: không bịa số (mọi con số phải từ dữ liệu được cấp) · chỉ đề xuất cắt danh mục `WANT`, không bao giờ `NEED`/`SAVING` · gợi ý phải kèm số tiền tiết kiệm được và quy ra % tiến độ mục tiêu · giọng trung lập, không phán xét ("lãng phí", "hoang phí" là cấm) · dưới 2 tuần dữ liệu thì nói "chưa đủ dữ liệu" thay vì suy diễn.
- Trả về **JSON có cấu trúc** lưu vào `AiInsight.structured` để FE render thành card, không trả một khối văn bản dài.
- Hạn mức free dễ đụng trần → cache 2 lớp theo `inputHash` (Redis → bảng `ai_insights`) là cơ chế chính.
- **`AiScheduler` sinh báo cáo cho kỳ VỪA ĐÓNG, 08:00 sáng giờ VN.** Không sinh lúc nửa đêm vì người ta hay ghi bù khoản chi Chủ nhật vào sáng Thứ Hai — sinh sớm quá là bỏ sót, mà báo cáo đã sinh thì job không sinh lại. Bắt buộc phải có: `GET /ai/report?period=week` luôn tính tuần HIỆN TẠI, nên không có job thì báo cáo tuần trước không bao giờ tồn tại. Job kiểm tra "đã có chưa" trước khi sinh → idempotent, tự bù khi máy tắt.
- ⚠️ **`ai_insights.periodStart` phải là kỳ mà báo cáo NÓI VỀ, không phải lúc sinh ra nó.** Đã từng lưu cả hai bằng `new Date()`, khiến bản ghi không cho biết nó là báo cáo tuần nào và index `['userId','kind','periodStart']` thành vô dụng.
- ⚠️ **`ai_insights` là kho lưu THEO KỲ — khóa duy nhất `(userId, kind, periodStart)`, sinh lại thì `upsert` GHI ĐÈ.** Đừng đặt khóa duy nhất trên `inputHash`: trong kỳ đang chạy, user nhập thêm giao dịch là hash đổi → đẻ thêm bản ghi cho cùng một tuần, `/reports` hiện 4–5 mục trùng và job Thứ Hai bỏ qua vì tưởng "đã có". Khi `upsert` phải **bơm tay `updatedAt: new Date()`** — `@UpdateDateColumn` không tự chạy trong `upsert`, mà scheduler đọc đúng cột đó.
- **Job báo cáo hỏi "đã CHỐT chưa?", không phải "đã có chưa?"** — `baoCaoDaChot()` = `updatedAt > periodEnd`. Bản sinh giữa kỳ (user mở `/ai` khi kỳ còn chạy) là ảnh chụp dang dở, phải bị sinh lại đè lên.
- **Luôn có fallback rule-based**: hết quota thì vẫn hiện thống kê thường và báo phần AI tạm chưa sẵn sàng — không được làm app gãy.

## Domain rules đã chốt (đừng làm khác)

- **KHÔNG theo dõi tài sản ròng** — không `Asset`, không `NetWorthSnapshot`. Đây là app quản lý **thu chi**, không phải bảng cân đối tài sản.
- **KHÔNG có giao dịch định kỳ** — không `RecurringRule`, không job tự sinh giao dịch. Khoản cố định nhập tay, hỗ trợ bằng template nhập nhanh. Đừng thêm lại.
- **Đúng MỘT ví chung cho mỗi user** — `Wallet` có `@Unique(['userId'])`, không chia loại ví, không chuyển tiền nội bộ, không `TxType.TRANSFER`. `transaction.walletId` **do BE tự điền**, client không gửi lên và người dùng không phải chọn ví.
- **Số tiền hiện có = `wallet.initialBalance` + Σthu − Σchi, luôn TÍNH RA bằng `SUM()`, không lưu thành cột.** Nếu chậm thì cache Redis — **không bao giờ thêm cột `balance`**, vì denormalize là nguồn gốc của số dư lệch.
- **`wallet.initialBalance` là mốc xuất phát, đặt MỘT LẦN lúc onboarding.** Tiền vào sau đó (lương, thưởng, được cho) luôn là `Transaction` loại `income` — không bao giờ cộng vào `initialBalance`. Sửa `initialBalance` **dịch chuyển toàn bộ lịch sử**, nên chỉ dùng khi khai sai lúc onboarding; lệch do quên nhập thì dùng `adjust-balance` để bù tại một ngày cụ thể.
- **`POST /goals/:id/contribute` KHÔNG tạo `Transaction`** — nạp vào mục tiêu là "gắn nhãn", không phải "chi"; tiền chưa rời ví. Tạo giao dịch sẽ làm số dư lệch khỏi tiền thật và ép user điều chỉnh số dư liên tục. Đối chiếu bằng ba con số `currentBalance` / `committedToGoals` / `freeToSpend`, và trả `409` khi nạp vượt số tiền hiện có.
- **Danh mục `isSystem = true` ("Điều chỉnh số dư") phải bị loại khỏi MỌI thống kê và prompt AI.** Quên lọc là AI sẽ hiểu nhầm bút toán bù thành khoản chi thật và đưa lời khuyên sai.
- Giao dịch **bắt buộc có `categoryId`** — không có danh mục thì AI không phân tích được, dữ liệu thành vô dụng.
- Chu kỳ "tháng" theo `user.monthStartDay`, **không** mặc định cứng ngày 1. **Helper duy nhất được phép tính khoảng kỳ: `common/utils/period.ts`** (`resolvePeriod`, `shiftRange`) — đừng rải `startOf('month')` khắp nơi. Mọi phép tính làm trong **múi giờ của user**: tính theo UTC sẽ đẩy giao dịch lúc 7h sáng sang ngày hôm trước.
- Ngân sách **lặp lại mỗi kỳ**; `budget.startDate` chỉ là mốc có hiệu lực, không phải ranh giới kỳ. `spent` luôn tính **trọn kỳ** kể cả phần tiêu trước khi tạo ngân sách — không có ngoại lệ cho kỳ đầu tiên.
- **Rollover đi cả hai chiều**: dư thì cộng, **vượt thì trừ**, chặn ở `±rolloverCapRatio × amount` (mặc định ±50%). `effectiveAmount = amount + rolloverIn`; `progress` tính trên `effectiveAmount`, **không** phải `amount`. Chỉ cộng khi dư mà không trừ khi vượt là làm hỏng ý nghĩa của ngân sách.
- ⚠️ **Mọi `@Cron` phải khai `timeZone` tường minh.** Mặc định nó dùng timezone MÁY CHỦ — máy dev là `Asia/Saigon` còn Railway/VPS thường là UTC, nên cùng biểu thức cron chạy vào hai thời điểm khác nhau. Thứ tự cũng quan trọng: chốt ngân sách (00:30) phải xong trước báo cáo AI (08:00) vì báo cáo đọc `rolloverIn` của kỳ mới.
- **Job chốt kỳ KHÔNG được tắt.** Nó trông như chỉ ghi log nhưng thực ra **chuỗi rollover phụ thuộc hoàn toàn vào nó**: `layRolloverIn()` đọc `rolloverOut` của kỳ trước từ `budget_period_results`. Không có bản ghi → `rolloverIn = 0` → dư/vượt kỳ trước bốc hơi. Kiểm chứng được bằng cách tạo ngân sách `rollover: true` rồi so trước/sau khi gọi `closeDuePeriods()`.
- **`budget.amount` sửa là ghi đè → lịch sử phải nằm ở `budget_period_results`.** Job chốt kỳ chạy **mỗi ngày** (không phải cuối tháng — `monthStartDay` khác nhau giữa các user), **idempotent** nhờ `UNIQUE(budgetId, periodStart)`. Snapshot phải **tự chứa đủ thông tin**: lưu `categoryName` dạng text, và FK `budgetId` là `SET NULL` chứ không `CASCADE` — xóa ngân sách không được làm mất lịch sử.
- `amount` luôn lưu số dương; hướng tiền suy ra từ `type`.
- **KHÔNG rate-limit HTTP** — app cá nhân, đừng thêm `@nestjs/throttler`. Hạn mức AI/ngày (`incrDaily`) thì giữ, vì nó bảo vệ quota nhà cung cấp chứ không phải chống tấn công.
- Xóa danh mục **không** xóa giao dịch — giao dịch chuyển về "Khác" (danh mục `isDefault`, không cho xóa). FK `transactions.categoryId` đặt `onDelete: 'RESTRICT'`, nên **DB sẽ chặn** nếu service quên chuyển; đó là chủ ý, không phải lỗi.
- **Công nợ bạn bè: chỉ ghi `Transaction` khi tiền THẬT SỰ rời/vào ví** (SPEC §4.6 · `SHARED_EXPENSES.md`). Bạn trả hộ → tách tối đa **3 giao dịch** (phần thực ăn vào danh mục thật · phần mời vào danh mục riêng · phần cho mượn vào danh mục hệ thống "Trả hộ bạn bè" nên nằm ngoài thống kê). Người khác trả hộ bạn → **KHÔNG giao dịch nào**, tiền chưa rời ví; khoản chi chỉ xuất hiện lúc bạn tất toán. Bất đối xứng này là chủ ý — ghi sớm là số dư tính ra thấp hơn tiền thật.
- **Công thức công nợ chỉ được viết ở MỘT hàm** (`FriendsService.tinhCongNo()`). Bốn số hạng cộng trừ đan nhau; rải dấu +/− ra nhiều query là chắc chắn sai dấu ở đâu đó, mà sai dấu công nợ thì con số vẫn "trông hợp lý" nên không ai phát hiện. Luôn `SUM()`, **không** lưu cột `balance` trên `Contact`.
- ⚠️ **Mỗi chiều tiền giờ có HAI danh mục hệ thống** ("Điều chỉnh số dư" và "Trả hộ bạn bè"). Tra danh mục hệ thống phải lọc **cả `name`**, không chỉ `isSystem: true` — `findOneBy` sẽ trả về cái nào tùy thứ tự DB. Dùng hằng số `SYSTEM_CATEGORY`, đừng gõ chuỗi.
- **`Contact` KHÔNG phải tài khoản** — không đăng ký, không mời, không email. Gõ tên trùng thì `POST /contacts` trả về **chính người đó với 200**, không phải `409`: ô chọn người trong form chia bill dựa vào đó để "gõ tên mới là tạo tại chỗ". **Không tự gộp có dấu/không dấu** ("Tuấn" ≠ "Tuan").
- `CategoryKind` (need/want/saving) là **trường quan trọng, không phải trang trí** — nó quyết định AI được phép khuyên cắt cái gì.

## Commands

| Vị trí | Command | Việc |
|---|---|---|
| `BE/` | `npm run start:dev` | API dev tại http://localhost:3001/api/v1 |
| `BE/` | `npm run typecheck` | `tsc --noEmit` |
| `BE/` | `npm run migration:generate -- src/database/migrations/<Tên>` | Sinh migration từ entity |
| `BE/` | `npm run migration:run` | Chạy migration |
| `BE/` | `npm run migration:revert` | Lùi migration gần nhất |
| `BE/` | `npm run verify:money` | Kiểm chứng `MoneyTransformer` round-trip qua DB thật |
| `BE/` | `npm run verify:redis` | Kiểm chứng `RedisService` + hành vi khi Redis chết |
| `BE/` | `npm test` | **199 test e2e** (Jest + supertest, DB thật `spendly_test`) |
| `BE/` | `npm run test:db:setup` | Chạy migration lên DB test (khi thêm migration mới) |
| `FE/` | `npm run dev` | Web tại http://localhost:3000 |
| `FE/` | `npm run build` | Build tĩnh ra `out/` (kèm full typecheck) |

### Hạ tầng: Docker (chính) hoặc Homebrew local

**Chạy cả stack bằng Docker** — `docker-compose.yml` ở repo root:

| Lệnh | Việc |
|---|---|
| `docker compose up -d --build` | dựng và chạy cả 4 service |
| `docker compose logs -f be` | xem log API |
| `docker compose down` | dừng, **giữ** dữ liệu |
| `docker compose down -v` | dừng và **xóa sạch** dữ liệu |

Web http://localhost:3000 · API http://localhost:3001/api/v1

**Những chỗ đã trả giá khi dựng, đừng lặp lại:**
- ⚠️ **Postgres 18 đổi quy ước thư mục dữ liệu**: volume phải mount ở `/var/lib/postgresql`, **không** phải `/var/lib/postgresql/data`. Mount kiểu cũ thì image từ chối khởi động với thông báo "unused mount/volume".
- ⚠️ **`healthcheck` + `depends_on: condition: service_healthy` là bắt buộc**, không phải trang trí. `depends_on` trần chỉ đợi container *chạy*, không đợi Postgres *nhận lệnh* — migration sẽ bắn vào lúc DB chưa mở cổng và BE chết ngay.
- ⚠️ **Migration chạy ở `docker-entrypoint.sh`, dùng `migration:run:prod`** (`typeorm migration:run -d dist/database/data-source.js`) chứ không phải script `ts-node` — image production không có devDependencies. Entrypoint cố ý **để lỗi làm chết container**: app chạy trên schema cũ nguy hiểm hơn là không chạy.
- **Cổng Postgres/Redis không mở ra máy thật** (5432/6379 đang bị bản Homebrew chiếm). Cần thì bỏ comment `ports` trong compose và đổi sang 5433/6380.
- **`NEXT_PUBLIC_API_URL` là build ARG của FE**, không phải biến runtime — đổi URL API phải **build lại image**. Giá trị phải là `localhost:3001` (trình duyệt gọi từ ngoài mạng compose), **không** phải `http://be:3001`.
- FE image dùng **nginx** phục vụ `out/`, không cần Node lúc chạy — đúng thứ Cloudflare Pages làm khi deploy thật. `nginx.conf` để `try_files $uri $uri/ $uri/index.html` cho khớp `trailingSlash: true`.

**Sao lưu & mang dữ liệu sang máy khác** — ⚠️ **volume `pgdata` KHÔNG đi theo git.**

Chỉ *schema* đi theo repo (migration tự dựng lại). Trên máy mới, `docker compose up` cho ra **DB trắng**. `docker compose down -v` cũng xóa sạch volume ngay trên máy này.

| Lệnh | Việc |
|---|---|
| `sh docker/backup.sh` | dump DB trong container ra `docker/backups/spendly-<timestamp>.sql` |
| `sh docker/restore.sh <file.sql>` | nạp file dump vào container (**ghi đè toàn bộ**) |

Cả hai đều **dừng container `be`** trong lúc thao tác để không ai ghi vào giữa chừng, và `restore` dùng `ON_ERROR_STOP=1` — nạp nửa chừng rồi lỗi mà vẫn bật app lên là tệ nhất.

Sang máy mới: `git clone` → copy `BE/.env` (không có trong git) → `docker compose up -d --build` → `sh docker/restore.sh <file dump mang theo>`.

⚠️ File dump chứa `passwordHash` — đã vào `.gitignore`, đừng commit và đừng gửi qua kênh công khai.

**Chuyển dữ liệu từ Postgres Homebrew sang Docker**: `sh docker/migrate-local-to-docker.sh`

Container khởi động với DB TRẮNG (migration chỉ dựng schema, không mang dữ liệu sang), nên lần đầu `docker compose up` xong đăng nhập vào sẽ **không thấy gì** — dữ liệu cũ vẫn nguyên ở Homebrew. Script dump bằng `pg_dump --clean --if-exists --no-owner` rồi nạp qua `docker compose exec -T postgres psql`; nó **dừng container `be`** trong lúc nạp để không ai ghi vào giữa chừng, và **chỉ ĐỌC** DB local nên chạy sai vẫn còn bản gốc. Bản dump được giữ lại ở `docker/spendly-dump-*.sql`.

Kiểm chứng sau khi chuyển: đối chiếu `count(*)` từng bảng ở hai bên, và so lại số dư ví (`initialBalance + Σthu − Σchi`) — cột tiền là `bigint`, sai ở đây thì mọi con số khác sai theo.

**Vẫn chạy được bằng Homebrew local** (cổng mặc định 5432 / 6379) — `npm run start:dev`, `npm test` đều nhắm vào đó. Thiết lập DB một lần:
```bash
psql -U <user-cua-ban> -d postgres -c "CREATE ROLE spendly LOGIN PASSWORD 'spendly'"
psql -U <user-cua-ban> -d postgres -c "CREATE DATABASE spendly OWNER spendly"
```
⚠️ **`npm test` vẫn dùng Postgres của Homebrew**, không phải container — `.env.test` trỏ `localhost:5432`. Muốn test trên DB trong Docker thì mở cổng 5433 rồi sửa `.env.test`.

⚠️ **Chạy Docker và `npm run start:dev` cùng lúc sẽ đá nhau ở cổng 3001.** Triệu chứng dễ nhầm: `GET /contacts` trả **404** (route không tồn tại) thay vì **401** — dấu hiệu tiến trình cũ đang chạy code cũ. Đã cắn hai lần rồi.

Chưa có ESLint config (script `lint` trong `package.json` sẽ lỗi cho tới khi thêm).

### Test e2e — `npm test`

**199 test, chạy trên Postgres + Redis THẬT**, DB riêng `spendly_test` (`.env.test`) nên không đụng dữ liệu dev.

- **Cố ý không mock DB/Redis.** Mọi bug đắt nhất của dự án này đều nằm ở ranh giới hạ tầng: `bigint` trả về string, TypeORM không suy được kiểu cột nullable, Redis chết làm gãy đăng ký. Mock đi thì test xanh mà app vẫn hỏng.
- `test/utils/test-app.ts` dựng app qua `configureApp()` — **cùng hàm cấu hình với `main.ts`**, để test không chạy trên cấu hình khác production.
- `--runInBand` + email sinh ngẫu nhiên: tránh tranh chấp DB giữa các test.
- Thêm migration mới → chạy `npm run test:db:setup` trước khi test.

**`test/redis-down.e2e-spec.ts` là test hồi quy cho một bug thật** — bắt buộc giữ. Mô phỏng Redis chết bằng `redis.getClient().disconnect()`, **không** bằng cách đổi `process.env.REDIS_PORT`: `ConfigModule.forRoot()` chạy ngay lúc import `app.module.ts`, tức trước cả `beforeAll`, nên đổi env lúc đó là quá muộn và test sẽ **xanh giả**. Bài học: test hồi quy phải được kiểm chứng bằng cách **tái tạo lại bug và xem nó có đỏ không**.

## Trạng thái hiện tại (P0)

Đã xong:
- Postgres 18 + Redis local, DB `spendly` đã tạo
- BE scaffold: NestJS 11 + TypeORM, `ConfigModule` validate env bằng Zod (`src/config/env.ts`), CORS + cookie-parser, prefix `/api/v1`
- `MoneyTransformer` + `BaseEntity` (`src/common/`)
- **Redis** (`src/shared/redis/`) — `RedisModule` global, `RedisService` với cache / hạn mức AI / session, suy giảm êm khi Redis chết
- **Auth đầy đủ** (`src/modules/auth/`) — 5 endpoint, argon2id, JWT 2 secret riêng, **refresh token xoay vòng** + whitelist Redis, `JwtAuthGuard` global
- **Hạ tầng chung** — `ResponseInterceptor` (envelope `{success,data}`), `AllExceptionsFilter` (dịch mã lỗi Postgres → HTTP), `ZodValidationPipe`, `@Public()`, `@CurrentUser()`
- **Seed** — đăng ký tạo user + ví + 19 danh mục mặc định trong 1 transaction (`modules/categories/default-categories.ts`)
- **Users** (4) — hồ sơ, sửa cài đặt, đổi mật khẩu (thu hồi toàn bộ refresh token), onboarding (chỉ chạy 1 lần)
- **Wallet** (2) — `GET`/`PATCH /wallet`, số ít không có `:id`
- **Categories** (4) — CRUD đầy đủ; xóa danh mục **chuyển giao dịch về "Khác"**, chặn xóa `isDefault`/`isSystem`, cấm đổi `type`

- **Transactions** (5) — CRUD + lọc đa tiêu chí + **phân trang cursor** + `adjust-balance`

- **Stats** (5) — balance (kèm `committedToGoals`/`freeToSpend`), summary (+ byKind/kindRatio/so sánh kỳ trước), **by-category kèm `count`+`average`+`vsPrevious3Avg`** (đầu vào chính của AI), trend, calendar
- **Budgets** (5) — CRUD + tiến độ kỳ hiện tại, **rollover 2 chiều có trần**, lịch sử kỳ đã chốt, cron chốt kỳ hằng ngày (idempotent)
- **Goals** (5) — CRUD + contribute (**không tạo giao dịch**, chặn nạp vượt số dư), `requiredMonthly`/`onTrack` tính ở BE
- **Debts** (5) — CRUD + ghi trả nợ + **mô phỏng kế hoạch trả nợ** snowball/avalanche
- **AI** (6) — **báo cáo kỳ** (tuần/tháng), necessity-review, health-score, insights, generate, chat. `XaiClient` tách riêng khỏi `AiPromptBuilder` để test không gọi mạng
- **Export** (1) — CSV có BOM UTF-8. PDF hoãn (cần nhúng font tiếng Việt)
- **Danh bạ & công nợ** (10) — `modules/friends/`: danh bạ tự tạo khi gõ tên, chia bill hai chiều, tất toán từng phần, `owedToMe`/`owedByMe` vào thẻ số dư

**57/59 endpoint đã xong · 199 test e2e xanh** (xem `API_ENDPOINTS.md`).

### FE — đã xong khung chính

| Trang | Nội dung |
|---|---|
| `/auth/login` · `/auth/register` | RHF + Zod + `useMutation` |
| `/onboarding` | 2 câu hỏi, ghi số dư ban đầu vào ví |
| `/dashboard` | 4 ô số dư, biểu đồ xu hướng, donut theo danh mục (kèm **số lần**), tỉ lệ 50/30/20, giao dịch gần đây |
| `/transactions` | Danh sách gom theo ngày + cuộn vô hạn, lọc, nhập nhanh, xuất CSV |
| `/budgets` | Tiến độ kỳ hiện tại, rollover 2 chiều |
| `/goals` | Tiến độ, cảnh báo chậm tiến độ, nạp tiền (chặn vượt "tự do tiêu") |
| `/debts` | Danh sách + mô phỏng kế hoạch trả nợ |
| `/ai` | Điểm sức khỏe tài chính · đánh giá mức cần thiết (**chỉ ĐỌC bản cron đã sinh**) · chat. Có fallback thống kê khi AI lỗi. **Không có báo cáo kỳ** — xem `/reports` |
| `/reports` | **Kho báo cáo đã lưu** theo tuần/tháng, bấm để mở rộng. Nguồn DUY NHẤT của báo cáo kỳ — chỉ đọc từ DB, không tự sinh |
| `/contacts` | **Danh bạ + công nợ bạn bè** — ai nợ bao nhiêu, tất toán từng phần. Nút chính là **"Thêm người"**; thêm người không cần chia bill trước, bắt đầu ở 0₫. Mỗi người lưu được **ảnh QR chuyển tiền** |
| `/categories` | CRUD danh mục, chọn `kind` kèm giải thích nó ảnh hưởng AI thế nào |
| `/settings` | Hồ sơ · chu kỳ tháng · ví · **điều chỉnh số dư** · đổi mật khẩu |

Nút **"Ghi khoản"** (ở `/dashboard` và `/transactions`) mở `components/transactions/QuickAddModal.tsx` — hai tab: **Thu/Chi** (`QuickAddForm`) và **Chia bill** (`SplitBillForm`). Đừng dựng `<Modal>` riêng ở từng trang nữa: trước đây hai trang mỗi nơi một bản, sửa một bên là lệch bên kia. Tab là ranh giới **kiểu ghi chép**, còn thanh `Chi | Thu` bên trong là **chiều tiền** — đừng gộp "Chia bill" thành mảnh thứ ba của thanh đó.

Điều hướng chia 2 nhóm: `NAV_CHINH` (việc hằng ngày — nằm ở tab bar mobile) và `NAV_PHU` (thỉnh thoảng mới đụng — sau nút "Thêm"). Tab bar chỉ chứa được ~5 mục trước khi chữ bị cắt và vùng bấm quá hẹp.

Còn lại: export PDF.

⚠️ **KHÔNG import CSV** — user quyết định không cần, nhập tay là đủ. Cột `importHash` đã bị xóa khỏi DB.
⚠️ **KHÔNG làm PWA** — user chỉ dùng trên web qua trình duyệt. Đừng thêm `manifest.json`, service worker, hay thông báo đẩy. Giao diện vẫn phải responsive để dùng tốt trên điện thoại.
- **7 entity đầy đủ** trong `src/modules/*/entities/` — đã sinh và chạy migration `InitSchema`, 10 bảng trong DB
- App boot sạch, kết nối DB OK



**Mẫu để copy khi làm module tiếp theo**: `modules/auth/` là module hoàn chỉnh đầu tiên — theo đúng cấu trúc `{module, controller, service, dto/, guards/, strategies/}`, controller chỉ nhận request + gọi service, validate bằng `ZodValidationPipe`, lấy user bằng `@CurrentUser()`.

## Docs liên quan

- `SPEC.md` — **source of truth**: mục tiêu, stack, data model (entity TypeORM), tính năng, lộ trình P0→P4, quyết định đã chốt.
- `SHARED_EXPENSES.md` — thiết kế đầy đủ tính năng **công nợ bạn bè**: mô hình tiền hai chiều, công thức công nợ, làm tròn, trường hợp biên.
- `API_ENDPOINTS.md` — **hợp đồng API**: 45 endpoint với request/response cụ thể, mã lỗi, và cột trạng thái (⬜/🚧/✅).

⚠️ **Làm xong một endpoint → cập nhật trạng thái trong `API_ENDPOINTS.md` ngay.** Đổi shape request/response cũng phải sửa file đó cùng lúc với code, nếu không FE sẽ code theo tài liệu sai.
