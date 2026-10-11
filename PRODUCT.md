# HUCEScholar

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Đã chốt công nghệ MVP ngày 11/10/2026: web responsive + PWA cho desktop, điện thoại và máy tính bảng; người dùng chọn chưa phát hành app native trong MVP. Next.js/React + TypeScript + Tailwind CSS; NestJS REST API; PostgreSQL + Prisma với migration SQL tùy chỉnh; PDF.js; Amazon S3 private; BullMQ/Redis và worker kiểm tra file ClamAV/Poppler; Docker Compose. Chi tiết, ranh giới và điều kiện kiểm chứng ở docs/HUCEScholar-tech-stack.md. Đã có workspace apps/web và apps/api, migration PostgreSQL 23 bảng, đăng nhập/đăng xuất bằng cookie phiên, phân quyền ba vai trò tại API, màn hình tài khoản responsive, UI Admin cấp/sửa/khóa/mở khóa tài khoản giảng viên/sinh viên và kiểm thử tự động. Chưa có danh mục/phân công, học liệu thật, upload, reader, dịch vụ file/mail hoặc service worker PWA. HTML/CSS/JavaScript tĩnh trong design/ vẫn chỉ là prototype thiết kế.

## Users

Sinh viên HUCE cần tìm và dùng học liệu trong quá trình học, đặc biệt khi ôn thi. Giảng viên biên soạn, cập nhật và gửi công bố giáo trình trong phạm vi phân công. Quản trị viên quản lý tài khoản, danh mục, phân công, kiểm duyệt và bàn giao.

## Product Purpose

Tập trung trải nghiệm tìm học liệu, đọc tài liệu điện tử và ghi chú riêng theo phiên bản. Thành công của luồng chính là tìm đúng tài liệu, hiểu nguồn/phiên bản/quyền sử dụng, đọc và mở lại ghi chú đúng chỗ.

## Capabilities and Constraints

- Ba role ADMIN, LECTURER, STUDENT; tài khoản do admin cấp/xác minh, không tự đăng ký hoặc SSO trong MVP.
- Cả giảng viên và sinh viên gửi tài liệu đều qua kiểm duyệt. Admin không biên soạn thay giáo trình.
- Tài liệu sinh viên bổ sung tách biệt với giáo trình giảng viên. Chưa hạn chế đọc theo lớp đăng ký.
- Đọc/tải phụ thuộc quyền nguồn, file an toàn, phiên bản được duyệt và tài liệu không bị ẩn.
- Ghi chú riêng gắn người, phiên bản, trang. Bản PDF mới không tự chuyển ghi chú cũ. Chưa xuất PDF kèm ghi chú hoặc offline.
- Thư viện mini là metadata và nguồn được phép; API trường và quyền lưu toàn văn chưa xác nhận.
- Bàn giao chỉ giáo trình giảng viên; người nhận hoạt động và được phân công mọi môn liên quan. Bản đang gửi bị rút về nháp, lịch sử/tác giả/ghi chú được giữ.

## Brand Commitments

Tên đã chốt: HUCEScholar. Giao diện tiếng Việt. Chưa có bộ nhận diện hoặc logo chính thức được duyệt; không dùng huy hiệu trường để ngụ ý quan hệ chính thức.

## Evidence on Hand

Proposal, use case và quy tắc nghiệp vụ 1.1; ERD và schema tham chiếu trong docs/. Database và auth đã có triển khai local; bằng chứng và ranh giới ở docs/implementation/2026-10-11-database-auth.md. Chưa có khảo sát, dữ liệu sách thật, tài liệu được trường cấp quyền hoặc triển khai vận hành. Toàn bộ nội dung prototype và tài khoản kiểm thử phải được ghi rõ là minh họa.

## Product Principles

- Ưu tiên tìm–đọc–ghi chú, giữ nguồn và phiên bản rõ ràng.
- Phản hồi lưu/thất bại trung thực; giữ nội dung người dùng khi có lỗi.
- Phân biệt công bố, an toàn file và hiển thị.
- Dữ liệu học tập riêng không thành dữ liệu kiểm duyệt.
