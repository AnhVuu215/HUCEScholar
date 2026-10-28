# HUCEScholar — kế hoạch cải thiện web và ý tưởng sản phẩm

Cập nhật: 17/10/2026. Mốc đối chiếu: commit `b7cef22`, nhánh `codex/web-ui-refinements`. Bảng hiện trạng ở mục 2 cập nhật lại ngày 26/10/2026 theo `main` `70fc393`.

**Ưu tiên mới theo yêu cầu người dùng:** viết plan upload PDF/DOCX cho giảng viên trước khi triển khai. DOCX có bản PDF để đọc/ghi chú và giữ Word gốc để tải theo quyền. [Thiết kế](../superpowers/specs/2026-10-17-lecturer-pdf-docx-upload.md) · [Plan chi tiết](../superpowers/plans/2026-10-17-lecturer-pdf-docx-upload.md). Đã chuyển sang triển khai; bằng chứng và giới hạn tại [mốc PDF/DOCX](../implementation/2026-10-17-lecturer-pdf-docx-upload.md).

Đây là đề xuất phát triển sau khi đọc code, schema, CI và nhật ký triển khai. Các hạng mục bên dưới chưa được triển khai chỉ vì xuất hiện trong kế hoạch. Không dùng số lượng test hoặc số bảng để suy ra phần trăm hoàn thành sản phẩm.

## Cập nhật 20/10

V2 (A–C, gồm AUTH-01) đã vào `main` qua PR #8. AUTH-02 đã triển khai theo [mốc buộc đổi mật khẩu](../implementation/2026-10-20-forced-password-change.md): tài khoản cũ không bị gắn cờ, admin cấp lại mật khẩu tạm. HOME-01 đã có [trang đầu theo vai trò](../implementation/2026-10-20-role-home.md); UX-01 ở [mốc lỗi thao tác nhỏ](../implementation/2026-10-20-interaction-fixes.md); UPLOAD-01 ở [mốc trạng thái kiểm tra file](../implementation/2026-10-20-scan-status.md); SEARCH-01 ở [mốc tìm không dấu](../implementation/2026-10-20-library-search.md), hoàn tất đợt B. Đợt C bắt đầu với REPORT-01 ở [mốc báo cáo tài liệu](../implementation/2026-10-20-material-reports.md); OPS-01 ở [mốc readiness và log](../implementation/2026-10-20-readiness-logging.md). Bảng hiện trạng bên dưới giữ nguyên mốc 17/10.

## Cập nhật 21/10

QA-01 có [pilot local tự động](../implementation/2026-10-21-local-pilot.md): bộ tài liệu tự soạn chạy qua ClamAV/Poppler/LibreOffice thật cho cả ba vai trò. Lượt này phát hiện và sửa lỗi trang có `/Rotate` hiển thị sai chiều. Ba điểm pilot tìm ra đã xử lý: UPLOAD-03 ở [mốc lý do file không đạt](../implementation/2026-10-21-file-check-reasons.md) (nhận PDF chỉ khóa quyền, tắt tô và trích dẫn; báo rõ lý do từ chối file), SEARCH-02 ở [mốc tìm nhiều từ](../implementation/2026-10-21-multiword-search.md). UPLOAD-04 cho admin thấy cùng lý do ([mốc](../implementation/2026-10-21-admin-file-reasons.md)). NOTIFY-01 có [lát đầu thông báo trong ứng dụng](../implementation/2026-10-21-in-app-notifications.md). EXPORT-01 có [xuất ghi chú Markdown/văn bản](../implementation/2026-10-21-notes-export.md). PERF-01 có [công cụ đo và mốc đầu tiên](../implementation/2026-10-21-perf-baseline.md), chưa đặt mục tiêu. COURSE-01 có [danh sách đọc theo môn](../implementation/2026-10-21-reading-lists.md), mô hình mặc định ghi trong mốc. STUDY-01 có [thẻ ôn tập từ đoạn tô](../implementation/2026-10-21-study-cards.md). Ý tưởng "Có bản mới nhưng không mất bản cũ" ở mục 6 thành VERSION-01, [khung báo phiên bản hiện hành](../implementation/2026-10-21-current-version-notice.md). Phiên dùng thử với người thật và OPS-02 vẫn mở. Ý tưởng "Điều chưa hiểu" ở mục 6 thành LEARN-02, [nhãn riêng Cần xem lại](../implementation/2026-10-21-review-later.md).

## Cập nhật 22/10

CAL-01 có [lịch học và việc cần làm riêng](../implementation/2026-10-22-study-calendar.md): ba chế độ Tuần/Tháng/Lịch biểu, panel việc cần làm, buổi học mở đúng trang tài liệu và nút "Lên lịch đọc" trong reader. Lộ trình CAL-02…05 ở [thiết kế](../superpowers/specs/2026-10-22-study-calendar.md).

CAL-02 thêm [lặp lại hằng tuần, kéo thả và phím tắt](../implementation/2026-10-22-calendar-repeat-drag.md) cho lịch học: sửa hoặc xóa riêng một buổi trong chuỗi, kéo việc chưa có ngày lên lịch.

AUTH-04 mở [tự đăng ký bằng email](../implementation/2026-10-22-self-signup.md) cho sinh viên và giảng viên theo quyết định của chủ dự án; tài khoản Admin vẫn chỉ do admin cấp.

## Cập nhật 23/10

CAL-03 thêm [nhắc trước giờ học](../implementation/2026-10-23-calendar-reminders.md): mỗi lịch học hoặc việc có giờ chọn một lời nhắc, hiện ở chuông thông báo, tùy chọn gửi email; worker PDF quét mỗi phút.

Rà soát app dev sau CAL-03 tìm ra 11 lỗi; [kế hoạch sửa](../superpowers/plans/2026-10-23-dev-audit-fixes.md) chia thành sáu nhánh nhỏ, đã vào `main` qua PR #35–#41: vá bảo mật Next 16.4.1, `pnpm infra:files` cho môi trường dev, kiểm tra file chịu được trình quét gián đoạn và nút "Kiểm tra lại", báo đúng khi PDF mất khỏi kho (410 `FILE_MISSING`, `doctor:files`), sửa giao diện nhỏ, giữ `pg` ở major 8.

## Cập nhật 24/10

Chạy lại đợt rà soát trên app dev với `main` `aee4daf`. Kết quả ghi ở mục "Sau cùng" của [kế hoạch sửa](../superpowers/plans/2026-10-23-dev-audit-fixes.md). Bảng hiện trạng ở mục 2 được viết lại theo `main`.

## Cập nhật 28/10

LEARN-03 có [sổ tay toàn kho lọc theo môn](../implementation/2026-10-26-library-notebook.md) (PR #50), sau đó PR #51 gom code trùng lặp, không đổi hành vi. READ-05b (PR #49) hiện vùng tô và giấy nhớ trên mọi trang khi cuộn liền. CAL-04b đưa [hạn danh sách đọc vào lịch học](../implementation/2026-10-28-reading-list-deadlines.md): giảng viên đặt hạn cho từng mục, người đọc tự chọn theo dõi môn để thấy hạn trên lịch riêng. EXPORT-02 cho [xuất cả sổ tay theo bộ lọc](../implementation/2026-10-28-notebook-export.md).

## Bổ sung yêu cầu V2 ngày 17/10

Theo yêu cầu mới, đã có [kế hoạch V2 tổng hợp](../superpowers/specs/2026-10-17-workspace-v2-design.md): chuẩn hóa button/dropdown → sidebar/header theo vai trò → ghi chú/tô màu/trích dẫn trực tiếp → hồ sơ và cài đặt, kèm36 ý tưởng để lựa chọn. Ba plan kỹ thuật được liên kết trong tài liệu đó; **chưa triển khai V2**. Người dùng chọn edit annotations riêng trước, chưa sửa nội dung gốc PDF/Word.

V2 tái sử dụng LEARN-01, READ-01 và AUTH-01 bên dưới; không tạo hai backlog thực hiện độc lập. UPLOAD-02 đã có trên nhánh tính năng, xem [kết quả PDF/DOCX](../implementation/2026-10-17-lecturer-pdf-docx-upload.md). Các điều kiện tài khoản, báo cáo, vận hành và pilot dưới đây vẫn hiệu lực dù ưu tiên cải thiện UI trước.

## 1. Hướng đi đề xuất

HUCEScholar nên giúp người học hoàn thành một vòng học tập: **tìm đúng tài liệu → đọc → ghi lại điều cần nhớ → quay lại ôn tập**. Hiện hệ thống đã đi khá xa ở ba bước đầu; bước ôn tập và trải nghiệm quay lại còn nhiều cơ hội cải thiện.

Ưu tiên song song hai kết quả: tài khoản đủ an toàn để dùng thật, và trải nghiệm học tập có ích hơn một kho chứa PDF. Giữ kiến trúc modular monolith Next.js/NestJS/PostgreSQL hiện tại; chưa cần viết lại giao diện, đổi framework hoặc tách microservice.

Các ràng buộc giữ nguyên:

- Ưu tiên web; tạm hoãn cài PWA và đợt kiểm chứng thiết bị thật theo yêu cầu hiện tại. Việc thử trình duyệt/cảm ứng thật vẫn là điều kiện cần trước khi quảng bá khả năng hỗ trợ các thiết bị đó.
- Giảng viên tự công bố PDF sau khi quét đạt, không bắt buộc nguồn HUCE hoặc admin duyệt. Không thêm lại vòng cấp quyền phức tạp.
- Sinh viên đóng góp tài liệu qua kiểm duyệt; quyền vẫn do API quyết định.
- Ghi chú và vùng tô riêng theo người/phiên bản/trang; không tự chia sẻ, gửi sang AI hoặc chuyển sang PDF mới.
- PDF/DOCX giảng viên tối đa25MiB; Word được chuyển PDF, giữ nguồn gốc theo quyền. PPTX/video/DOC và DOCX sinh viên chưa thuộc phạm vi.
- Không SSO, thu thập danh sách lớp thật hoặc kết nối thư viện trường. Tự đăng ký sinh viên/giảng viên đã mở từ 22/10 (AUTH-04).

## 2. Hiện trạng và bằng chứng

Cập nhật 26/10/2026 theo `main` `70fc393` (sau PR #42–#47). Cột giữa chỉ ghi những gì có mốc implementation; cột phải là việc còn mở.

| Khu vực             | Đã có trên `main`                                                                                                                         | Khoảng trống cần xử lý                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tài khoản           | Cookie phiên, Argon2id, CSRF, giới hạn đăng nhập; tự đổi mật khẩu, buộc đổi lần đầu (AUTH-02), khôi phục qua email (AUTH-03), tự đăng ký (AUTH-04) | Mail mới thử bằng transport file trên máy; chưa thử SMTP thật                                             |
| Học liệu giảng viên | Bản nháp, PDF/DOCX private, tự công bố, phiên bản, phân công; trạng thái quét tự cập nhật và lý do không đạt (UPLOAD-01/03); "Kiểm tra lại" khi trình quét gián đoạn | Cần thử với tập PDF thực tế được phép dùng                                                                |
| Tài liệu sinh viên  | Gửi/rút, yêu cầu sửa, từ chối/duyệt, lịch sử; thông báo trong ứng dụng (NOTIFY-01)                                                        | Chưa thử với người thật                                                                                   |
| Kho học liệu        | Tìm không dấu, nhiều từ (SEARCH-01/02); lọc môn/loại/nguồn; danh sách đọc theo môn (COURSE-01)                                            | Chưa xếp hạng kết quả hoặc tìm trong nội dung PDF                                                         |
| Reader              | Trang, zoom, xoay, text layer, lưu tiến độ; tìm chữ, mục lục, đọc tập trung (READ-01); báo phiên bản hiện hành (VERSION-01); báo đúng khi PDF mất; cuộn liền các trang và ảnh thu nhỏ (READ-05) | Chưa thử Safari/cảm ứng (đang hoãn)                                                                       |
| Ghi chú và ôn tập   | Ghi chú trang, tô màu, trích dẫn; giấy nhớ ghim trên trang (READ-04); sổ ghi chú toàn phiên bản (LEARN-01); "Cần xem lại" (LEARN-02); thẻ ôn tập (STUDY-01); xuất ghi chú (EXPORT-01); [sổ tay toàn kho lọc theo môn](../implementation/2026-10-26-library-notebook.md) (LEARN-03) | Sổ tay xuất được cả sổ theo bộ lọc (EXPORT-02), chưa sửa tại chỗ; chưa có thuật toán nhắc lại |
| Thư viện cá nhân    | Đã lưu, đọc gần đây; "Học tiếp" ở trang đầu (HOME-01); lịch học, lặp lại, kéo thả và nhắc lịch (CAL-01…03); "Cần xem lại" và buổi ôn trên lịch (CAL-04a); hạn danh sách đọc của môn tự theo dõi (CAL-04b)                                | Chưa có nhóm tự tạo; CAL-05 theo [thiết kế](../superpowers/specs/2026-10-22-study-calendar.md)        |
| Báo cáo nội dung    | Báo cáo từ reader, trang xử lý cho admin, ẩn tài liệu trong luồng xử lý (REPORT-01)                                                       | —                                                                                                         |
| Vận hành            | PrivateStore local/S3; worker ClamAV/Poppler/LibreOffice; `pnpm infra:files`; `doctor:files`; pilot tự động trên máy (QA-01)              | Chưa có bằng chứng S3/HTTPS, phục hồi dữ liệu; OPS-02 và phiên dùng thử với người thật đang hoãn          |
| Health/CI           | `/health` liveness và `/health/ready` cho DB/Redis/kho file/worker (OPS-01) và trình quét ClamAV; workflow chạy format/check/integration/Playwright             | Readiness chưa gắn vào healthcheck hay cảnh báo tự động (OPS-02)     |

Bằng chứng gần nhất, theo mốc của từng bước trong [kế hoạch sửa sau rà soát](../superpowers/plans/2026-10-23-dev-audit-fixes.md): 123 unit, 219 integration đạt và 1 bỏ qua (bước 4); e2e 177 đạt, 8 bỏ qua (bước 5). Đây là **các lượt chạy local khác nhau**, không cộng lại thành một bộ test hoặc coi là bằng chứng production.

## 3. Các vấn đề đáng ưu tiên

### Tài khoản chưa hoàn thành vòng đời

Admin đang cấp mật khẩu khởi tạo nhưng người nhận chưa tự thay được. Đây là khoảng trống chức năng cần khép kín trước khi dùng với người thật. Làm tự đổi mật khẩu trước vì không phụ thuộc SMTP; tiếp theo mới buộc đổi lần đầu và khôi phục.

Schema đã có `password_reset_tokens`, nhưng chưa có cờ buộc đổi mật khẩu trong `users`. Có bảng không đồng nghĩa có chức năng. Không tự bật cờ cho toàn bộ tài khoản cũ bằng một migration mà chưa có kế hoạch chuyển đổi.

### Dữ liệu học tập có rồi nhưng chưa dễ dùng lại

Người học có thể ghi chú tại trang đang đọc, nhưng muốn ôn tập sẽ cần nhớ ghi ở đâu. Màn hình “Ghi chú của tôi” hoặc panel ghi chú toàn tài liệu có giá trị sử dụng trực tiếp hơn thêm hiệu ứng, huy hiệu hay thống kê trang trí.

### Trang đầu sau đăng nhập còn giống trang thông tin tài khoản

`RoleWorkspace` hiện ưu tiên hồ sơ và đoạn mô tả chức năng. Nên đưa việc người đó cần làm lên trước: sinh viên học tiếp, giảng viên hoàn thiện bản nháp/scan lỗi, admin xử lý việc tồn. Giữ hồ sơ trong mục tài khoản; không dùng số liệu giả để làm dashboard có vẻ đầy đủ.

### Chưa đủ bằng chứng để mời người dùng vận hành thật

S3 adapter và CI đã có, nhưng còn thiếu một đợt thử cấu hình triển khai và phục hồi. Chuyển từ “chạy được local” sang “dùng thử có kiểm soát” cần công việc vận hành cụ thể, không chỉ thêm tính năng.

## 4. Backlog ưu tiên

P1: cần trước pilot với người dùng thật. P2: tăng giá trị và giảm ma sát. P3: thử nghiệm sau khi có phản hồi. S/M/L là độ lớn tương đối, không phải cam kết thời gian; phải tách nhỏ khi bắt đầu triển khai.

| ID        | Ưu tiên / cỡ | Hạng mục                             | Kết quả nghiệm thu chính                                                                                                                 | Phụ thuộc                                                                                                                                                        |
| --------- | ------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UPLOAD-02 | P1 / L       | Upload PDF/DOCX giảng viên           | Cùng form chọn file/tiêu đề; Word gốc riêng, PDF đọc/ghi chú bất biến; lỗi/retry/quyền được kiểm chứng                                   | [Spec](../superpowers/specs/2026-10-17-lecturer-pdf-docx-upload.md), [plan](../superpowers/plans/2026-10-17-lecturer-pdf-docx-upload.md); probe converter trước  |
| AUTH-01   | P1 / M       | Tự đổi mật khẩu cho cả ba vai trò    | Kiểm mật khẩu hiện tại; đổi nguyên tử; cookie hiện tại được xoay; các phiên cũ bị thu hồi; lỗi mạng không báo thành công giả             | Không cần SMTP; [spec](../superpowers/specs/2026-10-17-self-service-password-change.md), [plan](../superpowers/plans/2026-10-17-self-service-password-change.md) |
| AUTH-02   | P1 / M       | Buộc đổi mật khẩu khởi tạo           | Admin cấp mới có cờ; API chặn nghiệp vụ trước khi đổi; vẫn cho đổi mật khẩu/đăng xuất; chuyển đổi tài khoản cũ có chính sách riêng       | AUTH-01; migration SQL                                                                                                                                           |
| AUTH-03   | P1 / M       | Khôi phục tài khoản                  | Token hash, dùng một lần, hết hạn; phản hồi không lộ email tồn tại; thu hồi session/reset cũ; SMTP thử nghiệm trước                      | AUTH-01, SMTP và origin HTTPS                                                                                                                                    |
| LEARN-01  | P2 / M       | Tìm lại ghi chú trong một tài liệu   | Danh sách tất cả trang của đúng version, lọc chữ/màu/kind; chọn mục đi đúng trang; không lộ dữ liệu người khác                           | Tận dụng annotations; API phân trang                                                                                                                             |
| READ-01   | P2 / M       | Tìm chữ và mục lục PDF               | Next/previous match; chỉ rõ trang; outline chỉ khi PDF có; PDF scan báo không có lớp chữ; không giả OCR                                  | PDF.js hiện có; thử tài liệu nhiều trang                                                                                                                         |
| HOME-01   | P2 / M       | Trang đầu theo vai trò               | Sinh viên thấy Học tiếp; giảng viên thấy việc cần xử lý; admin thấy hàng chờ thật; có empty/error/retry                                  | API hiện hữu; endpoint bổ sung chỉ khi cần                                                                                                                       |
| UPLOAD-01 | P2 / S       | Theo dõi trạng thái scan dễ hiểu     | Polling có giới hạn/backoff, dừng khi rời trang/ẩn tab; phân biệt lỗi scan với lỗi kết nối; không yêu cầu upload lại khi chưa rõ kết quả | API file/status hiện có                                                                                                                                          |
| SEARCH-01 | P2 / M       | Tìm học liệu thuận tiện hơn          | Giữ bộ lọc trong URL không chứa dữ liệu riêng; nút bỏ lọc; test tìm không dấu; số trang rõ; đo truy vấn trước thêm index                 | Bộ dữ liệu mẫu được phép; kế hoạch SQL nếu cần                                                                                                                   |
| UX-01     | P2 / S       | Khép các lỗi thao tác nhỏ            | Hủy bỏ lưu trả focus đúng nút; bỏ mục cuối trang không kẹt; đổi tab nhanh không hiện dữ liệu cũ; không tràn ở 320px                      | Kiểm lại backlog cá nhân từ checkpoint                                                                                                                           |
| REPORT-01 | P1 / M       | Báo cáo tài liệu và xử lý            | Người có quyền đọc gửi theo version; admin xem/xử lý/lưu lý do; báo cáo không tự làm ẩn; không đính ghi chú riêng                        | Tận dụng reports/report_actions; nối lifecycle hiện hữu                                                                                                          |
| OPS-01    | P1 / M       | Readiness và log phục vụ xử lý sự cố | Giữ liveness cũ; readiness có timeout cho dependency cần thiết; worker heartbeat riêng; log request ID không có cookie/PDF/ghi chú       | Định nghĩa dependency critical và cấu hình môi trường                                                                                                            |
| OPS-02    | P1 / L       | Đợt thử S3 + HTTPS + phục hồi        | Upload/Range/download đúng quyền; bucket private; cookie/proxy đúng; phục hồi DB và object cùng trạng thái kiểm chứng được               | Môi trường, domain, ngân sách do chủ dự án chọn                                                                                                                  |
| QA-01     | P1 / M       | Pilot nội dung thực tế               | Tập PDF được phép dùng; text/scan/tiếng Việt/kích thước lớn/trang xoay; người thử thực hiện tác vụ từ đầu tới cuối                       | AUTH-01/02; local có thể làm trước cloud                                                                                                                         |
| NOTIFY-01 | P2 / M       | Thông báo trong ứng dụng             | Kết quả quét/duyệt/bản mới có deep link; đọc/chưa đọc theo owner; không gửi nội dung note                                                | Chốt event/outbox/idempotency trước schema                                                                                                                       |
| COURSE-01 | P2 / M       | Danh sách đọc theo môn               | Giảng viên sắp tài liệu theo tuần/chủ đề; sinh viên mở đúng version đã chỉ định; không tạo hệ quyền lớp mới                              | Cần người dùng xác nhận mô hình danh sách đọc                                                                                                                    |
| STUDY-01  | P3 / M       | Thẻ ôn tập từ đoạn tô                | Người dùng tự tạo câu hỏi/câu trả lời; giữ liên kết nguồn/trang/version; riêng tư; sửa/xóa được                                          | LEARN-01; thiết kế schema riêng                                                                                                                                  |
| EXPORT-01 | P3 / S–M     | Xuất ghi chú cá nhân                 | Xuất text/Markdown do người dùng chủ động; chỉ note của mình theo quyền hiện tại; escape nội dung; không xuất PDF gốc                    | Chốt xử lý quote và tài liệu mất quyền                                                                                                                           |
| PERF-01   | P2 / M       | Đo trước khi tối ưu                  | Có mẫu đo PDF lớn, query thư viện và render trên máy cấu hình thấp; chỉ đặt mục tiêu số sau baseline                                     | Bộ fixture tái lập; không lấy screenshot làm đo hiệu năng                                                                                                        |

## 5. Lộ trình triển khai

### Đợt ưu tiên mới — UPLOAD-02: PDF/DOCX giảng viên

Theo yêu cầu mới, viết và xem plan này trước; khi bắt đầu code, làm probe chuyển đổi/cách ly, sau đó schema/API/worker, cuối cùng form/reader/download. PDF cũ phải tiếp tục chạy. Chi tiết ở [plan UPLOAD-02](../superpowers/plans/2026-10-17-lecturer-pdf-docx-upload.md). Các đợt dưới đây giữ làm lộ trình sau đó; phần tài khoản vẫn là điều kiện cần trước pilot thật.

### Đợt A — hoàn thiện tài khoản

1. AUTH-01: tự đổi mật khẩu, làm một lát cắt API → UI → integration/browser.
2. AUTH-02: buộc đổi mật khẩu tài khoản mới; lập riêng kế hoạch migration và chính sách tài khoản đang dùng.
3. AUTH-03 khi có cấu hình SMTP thử nghiệm. Nếu chưa có mail, giữ hướng dẫn liên hệ admin; chưa đưa nút khôi phục hoạt động giả ra UI.

**Điểm dừng:** tài khoản thử đăng nhập bằng mật khẩu cấp, đổi được, mật khẩu cũ và phiên cũ mất hiệu lực. Không dùng credential thật trong kiểm thử hoặc quay demo.

### Đợt B — làm vòng học tập rõ ràng

1. LEARN-01: danh sách ghi chú toàn tài liệu, mở lại đúng trang.
2. READ-01: tìm chữ/mục lục, giữ bản soạn khi điều hướng.
3. HOME-01, UX-01: Học tiếp ở trang đầu; gọn đường đi; sửa focus và ca biên.
4. UPLOAD-01, SEARCH-01: giảm thao tác lặp cho giảng viên và người tìm tài liệu.

**Điểm dừng:** người thử tìm một tài liệu, ghi hai ghi chú ở hai trang, rời reader, quay lại tìm đúng ý cần nhớ mà không cần người hướng dẫn chỉ đường.

### Đợt C — dùng thử có kiểm soát

Làm REPORT-01, OPS-01, QA-01; chuẩn bị OPS-02 khi đã chọn môi trường. Có thể làm kế hoạch backup/readiness song song về thứ tự công việc, không mặc nhiên mua dịch vụ hoặc tạo tài khoản cloud.

**Điểm dừng:** đã chạy kịch bản tài liệu bị ẩn, mất quyền, scan lỗi, mất phản hồi, worker dừng và phục hồi DB/object. Biết người tiếp nhận vấn đề, có cách tạm dừng upload/công bố khi dependency không sẵn sàng.

### Đợt D — kiểm chứng ý tưởng học tập

Chọn một ý tưởng trong STUDY-01/COURSE-01/NOTIFY-01 dựa trên quan sát pilot. Làm phiên bản nhỏ rồi mới mở rộng; không gom mọi ý tưởng thành một đợt triển khai.

## 6. Ý tưởng đáng thử

| Ý tưởng                           | Trải nghiệm cụ thể                                                             | Cách thử ít tốn công                                       | Khi nào đáng làm tiếp                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Học tiếp ngay                     | Một nút trở về tài liệu/version/trang đọc gần nhất, dưới đó là vài mục gần đây | Dùng API personal library đã có                            | Người thử vào học liệu nhanh hơn và không nhầm bản cũ/bản mới               |
| Sổ tay theo môn                   | Gom các ghi chú của chính mình theo môn, tài liệu và trang                     | Bắt đầu danh sách trong một version trước; chưa nhóm tùy ý | Người dùng tìm lại ý đã ghi mà không nhớ số trang                           |
| Từ đoạn tô thành câu hỏi          | Tô một định nghĩa → tự viết “Điều kiện áp dụng là gì?” → lật xem đáp án        | Form thủ công; không gọi AI                                | Người học dùng để tự kiểm tra thay vì chỉ tô nhiều màu                      |
| Điều chưa hiểu                    | Gắn nhãn riêng “Cần xem lại” vào ghi chú; lọc trước buổi học                   | Một trạng thái riêng tư; chưa gửi giảng viên               | Nhãn dẫn tới việc đọc lại/giải quyết chứ không chỉ tạo thêm danh sách       |
| Lộ trình đọc do giảng viên chọn   | Tuần 1 đọc chương A của bản cụ thể; tuần 2 đọc bài tập B                       | Danh sách có thứ tự trong một môn                          | Giảng viên muốn dẫn dắt việc đọc, sinh viên hiểu tài liệu nào cần đọc trước |
| Có bản mới nhưng không mất bản cũ | Báo bản mới và cho người dùng mở riêng; note cũ ở nguyên PDF cũ                | Banner hoặc mục thư viện, chưa tự chuyển anchor            | Giảm việc đọc nhầm phiên bản mà vẫn giữ nguồn ghi chú                       |
| Buổi ôn tập từ sổ tay             | Người học chọn một môn, xem lần lượt note/đoạn tô và đánh dấu đã xem           | Lọc + điều hướng tuần tự; chưa thuật toán nhắc lại         | Có nhu cầu lặp lại sau nhiều buổi sử dụng                                   |
| Phản hồi chất lượng tài liệu      | Nêu “thiếu trang”, “chữ mờ”, “sai phiên bản” từ trang đọc                      | REPORT-01 với lý do có cấu trúc                            | Giảng viên/admin xử lý được phản hồi, không thành hộp thư bỏ quên           |

Điểm khác biệt nên theo đuổi: **mỗi điều đã học luôn quay lại được đúng nguồn**. Giữ version/page/quote khi hợp lệ có ích hơn một trang thống kê nhiều số nhưng không dẫn tới hành động.

## 7. Ý tưởng mở rộng cần điều kiện riêng

- **AI giải thích đoạn đang chọn:** chỉ chạy khi người dùng chủ động chọn và đồng ý gửi nội dung tới nhà cung cấp đã nêu; kiểm quyền lại ở API; câu trả lời dẫn đúng trang/version, cho phép “không đủ căn cứ”. Tách instruction của ứng dụng khỏi nội dung PDF có thể chứa prompt injection. Không đưa toàn bộ thư viện hoặc ghi chú riêng vào mô hình mặc định. Chỉ thử sau khi có ngân sách, chính sách dữ liệu và bộ đánh giá.
- **OCR cho PDF scan:** giữ file gốc bất biến, kết quả text là dữ liệu suy ra có version/provenance; đo tiếng Việt, công thức và chi phí worker trước. Không hứa highlight chuẩn chỉ vì OCR trả được chữ.
- **Chia sẻ ghi chú/nhóm học:** cần chia sẻ chủ động theo từng đối tượng, thu hồi quyền, xử lý bản copy và kiểm thử riêng. Không mở quyền admin xem note riêng; không suy ra quyền nhóm từ môn học.
- **Nhận DOC/PPTX/video:** còn ngoài phạm vi. DOCX giảng viên đã được chuyển sang UPLOAD-02 theo yêu cầu mới; các định dạng khác cần luồng kiểm tra/chuyển đổi riêng.
- **Tích hợp thư viện HUCE/SSO:** chỉ sau khi có đầu mối, contract API và phạm vi truy cập nội dung rõ ràng. Hiện chưa coi đây là dependency cho web MVP.
- **PWA/offline/native:** giữ sau theo yêu cầu hiện tại. Nếu quay lại offline phải thiết kế lưu dữ liệu riêng, hết quyền, đăng xuất/xóa dữ liệu trên máy dùng chung; không bật cache rộng để đạt biểu tượng offline.

Chưa ưu tiên chat chung, bảng xếp hạng đọc, điểm thưởng, recommendation engine hoặc tìm kiếm vector toàn kho. Chúng chưa giải quyết khoảng trống đã quan sát tốt bằng tài khoản hoàn chỉnh và sổ tay tìm lại được.

## 8. Chất lượng kỹ thuật và dùng thử

### Chất lượng kỹ thuật nên hoàn thiện cùng các tính năng

- **Hợp đồng API:** khi làm endpoint mới, ghi schema request/response, error code và giới hạn trong tài liệu có thể đối chiếu với test. Chưa thấy cấu hình Swagger/OpenAPI trong entrypoint hiện tại; không tuyên bố client đã sinh từ OpenAPI. Chỉ thêm sinh client khi đủ contract và thấy lợi ích, không dựng một package chung trước.
- **Kiểm thử dễ bảo trì:** `tests/materials.spec.ts` đang gom nhiều luồng. Khi thay đổi tiếp, tách theo publication/reader/notes/lifecycle và gom helper fixture cần dùng chung; giữ account tách để không chạm limiter. Không refactor cả bộ test chỉ để đổi cách chia file.
- **Khả năng tiếp cận:** rà keyboard, thông báo lỗi, thứ tự focus, phóng chữ và tương phản trên luồng thật; ưu tiên bỏ sót thao tác, không gắn nhãn “đạt WCAG” từ vài screenshot.
- **Giảm lỗi vận hành:** đối soát CHECKING và retry queue đã có; bổ sung đo tuổi job, trạng thái worker và hướng dẫn xử lý, tránh xây lại một hàng đợi mới. Với cleanup file orphan, lập báo cáo trước; không tự xóa PDF có khả năng còn được tham chiếu.

### Phiên dùng thử

Đề xuất một nhóm nhỏ: khoảng 2 giảng viên, 5 sinh viên và 1 quản trị viên; đây là quy mô thử dự kiến, chưa tuyển hoặc gửi lời mời. Dùng tài liệu họ có thể cung cấp hợp lệ, không tự lấy sách trường. Chưa cần benchmark nhiều người đồng thời ngay từ đầu.

| Vai trò    | Tác vụ quan sát                                                     | Ghi nhận                                                            |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Giảng viên | Tạo bản nháp, upload, hiểu kết quả scan, công bố và tạo bản kế tiếp | Điểm mắc, số lần cần hướng dẫn, lỗi, hiểu nhãn tự công bố           |
| Sinh viên  | Tìm theo môn/tác giả, đọc, tô, ghi note, quay lại sau một phiên mới | Thời gian hoàn thành, có tìm lại được ghi chú và đúng version không |
| Admin      | Cấp/khóa tài khoản, phân công, xử lý báo cáo và ẩn/khôi phục        | Nhận đúng việc cần xử lý, hiểu tác động, không xem được note riêng  |

Lưu số đo tổng hợp và loại lỗi, không ghi nội dung note, mật khẩu, cookie, token hoặc toàn URL PDF vào analytics. Mục tiêu ban đầu: các luồng cốt lõi hoàn thành không mất dữ liệu đã xác nhận lưu; mọi lỗi chặn phải có cách khôi phục. Đặt chỉ tiêu thời gian cụ thể sau baseline, không tự bịa tỷ lệ thành công.

## 9. Điều kiện trước khi gọi là pilot sẵn sàng

- [ ] AUTH-01/02 chạy xuyên suốt cho ba vai trò; có đường hỗ trợ khôi phục và người chịu trách nhiệm.
- [ ] Đọc/tải/ghi chú chặn đúng khi khóa tài khoản, ẩn tài liệu hoặc mất quyền; không có admin bypass note.
- [ ] Ít nhất một ca worker thật được bật và ghi kết quả; fixture SAFE không thay thế ClamAV/Poppler.
- [ ] S3 private/Range và HTTPS/cookie/proxy đã thử trong đúng cấu hình dự kiến dùng.
- [ ] Phục hồi cả metadata DB và object PDF sang môi trường tách biệt; đối chiếu thiếu/orphan file và ghi chú theo version.
- [ ] Có readiness, cảnh báo hàng đợi/worker và log sạch dữ liệu nhạy cảm; không coi `/health`200 là toàn hệ thống khỏe.
- [ ] Kiểm tra run CI trên đúng commit được chọn; workflow tồn tại chưa đủ để kết luận đã xanh trên GitHub.
- [ ] Nếu tuyên bố hỗ trợ Safari/cảm ứng/thiết bị nào, đã thử thao tác chọn chữ/ghi chú trên môi trường đó; đợt này vẫn hoãn theo yêu cầu hiện tại.

Không có lịch triển khai hay chi phí cloud được cam kết trong kế hoạch này. Chốt từng đợt sau khi biết tài liệu thử, người dùng và môi trường.

## 10. Cách tiếp tục từ đây

**UPLOAD-02 đã được triển khai trên nhánh tính năng; xem bằng chứng local và giới hạn trong mốc PDF/DOCX.** AUTH-01/02 vẫn tiếp nối trong lộ trình và cần hoàn thiện trước pilot. Phần tạo sự khác biệt cho người học sau đó bắt đầu bằng LEARN-01.

Chỉ mở một nhánh `codex/` cho một lát cắt rõ; hoàn tất API/quyền/UI/test/docs trước khi chuyển hạng mục. Mỗi hạng mục cần ghi: vấn đề người dùng, hiện trạng, API/schema thay đổi, tiêu chí nghiệm thu và bằng chứng kiểm thử. Không biến toàn backlog thành phạm vi một PR.

Nguồn nội bộ: [PRODUCT](../../PRODUCT.md), [nghiệp vụ](../HUCEScholar-quy-tac-nghiep-vu.md), [tech stack](../HUCEScholar-tech-stack.md), [schema](../../apps/api/prisma/schema.prisma), [auth](../../apps/api/src/auth/auth.service.ts), [reader](../../apps/web/components/library/library-reader.tsx), [CI](../../.github/workflows/ci.yml), [highlight](../implementation/2026-10-17-pdf-text-highlights.md), [UI](../implementation/2026-10-17-web-ui-refinements.md).

Nguồn đối chiếu bảo mật ngày 17/10/2026: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#change-password-feature) khuyến nghị kiểm session/mật khẩu hiện tại; [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renew-the-session-id-after-any-privilege-level-change) hướng dẫn thay session ID khi thay mật khẩu; [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) nêu token giới hạn thời gian/dùng một lần và tránh lộ tài khoản. Thứ tự backlog, UX, quota cụ thể và ý tưởng học tập là đề xuất của dự án, không phải yêu cầu nguyên văn từ OWASP.
