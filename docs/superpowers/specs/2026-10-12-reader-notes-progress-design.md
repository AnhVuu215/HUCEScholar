# Ghi chú theo trang và tiến độ đọc riêng tư

Mở rộng reader hiện có, kế thừa giao diện navy và schema PostgreSQL. Cả ADMIN, LECTURER, STUDENT chỉ sử dụng dữ liệu học tập của chính mình. API luôn lấy user từ session, không nhận userId; không đưa nội dung ghi chú vào audit/log. Ghi chú và tiến độ gắn version ID, không tự chuyển sang bản hiện hành mới.

## Phạm vi và hành vi

- Ghi chú văn bản theo trang: tạo, đọc theo trang (cursor 30 mục), sửa và xóa có revision. Nội dung trim, 1–4000 ký tự; trang trong 1..page_count. Plain text, không HTML, không highlight tọa độ trong mốc này.
- Tạo có requestId UUID v4, duy nhất theo chủ sở hữu; retry cùng requestId/nội dung trả lại bản đã tạo. Khác nội dung trả 409, không tạo thêm. Thêm cột request_id + unique bằng migration SQL; giữ các CHECK/trigger/index cũ. Idempotency giữ trong vòng đời bản ghi, xóa rồi tái sử dụng requestId không được coi là một lần retry hợp lệ của UI.
- Ghi chú đang soạn giữ nguyên và gắn trang ban đầu khi chuyển trang. Lỗi mạng/409 giữ nội dung, có tải lại danh sách và thao tác bỏ thay đổi rõ ràng. Cảnh báo khi bấm link nội bộ, đăng xuất hoặc đóng/tải lại trang nếu còn nội dung chưa lưu; Back/Forward trong SPA chưa được chặn, có lời nhắc lưu trước khi dùng. Bản soạn chỉ tồn tại trong bộ nhớ khi trang đang mở.
- Tiến độ: GET trả item hoặc null; PUT nhận pageNumber + revision (0 khi chưa có), trả revision tăng. Lưu trang đã render thành công, không ghi khi render lỗi/đang tải. Không lưu zoom/rotation hoặc offset trong mốc này; page_offset=0. Mở lại cùng phiên bản khôi phục trang trước khi render; lỗi tải tiến độ cần thử lại hoặc người dùng chọn đọc từ trang 1 mà không ghi đè dữ liệu chưa tải.
- Lưu tiến độ tuần tự, gộp chuyển trang nhanh. Lỗi mạng có nút retry; 409 báo thay đổi từ tab khác, không tự ghi đè. Người dùng tải lại tiến độ để quyết định tiếp tục. Thông báo lưu phân biệt pending/saved/failed/conflict.

## Quyền và giao dịch

Mọi endpoint yêu cầu SessionGuard; ghi thêm CsrfGuard. Dùng cùng điều kiện đọc: APPROVED + VISIBLE + SAFE + quyền chưa hết hạn. Mutation lấy advisory lock theo owner trước actor → document → version → file (FOR SHARE). Advisory lock tuần tự hóa lần tạo đầu và CAS; actor shared giữ ổn định trạng thái tài khoản mà không đảo khóa với kiểm duyệt (document → manager shared). Người khác/admin truy cập note ID trả 404. Tài liệu ngừng khả dụng thì dừng cấp ghi chú/tiến độ nhưng giữ dữ liệu. Bản cũ APPROVED còn đủ quyền vẫn dùng riêng. Không mở quyền nhờ downloadAllowed.

## Giao diện

Panel ghi chú inline dưới vùng PDF để mobile/tablet không mất chỗ đọc; label trang, trạng thái lưu, form textarea và danh sách có edit/delete xác nhận. Tái sử dụng control/button/field-hint, focus rõ và target 44px. Reader vẫn ưu tiên tài liệu và nguồn/phiên bản; không đổi DESIGN/sidecar wireframe. Thông báo tiến độ gần toolbar. Không localStorage hoặc service worker cho dữ liệu học tập.

## Nghiệm thu

Integration kiểm chứng owner isolation (kể cả admin), CSRF, validation/trang, idempotency, stale revision/concurrent writes, hidden/unsafe/expired, giữ bản cũ và dữ liệu sau thu hồi. Browser dùng PDF tự tạo: tạo/sửa/xóa/reload ghi chú, mất response không nhân đôi, conflict giữ bản soạn, trang 2 khôi phục sau reload, lỗi/409 tiến độ không overwrite; responsive 1440/768/360. Format/lint/types/unit/integration/browser/build; migration deploy qua workflow Prisma, không db push. PDF/S3/thiết bị thật chưa được xác minh ngoài bằng chứng hiện có.
