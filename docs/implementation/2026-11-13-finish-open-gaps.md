# Làm nốt việc còn mở sau ROLE-01 và SEARCH-04

Ngày 13/11/2026. Nhánh `codex/finish-open-gaps`, xây trên `main` `359f882` (sau PR #83). Rà các mục "Chưa làm" và "chưa kiểm chứng" trong các mốc gần đây, làm nốt những gì làm được trên web và trên máy local.

## SEARCH-04: admin thấy file lập chỉ mục chữ lỗi

Trước đây, PDF trích chữ lỗi 3 lần thì worker dừng hẳn. Lỗi chỉ hiện trong log và cột `file_text.attempts`, nên admin không biết tài liệu nào không tìm được trong nội dung.

Theo lựa chọn khuyến nghị, đổi được ở API:

- **Chỉ báo cho bản hiện hành**, vì tìm trong nội dung chỉ đọc bản hiện hành. Lỗi ở phiên bản cũ không ảnh hưởng người tìm.
- **Trạng thái suy ra từ đúng điều kiện worker dùng**: `INDEXED` (số trang có chữ, có bị cắt không), `PENDING` (worker sẽ còn thử), `FAILED` (đã thử 3 lần), `NO_TEXT` (PDF scan, không có lớp chữ), `COPY_RESTRICTED`, `UNAVAILABLE` (PDF chưa SAFE). Không thêm cột hay migration.
- **"Lập chỉ mục lại" chỉ dành cho `FAILED`**: đặt lại số lần thử về 0, worker thử lại trong khoảng một phút. File, trạng thái quét và trạng thái duyệt không đổi. Mỗi lần ghi `TEXT_INDEX_RETRIED` vào `audit_events`.

### API

- `GET /api/v1/admin/materials` và `GET /api/v1/admin/materials/:id` có thêm `textIndex` (null nếu chưa có bản công bố).
- `GET /api/v1/admin/materials?textIndex=FAILED` chỉ trả tài liệu có bản hiện hành lập chỉ mục lỗi. Giá trị khác trả 400.
- `POST /api/v1/admin/materials/:id/text-index`: chỉ ADMIN còn hoạt động. Trả 409 `TEXT_INDEX_NOT_FAILED` nếu bản hiện hành không ở trạng thái lỗi. Hàng `file_text` được khóa `FOR UPDATE` trước khi kiểm tra.

### Giao diện

- Trang đầu admin có mục **Lập chỉ mục chữ lỗi**: số tài liệu lỗi, 5 tài liệu gần nhất và link **Xem và lập chỉ mục lại**.
- Quản lý học liệu có bộ lọc **Tìm trong nội dung → Lập chỉ mục chữ lỗi**. Link từ trang đầu mở sẵn bộ lọc này qua `?textIndex=FAILED`. Hàng lỗi có nhãn đỏ.
- Chi tiết tài liệu có dòng **Tìm trong nội dung** mô tả trạng thái, kèm nút **Lập chỉ mục lại** khi lỗi.

## ROLE-01: phần còn sót

- **Email xác nhận đăng ký** vẫn ghi "chọn vai trò sinh viên hoặc giảng viên". Nay ghi "hoàn tất đăng ký tài khoản sinh viên: nhập tên và đặt mật khẩu".
- **Ba kiểm chứng cần Docker** trước đây chưa chạy lại sau khi bỏ vai trò giảng viên. Đã chạy ở mục bên dưới, đều đạt.
- **Database dev** đã có đủ 34 migration (`db:migrate` báo không còn migration chờ).

## Kiểm chứng local

Windows, Node 24.19.0, pnpm 11.25.0, Docker Desktop (máy ảo 3 GB), Chrome do Playwright điều khiển.

- `pnpm format:check`, `pnpm lint` (một cảnh báo có sẵn ở `pdf-text.ts`), `pnpm typecheck`, `pnpm build`: đạt.
- Unit API: 236 đạt, 2 bỏ qua, gồm `text-index-state.spec.ts` mới.
- Integration: 244 đạt, 1 bỏ qua (`pdf-worker.real`, cần bật riêng). Ca mới: lọc `FAILED`, chặn sinh viên (403), retry thành `PENDING`, retry lần hai 409, ghi audit, hết lỗi thì rời bộ lọc, đã lập chỉ mục thì báo số trang, file chưa lỗi không retry được.
- E2E `tests/search-04.spec.ts` ca mới: trang đầu admin → link → danh sách đã lọc → mở quản lý → **Lập chỉ mục lại** → trạng thái chờ, tài liệu rời danh sách lỗi. Các spec `role-home`, `materials`, `upload-03`, `auth-04` (tự đăng ký) đạt. Lượt đầu có 8 ca reader hỏng vì máy hết cổng kết nối tạm (`connect EADDRINUSE` khi proxy tới API); chạy lại riêng 8 ca đều đạt.
- **Worker thật** (`infra/compose.docx-test.yaml`, ClamAV, LibreOffice, Poppler) trên database test:
  - `PILOT_REAL=1 tests/pilot-local.spec.ts`: 5/5 đạt theo luồng sinh viên tải lên, admin duyệt.
  - `DOCX_REAL=1`, ca Word thật trong `document-upload.spec.ts`: đạt.
  - Bước lập chỉ mục chữ của SEARCH-04 chạy trọn qua worker thật lần đầu: các PDF pilot đã duyệt đều có `indexed_at`, 0 lần thử lỗi. Gồm bản 400 trang (400 trang có chữ) và bản PDF chuyển từ Word (3 trang).
- **Diễn tập OPS-02** (`infra/compose.rehearsal.yaml`: Garage thay S3, Caddy HTTPS nội bộ, `NODE_ENV=production`):
  - `rehearsal:check flow`: 13/13 đạt.
  - Sao lưu, xóa volume, khôi phục: khớp 10 trigger, 41 bảng, 55 dòng, 2 object.
  - `rehearsal:check verify`: 4/4 đạt. `doctor-files`: đủ 2 object.

Chưa kiểm chứng trên production, S3 thật hay thiết bị thật.

## Không làm trong mốc này

- **SEARCH-04**: tìm trong phiên bản cũ, khớp nguyên từ, gợi ý chính tả và xếp hạng theo tần suất từ. Đây là thay đổi cách tìm đã chốt ở SEARCH-04 (chỉ bản hiện hành, khớp chuỗi con như tìm tiêu đề), không phải lỗ hổng. Chỉ làm khi chủ dự án muốn đổi hành vi.
- **OCR, cài PWA, phiên dùng thử với người thật, OPS-02 trên môi trường thật**: đang hoãn hoặc chờ chủ dự án quyết.
