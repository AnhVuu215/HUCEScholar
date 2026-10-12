# Mốc 2 — Database và đăng nhập

Ngày: 11/10/2026. Phạm vi: PostgreSQL/Prisma, đăng nhập/đăng xuất bằng cookie phiên và kiểm tra ba role tại API; giao diện responsive cho tài khoản. Chưa phải bản triển khai vận hành của trường.

## Triển khai

- Prisma 7.10.0 với adapter pg; đủ 23 model trong namespace `hucescholar`. Baseline migration sao chép nguyên văn SQL tham chiếu; hai blob Git giống từng byte sau chuẩn hóa LF, SHA-256 `872fc46cf65f2f2c7bfbc97b0afc02069d8f6d25dfe3d06bd9b65cf1c2bf1ebe`. Migration bookkeeping nằm ở `public`.
- Prisma không suy ra inverse duy nhất của FK `(documents.id,current_version_id)`. Mapping inverse dùng collection kèm chú thích; SQL/FK giữ nguyên. Không thêm unique dư thừa, không dùng `db push`; đọc lại schema bằng introspection cần giữ bản chỉnh mapping này.
- Migration thứ hai thu hồi tất cả phiên còn hiệu lực khi `status`, `password_hash`, `role` hoặc `verified_at` thực sự thay đổi. Khôi phục trạng thái không làm sống lại phiên cũ.
- Mật khẩu Argon2id (19 MiB, 2 lượt, parallelism 1). Token ngẫu nhiên 32 byte, chỉ lưu SHA-256 vào PostgreSQL, hết hạn sau 8 giờ, không gia hạn ngầm. ID bigint trả dưới dạng chuỗi JSON.
- Login giữ row lock và đọc lại tài khoản trong transaction sau khi kiểm tra hash; thay mật khẩu/khóa đồng thời không tạo được phiên từ dữ liệu cũ. Không có account mutation API ở mốc này.
- Browser cookie HttpOnly, SameSite=Lax, Path=/; production HTTPS dùng Secure và tiền tố `__Host-`. Không có JWT/localStorage. Logout thu hồi phiên trong DB và xóa cookie.
- CSRF: seed HttpOnly ngẫu nhiên + HMAC gắn với cookie phiên hiện tại. Mọi mutation yêu cầu đúng Origin cấu hình, header CSRF và không có `Sec-Fetch-Site: cross-site`. Sau login phải lấy CSRF mới để logout.
- Redis: Lua tăng đếm atomic, 10 lần/email chuẩn hóa/15 phút và 60 lần/IP/phút. Key email/IP được hash; không lưu phiên trong Redis. Mất Redis trả 503, không dùng fallback RAM; tiếp tục tự nối lại với khoảng chờ tối đa 5 giây.
- Mọi phản hồi API đều `Cache-Control: no-store`, kể cả lỗi và URL viết hoa. Body JSON giới hạn 16 KiB; DTO từ chối trường thừa. Lỗi sai mật khẩu/không có tài khoản/PENDING/LOCKED có cùng phản hồi. Không trả hash hoặc token trong JSON.
- CLI chỉ tạo ADMIN đầu tiên, khóa advisory trong transaction, ghi audit; không thay tài khoản đã tồn tại. Mật khẩu lấy qua file env bị Git bỏ qua. File `.env.bootstrap.example` trống có thể commit; file thực không được commit.

## API hiện có

Tất cả đường dẫn có tiền tố `/api/v1`. Web gọi cùng origin qua proxy; API không bật CORS rộng.

| Method/path | Quyền và kết quả |
| --- | --- |
| GET `/health` | Liveness, không chứng minh toàn hệ thống sẵn sàng |
| GET `/auth/csrf` | Public; `{csrfToken}`, cấp seed cookie nếu cần |
| POST `/auth/login` | CSRF + Origin; `{email,password}` → `{user}` và session cookie |
| GET `/auth/me` | Phiên hợp lệ → `{user}` |
| POST `/auth/logout` | CSRF + Origin; thu hồi phiên nếu có, 204; gọi lại được |
| GET `/workspace/admin` | ADMIN chính xác → `{user}` |
| GET `/workspace/lecturer` | LECTURER chính xác → `{user}` |
| GET `/workspace/student` | STUDENT chính xác → `{user}` |

`user = {id:string,email,displayName,role}`. Chưa có tự đăng ký, đổi role từ browser, gửi mail reset hoặc tạo tài khoản khác qua UI/API. Admin không tự được vào endpoint giảng viên/sinh viên. Giao diện workspace chỉ hiển thị hồ sơ và công việc sẽ triển khai; không mô phỏng học liệu.

## Proxy và cấu hình triển khai

Local chỉ phục vụ loopback: PostgreSQL 55432 và Redis 56379 để tránh dịch vụ PostgreSQL khác đang dùng 5432. `TRUSTED_PROXY_IPS` mặc định trống; Nest bỏ qua forwarded IP từ peer không tin cậy. Qua Next rewrite local, các trình duyệt cùng máy dùng chung bucket IP loopback; bucket email vẫn riêng. Không bật trust proxy cho loopback chỉ để tin header Next, vì rewrite có thể chuyển tiếp header do client cung cấp.

Trước triển khai nhiều người dùng: Caddy phải route `/api/*` **trực tiếp** tới Nest cùng origin; ghi đè/chuẩn hóa X-Forwarded-For từ socket client, chỉ cấu hình exact IP của Caddy trong `TRUSTED_PROXY_IPS`, và khóa truy cập Nest từ mạng ngoài. Không dùng wildcard, hop-count hoặc dải subnet rộng. Caddy/HTTPS và chính sách địa chỉ thật chưa được triển khai/kiểm chứng ở mốc local này.

DB credentials, CSRF secret và Redis URL là server-only. `pnpm setup:local` sinh secret ngẫu nhiên và giữ file đã có. Dùng tài khoản DB có quyền migration cho local; trước production cần tách migration/runtime DB role và kiểm tra backup, TLS, quyền mạng. Logger không in lỗi driver/connection raw vì có thể chứa dữ liệu nhạy cảm.

## Bằng chứng kiểm tra

- Đã quan sát RED trước triển khai: cấu hình/auth routes thiếu; trigger chưa thu hồi phiên; màn hình login chưa có. Các lỗi review Redis reconnect, proxy config và URL khác casing có regression test trước khi sửa.
- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm check`: đạt; unit **40/40**, lint/typecheck và production build local đạt. Đã chạy toàn bộ suite với Node **24.19.0** đã pin (terminal người dùng còn có Node 22 riêng).
- `pnpm test:integration`: **26/26** đạt trên PostgreSQL thật `_test` và Redis DB 15; có ba role, token hash, logout, hạn/thu hồi/khóa/xác minh, CSRF/Origin, generic errors, throttle, DTO, proxy/caching regression. Ca JSON parser đã quan sát RED trước sửa: middleware no-store phải đặt trước body parser; sau sửa unit/type/lint/integration và build API đều đạt.
- SQL gốc `docs/tools/validate_data_design.sql`: **37/37** đạt trên database đã migrate, transaction kết thúc ROLLBACK. Đây là kiểm chứng ràng buộc, không chứng minh dữ liệu fixture tồn tại lâu dài.
- Cấu trúc PostgreSQL 18.6: **23 bảng, 47 FK, 58 CHECK, 7 partial index**, trigger gốc và trigger phiên bổ sung. Không nhầm 37 ca SQL với số CHECK. PostgreSQL 18 cũng biểu diễn NOT NULL bằng loại constraint riêng `n`.
- Playwright qua Chrome đã cài: **18/18**, gồm đăng nhập ba role, tải lại phiên, sai mật khẩu/khôi phục, URL sai quyền, lỗi mạng, logout/quay lại và reflow login/workspace ở 360, 768, 1440 px. Không thay thế kiểm chứng Safari/iOS/Android hoặc PWA trên thiết bị thật.
- Captures local chỉ có credential trống hoặc account synthetic được ghi nhãn. Trace tắt để tránh thu mật khẩu/session. Test env/password ngẫu nhiên nằm trong `.local/test.env`; test setup chỉ seed `e2e-*@example.test` trong `hucescholar_test`, không seed app DB.
- Review code độc lập tìm ba P2 (proxy IP boundary, Redis ngừng reconnect, URL casing bỏ qua no-store); đã sửa và thêm kiểm thử. Impeccable detector chỉ có advisory do DESIGN.md gốc có scope prototype; không tự sửa hay mở rộng root design authority. Documenter xác nhận không cần đổi DESIGN.md/sidecar.

Kiểm chứng local bổ sung: tạo ADMIN đầu tiên vào app DB bằng CLI, gọi bootstrap lại bị từ chối và hash không đổi. Đăng nhập qua web proxy, restart đúng container PostgreSQL của dự án, giữ được tài khoản và dùng lại phiên cũ qua `/auth/me`; phiên kiểm chứng đã logout. Đây là bằng chứng dữ liệu tồn tại thật, tách biệt test rollback. UI review cuối **disposition: ship** cho hai sửa truthfulness/dev indicator; sáu capture được thay mới, targeted capture suite 6/6 đạt. Không đổi thiết kế gốc hoặc thêm artwork.

Review lại phát hiện initial Redis failure có thể để retry timer sống sau bootstrap thất bại: đã thêm disconnect khi connect đầu thất bại và đóng Nest app để dọn pool/worker. Redis mất sau khi API đã sẵn sàng vẫn tiếp tục reconnect. Node 24 process probe với Redis không sẵn sàng đã thoát status 1 trong 10 giây, không bị timeout bởi pool/timer còn sống. Reviewer kiểm lại lifecycle không còn finding cụ thể. CI tại HEAD được kiểm tra sau push và theo dõi ở draft PR #1.

Prisma generate cũng đạt khi bỏ DATABASE_URL khỏi môi trường và không tải `.env`, xác nhận sinh client không cần kết nối database. Build/dev runtime ứng dụng vẫn bắt buộc đủ cấu hình auth; không dùng credential mặc định để bỏ qua validation.

Commit triển khai `1257c31` đã được đẩy lên [draft PR #1](https://github.com/AnhVuu215/HUCEScholar/pull/1). [GitHub Actions trên Linux/Node 24](https://github.com/AnhVuu215/HUCEScholar/actions/runs/38131781516) **success**, gồm tạo dịch vụ ephemeral, install/format/check, test setup, integration và browser. Không merge `main`. Trạng thái các commit tài liệu sau đó theo dõi trực tiếp tại PR; không coi CI của commit cũ là bằng chứng HEAD mới.

## Giới hạn và bước sau

Chưa có CRUD/cấp tài khoản qua UI, bảo vệ admin cuối qua account mutation, reset password email, SSO/MFA, thu dọn phiên hết hạn tự động, upload, file scanning, S3, catalog, PDF.js, ghi chú hoặc service worker. Bootstrap chỉ phục vụ ADMIN đầu tiên; account test ở database riêng không phải tài khoản ứng dụng. Chưa deploy cloud hay merge `main`.

Bước hợp lý tiếp theo: quản lý tài khoản + danh mục khoa/ngành/môn + phân công giảng viên, rồi luồng tài liệu/upload/kiểm duyệt. Giữ nguyên quyền đọc/file và version rules đã chốt trong đặc tả.
