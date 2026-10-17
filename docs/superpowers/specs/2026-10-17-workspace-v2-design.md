# HUCEScholar V2 — Kế hoạch trải nghiệm học liệu, tài khoản và điều hướng

Ngày: 17/10/2026. **Trạng thái: đề xuất để chọn phạm vi, chưa triển khai.**

## 1. Mục tiêu và phạm vi đã xác nhận

Biến trải nghiệm hiện có thành một không gian học tập gọn: **tìm → đọc → chọn đoạn → tô/ghi chú/trích dẫn → tìm lại để ôn tập**. Đồng thời chuẩn hóa điều khiển, hoàn thiện tài khoản và giảm nội dung ít dùng trong sidebar.

Người dùng đã chọn: **ghi chú, tô màu và trích dẫn trực tiếp trước**. “Edit” trong đợt này là sửa dữ liệu học tập riêng ngay trong reader. Chỉnh nội dung gốc PDF/Word không thuộc phạm vi; giảng viên tiếp tục cập nhật bằng phiên bản mới.

Giữ nền tảng Next.js/NestJS/PostgreSQL/PDF.js, nhận diện navy/blue hiện hành, tiếng Việt và web-first. Không làm lại landing/prototype, không yêu cầu cài PWA, không thêm vòng admin duyệt tài liệu giảng viên.

## 2. Hiện trạng được đối chiếu từ code

Mốc kiểm tra: nhánh `codex/lecturer-docx-upload`, commit `77cec0a`. Đây là đối chiếu cấu trúc/code, **không phải một lượt kiểm chứng trực quan hoặc chạy lại test**. Các thay đổi V2 dưới đây chưa có code. Không coi nhánh local là đã merge lên main.

| Khu vực           | Hiện có                                                                                                             | Khoảng trống V2                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Điều khiển        | Button thường cao tối thiểu 44px; form quản lý có input/select 48px; bo góc 6px; primary button có margin-top chung | Chiều cao/căn hàng tùy từng vùng, cần tokens và quy ước layout; popup native khó đồng nhất               |
| Điều hướng        | `RoleWorkspace` chứa sidebar, header trang, đăng xuất và nội dung tài khoản mặc định                                | Tài khoản, tác vụ chuyên môn và tiện ích dự án cùng một cấp; chưa có header tiện ích chung               |
| Sidebar           | Admin 10 mục, giảng viên 7, sinh viên 6, tính cả tài khoản/project/install; logo không tính                         | Cần nhóm theo công việc và tần suất, không chỉ thu nhỏ chữ hoặc giấu mọi mục sau icon                    |
| Reader            | PDF.js, chọn chữ, zoom/xoay, ghi chú trang, highlight riêng 3 màu, ghi chú kèm, lưu tiến độ, guard khi rời bản soạn | Toolbar/form dài; thiếu bảng ghi chú toàn phiên bản, trích dẫn thuận tiện, tìm chữ/mục lục và focus mode |
| Dữ liệu đoạn chọn | Highlight đã lưu `anchor.quote`, quads chuẩn hóa, version/page và revision                                          | Có nền để trích dẫn, không cần xây lại hệ anchor                                                         |
| Hồ sơ             | Tên/email/role hiển thị; admin quản lý tài khoản; chưa thấy self-service đổi tên/mật khẩu/settings                  | Cần hồ sơ sửa được có giới hạn, bảo mật và tùy chọn có tác dụng thật                                     |
| PDF/DOCX          | Giảng viên có luồng upload/chuyển PDF; nguồn Word giữ riêng, bản đọc bất biến                                       | Tiếp tục dùng luồng này; không lên kế hoạch xây lại upload                                               |

Nguồn chính: [shell](../../../apps/web/components/auth/role-workspace.tsx), [CSS](../../../apps/web/app/globals.css), [reader](../../../apps/web/components/library/library-reader.tsx), [highlight](../../../apps/web/lib/highlights.ts), [reading API](../../../apps/api/src/materials/reading.controller.ts), [auth](../../../apps/api/src/auth/auth.controller.ts), [schema](../../../apps/api/prisma/schema.prisma).

## 3. Phương án được đề xuất

### Điều hướng và bố cục

Giữ sidebar cho **đích đến công việc**; dùng header thấp cho breadcrumb, tên trang ngắn và menu tài khoản. Không nhân đôi tiêu đề lớn/header của từng page. Reader có thể thu sidebar và mở focus mode, vẫn có đường thoát rõ.

| Vùng                    | Sinh viên                                                             | Giảng viên                          | Admin                                                        |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Học tập                 | Kho học liệu; Thư viện của tôi                                        | Kho học liệu; Thư viện của tôi      | Kho học liệu; Thư viện của tôi                               |
| Công việc riêng         | Tài liệu tôi đóng góp, vẫn dùng route materials cũ                    | Học liệu của tôi; Phân công của tôi | Quản lý học liệu; Kiểm duyệt; Tài khoản; Danh mục; Phân công |
| Header / menu tài khoản | Hồ sơ; Cài đặt; Đăng xuất                                             | Hồ sơ; Cài đặt; Đăng xuất           | Hồ sơ; Cài đặt; Đăng xuất                                    |
| Tiện ích phụ            | Hướng dẫn/trợ giúp khi có nội dung; liên kết project ở chân trang phụ | Tương tự                            | Tương tự                                                     |

Sau phân bổ: sidebar tác vụ chính còn 3/4/7 đích tương ứng sinh viên/giảng viên/admin. Admin dùng nhóm “Học tập” và “Quản trị”; chỉ thu nhóm khi cần, không bắt buộc tăng một cấp click cho mọi thao tác. `/project` và `/install` vẫn truy cập trực tiếp; bỏ khỏi luồng học tập chính, phù hợp ưu tiên web. Chưa thêm mục “Thông báo” hoặc “Dashboard” khi chưa có dữ liệu thật.

Đường dẫn `/workspace/{role}` hiện là tài khoản: trong đợt này giữ truy cập được và hiện profile mới, không tự đổi thành dashboard. Khi có trang Học tiếp sẽ có task/mapping route riêng.

### Điều khiển đồng bộ

- Một bộ kích thước: điều khiển chuẩn 44px, form dài 48px có chủ đích; cùng nhóm toolbar dùng cùng kích thước. Click target icon tối thiểu 44×44px. Không ép mọi control thành nút lớn hoặc pill.
- Tokens đề xuất: radius control 8px, popup 12px, spacing 4/8/12/16/24px. Đây là giá trị đề xuất cần xem trên màn hình thật trước khi khóa, giữ màu hiện hành.
- Button primary/secondary/quiet/danger có loading, disabled, focus và lỗi rõ. Đặt khoảng cách ở container, bỏ phụ thuộc `margin-top` ngầm trên mọi primary button.
- Phân biệt **select chọn giá trị** và **menu hành động**. Để cả popup bo góc ổn định, dùng select/listbox truy cập được cho lựa chọn ngắn, không chỉ CSS bo góc `<select>`. Danh sách môn dài dùng combobox tìm kiếm trong đợt riêng nếu thật sự cần.
- Nội dung dài wrap, tiêu đề/tên người không làm lệch hàng. Thiết kế empty/loading/error/retry và thao tác keyboard cùng thiết kế mặc định.

### Reader và kho học liệu

Desktop: thanh đọc gọn trên cùng → PDF ở trung tâm → panel bên phải đóng/mở cho ghi chú và nguồn. Màn hẹp: một cột, panel mở inline dưới toolbar/PDF; không ép hai cột, không thêm modal để đọc ghi chú. Context toolbar xuất hiện gần vùng chọn, luôn có lối tương đương bằng keyboard trong toolbar cố định.

| Hành động       | Trải nghiệm đề xuất                                                                 | Quy tắc dữ liệu                                                                    |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Chọn chữ        | Hiện Tô sáng / Ghi chú / Sao chép trích dẫn                                         | Tối đa 2000 ký tự, một trang theo anchor hiện hữu                                  |
| Tô sáng         | 8 màu có tên; chọn màu mặc định trong cài đặt về sau                                | Giữ 3 mã màu cũ; đổi màu dùng revision hiện hữu                                    |
| Sửa đoạn tô     | Bấm đoạn đã tô hoặc chọn từ danh sách → chỉnh màu/note tại panel gọn                | Không thay anchor đang lưu, không sửa PDF gốc                                      |
| Trích dẫn       | Quote + tên tài liệu/tác giả nếu có + phiên bản + trang PDF + link nội bộ           | Không bịa tác giả/năm/số trang in; không nhúng signed URL hoặc note riêng vào link |
| Tìm lại         | Tab Ghi chú gom mọi trang của đúng phiên bản; lọc chữ/màu/loại, bấm quay đúng trang | API phân trang, chỉ owner, kiểm quyền đọc lại mỗi lần                              |
| Đọc tập trung   | Thu navigation/metadata, vẫn thấy trạng thái lưu và thoát chế độ                    | Không mất bản soạn hoặc mở vượt quyền                                              |
| Tìm chữ/mục lục | Next/previous match, outline khi PDF có                                             | Scan không có text báo rõ; chưa OCR                                                |
| Kho học liệu    | Filter chính gọn một hàng, bộ lọc phụ thu gọn, kết quả rõ version và nguồn          | Chỉ filter công khai vào URL; dữ liệu note không vào URL/analytics                 |

Không thêm bút vẽ, tẩy, chèn chữ vào PDF, sửa Word online, cộng tác đồng thời hoặc xuất PDF kèm annotations vào đợt nền tảng. Chúng cần thiết kế riêng nếu được chọn sau.

### Tài khoản và cài đặt

Hồ sơ gồm tên hiển thị sửa được, email/vai trò chỉ đọc và thông tin quản lý tài khoản rõ ràng. Avatar mặc định từ chữ cái; upload ảnh là ý tưởng sau, tránh mở thêm pipeline file chỉ để làm đẹp profile.

Cài đặt có hai nhóm ban đầu: **Bảo mật** (đổi mật khẩu bằng plan AUTH-01 đã có) và **Trình đọc** (màu tô mặc định, zoom mặc định, mở panel ghi chú mặc định). Chỉ thêm lựa chọn có hành vi đã triển khai. Chưa thêm công tắc thông báo giả, tự đổi email, role hoặc đơn vị học tập chưa có dữ liệu xác minh. Theme tối/dark PDF cần đợt QA tương phản riêng.

## 4. Thứ tự thực hiện và task

S/M/L là cỡ tương đối để tách PR, không phải cam kết ngày làm. “P1 V2” là ưu tiên trong đợt cải thiện này; điều kiện bảo mật/vận hành trước pilot trong roadmap cũ vẫn hiệu lực.

| Đợt / ID       | Task                                                        | Cỡ  | Phụ thuộc              | Kết quả nghiệm thu                                                 |
| -------------- | ----------------------------------------------------------- | --- | ---------------------- | ------------------------------------------------------------------ |
| A / UI-01      | Inventory controls + tokens và control primitives tối thiểu | M   | Không                  | 44/48px có quy tắc, bo góc thống nhất, không lệch hàng             |
| A / UI-02      | Select popup/menu bo góc + keyboard                         | M   | UI-01                  | Mở/đóng/chọn/escape/focus và lỗi chạy được                         |
| A / NAV-01     | Sidebar theo role, header/menu tài khoản                    | M   | UI-01/02               | 3/4/7 đích chính, route cũ vẫn tới được, logout không mất bản soạn |
| B1 / READ-02   | Palette 8 màu tương thích dữ liệu cũ                        | S   | UI-01                  | Tạo/đổi màu/reload không làm mất annotations cũ                    |
| B1 / READ-03   | Selection toolbar + chỉnh highlight tại panel               | L   | UI-02, READ-02         | Chọn → tô/note → sửa ngay trên trang, không mất selection          |
| B1 / CITE-01   | Copy trích dẫn và link đúng trang                           | M   | READ-03                | Nội dung, nguồn/version/page chính xác, clipboard có fallback      |
| B2 / LEARN-01  | Sổ ghi chú toàn phiên bản                                   | M   | READ-03                | Tìm lại note ở trang khác, phân trang và owner checks              |
| B2 / READ-01   | Tìm chữ/mục lục và focus mode                               | M   | NAV-01, READ-03        | Không báo nhầm OCR; zoom/rotate/guard còn đúng                     |
| B2 / SEARCH-02 | Gọn bộ lọc/kết quả kho học liệu                             | S   | UI-02                  | Dùng filter/back/retry không mất trạng thái hợp lệ                 |
| C / ACCOUNT-01 | Trang profile và đổi tên hiển thị                           | M   | NAV-01                 | Không sửa email/role bằng request tự tạo; CAS giữ bản nhập         |
| C / AUTH-01    | Tự đổi mật khẩu                                             | M   | ACCOUNT-01             | Tái dùng plan đã có; rotate cookie, thu hồi phiên cũ               |
| C / PREF-01    | Cài đặt reader đồng bộ tài khoản                            | M   | READ-02/03, ACCOUNT-01 | Có tác dụng thật, không rò cài đặt sang người khác                 |
| D / V2-QA      | Kiểm thử xuyên suốt và dùng thử có quan sát                 | M   | A–C                    | Tìm/đọc/tô/trích dẫn/sửa hồ sơ/đổi mật khẩu không mất dữ liệu      |

Kế hoạch kỹ thuật theo từng lát cắt:

1. [UI và điều hướng](../plans/2026-10-17-workspace-v2-ui-navigation.md).
2. [Reader và kho học liệu](../plans/2026-10-17-workspace-v2-reader-library.md).
3. [Hồ sơ, bảo mật và cài đặt](../plans/2026-10-17-workspace-v2-account-settings.md).

PR đề xuất: UI-01 → UI-02 → NAV-01 → READ-02/03 → CITE-01 → LEARN-01 → READ-01/SEARCH-02 → ACCOUNT-01 → AUTH-01 → PREF-01. Một task lớn có thể tách API và UI nhưng chỉ bật tính năng khi cả lát cắt có kiểm chứng. Tên nhánh dùng `codex/`; không gom toàn bộ thành một PR khổng lồ.

## 5. Các ý tưởng để lọc cho tương lai

Đây là **danh sách lựa chọn**, không phải tính năng đã được duyệt làm. Giá trị là giả thuyết cần kiểm chứng qua dùng thử. Nhóm “nên chọn tiếp” ưu tiên giá trị học tập và ít thêm nội dung vào sidebar.

| ID      | Ý tưởng / lợi ích cụ thể                                | Cỡ  | Điều kiện / lưu ý                                                      | Đề xuất          |
| ------- | ------------------------------------------------------- | --- | ---------------------------------------------------------------------- | ---------------- |
| IDEA-01 | Học tiếp ngay ở đầu Thư viện của tôi                    | S   | Dùng progress/personal API; đúng version cũ                            | Nên chọn tiếp    |
| IDEA-02 | Bookmark riêng từng trang, có tên dễ nhớ                | M   | Schema owner/version/page; khác với lưu cả tài liệu                    | Nên chọn tiếp    |
| IDEA-03 | Sổ tay toàn kho, tìm note của mình theo môn             | M   | Bắt đầu sau LEARN-01; mất quyền không lộ metadata                      | Nên chọn tiếp    |
| IDEA-04 | Nhãn “Chưa hiểu / Quan trọng / Cần ôn”                  | M   | Nhãn riêng; không thay ý nghĩa màu đã dùng                             | Nên chọn tiếp    |
| IDEA-05 | Xuất sổ tay Markdown/plain text kèm nguồn               | M   | Chủ động xuất, kiểm quyền; không tự xuất PDF gốc                       | Nên chọn tiếp    |
| IDEA-06 | Báo “có bản mới”, giữ nút mở ghi chú bản cũ             | S–M | Không tự chuyển anchor                                                 | Nên chọn tiếp    |
| IDEA-07 | Báo tài liệu thiếu trang/chữ mờ/sai thông tin           | M   | Nối reports/report_actions; không tự ẩn                                | Nên chọn tiếp    |
| IDEA-08 | Giảng viên tạo danh sách đọc theo tuần/chủ đề           | M   | Giữ version được chỉ định; chưa thêm quyền lớp                         | Thử sau V2       |
| IDEA-09 | Thẻ ôn tập thủ công từ đoạn tô                          | M   | Nguồn/version/page giữ nguyên; không cần AI                            | Thử sau V2       |
| IDEA-10 | Phiên ôn tập lần lượt các đoạn “Cần ôn”                 | M   | Chọn môn, đánh dấu đã xem; đo nhu cầu trước thuật toán                 | Thử sau V2       |
| IDEA-11 | Nhắc ôn có lịch trong ứng dụng                          | M   | Người dùng tự bật; mute/dismiss; chưa email                            | Thử sau V2       |
| IDEA-12 | Ghi chú liên kết hai tài liệu                           | M   | Kiểm quyền cả hai đầu; không lộ tiêu đề tài liệu mất quyền             | Thử sau V2       |
| IDEA-13 | Bộ sưu tập cá nhân theo kỳ thi/chủ đề                   | M   | Riêng tư; không nhầm quyền môn hoặc nhóm học                           | Thử sau V2       |
| IDEA-14 | Tìm tiêu đề/tác giả không dấu, gợi ý môn                | M   | Fixture tiếng Việt và đo query trước thêm index                        | Nên chọn tiếp    |
| IDEA-15 | Combobox môn tìm nhanh khi danh sách dài                | M   | UI-02 không tự biến thành component khổng lồ                           | Theo dữ liệu     |
| IDEA-16 | Xem trước outline và vài thông tin trước khi mở reader  | S   | API không tải hàng loạt PDF để tạo preview                             | Thử sau V2       |
| IDEA-17 | Giảng viên nhân thông tin nháp, không nhân file/công bố | S–M | Gắn nhãn bản mới; giữ scan và version độc lập                          | Theo phản hồi    |
| IDEA-18 | Cảnh báo upload nhầm bản/file trùng của chính mình      | M   | Không lộ hash hoặc file của người khác                                 | Theo phản hồi    |
| IDEA-19 | Giảng viên ghi “đọc trước/điểm cần lưu ý” cho tài liệu  | M   | Nội dung công khai khác note riêng, chỉ chủ sửa                        | Thử sau V2       |
| IDEA-20 | Thông báo scan xong/duyệt/bản mới trong app             | M   | Event/outbox, idempotency, deep link; không gửi nội dung note          | Thử sau V2       |
| IDEA-21 | Hoạt động gần đây của chính mình                        | S–M | Thông tin hữu ích, không dựng feed theo dõi người khác                 | Theo phản hồi    |
| IDEA-22 | Admin hàng đợi “cần xử lý” với lọc/lý do rõ             | M   | Dùng trạng thái thật; không lộ dữ liệu học tập riêng                   | Nên chọn tiếp    |
| IDEA-23 | Profile avatar ảnh upload                               | M   | File image pipeline, EXIF, kích thước và xóa ảnh cũ                    | Để sau           |
| IDEA-24 | Theme tối cho chrome ứng dụng                           | M   | Contrast, biểu đồ/trạng thái; không invert màu PDF                     | Để sau           |
| IDEA-25 | Xem và thu hồi phiên đăng nhập khác                     | M   | Không lộ token; session hiện tại có nhãn rõ                            | Nên chọn tiếp    |
| IDEA-26 | Buộc đổi mật khẩu ban đầu và khôi phục tài khoản        | M–L | AUTH-02/03, chính sách tài khoản cũ, SMTP thật                         | Cần trước pilot  |
| IDEA-27 | OCR PDF scan có nhận diện tiếng Việt                    | L   | Bản suy ra riêng, đo sai lệch/công thức/tọa độ, worker quota           | Cần nghiên cứu   |
| IDEA-28 | AI giải thích đoạn chọn bằng ngôn ngữ dễ hiểu           | L   | Opt-in, quyền nguồn, nhà cung cấp/chi phí, trích nguồn và đánh giá sai | Pilot riêng      |
| IDEA-29 | AI gợi ý câu hỏi ôn tập từ đoạn đã chọn                 | L   | Người học duyệt/sửa; không gọi khi chỉ mở PDF                          | Pilot riêng      |
| IDEA-30 | Hỏi đáp AI trong một tài liệu, dẫn đúng trang           | L   | Extraction/index riêng theo version, kiểm quyền mọi retrieval          | Pilot riêng      |
| IDEA-31 | Tóm tắt chương có liên kết chứng cứ                     | L   | Không tóm tắt scan chưa OCR; không bịa thông tin thiếu                 | Pilot riêng      |
| IDEA-32 | So sánh thay đổi giữa hai bản tài liệu                  | L   | Match trang/đoạn không bảo đảm; không tự chuyển note                   | Cần nghiên cứu   |
| IDEA-33 | Chia sẻ trích dẫn/note cho nhóm học                     | L   | Mô hình mời/thu hồi/quyền copy; mặc định riêng tư                      | Quyết định riêng |
| IDEA-34 | Bút viết tay/underline/ghim note theo tọa độ            | L   | Anchor loại mới, cảm ứng/zoom/rotate/accessibility; không sửa byte PDF | Quyết định riêng |
| IDEA-35 | Xuất PDF với annotations của mình                       | L   | Quyền xuất/phân phối, font/render và giữ file gốc                      | Quyết định riêng |
| IDEA-36 | Readiness, cảnh báo worker và thử phục hồi dữ liệu      | M–L | OPS-01/02; cloud/domain/ngân sách do chủ chọn                          | Cần trước pilot  |

**Gói nên chọn sau V2:** Học tiếp + bookmark + sổ tay theo môn + xuất Markdown + bản mới + báo lỗi tài liệu. Gói này làm vòng học tập khép kín mà chưa phụ thuộc nhà cung cấp AI.

**Gói thử AI nhỏ nhất:** chỉ giải thích đoạn đang chọn, opt-in từng lần, dẫn trang/version, nói rõ khi thiếu căn cứ và cho phản hồi hữu ích/sai. Chưa tự gửi cả tài liệu hoặc ghi chú cá nhân; không dùng câu trả lời làm sự thật mặc định. Phải có ngân sách, chính sách dữ liệu, quota, prompt-injection tests, đánh giá tiếng Việt và công thức trước khi mở rộng. Không mặc nhiên tích hợp dịch vụ trả phí.

## 6. Điều kiện hoàn thành V2

- Người dùng tìm tài liệu, tô/note hai trang, copy quote, rời rồi mở lại và tìm đúng ý mà không cần nhớ số trang.
- Ghi chú/màu cũ còn nguyên; tab cũ không ghi đè bản mới; mất mạng giữ bản soạn; mất quyền dừng đọc/ghi đúng quy tắc.
- Hồ sơ đổi tên thật, cài đặt có tác dụng thật, đổi mật khẩu khép kín. Email/role không tự sửa được.
- Cùng hàng điều khiển không lệch; popup bo góc theo component đã chọn; keyboard, focus, 200% zoom và viewport 320/390/768/1440 được kiểm.
- Không còn hành động chưa hoạt động được trình bày như đã có. Không thêm menu cho ý tưởng chưa chọn.
- Có bằng chứng lint/typecheck/unit/integration/browser/build theo từng PR; tách local khỏi production/thiết bị thật. Chỉ tài liệu kế hoạch được viết trong lượt này.

## 7. Tương quan roadmap cũ và quyết định còn lại

Kế hoạch này bổ sung UX/UI theo yêu cầu mới, tái sử dụng LEARN-01, READ-01, AUTH-01 và không thay các điều kiện pilot REPORT/OPS/AUTH-02/03 ở [roadmap trước](../../roadmap/2026-10-17-web-improvement-roadmap.md). UPLOAD-02 đã có trên nhánh tính năng; không lập lại thành việc chưa làm.

Đã chốt: edit là annotations riêng. Đề xuất chờ chọn khi bắt đầu làm: palette 8 màu cụ thể, chọn một đợt A/B/C để mở trước, và những IDEA được đưa vào backlog thực hiện. Các giá trị UI và API dưới các plan là thiết kế đề xuất, không mô tả contract đã tồn tại. Không cần chốt toàn bộ 36 ý tưởng mới có thể bắt đầu đợt A.
