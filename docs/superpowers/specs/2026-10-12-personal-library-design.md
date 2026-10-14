# Thư viện cá nhân

Mốc này mở rộng kho học liệu đã có: lưu/bỏ lưu theo document và đọc gần đây theo version. Không nhập sách trường, tải nội dung ngoài, thêm bộ sưu tập hoặc đồng bộ thư viện khi chưa có nguồn/quyền. Giữ ba roles, schema và thiết kế production.

- Mọi role đã xác minh có thư viện riêng. API lấy user từ session, admin không xem thư viện người khác.
- `saved_documents` đã có khóa user/document. PUT/DELETE `/personal-library/saved/:id` là đặt trạng thái, idempotent; GET route trả saved boolean của chính owner, không xác nhận document tồn tại. PUT chỉ lưu nếu current đủ điều kiện đọc. DELETE được bỏ liên kết riêng cả khi tài liệu ẩn/hết quyền.
- GET `/personal-library/saved?page&limit` phân trang12, tối đa100; xếp created_at DESC/document_id DESC. Mỗi entry documentId/savedAt/material; material là bản hiện hành đủ điều kiện hoặc null. Entry không khả dụng giữ được để bỏ lưu, không lộ title/source/file metadata. Không tự chuyển ghi chú hay progress.
- GET `/personal-library/recent?page&limit` lấy reading_progress riêng, updated_at DESC/version_id DESC, giữ exact version/page. Material null nếu hidden/unsafe/expired; không cấp link đọc. Không coi mở metadata là đã đọc.
- Dùng LibraryService cho selection/availability/serialization; API file/notes/progress vẫn kiểm tra quyền mỗi request. Save khóa advisory theo owner → actor SHARE → document SHARE → version/file SHARE. Reread current dưới khóa document; hide/approval không chen giữa check/save. Delete serialize cùng owner; mọi write CSRF. Không migration/dependency hoặc personal audit payload.
- `/workspace/personal-library`: hai tab Đã lưu/Đọc gần đây, hàng có version/page, đọc/bỏ lưu; nhãn không khả dụng rõ. Nút lưu/bỏ lưu trong reader giữ app context; mất response khóa nút, yêu cầu tải trạng thái rồi mới retry. GET lỗi không suy ra chưa lưu. Danh sách có retry, phân trang, loading/empty, confirmation bỏ lưu; không xóa progress.

Nghiệm thu: privacy ba role, idempotency/concurrent writes, CSRF/validation, hidden/unsafe/expired retention và remove, saved current vs recent pinned old version, pagination; browser save/reload/lost-response/unsave/recent và responsive1440/768/360. Format/lint/types/unit/integration/browser/build, fresh branch review, UI finish/documentation, local runtime, commit chức năng/push, không merge.
