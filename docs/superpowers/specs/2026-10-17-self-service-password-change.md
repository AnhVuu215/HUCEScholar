# AUTH-01 — tự đổi mật khẩu trên web

Trạng thái: thiết kế đề xuất ngày 17/10/2026, chưa triển khai. Là lát cắt đầu tiên của [roadmap](../../roadmap/2026-10-17-web-improvement-roadmap.md), không bao gồm toàn bộ vòng đời tài khoản.

## Mục tiêu và phạm vi

ADMIN/LECTURER/STUDENT đang đăng nhập và biết mật khẩu hiện tại tự đặt mật khẩu mới trong mục tài khoản. Giữ người thao tác đăng nhập bằng một session mới, thu hồi tất cả session cũ. Admin không đổi mật khẩu thay người khác trong API này.

Không làm SMTP, quên mật khẩu, đổi email, cờ buộc đổi lần đầu, màn hình quản lý thiết bị, mật khẩu mặc định hoặc lịch đổi mật khẩu định kỳ. Không thay password của tài khoản demo thật khi triển khai/kiểm thử.

## Hiện trạng đã đọc

- `AuthService.login` xác minh Argon2id ngoài transaction, khóa hàng users rồi kiểm lại hash/status/email trước khi cấp session. Tận dụng thứ tự khóa đó cho thay mật khẩu và ca race.
- Session dùng token ngẫu nhiên32 byte, DB lưu hash; thời hạn8 giờ, `authenticate` đọc trạng thái tài khoản mỗi request.
- `CsrfGuard` đã là global guard; response API đã `no-store`; body auth giới hạn16 KiB.
- Schema có `users.password_hash`, `revision`, `auth_sessions`, `password_reset_tokens`, `audit_events`. AUTH-01 không cần migration.
- Giới hạn mật khẩu tạo tài khoản hiện là 16–128 theo validator; login nhận 1–128, trong khi input web giới hạn 128 đơn vị UTF-16. AUTH-01 cần giữ tương thích với ô login này; không trim/normalize mật khẩu.

## Hợp đồng API đề xuất

```http
POST /api/v1/auth/change-password
Content-Type: application/json
Origin: <APP_ORIGIN>
X-CSRF-Token: <current token>

{ "currentPassword": "<secret>", "newPassword": "<secret>" }
```

Session lấy từ cookie, người dùng từ SessionGuard; không nhận `userId`, role hoặc email trong body. `currentPassword`: string không rỗng, tối đa 128 đơn vị UTF-16; `newPassword`: tối thiểu 16 Unicode code point theo MinLength hiện có, tối đa 128 đơn vị UTF-16 để nhập lại được qua login hiện hành; reject unknown fields. Client và API kiểm cùng hai cách đếm này, không chỉ dựa vào HTML minlength. Xác nhận mật khẩu mới thực hiện ở form, không cần gửi thêm bản copy secret qua API.

| Kết quả                                                  | HTTP / code                        | Hành vi                                                                 |
| -------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Thành công                                               | 204, không body                    | Set cookie session mới; clear CSRF cookie để lần ghi tiếp lấy token mới |
| DTO sai hoặc password mới trùng cũ                       | 400 / `INVALID_PASSWORD_INPUT`     | Không ghi DB                                                            |
| Mật khẩu hiện tại sai                                    | 400 / `INVALID_CURRENT_PASSWORD`   | Giữ session; phản hồi không chứa input                                  |
| Session hết hạn/thu hồi, tài khoản không ACTIVE/verified | 401                                | Không ghi mật khẩu hoặc cấp session                                     |
| CSRF/origin sai                                          | 403                                | Chặn theo guard hiện hữu                                                |
| Hash/email đổi trong lúc xử lý                           | 409 / `CREDENTIAL_CHANGED`         | Không ghi đè; yêu cầu đăng nhập lại, không tự retry                     |
| Hết quota                                                | 429                                | Giữ chính sách login độc lập                                            |
| Redis/DB lỗi                                             | 503 hoặc lỗi server chuẩn hiện hữu | Không fail open, không gửi cookie mới trước commit                      |

Không cố biến mọi lỗi DB thành “chưa đổi”: khi phản hồi thất lạc hoặc connection lỗi tại commit có thể chưa rõ kết quả. UI dùng trạng thái chưa xác nhận và đường đăng nhập lại.

## Giao dịch và session

1. Kiểm session/CSRF, tiêu thụ quota riêng rồi đọc candidate user. Xác minh currentPassword, từ chối mật khẩu mới giống cũ; hash mới bằng `passwordOptions` hiện có. Công việc Argon2 nằm ngoài đoạn khóa DB để hạn chế giữ khóa lâu.
2. Sinh token mới bằng CSPRNG; chưa set cookie.
3. Transaction khóa hàng user bằng `FOR UPDATE`, cùng thứ tự với login/account update. Đọc lại status, verified_at, email và password_hash. Nếu khác candidate, dừng; không retry thay mật khẩu với snapshot cũ.
4. Kiểm lại session từ cookie thuộc đúng user, chưa revoked và chưa hết hạn trong transaction; không chỉ tin kết quả SessionGuard trước khi chờ khóa. Kiểm thời gian bằng đồng hồ DB tại thời điểm thực hiện, không dựa vào `now()` cố định ở đầu một transaction có thể chờ lâu.
5. Cập nhật hash, `updated_at`, tăng `revision` một lần. Thu hồi mọi session chưa revoked theo mẫu timestamp `greatest(clock_timestamp(), created_at)` hiện dùng ở UsersService. Đánh dấu dùng hết token reset chưa dùng của user để token phát hành trước thay đổi không dùng lại được.
6. Tạo session mới với hash token và hạn tuyệt đối không muộn hơn session đang thay thế. Ghi audit `ACCOUNT_PASSWORD_CHANGED`, entity `USER`, actor là chính user. Audit chỉ metadata; không password/hash/cookie/token/IP thô hoặc nội dung note.
7. Commit rồi mới set cookie theo cấu hình hiện hữu, maxAge còn lại; clear CSRF cookie với đúng thuộc tính. Không trả token trong JSON. Mọi bước DB thành công hoặc rollback cùng nhau.

Hai request đổi mật khẩu đồng thời: một request thắng; request còn lại thất bại do session/hash không còn hợp lệ. Login bắt đầu bằng hash cũ rồi chờ khóa phải bị từ chối; login bắt đầu sau commit bằng mật khẩu mới vẫn hợp lệ. Request nghiệp vụ đã được xác thực trước khi thay đổi không được mặc nhiên coi là có thể hủy từ xa; không hứa “xóa ngay dữ liệu đang hiển thị ở các tab”.

Quota đề xuất khởi điểm:5 request/user/15 phút và 30 request/IP/15 phút, Redis key namespace riêng, user/IP được hash; áp dụng trước Argon2 và tính cả lần thành công. Đây là lựa chọn dự án cần kiểm chứng, không phải con số bắt buộc từ OWASP. Redis lỗi trả 503; không khóa vĩnh viễn account. Giữ nguyên login 60/IP/phút và 10/email/15 phút. Local cùng loopback không chứng minh cấu hình proxy cho nhiều người dùng.

## Trải nghiệm

Đặt form inline bên dưới thông tin tài khoản ở `RoleWorkspace` khi dùng trang mặc định của từng vai trò; không thêm modal hoặc thiết kế lại sidebar. Ba trường: Mật khẩu hiện tại / Mật khẩu mới / Nhập lại mật khẩu mới. Cho paste/password manager, autocomplete current-password/new-password, label rõ, vùng chạm tối thiểu44px. Ghi trước nút lưu: “Sau khi đổi, các phiên đăng nhập cũ sẽ bị kết thúc.”

- Client kiểm độ dài/xác nhận khớp để hỗ trợ người dùng; API vẫn kiểm độc lập.
- Khi pending chống submit kép; không thêm password vào URL, storage, history, telemetry, toast, ảnh hoặc trace.
- 204: xóa cả ba trường và báo thành công, focus về thông báo. Không điều hướng khỏi tài khoản.
- 400: thông báo đúng trường; session vẫn dùng được. Không phản chiếu giá trị mật khẩu trong lỗi.
- 401/409: xóa trường, giải thích cần đăng nhập lại, có link rõ tới `/login`; không tự gửi mật khẩu cũ hoặc mới để thử đăng nhập.
- Lỗi mạng/timeout/5xx: xóa trường, chuyển sang thông báo “Chưa xác nhận được kết quả đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới; nếu không được, thử mật khẩu cũ.” Không suy ra thành công từ `/auth/me`, vì cookie có thể đã nhận hoặc chưa nhận. Không tự retry mutation.
- Rời form không lưu password draft. Không tái sử dụng guard ghi chú để giữ bí mật mật khẩu lâu hơn; bản soạn note ở reader giữ hành vi riêng hiện có.

## Nghiệm thu

- [ ] Cả ba vai trò đổi được; không đổi cho user khác bằng body hoặc URL.
- [ ] Sai current/DTO/CSRF/rate limit không thay hash, revision hoặc session.
- [ ] Hai browser session trước đổi đều mất hiệu lực; browser thao tác nhận cookie mới dùng được; hạn session không tự kéo dài.
- [ ] Login bằng password cũ thất bại, bằng password mới thành công; test không in các giá trị này.
- [ ] Password đổi/status đổi/session revoked trong lúc chờ khóa không làm ghi đè hoặc cấp phiên sau thu hồi.
- [ ] Transaction lỗi rollback cả password, revoke, reset-token và audit; cookie chỉ set sau commit.
- [ ] Token reset cũ dùng không được; audit không chứa secret.
- [ ] Mất phản hồi sau khi commit không tự gửi lại; UI không báo thành công giả.
- [ ] Form ở 320/360/768/1440px, keyboard/focus/labels và password manager; chưa coi là chứng nhận thiết bị thật.

Nguồn thiết kế: [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#change-password-feature), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renew-the-session-id-after-any-privilege-level-change), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Chi tiết status code, giữ hạn session, quota và UI trên đây là đề xuất cụ thể cho HUCEScholar.
