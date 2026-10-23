# AUTH-04 — Tự đăng ký bằng email

Ngày 22/10/2026. Nhánh `codex/auth-04-self-signup`, xây trên `main` sau PR #28 (VERSION-01).

Chủ dự án quyết định mở tự đăng ký. Trước đây MVP chỉ cho admin cấp tài khoản (A01). Các lựa chọn đã chốt:

- Người tự đăng ký chọn **Sinh viên** hoặc **Giảng viên**, **không cần admin duyệt**.
- Tài khoản **Admin chỉ do admin cấp**. API từ chối `role: ADMIN` ở bước đăng ký.
- Phải **xác nhận email** trước khi có tài khoản.

`AGENTS.md`, `PRODUCT.md`, quy tắc A01 và từ điển dữ liệu đã cập nhật theo quyết định này.

## Thiết kế: email trước, mật khẩu sau

Phương án đầu là nhập email, tên, vai trò và mật khẩu cùng lúc, rồi mới xác nhận email. Phương án này có lỗ hổng:

1. Kẻ xấu đăng ký trước bằng email của nạn nhân, kèm mật khẩu của chúng.
2. Nạn nhân nhận thư xác nhận thật và bấm link.
3. Tài khoản được kích hoạt với mật khẩu của kẻ xấu.

Vì vậy luồng được chia hai bước:

1. **`/signup`:** chỉ nhập email. API luôn trả cùng một câu, kể cả khi email đã có tài khoản. Việc tra tài khoản và gửi thư chạy sau khi đã trả lời, giống AUTH-03.
   - Email chưa có tài khoản: gửi link `APP_ORIGIN/signup/complete#token=…`, hết hạn sau 24 giờ. Chỉ link mới nhất dùng được.
   - Email đã có tài khoản đang hoạt động: gửi thư "Bạn đã có tài khoản", không có link.
   - Tài khoản bị khóa: không gửi gì.
2. **`/signup/complete`**, mở từ link: nhập tên hiển thị, chọn vai trò, đặt mật khẩu (≥ 16 ký tự, như đổi mật khẩu). Bấm "Tạo tài khoản" sẽ:
   - tạo tài khoản `ACTIVE`, `verified_at = now()`, `verified_by = NULL`, không buộc đổi mật khẩu
   - vô hiệu mọi link đăng ký của email đó
   - ghi audit `ACCOUNT_SELF_REGISTERED`
   - không tự đăng nhập; người dùng đăng nhập bằng mật khẩu vừa đặt

Kết quả: chỉ người giữ hộp thư mới đặt được mật khẩu, và **không có tài khoản treo** chờ xác nhận. Token ngẫu nhiên 32 byte, DB chỉ lưu SHA-256, token đi sau `#` nên không lên log máy chủ.

Lỗi trả về:

- link sai, đã dùng hoặc hết hạn → `400 SIGNUP_TOKEN_INVALID`
- email đã có tài khoản khi bấm hoàn tất (ví dụ admin vừa cấp) → `409 SIGNUP_EMAIL_TAKEN`
- thư chưa cấu hình (`MAIL_TRANSPORT` trống) → `503 SIGNUP_UNAVAILABLE`

Giới hạn qua Redis:

- yêu cầu: 5 lần / 15 phút cho mỗi email, 20 lần / giờ cho mỗi IP
- hoàn tất: 5 lần / 15 phút cho mỗi link, 20 lần / giờ cho mỗi IP

## Quyền sau khi đăng ký

- Giảng viên tự đăng ký **chỉ đăng học liệu cho môn admin đã phân công** (quy tắc phân công có sẵn), nên chưa đăng được gì cho tới khi admin phân công. Sau khi được phân công, họ tự công bố như giảng viên khác (A02).
- Admin vẫn xem, khóa, đổi thông tin và cấp lại mật khẩu tạm cho tài khoản tự đăng ký như mọi tài khoản sinh viên/giảng viên.

## API và schema

- `POST /api/v1/auth/signup` `{ email }` → 202
- `POST /api/v1/auth/signup/complete` `{ token, displayName, role: STUDENT|LECTURER, password }` → 204
- Cả hai cần CSRF như mọi lệnh ghi.

Migration `202610220002_signup_tokens` (SQL thuần), bảng `signup_tokens`:

- 3 CHECK: email chuẩn hóa, hạn sau lúc tạo, `used_at` hợp lệ
- `token_hash` UNIQUE, index theo email
- không có FK

Migration cũng sửa comment của `users` và `users.verified_at`.

Test schema sau khi gộp `main` có CAL-01 (PR #29): 32 bảng, 65 FK, 101 CHECK, 11 partial index.

## Kiểm chứng

Máy local lượt này không có Node 24 và Docker. Đã chạy bằng Node 22, gọi trực tiếp binary: Prisma generate, typecheck, ESLint, Prettier, unit API, `nest build` và `next build`. Integration và browser chờ CI của PR.

- Integration `signup.integration.spec.ts` (4 ca):
  - thiếu CSRF → 403
  - chưa có tài khoản trước khi dùng link; chỉ link mới nhất dùng được; DB không chứa token gốc
  - từ chối `ADMIN`, role sai chữ, mật khẩu ngắn, tên rỗng hoặc quá dài
  - tạo `STUDENT` đúng trạng thái và audit; dùng lại link → invalid; đăng nhập được
  - đăng ký giảng viên; email được admin cấp trong lúc link còn hạn → 409; link hết hạn hoặc sai định dạng → invalid
  - email đã có tài khoản và tài khoản bị khóa nhận cùng câu trả lời, không có link; tài khoản khóa không nhận thư
  - yêu cầu thứ 6 cho cùng email → 429
- Browser `tests/auth-04.spec.ts`: đăng nhập → "Đăng ký" → thư trong outbox → hoàn tất (không có lựa chọn Quản trị; phải chọn vai trò) → link không dùng lại được → đăng nhập vào không gian giảng viên; 390/320px không tràn ngang.

## Chưa làm

- Giới hạn email theo tên miền trường: chưa có tên miền chính thức để kiểm.
- CAPTCHA hoặc chặn email dùng một lần; hiện chỉ có giới hạn tần suất.
- Dọn token đã hết hạn định kỳ.
- Admin lọc riêng tài khoản tự đăng ký; hiện phân biệt qua audit `ACCOUNT_SELF_REGISTERED`.
- AUTH-03 từng giới hạn bước hoàn tất đặt lại mật khẩu bằng một khóa chung cho mọi người; đã sửa sang khóa theo từng link ở PR #30, cùng cách AUTH-04 dùng.
