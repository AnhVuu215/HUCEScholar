# Giảng viên upload PDF/DOCX trên web

Phạm vi17/10/2026: form tiêu đề/môn/file cho giảng viên, nguồn Word riêng tư, chuyển thành PDF để đọc/ghi chú, tải Word gốc theo quyền. Sinh viên tiếp tục upload PDF qua kiểm duyệt. Không cài PWA hoặc triển khai cloud trong mốc này.

## Luồng và dữ liệu

- Giảng viên mở **Học liệu của tôi → Tạo bản nháp**, chọn PDF/DOCX tối đa25MiB, nhập tiêu đề/môn rồi **Lưu và tải file lên**. Tên file chỉ gợi ý khi tiêu đề trống. Có thể **Lưu bản nháp** chưa có file.
- Lưu metadata trước, giữ ID/revision đã xác nhận rồi gửi bytes. Lỗi upload giữ file và bản nháp trong phiên. POST metadata chưa rõ kết quả chặn tạo lại và hướng dẫn kiểm tra danh sách; không suy đoán bản trùng theo tiêu đề.
- PDF trực tiếp dùng luồng quét cũ. DOCX lưu vào `sources/<UUID>.docx`; `document_source_uploads` giữ danh tính nguồn bất biến, trạng thái scan/conversion và bản PDF kết quả. `files` vẫn chỉ chứa PDF. Phiên bản trỏ nguồn bằng FK cùng version; SQL deferred trigger kiểm tra snapshot.
- Worker kiểm hash/dung lượng nguồn, quét ClamAV, gọi converter cách ly, quét/phân tích PDF bằng ClamAV/Poppler rồi gắn kết quả vào đúng bản nháp. Nguồn và PDF đều SAFE mới được READY. Không ghi đè metadata đang sửa.
- Queue `hs-docx-convert`, ID ổn định theo source; tối đa3 lần, backoff. Claim có token và lease10phút, dài hơn các công đoạn I/O/tool có timeout. Worker mất lease, nguồn bị thay, bàn giao hoặc mất phân công không được attach. Reconcile khôi phục enqueue bị mất, chốt FAILED sau ba claim hết hạn/thất bại. Retry thủ công chỉ dành lỗi dịch vụ/chuyển đổi; nguồn không hợp lệ hoặc scan lỗi phải thay file.
- **Xem trước bản PDF** mở bản đọc SAFE của bản nháp thuộc quyền giảng viên. Tự công bố không cần admin. Bản đã công bố/ghi chú giữ nguyên PDF; phiên bản kế tiếp không sao chép nguồn hoặc file.
- `/library/versions/:id/pdf` và `/download` luôn PDF. `/source-download` trả Word gốc byte-identical, cùng grant APPROVED/VISIBLE/SAFE/hạn quyền/tài khoản và `download_allowed`. Không nhận object key hoặc source ID từ browser. Hỗ trợ một byte Range và tên Unicode an toàn. Mọi response no-store.
- UI tách scan, conversion và publication; polling có backoff, tối đa3phút, không fetch khi tab ẩn và hủy khi unmount. Poll cập nhật baseline/trạng thái, giữ các trường đang gõ. Khi không rõ kết quả upload cần tải trạng thái trước retry. DOCX replay giữ UUID, kiểm hash/size/name/version và không gắn lại nguồn đã bị thay.

## Converter và giới hạn

`infra/docx-converter.Dockerfile`: Node24.19.0, LibreOffice Writer **7.4.7.2 40(Build:2)**, Python3 stdlib ZIP/XML validation, Liberation2/DejaVu fonts, Debian Bookworm. HTTP entry là MJS độc lập; API/worker nghiệp vụ vẫn TypeScript. Không thêm dependency npm để phân tích ZIP/XML.

Container non-root, read-only rootfs, tmpfs512MiB, memory1GiB/CPU1/pids128, bỏ capabilities và no-new-privileges. Network nội bộ không có cổng host; không mount source app, dữ liệu người dùng hoặc secret. Từng job có thư mục/profile riêng, macro bị tắt, cấm external resource trừ hyperlink thông thường. Chạy process bằng argument array, shell=false, kill process group khi timeout/disconnect; cleanup sau mỗi job. Không tắt cách ly để tiện debug.

Validator giới hạn25MiB input,2000 entries,100MiB thực giải nén,8MiB/XML; không extract đường dẫn ZIP. Từ chối ZIP thường đổi đuôi, encrypted, traversal, symlink, macro/embedded object, DTD/entity và external image. Output giới hạn25MiB, phải có chữ ký PDF, được Poppler đọc và qua ClamAV.

Giới hạn thực giải nén đo raw DEFLATE theo chunk64KiB, đối chiếu kích thước/CRC và tổng bytes; không chỉ dùng ZipExtFile vì lớp này cắt dữ liệu theo dung lượng khai báo. Fixture khai báo1byte nhưng nén101MiB đã quan sát RED→GREEN sau sửa. DOCX chỉ nhận ZIP STORE/DEFLATE; phương thức nén khác bị từ chối.

Fixture synthetic có tiếng Việt, bảng, ảnh nhúng, ngắt trang và OMML. Probe đầu cho PDF2trang, tiếng Việt/bảng đọc được; **công thức OMML chưa hiện đầy đủ**. Không cam kết bố cục/ảnh/công thức/font giống Word tuyệt đối. Giảng viên cần xem trước; nếu lệch, xuất PDF từ Word rồi upload PDF. Chưa nhận DOC/DOCM/PPTX, OCR, sửa Word trong web, cache offline hoặc tự chuyển ghi chú sang bản mới.

## Chạy local

Sau khi cấu hình môi trường local bằng workflow hiện có:

Runtime chuyển đổi chỉ cần Docker; Python/LibreOffice nằm trong image. Unit test validator và script sinh fixture cần Python3 trên máy chạy test. Trên Windows, nếu `python3` là alias WindowsApps, đặt `DOCX_PYTHON` thành đường dẫn `python.exe` thực trước `pnpm check`; CI Ubuntu dùng `python3` có sẵn. Không cần cài Office để chạy ứng dụng.

```powershell
pnpm --filter @hucescholar/api db:migrate
docker compose --env-file infra/.env -f infra/compose.yaml --profile files up -d --build
pnpm dev
```

Migration additive thứ8 tạo bảng thứ24, không dùng `db push`. Kiểm tra database mục tiêu trước khi deploy. `DOCX_CONVERTER_URL=http://docx-converter:8080` chỉ cấu hình cho worker; API không gọi LibreOffice. Converter chưa sẵn sàng: giữ nguồn riêng tư, retry hữu hạn và báo trạng thái lỗi, PDF trực tiếp vẫn dùng luồng cũ.

## Kiểm chứng

- Package validator, HTTP client, streaming intake, SQL guards và kiểm thử API cho quyền/replay/lease/thay file/metadata/retry/reconcile/commit acknowledgment.
- Probe Docker thật: DOCX→PDF2trang; ClamAV thật cho nguồn và kết quả; external image422; metadata-network egress bị chặn; inspect read-only/no host ports/internal network.
- Playwright form: file picker lúc tạo, gợi ý không ghi đè tiêu đề, response upload mất vẫn replay đúng source, metadata-create mất phản hồi chặn tạo trùng, giữ các trường đang sửa khi cập nhật trạng thái. Batch ảnh1440/768/360/320px, không tràn ngang.
- Review độc lập phát hiện P2: polling nhận metadata/revision từ tab khác có thể làm mất cập nhật. Ca browser tái hiện RED→GREEN: giữ revision gốc, tách snapshot mới để đối chiếu; chỉ lưu với revision mới sau xác nhận rõ ràng. Bản soạn và file đang chọn được giữ. Không tự cho retry nguồn/công bố trước khi lưu metadata đã đối chiếu.
- Hồi quy browser đầu83/84: tài khoản `e2e-admin` dùng chung vượt giới hạn10lần/15phút giữa suite auth, UI và quản lý người dùng. Tách fixture `e2e-users-admin`; không thay limiter hoặc auth production. Unit cũ có một lần Node subprocess khởi động quá1giây; chạy lại68/68 đạt, không sửa timeout production/test để che lỗi.
- Sau sửa CAS và fixture, toàn bộ browser **84/84 đạt**, bao gồm ca converter thật. Fault injection sau đó xác nhận mất kết nối ClamAV ở nguồn/đầu ra phải QUEUED để retry thay vì đánh dấu file unsafe; đã quan sát RED2→GREEN2. `FileCheckError` phân biệt hạ tầng tạm thời với phản hồi FOUND; PDF cũ vẫn giữ hành vi bắt lỗi hiện hữu.
- Ca xuyên suốt có opt-in riêng, không giả SAFE bằng SQL:
- Đã chạy ca opt-in bằng Chrome/Compose local: **1/1 đạt (23.6giây)**, gồm nguồn Word có ảnh nhúng; đọc2trang, note/highlight qua reload, kiểm tra note riêng tư và Word download byte-identical. Lần chạy đầu dừng ở thao tác chọn chữ ngoài viewport sau lưu note; sửa test cuộn đoạn chữ vào màn hình rồi chạy lại đạt. Đây là sửa harness, không thay logic highlight.

```powershell
pnpm test:setup
docker compose --env-file infra/.env -f infra/compose.yaml --profile files up -d --build
$env:DOCX_REAL = '1'
pnpm exec playwright test tests/lecturer-document-upload.spec.ts -g 'real DOCX'
Remove-Item Env:DOCX_REAL
```

Ca này chạy one-shot worker từ image đã build qua `infra/compose.docx-test.yaml`, chỉ DB `_test`/Redis15/files-test và tài khoản synthetic `e2e-docx-*`. Helper từ chối chạy với database ứng dụng. Hành trình: upload thật→worker thật→preview→tự công bố→sinh viên renderPDF/tô/note/reload→Word gốc byte-identical và note riêng tư. CI thông thường chạy kiểm tra package/API/UI; real converter là opt-in có Docker/ClamAV, không coi ca skipped là bằng chứng.

Kết quả cuối: `format:check` và `pnpm check` đạt; **68unit,154integration đạt** (một ca real-scan opt-in cũ không chạy trong suite integration thường). Browser toàn bộ **84/84 đạt**; sau chỉnh phân loại lỗi scanner, chạy lại ba ca upload/CAS/recovery/DOCX thật **3/3 đạt**, dùng image worker mới. Snapshot đối chiếu1440/360px đã xem cùng lần xác nhận cuối. Reviewer độc lập xác nhận P2 đã xử lý và không còn lỗi cần sửa trong phạm vi review.

Migration đã áp dụng lên database local `hucescholar` sau `_test`; API/web và file-worker đã tải bản mới. Health API và đăng nhập bằng tài khoản giảng viên demo có sẵn xác nhận form PDF/DOCX trên web local. Tài liệu Word/diagram prototype lịch sử giữ nguyên.

## Trước pilot

Chỉ có bằng chứng local filesystem/Docker/Chrome; chưa xác minh S3 thật, production, iOS/Android hoặc độ trung thực trên tài liệu thực tế. Runtime DB role phải có quyền đọc/ghi bảng và sequence mới; role migration tách riêng trước production. PUBLIC không được cấp quyền bảng/sequence. Backup phải giữ đồng bộ PostgreSQL, Word gốc và PDF; không xóa object còn tham chiếu. Cần đo dung lượng hai bản, quota, retention/orphan cleanup, TLS/HTTPS và kiểm thử restore trước pilot. Không triển khai cleanup tự động trong tính năng này.
