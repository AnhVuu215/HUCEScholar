# READ-01 — Tìm chữ, mục lục và đọc tập trung

Reader có **Tìm trong PDF**, **Mục lục PDF** khi file chứa bookmark, và **Đọc tập trung**. Các công cụ hoạt động trên đúng PDF/phiên bản đang mở, không sửa file gốc hoặc ghi vùng tô tìm kiếm vào annotations.

## Tìm chữ trong PDF

- Query tối đa100 ký tự, có dấu, không phân biệt hoa thường; ký tự regex được xem như chữ thường. Không tìm không dấu hoặc OCR. PDF scan thiếu lớp chữ báo rõ và vẫn cho ghi chú trang.
- Duyệt lần lượt, công bố kết quả theo lô4 trang và kiểm lại library access trước mỗi lô. Chỉ giữ text của trang đang xử lý cùng tối đa2000 offsets; chạm giới hạn có thông báo tìm cụ thể hơn. Không lưu text/query vào URL, storage hay service worker.
- Đổi query, đóng công cụ, đổi PDF hoặc rời reader hủy lượt đang chạy. PDF.js có thể hoàn thành lời gọi text đã bắt đầu; callback của lượt bị hủy không cập nhật UI và không đọc tiếp trang sau.
- Giữ adjacency và `hasEOL` của text items, không chèn khoảng trắng giữa mọi mẩu chữ. Whitespace query khớp qua xuống dòng. Engine và lớp dấu tìm dùng chung offset map để từ bị chia bởi đổi font vẫn tìm/đánh dấu đúng.
- Kết quả trước/tiếp chuyển đúng trang qua draft guard, giữ focus nút để tiếp tục bằng Enter/Space; mục lục trả focus vùng đọc sau jump. Progress vẫn chỉ ghi sau PDF render. Dấu tìm là DOM Range rectangles trên lớp riêng, không đổi vùng chọn hoặc highlight đã lưu; dựng lại theo text layer sau zoom/xoay và gỡ khi đóng.

## Mục lục và chế độ tập trung

Mục lục chỉ xuất hiện khi có bookmark, tối đa250 mục/depth8. Chỉ resolve named destination hoặc page reference nội bộ, kiểm page index hợp lệ rồi qua guard. Không biến URL/javascript/remote bookmark thành link; mục ngoài hiển thị nhãn không có đích nội bộ. Lỗi tải/resolve có retry hoặc hướng dùng số trang.

Đọc tập trung ẩn sidebar/header/heading/footer, thông tin nguồn và panel ghi chú bằng CSS; các editor vẫn mounted, giữ bản soạn và phiên bản/trang đích. Điều khiển đọc, tiến độ, tìm/mục lục và nút thoát còn dùng được. Hành động mở/tạo ghi chú rõ ràng thoát chế độ tập trung sau khi guard chấp nhận để editor thấy được. Hủy guard giữ nguyên chế độ và bản soạn.

Escape đóng lớp gần nhất: select/vùng chọn/trích dẫn, rồi tìm/mục lục, rồi mới thoát tập trung. Citation có handler riêng, stage có handler native trước reader để không bỏ qua toolbar khi focus vẫn trên PDF. Đóng trích dẫn vô hiệu hóa clipboard acknowledgement đang chờ và trả focus vùng đọc.

## Kiểm chứng và giới hạn

`tests/reader-find-logic.spec.ts` kiểm chữ tiếng Việt, ký tự literal, từ bị tách, EOL/offsets, hủy theo lô, giới hạn2000 và destination hợp lệ/lỗi. `tests/reader-find.spec.ts` dùng PDF tự tạo hai trang có mục lục, một bookmark đích hỏng và một từ chia giữa hai font; kiểm marker hai mẩu, zoom/xoay, không có annotation mutation, retry/response muộn, guard, focus/Escape, giữ draft và scan fallback. Unicode engine được kiểm bằng dữ liệu chữ trực tiếp; fixture PDF browser dùng font Latin cơ bản.

Kiểm chứng cuối: `pnpm check` qua lint/typecheck,82 unit và API/web build; format và `git diff --check` sạch. Toàn bộ Playwright suite tuần tự:127 passed,1 skipped (chuyển DOCX thật theo cấu hình hiện có). Tám ca READ-01 gồm5 browser +3 logic; kiểm thêm menu bốn viewport cùng task. Đã xem ảnh1280px focus và390px thường, chờ PDF render xong: không tràn/clipped controls, draft vẫn giữ. Chưa kiểm thiết bị thật.

RED đã tái hiện nút tìm chưa có, từ tách trả0 thay vì1, editor bị ẩn khi tạo trong focus và nút tìm mất focus sau jump. Review cuối không còn findings. Lượt full song song chạm giới hạn60 login/IP/phút; chạy tuần tự giải quyết tải fixture, không thay giới hạn sản phẩm. Ca menu320px được đồng bộ với trang đích trước khi kiểm lại same-route menu; không thêm workaround vào navigation sản phẩm.

Không thay schema, scan/moderation/visibility, quyền tải, file PDF/DOCX hoặc PWA cache. Chưa kiểm thiết bị thật, production, hiệu năng PDF rất lớn hoặc chất lượng lớp chữ của tài liệu thực tế. Tìm kiếm phụ thuộc text layer; chưa hỗ trợ OCR, tìm không dấu, xuất PDF kèm ghi chú hoặc đọc offline.
