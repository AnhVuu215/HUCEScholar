# Giảng viên upload PDF/DOCX — thiết kế luồng và dữ liệu

Ngày: 17/10/2026. Trạng thái: **đề xuất thiết kế, chưa triển khai**. Người dùng đã chọn DOCX đọc/ghi chú ngay trên web qua bản PDF chuyển đổi và giữ file Word gốc để tải. Yêu cầu mới nhất là viết plan trước.

## 1. Kết quả người dùng cần

Giảng viên mở **Học liệu của tôi → Thêm tài liệu**, chọn PDF hoặc DOCX, nhập tiêu đề, môn và các thông tin thông thường ngay trên cùng màn hình. Lưu/upload xong thấy tên file và trạng thái xử lý, không phải đoán cần đóng/mở lại bản nháp. Có thể tự công bố khi file đọc đã sẵn sàng và qua kiểm tra.

Sinh viên đọc bằng reader hiện hữu, tô sáng và ghi chú riêng. Với tài liệu xuất phát từ DOCX, có nút tải Word gốc nếu giảng viên cho tải; đọc web dùng bản PDF đã tạo cho phiên bản đó.

Phạm vi đợt này: mở rộng DOCX cho **giảng viên**. Sinh viên tiếp tục upload PDF theo luồng hiện tại; không tự mở rộng DOCX, DOC/PPTX, nhiều file đính kèm hoặc soạn thảo Word trên web. Nguồn tham khảo giảng viên vẫn tùy chọn, không thêm admin duyệt. Giữ phân công môn, quyền API, quét file và giới hạn upload 25 MiB.

## 2. Hiện trạng đã xác minh

- `MaterialEditor` hiện chỉ lưu metadata rồi đóng; `DraftPdf` chỉ hiện khi đã có `current`. Người dùng phải mở lại để chọn file. Không có trình soạn nội dung Word trong luồng này.
- `POST /material-drafts/:id/pdf` và `receivePdf` chỉ nhận MIME/đuôi/chữ ký PDF.
- `files.mime_type` bị SQL CHECK khóa ở `application/pdf`; object key, hash và byte size bất biến. Không sửa MIME sang DOCX hoặc ghi metadata PDF giả khi PDF chưa tồn tại.
- Reader, annotations, Range, publication và moderation đang dựa vào `document_versions.file_id` trỏ PDF. Giữ mô hình này để tái sử dụng reader/quyền hiện có.
- Worker đang quét ClamAV và dùng Poppler; chưa có LibreOffice/chuyển DOCX. PrivateStore có local/S3 nhưng hiện chỉ chấp nhận key PDF.

## 3. Luồng giao diện đề xuất

1. Bấm **Thêm tài liệu**; form có **Chọn file PDF hoặc Word (.docx)** ở gần đầu, tiếp theo là tiêu đề, tác giả tùy chọn, loại, môn, mô tả, nguồn tùy chọn và lựa chọn tải file gốc.
2. Chọn file có thể điền gợi ý tiêu đề từ tên file khi tiêu đề còn trống; không ghi đè tiêu đề người dùng đã nhập. File không tự upload khi vừa chọn.
3. Nút **Lưu và tải file lên** lưu metadata rồi upload trong một thao tác người dùng. Chưa chọn file vẫn có **Lưu bản nháp**; bản nháp không đủ điều kiện công bố.
4. Form ở lại sau khi lưu để thấy file/trạng thái và công bố. Sau khi upload đã được máy chủ xác nhận, đổi nút thành các thao tác tương ứng; không giữ bộ chọn file giả sau reload.
5. PDF: đang kiểm tra → sẵn sàng hoặc không đạt. DOCX: đã nhận → kiểm tra Word → chuyển đổi → kiểm tra PDF → sẵn sàng hoặc lỗi cụ thể.
6. Nút **Công bố** chỉ khả dụng khi server xác nhận đủ điều kiện; vẫn có xác nhận công bố hiện hữu. Lỗi chuyển đổi không được bỏ qua bằng tải Word trực tiếp.

Metadata và bytes là hai request, không hứa một transaction bao cả HTTP upload. Khi metadata lưu thành công nhưng upload lỗi, giữ ID/revision và thông tin vừa lưu, chỉ thử lại file vào bản nháp đó. Khi POST tạo metadata mất phản hồi, không tự POST lại: khóa retry tạo, cho tải danh sách bản nháp để người dùng chọn bản đã tạo hoặc kiểm tra trước khi tạo mới. Không tự nhận hai bản trùng tiêu đề là một.

File được chọn chỉ nằm trong bộ nhớ trang. Trong lúc gửi bytes chặn submit kép/rời trang theo guard hiện hữu; lỗi mạng giữ trạng thái chưa rõ kết quả và yêu cầu đọc trạng thái server trước retry. Không đưa file hoặc nội dung vào localStorage/service worker. Công bố chưa rõ kết quả tiếp tục dùng đường khôi phục hiện hữu.

## 4. Quyết định kiến trúc

**Giữ `files` chỉ chứa PDF; thêm bảng nguồn DOCX và liên kết tới PDF kết quả.** Phương án này có thêm migration nhưng không làm sai các constraint PDF hiện có. Không dùng “DOCX đổi đuôi PDF”, chuyển đổi ở trình duyệt, dịch vụ Office công khai hoặc upload tài liệu sang bên thứ ba.

DOCX được xử lý bất đồng bộ trong pipeline riêng; PDF upload trực tiếp giữ pipeline hiện tại. Worker điều phối có DB/Redis/storage; converter chỉ chuyển file trong vùng cách ly, không có credential DB/S3. Không chạy LibreOffice trong API request hoặc cài bộ Office vào máy Windows của người dùng để phục vụ app.

### Mô hình dữ liệu đề xuất

Thêm `document_source_uploads`:

| Nhóm            | Trường / ràng buộc                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Định danh       | `id`, `version_id`, `uploaded_by`, `request_id` UUID; unique `(uploaded_by, request_id)`; FK version/user; unique `(version_id,id)` cho composite FK |
| Nguồn bất biến  | `object_key`, `original_name`, `mime_type` cố định DOCX, `byte_size`, `sha256`, `created_at`; check dung lượng/hash/key; cấm sửa danh tính bytes     |
| Quét nguồn      | `scan_status`: CHECKING/SAFE/FAILED, `checked_at`                                                                                                    |
| Chuyển đổi      | `conversion_status`: QUEUED/RUNNING/READY/FAILED/CANCELLED; `error_code` hữu hạn, `updated_at`; không lưu raw tool stderr                            |
| Kết quả         | `rendered_file_id` nullable FK `files`; `converter_build` lưu nhận diện image/font/converter đã tạo kết quả                                          |
| Claim công việc | `processing_token` UUID, `lease_expires_at`, `attempt_count` để ngăn worker cũ commit sau retry; không trả các trường này qua API                    |

Thêm `document_versions.source_upload_id` nullable; composite FK `(id, source_upload_id)` tới `(version_id,id)` ngăn gắn nguồn của version khác. PDF upload trực tiếp và dữ liệu cũ có giá trị null; không backfill nguồn DOCX giả.

Khi nhận DOCX mới, transaction khóa bản nháp hiện hành, lưu nguồn, đặt pointer mới, **xóa `file_id` của bản nháp**, tăng revision. Bản PDF công bố của version trước vẫn nguyên vẹn. Nếu bản nháp trước đó có PDF, không cho công bố nhầm PDF cũ trong lúc Word mới đang xử lý.

Worker chỉ tạo `files` khi PDF thật đã có, biết hash/size/pageCount và đã quét. Trong transaction cuối, kiểm pointer còn là upload này, claim token còn hiệu lực, version vẫn DRAFT và người upload còn quyền/phân công; gắn PDF và READY nguyên tử, tăng revision. Thay đổi metadata không liên quan có thể tăng revision trong lúc xử lý: không dùng một revision cũ từ lúc enqueue làm điều kiện duy nhất, phải kiểm lại quyền và pointer thực tế dưới khóa.

SQL guard bổ sung:

- Giữ trigger bất biến version terminal/submitted và toàn bộ constraint/partial index hiện hữu; thêm guard bất biến nguồn.
- READY yêu cầu nguồn SAFE và PDF SAFE thật, có kết quả; khi công bố phải có `file_id` đúng với `rendered_file_id` của source hiện hành. Kiểm ràng buộc liên bảng ở trạng thái cuối transaction bằng deferred constraint trigger khi cần.
- Row nguồn đã READY không được ghi đè kết quả. Không chạy lại converter để thay PDF của một version đã có note/công bố; cập nhật nội dung phải tạo phiên bản kế tiếp.
- Worker cũ sau khi giảng viên thay file không được gắn kết quả. PDF upload qua route cũ cũng phải clear pointer nguồn DOCX trong transaction thay file.

## 5. Pipeline và cách ly converter

1. API kiểm session/CSRF, ownership/phân công và revision, giới hạn stream25 MiB, tên file và MIME được phép. Lưu DOCX ở vùng source private bằng key UUID bất biến. Header/đuôi chỉ là bước sàng lọc, không chứng minh nội dung hợp lệ.
2. Worker kiểm hash/size, quét ClamAV nguồn trước khi mở/chuyển đổi. Parser ZIP đọc giới hạn; kiểm package OOXML có `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` và content type Word chuẩn. Từ chối ZIP thường, package mã hóa, DOC/DOCM đổi đuôi, macro/OLE, đường dẫn ZIP traversal, XML DTD/entity và nội dung liên kết cần tự tải tài nguyên ngoài. Hyperlink văn bản thông thường không được coi là yêu cầu fetch tài nguyên.
3. Đề xuất ngưỡng khởi điểm: tối đa 2000 entries, 100 MiB tổng giải nén; kiểm giới hạn thật khi đọc stream, không chỉ tin central directory. Chọn thư viện ZIP hỗ trợ lazy/stream và xác nhận API/phiên bản ở bước probe, không tự dùng dependency transitive không khai báo.
4. Converter dùng LibreOffice headless với `writer_pdf_Export`, profile riêng mỗi job, macro bị vô hiệu, không update tài nguyên ngoài; spawn bằng argument array, `shell:false`, đường dẫn nội bộ cố định. Lệnh không dùng tên file người dùng làm tham số tùy ý.
5. Đề xuất service converter nội bộ riêng: không publish port, không DB/Redis/S3 credential, không egress Internet, không mount thư mục dự án/file dùng chung. Non-root, root filesystem read-only, tmpfs có quota, drop capabilities/no-new-privileges, giới hạn RAM/CPU/PID. Worker gửi bytes đã quét qua mạng internal chỉ kết nối worker/converter. Không cấp Docker socket cho worker.
6. Điểm bắt đầu để đo: một conversion đồng thời, timeout 120 giây, input 25 MiB/output PDF 25 MiB, RAM 1 GiB. HTTP cũng giới hạn body/output và hủy request khi caller disconnect. Timeout phải dừng process tree và xóa profile/tmp; thiếu output hợp lệ là thất bại kể cả exit code0.
7. Quét PDF kết quả, kiểm pdfinfo/pdftotext và giới hạn số trang theo pipeline hiện hữu; lưu object PDF bất biến, rồi mới gắn kết quả trong transaction cuối. Không serialize đường dẫn local, key S3 hoặc stderr lên UI.

Các giới hạn cụ thể là đề xuất để probe trước, không phải kết quả hiệu năng đã đo. Nếu không thể chứng minh cách ly/tắt fetch và chuyển đổi thực tế ở bước đầu, dừng trước migration/đưa DOCX ra UI; giữ nguyên PDF đang hoạt động và ghi rõ điểm còn thiếu.

## 6. Hợp đồng API đề xuất

Giữ nguyên metadata API và route PDF cũ để tránh phá client/test hiện có. Thêm:

```http
POST /api/v1/material-drafts/:id/file
Content-Type: application/pdf | application/vnd.openxmlformats-officedocument.wordprocessingml.document
X-File-Name: <URI-encoded name>
If-Match: "<revision>"
X-Upload-Id: <UUID v4 cho DOCX>
X-CSRF-Token: <token>

<raw file bytes>
```

Route mới chỉ LECTURER. PDF delegate pipeline hiện có; DOCX trả 202 kèm item bản nháp sau commit nguồn. Replay DOCX cùng actor/requestId/version/hash/size/name trả nguồn cũ theo quyền hiện tại, không enqueue conversion mới. Payload khác với UUID cũ trả 409 `UPLOAD_REQUEST_MISMATCH`; kiểm replay trước so sánh revision cũ nhưng không bỏ kiểm owner/version/phân công. UI PDF vẫn dùng cơ chế upload chưa rõ kết quả/đọc lại như hiện có; không hứa idempotency PDF chỉ vì có route mới.

`GET /material-drafts/:id` bổ sung trường `sourceUpload` hoặc null, gồm `id`, `format`, `name`, `byteSize`, `scanStatus`, `conversionStatus`, `errorCode`; giữ `pdf`, `fileState`, `revision` cũ. `fileState` chỉ mô tả PDF: chưa có PDF thật vẫn MISSING, không giả SAFE/CHECKING cho nguồn DOCX. UI dùng cả hai trường để mô tả quá trình.

`POST /material-drafts/:id/source/retry`: body `{revision, sourceUploadId}`; chỉ retry lỗi hạ tầng tạm thời trên source hiện hành, còn DRAFT, còn quyền và source thuộc người quản lý hiện tại. Request nhận claim mới, job cũ không commit được. File không hợp lệ/nhiễm/mã hóa yêu cầu thay file, không retry vô hạn. Khi bàn giao hoặc mất quyền, hủy job/pointer claim phù hợp; người quản lý mới reupload nếu nguồn thuộc người cũ, không mạo danh actor cũ để tiếp tục xử lý.

Lỗi có code hữu hạn: `INVALID_DOCUMENT`, `FILE_TOO_LARGE`, `INVALID_DOCX`, `DOCX_UNSUPPORTED`, `CONVERSION_TIMEOUT`, `CONVERSION_FAILED`, `PROCESSOR_UNAVAILABLE`, `UPLOAD_UNCERTAIN`, `STALE_REVISION`, `SOURCE_SUPERSEDED`. Lỗi không expose nội dung file, path, tool output hay chi tiết scanner.

## 7. Đọc, tải và phiên bản

- `GET /library/versions/:id/pdf` luôn stream PDF, giữ Range/quyền/no-store. `/download` cũ vẫn trả PDF để tương thích; với DOCX đây là bản chuyển đổi, không gọi là “PDF gốc”.
- Thêm `/library/versions/:id/source-download`: chỉ DOCX nguồn SAFE, conversion READY, đúng PDF/source/version, được đọc và `download_allowed=true`; stream attachment với MIME DOCX, tên file encode an toàn. Không có public/signed URL lộ lên client. PDF-only không có Word trả 404.
- Nút **Tải Word gốc** và **Tải bản PDF** chỉ xuất hiện theo quyền server. Khi giảng viên tắt tải, cả hai endpoint download chặn; đọc PDF trong hệ thống vẫn theo quyền hiện hữu.
- Tải lại bytes nguồn kiểm hash/danh tính nguồn không bị thay. Sau khi ẩn/khóa/mất quyền, lượt cấp đọc/tải mới bị chặn; không hứa thu hồi bytes đã tải.
- Ghi chú gắn version/page của PDF kết quả. Giữ PDF đó bất biến dù nâng LibreOffice hoặc bộ font; không chuyển note sang Word hoặc PDF tạo lại. Version kế tiếp không kế thừa file/pointer nguồn hoặc ghi chú tự động.
- Có nhãn **Bản đọc được chuyển từ Word**, người upload xem trước trước khi bấm Công bố. Không cam kết bố cục trùng tuyệt đối Microsoft Word, nhất là công thức/font/trang ngắt.

## 8. Xử lý lỗi và vòng đời

Queue có request/job ID ổn định, retry tối đa 3 lần cho lỗi tạm thời, backoff và reconcile các nguồn CHECKING/QUEUED/RUNNING bị treo; claim hết hạn mới được lấy lại. Không retry nội dung hỏng như lỗi hạ tầng. Dùng token CAS để worker timeout cũ không hoàn tất đè lên lần mới.

Khi metadata thay đổi vẫn giữ file đã xác nhận; khi thay source, job trước bị supersede/cancel. Khi nhận PDF thay DOCX, pointer bị clear; worker DOCX cũ không thể restore pointer. Khi database commit chưa rõ kết quả, giữ immutable object và đọc lại trước dọn dẹp. Cleanup chỉ xóa output không còn tham chiếu khi có bằng chứng; không tự xóa PDF/Word nguồn trong task này chỉ vì job báo lỗi.

Luôn giữ ba trục riêng: scan nguồn/PDF, chuyển đổi kỹ thuật, xét công bố và visibility; không gộp thành một boolean “đã duyệt”.

## 9. Nghiệm thu

- [ ] Giảng viên chọn file trước khi tạo, nhập tiêu đề/môn và upload một lượt; upload lỗi không tạo lại metadata đã có ID.
- [ ] PDF cũ và sinh viên upload PDF không thay hành vi; DOCX sinh viên bị API từ chối.
- [ ] DOCX tổng hợp có tiếng Việt/bảng/ảnh/công thức chuyển qua pipeline thật; reader mở được, có text/highlight khi PDF output có lớp chữ; note giữ sau reload.
- [ ] Word gốc tải byte-identical với file upload, đúng tên/MIME và chỉ khi được phép; PDF bản đọc là file khác.
- [ ] File giả/ZIP bomb/macro/external resource/mã hóa/lỗi scanner/converter hết hạn đều không công bố hoặc đọc nhầm file cũ.
- [ ] Replay/lost response/worker trùng/retry/thay file/thu hồi phân công/bàn giao không gắn sai file hoặc nhân đôi conversion đã xác nhận.
- [ ] Terminal version/source/PDF/notes không bị thay khi converter/font nâng cấp.
- [ ] Lint/typecheck/unit/integration/build/browser và migration SQL guard đạt; có một ca conversion thật, không chỉ mock SAFE.

Tham khảo ngày 17/10/2026: [LibreOffice command-line parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html) mô tả headless, convert-to/outdir và profile; [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) nêu kiểm loại/nội dung, lưu ngoài webroot và xử lý file có giới hạn. Cách ly, schema, quota và UX trên đây là thiết kế đề xuất cho dự án, chưa phải bằng chứng đã vận hành.
