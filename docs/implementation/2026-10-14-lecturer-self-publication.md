# Giảng viên upload và tự công bố — 14/10/2026

Chủ sản phẩm đổi A02: giảng viên chọn tài liệu PDF từ nguồn bất kỳ, không bắt buộc tài liệu HUCE hoặc khai báo căn cứ quyền, tự công bố thay vì chờ admin duyệt. Thực hiện trên `codex/lecturer-self-publication`, base `b3cefe9`. Giữ PDF25MiB, quét kỹ thuật, phân công môn, chủ sở hữu, phiên bản và quyền riêng tư ghi chú. Sinh viên vẫn dùng luồng gửi/duyệt đã có.

## Chức năng và dữ liệu

- Form giảng viên: nguồn tham khảo tùy chọn; bỏ ô căn cứ quyền bắt buộc. Student validation vẫn bắt buộc tại API. Không tự ghi nguồn HUCE, giấy phép hoặc lời xác nhận giả để qua validation.
- Sau upload, **Cập nhật trạng thái** rồi **Công bố** khi SAFE. Xác nhận inline phiên bản/lần lưu; mất response khóa mutation cho đến **Tải trạng thái công bố**. Bản công bố bất biến, sửa bằng phiên bản kế tiếp.
- POST `/api/v1/material-drafts/:id/publish` nhận `{revision}`. LECTURER riêng; actor và tài nguyên được kiểm tra lại dưới khóa. DRAFT/SAFE/đúng phân công, title/course và revision phải hợp lệ. Cập nhật version/current/document revision + audit `MATERIAL_SELF_PUBLISHED` trong transaction. Không tự mở HIDDEN.
- Migration007 thêm publication_method: ADMIN_REVIEW mặc định giữ dữ liệu cũ; LECTURER_SELF cho tự công bố và CHECK chỉ cho APPROVED. API/UI serialize publicationMethod để hiển thị **Đã công bố**, không giả **Đã duyệt** bởi admin. Không tạo publication_requests cho tự công bố; vẫn giữ lịch sử yêu cầu thật của tài liệu cũ.
- Library/reader/saved/recent dùng điều kiện đọc hiện hữu; restore chấp nhận nguồn/căn cứ quyền trống ở LECTURER_SELF. Vẫn SAFE, APPROVED, VISIBLE và chưa hết hạn hiệu lực đã khai báo nếu có. Admin vẫn quản lý ẩn/khôi phục/bàn giao; không công bố thay giảng viên bằng endpoint này.
- Yêu cầu lecturer SUBMITTED/CHANGES_REQUIRED cũ không được tự chuyển hàng loạt. Rút/mở lại để công bố; endpoint submit cũ còn tương thích. Ghi chú luôn giữ nguyên version/page của PDF cũ.

## Kiểm chứng và giới hạn

- API RED→GREEN: năm test mới ban đầu thất bại400/404; sau triển khai cả integration **134 đạt, một scanner test opt-in skip**. Bao phủ nguồn optional chỉ lecturer, role/owner/CSRF, MISSING/CHECKING/FAILED, revision/double publish, current/no fake request/audit, hidden/restore và successor. Migration test nhận đủ bảy migration;23bảng/47FK/63CHECK/7partial index và snapshot guards còn nguyên.
- Browser RED: form bắt buộc nguồn/quyền chặn lưu. GREEN: tạo không nguồn/quyền, upload PDF tổng hợp, SAFE fixture, tự công bố mất response→refresh, immutable metadata và tìm/đọc trong library; không có yêu cầu admin.
- `pnpm check` sau sửa review đạt lint/typecheck,50unit và build. Full integration cuối134pass/1skip; full browser53pass, gồm legacy reopen→selfpublish→v2→lịch sử yêu cầu cũ và lecturer legacy withdraw bằng metadata fixture đúng. Các cảnh báo pg-query/NO_COLOR có sẵn được giữ trong log.
- Independent review phát hiện lịch sử yêu cầu cũ bị che sau tự công bố rồi tạo phiên bản mới và fixture/expectation browser legacy cần chuyển sang hành vi mới. Regression và sửa được ghi trong ledger; không đổi dữ liệu lịch sử để làm test qua.
- Bounded captures1440/768/360 không tràn document; detector một lượt trả[]. Trong lượt xem ảnh phát hiện VersionHistory giữ nhãn DRAFT sau publish vì effect không phụ thuộc revision. Regression mới tái hiện nhãn cũ sau5000ms; thêm current.revision cho tải danh sách/chi tiết lịch sử. Luồng tự công bố và history regression đã đạt trong các lượt browser sau fix; bản demo local cũng hiện đúng nhãn ngay sau công bố.
- Lượt browser cuối `.local/self-publish-browser-complete.log`:52/53 đạt; ca reader đầu tiên còn đang render PDF khi assertion mặc định5giây hết hạn. Helper reader tương tự đã đạt sau giới hạn15giây. Điều chỉnh riêng assertion khởi tạo này lên15giây, không đổi timeout toàn bộ hoặc reader sản phẩm. Test retry PDF cũng chờ trang2 được lưu rồi kiểm tra resume trang2, không giả định trang1 sau reload. Chạy lại riêng ca còn lại đạt1/1 trong `.local/self-publish-browser-recheck.log`; không gộp thành một lượt full-suite xanh.
- Docker lỗi giữa lượt: WSL bootstrap/precondition lỗi, nhưng `wsl --version` đọc được3.0.3. Chỉ restart Docker Desktop bằng CLI chính thức; PostgreSQL/Redis/ClamAV healthy trở lại. Không cập nhật WSL, reset distro hoặc xóa volume. Lần test setup treo được dừng trước khi chạy lại.

- Local đã áp dụng migration007 vào `hucescholar`, rebuild và khởi động lại đúng hai preview process đã xác minh. Tài khoản lecturer demo upload PDF tổng hợp hai trang, để trống nguồn/căn cứ quyền, qua worker ClamAV/Poppler thật rồi tự công bố thành công. UI hiện **Đã công bố** ở cả thông báo, lịch sử phiên bản và danh sách; không có lần gửi duyệt nào.

Các log `.local/self-publish-*`, PDF tổng hợp và credential demo bị Git bỏ qua. Browser fixture đánh dấu SAFE tổng hợp được phân biệt với lần thử scanner thật trên local. Không deploy/push/merge, không nhập dữ liệu trường hoặc tải nội dung ngoài. Hạn chế Back/Forward SPA với note chưa lưu và PWA/S3/thiết bị thật vẫn như mốc trước.
