# Giữ bản soạn kiểm duyệt khi Back/Forward

## Nguyên nhân và bản sửa

Ca `lecturer reopens a legacy change request, self-publishes and retains older request history` mất lý do và lựa chọn sau Back/Forward. Lỗi đã có trên HEAD `5a19c49` trước CITE-01.

`RoleWorkspace` hiển thị link theo role của route ngay khi shell còn đang xác thực. Sau đăng nhập, người dùng hoặc test bấm link đủ nhanh khi link mới có HTML nhưng router chưa hydrate: trình duyệt tải document mới cho `/workspace/admin/moderation`. Back/Forward sau đó có thể tiếp tục tải document mới, khiến RAM chứa `retainedDecision` bị tạo lại. Không phải lỗi khớp owner/revision hoặc API tự xóa lý do.

Đã đổi shell để chỉ cung cấp role cho menu khi xác thực client hoàn tất (`ready` hoặc `denied` với role thật của tài khoản). Trong lúc chờ/lỗi kết nối vẫn có trạng thái tải/thử lại hiện hữu. Link được mount sau hydration nên thao tác điều hướng chính đi qua Next.js, giữ được RAM của document cho luồng Back/Forward.

Không đổi API, database, luật duyệt hoặc cách lưu bản soạn. Lý do/lựa chọn vẫn chỉ nằm trong RAM và chỉ khôi phục sau khi actor/request/revision/PENDING/snapshot khớp. Xác nhận đã kiểm tra quyền luôn cần làm lại. Không thêm localStorage, sessionStorage, history payload hoặc service-worker cache. Reload thật/đóng tab vẫn có thể mất RAM; không hứa đồng bộ bản soạn qua lần tải document mới.

## Kiểm chứng

- Chẩn đoán trước sửa ghi mốc vòng đời và boolean/độ dài, không ghi nội dung hoặc credential. Thấy request document tới trang kiểm duyệt trước/sau Back/Forward, module khởi tạo lại và bản giữ tạm rỗng. Log `.local/moderation-draft-navigation.log`.
- Chỉ thay điều kiện menu, ca lỗi chạy qua: không có document navigation vào kiểm duyệt, cùng owner/request/revision khôi phục đúng lý do/lựa chọn. Log `.local/moderation-draft-green-diagnosis.log`. Toàn bộ instrumentation tạm đã gỡ.
- Regression auth ba vai trò chủ động giữ phản hồi profile, kiểm tra chưa có role link khi chờ, rồi trả phản hồi và kiểm tra menu có thể dùng. Giữ kiểm tra đăng nhập/restore session/đăng xuất cũ.
- Regression kiểm duyệt đếm request document, đi Back/Forward thật, giữ lý do và lựa chọn APPROVED nhưng không tự đánh dấu xác nhận quyền. Sau đó tiếp tục ca yêu cầu sửa → mở lại → tự công bố → phiên bản kế tiếp như trước.
- `pnpm check` đạt lint/typecheck, 82 unit tests và build API/web. `pnpm format:check` và `git diff --check` đạt.
- Browser hồi quy cuối **61/61 đạt**: auth ba vai trò, workspace UI, trích dẫn, reader V2, thao tác ghi chú trực tiếp, geometry và toàn bộ `materials.spec.ts`. Ca kiểm duyệt trước đây thất bại nay đạt cả khôi phục lý do/lựa chọn, xác nhận quyền mới và kết thúc luồng self-publication/phiên bản kế tiếp. Log `.local/moderation-draft-regression.log`; check/format ở `.local/moderation-draft-check.log` và `.local/moderation-draft-format-check.log`.
- Rà soát độc lập ba file code/test không phát hiện vấn đề cần sửa. `moderation-detail.tsx` giữ nguyên so với HEAD; instrumentation chẩn đoán đã được gỡ hoàn toàn.

Kiểm thử dùng tài khoản/PDF tổng hợp và database `_test`; chưa phải kiểm chứng production hoặc thiết bị thật.
