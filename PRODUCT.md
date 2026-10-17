# HUCEScholar

<!-- impeccable:product-schema 1 -->

## Platform

web

Ưu tiên hiện tại17/10/2026: hoàn thiện và kiểm chứng luồng web. Theo yêu cầu người dùng, tạm hoãn cài PWA và thử nghiệm cài trên thiết bị; nền tảng PWA hiện có được giữ nguyên.

## Stack

Đã chốt công nghệ MVP ngày 11/10/2026: web responsive + PWA cho desktop, điện thoại và máy tính bảng; người dùng chọn chưa phát hành app native trong MVP. Next.js/React + TypeScript + Tailwind CSS; NestJS REST API; PostgreSQL + Prisma với migration SQL tùy chỉnh; PDF.js; Amazon S3 private; BullMQ/Redis và worker kiểm tra file ClamAV/Poppler; Docker Compose. Chi tiết, ranh giới và điều kiện kiểm chứng ở docs/HUCEScholar-tech-stack.md. Đã có workspace apps/web và apps/api, migration PostgreSQL 23 bảng, đăng nhập/đăng xuất bằng cookie phiên, phân quyền ba vai trò tại API, màn hình tài khoản responsive, UI Admin cấp/sửa/khóa/mở khóa tài khoản giảng viên/sinh viên và kiểm thử tự động. Đã có danh mục khoa/ngành/môn, liên kết ngành dùng chung và phân công/thu hồi có lịch sử; giảng viên xem phân công riêng. Chưa có học liệu được cấp quyền thật, dịch vụ mail. PWA đã có icon PNG, hướng dẫn cài và service worker chỉ lưu offline fallback/icon công khai; PDF và ghi chú vẫn cần mạng. HTML/CSS/JavaScript tĩnh trong design/ vẫn chỉ là prototype thiết kế.

Đã bổ sung metadata bản nháp riêng cho giảng viên/sinh viên, upload PDF private, BullMQ worker ClamAV/Poppler và trạng thái kỹ thuật độc lập kiểm duyệt. Local dùng filesystem ngoài webroot, production bắt buộc S3 private nhưng chưa kiểm chứng cloud. Bản chưa có PDF vẫn là DRAFT. Đã có gửi/rút, lịch sử, admin xem PDF SAFE và quyết định yêu cầu sửa/từ chối/duyệt bản hiện hành nguyên tử. Chủ mở lại CHANGES_REQUIRED để sửa/gửi lại; APPROVED/REJECTED bất biến. Đã có kho học liệu tìm tiêu đề/tác giả, lọc môn/loại/nguồn, trình đọc PDF.js chuyển trang/zoom/xoay/chọn chữ và tải theo quyền; file API hỗ trợ byte Range private. Đã có ghi chú plain text riêng theo phiên bản/trang, sửa/xóa có revision và retry tạo không nhân đôi; tiến độ lưu sau khi render thành công, mở lại đúng trang và báo xung đột tab. Đã có phiên bản kế tiếp và lịch sử từng bản, bàn giao giáo trình giảng viên, ẩn/khôi phục toàn tài liệu có lịch sử và kiểm tra quyền. Revision tăng qua các phiên bản để ngăn thao tác tab cũ sửa nhầm bản mới. Chưa có highlight hoặc đọc PDF offline. Xem docs/implementation/2026-10-12-material-lifecycle.md.

## Users

Sinh viên HUCE cần tìm và dùng học liệu trong quá trình học, đặc biệt khi ôn thi. Giảng viên upload và tự công bố PDF cho môn được phân công; không bắt buộc tài liệu HUCE hoặc khai báo căn cứ quyền. Quản trị viên quản lý tài khoản, danh mục, phân công, kiểm duyệt tài liệu sinh viên và bàn giao.

## Product Purpose

Tập trung trải nghiệm tìm học liệu, đọc tài liệu điện tử và ghi chú riêng theo phiên bản. Thành công của luồng chính là tìm đúng tài liệu, hiểu nguồn/phiên bản/quyền sử dụng, đọc và mở lại ghi chú đúng chỗ.

## Capabilities and Constraints

- Ba role ADMIN, LECTURER, STUDENT; tài khoản do admin cấp/xác minh, không tự đăng ký hoặc SSO trong MVP.
- Quyết định mới14/10/2026: giảng viên tự công bố PDF sau khi quét SAFE, không cần admin duyệt. Nguồn tham khảo tùy chọn, không có ô căn cứ quyền bắt buộc. Tài liệu sinh viên vẫn qua kiểm duyệt; admin không biên soạn thay giáo trình.
- Tài liệu sinh viên bổ sung tách biệt với giáo trình giảng viên. Chưa hạn chế đọc theo lớp đăng ký.
- Đọc/tải phụ thuộc quyền nguồn, file an toàn, phiên bản được duyệt và tài liệu không bị ẩn.
- APPROVED là trạng thái nội bộ của bản đã duyệt hoặc tự công bố; publicationMethod phân biệt ADMIN_REVIEW và LECTURER_SELF. Giao diện không mô tả tự công bố là admin đã duyệt. Giữ PDF25MiB, môn/phân công, ownership và ghi chú theo phiên bản.
- Ghi chú riêng gắn người, phiên bản, trang. Bản PDF mới không tự chuyển ghi chú cũ. Chưa xuất PDF kèm ghi chú hoặc offline.
- Reader đã có guard Back/Forward trong lịch sử ứng dụng: chọn ở lại giữ bản soạn, đang lưu chặn rời trang; không lưu nội dung vào history hoặc bộ nhớ browser lâu dài. Phạm vi và giới hạn ở docs/implementation/2026-10-17-web-reader-history.md.
- Thư viện cá nhân đã có tài liệu đã lưu và đọc gần đây cho cả ba vai trò. Đã lưu mở bản hiện hành; đọc gần đây giữ đúng phiên bản/trang. Bỏ lưu giữ ghi chú và tiến độ. Mục mất quyền chỉ hiện nhãn chung, không lộ metadata.
- Thư viện mini là metadata và nguồn được phép; API trường và quyền lưu toàn văn chưa xác nhận.
- Bàn giao chỉ giáo trình giảng viên; người nhận hoạt động và được phân công mọi môn liên quan. Bản đang gửi bị rút về nháp, lịch sử/tác giả/ghi chú được giữ.

## Brand Commitments

Tên đã chốt: HUCEScholar. Giao diện tiếng Việt. Chưa có bộ nhận diện hoặc logo chính thức được duyệt; không dùng huy hiệu trường để ngụ ý quan hệ chính thức.

Landing `/` tham khảo cách tổ chức nội dung NEU Reader nhưng dùng bố cục và bìa minh họa riêng, tông xanh HUCE-inspired hiện hữu; không dùng tài sản hoặc dữ liệu NEU. Hướng dẫn theo vai trò dẫn tới đăng nhập thật, trình bày rõ trạng thái phát triển. Trang tiến độ kỹ thuật ở `/project`.

## Evidence on Hand

Proposal, use case và quy tắc nghiệp vụ 1.1; ERD và schema tham chiếu trong docs/. Database và auth đã có triển khai local; bằng chứng và ranh giới ở docs/implementation/2026-10-11-database-auth.md. Chưa có khảo sát, dữ liệu sách thật, tài liệu được trường cấp quyền hoặc triển khai vận hành. Toàn bộ nội dung prototype và tài khoản kiểm thử phải được ghi rõ là minh họa.

## Product Principles

- Ưu tiên tìm–đọc–ghi chú, giữ nguồn và phiên bản rõ ràng.
- Phản hồi lưu/thất bại trung thực; giữ nội dung người dùng khi có lỗi.
- Phân biệt công bố, an toàn file và hiển thị.
- Dữ liệu học tập riêng không thành dữ liệu kiểm duyệt.
