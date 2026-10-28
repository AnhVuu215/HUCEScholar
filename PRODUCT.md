# HUCEScholar

<!-- impeccable:product-schema 1 -->

## Platform

web

Ưu tiên hiện tại17/10/2026: hoàn thiện và kiểm chứng luồng web. Theo yêu cầu người dùng, tạm hoãn cài PWA và thử nghiệm cài trên thiết bị; nền tảng PWA hiện có được giữ nguyên.

## Stack

Đã chốt công nghệ MVP ngày 11/10/2026: web responsive + PWA cho desktop, điện thoại và máy tính bảng; người dùng chọn chưa phát hành app native trong MVP. Next.js/React + TypeScript + Tailwind CSS; NestJS REST API; PostgreSQL + Prisma với migration SQL tùy chỉnh; PDF.js; Amazon S3 private; BullMQ/Redis và worker kiểm tra file ClamAV/Poppler; Docker Compose. Chi tiết, ranh giới và điều kiện kiểm chứng ở docs/HUCEScholar-tech-stack.md. Đã có workspace apps/web và apps/api, migration PostgreSQL 24 bảng, đăng nhập/đăng xuất bằng cookie phiên, phân quyền ba vai trò tại API, màn hình tài khoản responsive, UI Admin cấp/sửa/khóa/mở khóa tài khoản giảng viên/sinh viên và kiểm thử tự động. Đã có danh mục khoa/ngành/môn, liên kết ngành dùng chung và phân công/thu hồi có lịch sử; giảng viên xem phân công riêng. Chưa có học liệu được cấp quyền thật, dịch vụ mail. PWA đã có icon PNG, hướng dẫn cài và service worker chỉ lưu offline fallback/icon công khai; PDF và ghi chú vẫn cần mạng. HTML/CSS/JavaScript tĩnh trong design/ vẫn chỉ là prototype thiết kế.

Ngày17/10 bổ sung PDF/DOCX giảng viên: chọn file cùng tiêu đề/môn, Word gốc riêng tư và converter LibreOffice cách ly tạo bản PDF để đọc/tô/ghi chú. Công bố chỉ sau nguồn và PDF SAFE/READY; tải Word gốc theo quyền tải. Xem docs/implementation/2026-10-17-lecturer-pdf-docx-upload.md.

READ-02 đã bổ sung tám màu tô sáng có tên/dấu chọn và thao tác bàn phím. Màu cũ giữ nguyên; decoder đọc màu hex hợp lệ ngoài palette, yêu cầu chọn màu hỗ trợ trước sửa. Xem docs/implementation/2026-10-17-reader-highlight-palette.md.

READ-03 local: toolbar gần đoạn chọn để tô sáng/ghi chú, panel gọn bên phải trên desktop và dưới PDF trên màn hẹp. Một editor hoạt động mỗi lần; bản soạn giữ đúng phiên bản/trang/đoạn gốc, vùng tô chồng nhau có lựa chọn rõ ràng. Xem docs/implementation/2026-10-17-reader-direct-annotations.md.

CITE-01: chọn chữ để sao chép trích dẫn plain text kèm nguồn, tác giả nếu có, phiên bản và trang PDF. Link cùng origin mở đúng phiên bản/trang, ưu tiên trang được dẫn và có đường quay lại tiến độ trước. Clipboard bị chặn có sao chép thủ công; lưu đoạn vào ghi chú là thao tác riêng. Guard bảo vệ cả link và Back/Forward khi chỉ đổi query trang. Xem docs/implementation/2026-10-18-reader-citations.md.

LEARN-01 local: sổ ghi chú riêng trên mọi trang của cùng phiên bản, tìm nội dung/chữ đã tô, lọc loại/màu và tải thêm. Mở kết quả tới đúng trang bằng bộ soạn hiện có; duyệt/lọc giữ bản soạn và sửa vẫn kiểm revision. Xem docs/implementation/2026-10-18-reader-notebook.md.

CAL-04b local: giảng viên đặt hạn (ngày) cho từng mục danh sách đọc; người đọc tự bật theo dõi từng môn để hạn hiện trên Lịch học riêng, chỉ đọc, chỉ với tài liệu còn đọc được. Theo dõi không phải đăng ký môn và không mở thêm quyền. Xem docs/implementation/2026-10-28-reading-list-deadlines.md.

LEARN-03 local: trang Sổ tay tìm ghi chú trang/đoạn tô riêng trên mọi tài liệu còn đọc được, lọc chữ/môn/loại/màu/cần xem lại, mở đúng phiên bản/trang. Tài liệu mất quyền không được liệt kê. Sửa vẫn trong reader. Xem docs/implementation/2026-10-26-library-notebook.md.

READ-01 local: tìm chữ trong PDF theo lô, kết quả trước/tiếp và dấu tạm theo text layer; mục lục chỉ mở đích trang nội bộ qua guard. Đọc tập trung ẩn chrome/panel nhưng giữ bản soạn; mở ghi chú sẽ hiện editor, Escape đóng công cụ trước khi thoát. Chưa OCR/tìm không dấu. Xem docs/implementation/2026-10-18-reader-find-focus.md.

SEARCH-02 local: kho ưu tiên tìm kiếm/môn, thu gọn nguồn/loại inline và có xóa lọc. Bộ lọc công khai và trang ở URL đã kiểm tra giá trị; Back/Forward khôi phục form/kết quả, request cũ bị hủy. Ghi chú riêng không nằm trong URL. Chi tiết và bàn giao palette/zoom cho PREF-01: docs/implementation/2026-10-18-library-catalog.md.

Đã bổ sung metadata bản nháp riêng cho giảng viên/sinh viên, upload PDF private, BullMQ worker ClamAV/Poppler và trạng thái kỹ thuật độc lập kiểm duyệt. Local dùng filesystem ngoài webroot, production bắt buộc S3 private nhưng chưa kiểm chứng cloud. Bản chưa có PDF vẫn là DRAFT. Đã có gửi/rút, lịch sử, admin xem PDF SAFE và quyết định yêu cầu sửa/từ chối/duyệt bản hiện hành nguyên tử. Chủ mở lại CHANGES_REQUIRED để sửa/gửi lại; APPROVED/REJECTED bất biến. Đã có kho học liệu tìm tiêu đề/tác giả, lọc môn/loại/nguồn, trình đọc PDF.js chuyển trang/zoom/xoay/chọn chữ và tải theo quyền; file API hỗ trợ byte Range private. Đã có ghi chú plain text riêng theo phiên bản/trang, sửa/xóa có revision và retry tạo không nhân đôi; tiến độ lưu sau khi render thành công, mở lại đúng trang và báo xung đột tab. Đã có phiên bản kế tiếp và lịch sử từng bản, bàn giao giáo trình giảng viên, ẩn/khôi phục toàn tài liệu có lịch sử và kiểm tra quyền. Revision tăng qua các phiên bản để ngăn thao tác tab cũ sửa nhầm bản mới. Đã có vùng tô chữ và ghi chú kèm riêng theo phiên bản/trang; chưa đọc PDF offline. Xem docs/implementation/2026-10-17-pdf-text-highlights.md. Xem docs/implementation/2026-10-12-material-lifecycle.md.

## Users

Sinh viên HUCE cần tìm và dùng học liệu trong quá trình học, đặc biệt khi ôn thi. Giảng viên upload PDF/DOCX và tự công bố bản đọc SAFE cho môn được phân công; không bắt buộc tài liệu HUCE hoặc khai báo căn cứ quyền. Quản trị viên quản lý tài khoản, danh mục, phân công, kiểm duyệt tài liệu sinh viên và bàn giao.

## Product Purpose

Tập trung trải nghiệm tìm học liệu, đọc tài liệu điện tử và ghi chú riêng theo phiên bản. Thành công của luồng chính là tìm đúng tài liệu, hiểu nguồn/phiên bản/quyền sử dụng, đọc và mở lại ghi chú đúng chỗ.

## Capabilities and Constraints

- Ba role ADMIN, LECTURER, STUDENT. Quyết định 22/10/2026 (AUTH-04): sinh viên và giảng viên tự đăng ký bằng email, chọn role sau khi mở liên kết xác nhận, không cần admin duyệt. Tài khoản ADMIN chỉ do admin cấp. Admin vẫn cấp được mọi role. Chưa có SSO.
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
