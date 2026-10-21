# AUTH-03 — Khôi phục tài khoản qua email

Ngày 21/10/2026. Nhánh `codex/auth-03-account-recovery`, xây trên `main` sau PR #25. Roadmap ghi mục này cần SMTP và HTTPS, vốn thuộc phần vận hành đã hoãn. Chủ dự án bảo triển khai, nên lượt này làm **phần chạy và kiểm chứng được trên máy local**. Gửi thư thật qua máy chủ SMTP thật và HTTPS **chưa kiểm**.

## Hành vi

- Trang đăng nhập có link **Quên mật khẩu?** dẫn tới `/forgot-password`. Người dùng nhập email và **luôn nhận cùng một câu trả lời**, dù email có tài khoản hay không, bị khóa hay chưa xác minh. Việc tra tài khoản và gửi thư chạy **sau khi đã trả lời**, nên thời gian phản hồi cũng không lộ email có tồn tại hay không.
- Chỉ tài khoản ACTIVE đã xác minh mới nhận thư. Tài khoản bị khóa hoặc chưa xác minh vẫn phải nhờ admin cấp lại, như trước.
- Thư có link `APP_ORIGIN/reset-password#token=…`:
  - token ngẫu nhiên 32 byte, DB chỉ lưu SHA-256 trong `password_reset_tokens` (bảng có sẵn từ baseline)
  - hết hạn sau **30 phút**; chỉ link mới nhất dùng được, yêu cầu mới vô hiệu link cũ
  - token nằm sau `#`, nên không lên log máy chủ hay header Referer; web chỉ đọc token lúc bấm gửi và xóa nó khỏi thanh địa chỉ sau khi đặt lại xong
- Đặt mật khẩu mới (≥ 16 ký tự, giống đổi mật khẩu) trong một transaction:
  - cập nhật mật khẩu, bỏ cờ buộc đổi mật khẩu
  - **thu hồi mọi phiên**, vô hiệu mọi token còn lại
  - ghi audit `ACCOUNT_PASSWORD_RESET`
  - không tự đăng nhập; người dùng đăng nhập lại bằng mật khẩu mới
- Token sai, hết hạn hoặc đã dùng đều trả cùng `400 RESET_TOKEN_INVALID`.
- Giới hạn qua Redis:
  - yêu cầu: 5 lần / 15 phút cho mỗi email, 20 lần / 15 phút cho mỗi IP
  - hoàn tất: 5 lần / 15 phút cho mỗi IP
- Mỗi yêu cầu cho một tài khoản thật ghi audit `ACCOUNT_RECOVERY_REQUESTED`.
- Admin cấp lại mật khẩu tạm (luồng cũ) vẫn vô hiệu mọi token khôi phục, như trước.

## Cấu hình thư

Biến trong `apps/api/.env.example`:

| `MAIL_TRANSPORT` | Ý nghĩa |
| --- | --- |
| (trống) | Tắt khôi phục: API trả `503 RECOVERY_UNAVAILABLE`, form bảo liên hệ quản trị viên |
| `file` | Ghi mỗi thư thành file JSON trong `MAIL_DIR` (đường dẫn tuyệt đối). Chỉ cho dev/test; production từ chối khởi động |
| `smtp` | Gửi qua `SMTP_URL` (`smtp://` hoặc `smtps://`) với người gửi `MAIL_FROM` bắt buộc; timeout kết nối 10 giây |

- Lỗi gửi thư chỉ ghi một câu chung vào log, không kèm host hay thông tin đăng nhập SMTP.
- Môi trường test (`pnpm test:setup`) đặt `MAIL_TRANSPORT=file` và `MAIL_DIR=.local/mail-outbox/` (đã nằm trong `.gitignore`).
- Thư viện mới: `nodemailer@10.0.13`, bản phát hành 30/9/2026, cố định phiên bản như các thư viện khác; thêm `@types/nodemailer@8.0.2` cho dev.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- Unit `mailer.spec.ts` (3 ca):
  - cấu hình tắt khi trống; từ chối `file` trong production, `MAIL_DIR` tương đối, URL không phải SMTP, thiếu `MAIL_FROM`, transport lạ
  - **gửi qua giao thức SMTP thật** tới một server SMTP giả trong process, kiểm `To`/`From`
  - server không tới được → lỗi chung
- Integration `recovery.integration.spec.ts` (3 ca):
  - email không tồn tại và tài khoản bị khóa nhận cùng câu trả lời, không có thư; thiếu CSRF → 403
  - email viết hoa vẫn đúng; hai yêu cầu → chỉ link mới nhất dùng được; DB không chứa token gốc
  - mật khẩu ngắn → 400; đặt lại → phiên cũ 401, mật khẩu cũ 401, mật khẩu mới 200; dùng lại link → `RESET_TOKEN_INVALID`
  - đúng thứ tự audit; link hết hạn hoặc sai định dạng → `RESET_TOKEN_INVALID`
  - yêu cầu thứ 6 cho cùng email → 429
- Browser `tests/auth-03.spec.ts`:
  - đăng nhập → "Quên mật khẩu?" → cùng câu trả lời cho email lạ và email thật → đọc link từ outbox
  - thiếu token thì form báo lỗi; mật khẩu xác nhận không khớp thì báo lỗi
  - đặt lại thành công, token biến khỏi URL; dùng lại link thất bại
  - mật khẩu cũ bị từ chối, mật khẩu mới vào được không gian sinh viên
- Bộ đầy đủ:
  - `pnpm format:check`, `pnpm check` (lint, typecheck, 107 unit, build): đạt.
  - `pnpm test:integration`: 204 passed, 1 skipped.
  - `pnpm test:e2e --workers=1`: 167 passed, 8 skipped (6,5 phút).

## Chưa kiểm hoặc chưa làm

- Chưa gửi qua máy chủ SMTP thật hay nhà cung cấp thư; chưa có SPF/DKIM, chưa kiểm thư rơi vào spam; chưa chạy trên HTTPS. Thuộc OPS-02.
- Hàng đợi gửi thư bền: hiện gửi ngay trong process API sau khi trả lời, nên API khởi động lại giữa chừng thì thư đó mất (người dùng yêu cầu lại).
- Đổi email, xác minh email, thông báo "mật khẩu vừa được đổi" gửi tới hộp thư.
