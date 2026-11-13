# ROLE-01 — Bỏ vai trò giảng viên

Ngày 10/11/2026. Nhánh `codex/remove-lecturer-role`, xây trên `main` `1446e59` (sau PR #76).

Quyết định của người dùng: hệ thống chỉ còn hai vai trò, **quản trị viên** và **sinh viên**. Sinh viên là người dùng chính và là người tải tài liệu lên; quản trị viên duyệt trước khi tài liệu được công bố. Danh sách đọc chuyển sang cho quản trị viên soạn.

## Đã chốt

- **Role chỉ còn `ADMIN` và `STUDENT`.** Database chặn bằng `ck_user_role`. Tự đăng ký (AUTH-04) luôn tạo tài khoản sinh viên, không còn bước chọn vai trò. Admin cấp tài khoản cũng chỉ cấp sinh viên. Tài khoản ADMIN vẫn chỉ tạo bằng script bootstrap như trước.
- **Tài khoản giảng viên cũ chuyển thành sinh viên.** Tài liệu, ghi chú, tiến độ và lịch sử của họ được giữ nguyên. Đổi role sẽ thu hồi phiên đăng nhập (trigger có sẵn), nên họ cần đăng nhập lại.
- **Mọi tài liệu đều qua admin duyệt.** Bỏ endpoint tự công bố (`POST /material-drafts/:id/publish`). Nguồn và căn cứ quyền bắt buộc với mọi bản nháp.
- **Sinh viên tải được cả PDF và Word (DOCX).** Luồng Word trước đây chỉ dành cho giảng viên (quét nguồn, chuyển sang PDF, quét PDF, xem trước) nay mở cho sinh viên. Chỉ gửi duyệt được khi bản PDF đã an toàn; với Word thì bản chuyển đổi phải sẵn sàng.
- **Bỏ phân công môn và bàn giao.** Xóa bảng `lecturer_assignments`, các endpoint `/admin/assignments`, `/lecturer/assignments`, `/admin/materials/:id/recipients` và `/admin/materials/:id/transfer`. Sinh viên gắn tài liệu với bất kỳ môn đang hoạt động nào. Admin ngừng môn trực tiếp, không còn phải thu hồi phân công trước.
- **Bỏ cột `documents.kind`.** Không còn phân biệt "học liệu giảng viên" và "tài liệu sinh viên bổ sung". Kho học liệu, trang kiểm duyệt và trang quản lý học liệu bỏ bộ lọc "Nguồn". API trả 400 nếu client cũ còn gửi tham số `kind`.
- **Dữ liệu cũ được ghi đúng.** Phiên bản giảng viên tự công bố trước ROLE-01 giữ `publication_method = LECTURER_SELF`, vì phiên bản đã công bố là bất biến và không được hiện như thể admin đã duyệt. Giao diện ghi "giảng viên tự công bố (trước khi bỏ vai trò giảng viên)". Lịch sử bàn giao cũ (`ownership_transfers`) vẫn hiện ở trang quản lý học liệu, chỉ để đọc.
- **Danh sách đọc: mỗi môn một danh sách, admin soạn.** Ràng buộc mới là `ux_reading_list_course UNIQUE (course_id)`. Admin nào cũng sửa được danh sách của môn. `owner_id` ghi người lưu gần nhất. Danh sách hiện với người đọc khi đã công bố; không còn điều kiện "giảng viên còn được phân công". Endpoint đổi từ `/courses/:id/reading-lists/mine` sang `/courses/:id/reading-lists/manage` và chỉ dành cho ADMIN. Trang soạn danh sách mới ở `/workspace/admin/reading-lists`; chỉ liệt kê các môn đã có tài liệu đọc được.
- **Hạn đọc, theo dõi môn, dấu "Đã đọc" và nhắc hạn giữ nguyên.** Thông báo đổi hạn nay ghi "Quản trị viên đặt/bỏ hạn đọc".

## Migration `202611100001_remove_lecturer_role`

Chạy theo thứ tự, trong một transaction:

1. `UPDATE users SET role='STUDENT' WHERE role='LECTURER'`, rồi thay `users_role_check` bằng `ck_user_role`.
2. Thay `protect_document_identity()` để chỉ khóa `created_by`, xóa `documents.kind` và tạo lại `ix_document_manager` trên `manager_id`.
3. Xóa bảng `lecturer_assignments`. Sự kiện audit `LECTURER_ASSIGNMENT` cũ vẫn ở `audit_events`.
4. Nếu một môn có nhiều danh sách đọc (từ nhiều giảng viên), giữ danh sách đã công bố và được sửa gần nhất; các danh sách còn lại và mục của chúng bị xóa. Sau đó đổi ràng buộc unique sang `course_id` và thêm `ix_reading_list_owner`.

Sau migration, database test còn 40 bảng, 75 FK, 133 CHECK và 19 partial index (bớt 1 bảng, 4 FK, 3 CHECK và 2 partial index). `schema.integration.spec.ts` kiểm tra các con số này.

Migration đã chạy trên database test có sẵn tài khoản giảng viên của bộ e2e: sau migration không còn role LECTURER, seed chạy lại bình thường. Database dev local cần chạy `pnpm --filter @hucescholar/api db:migrate` trước khi mở app (đã chạy trên máy dev, kiểm lại ngày 13/11).

## Giao diện

- Menu sinh viên: Học tập + Đóng góp (Học liệu của tôi). Menu admin: thay "Phân công giảng viên" bằng "Soạn danh sách đọc".
- "Học liệu của tôi" chỉ còn một luồng: chọn PDF/Word ngay trong form, lưu và tải lên, theo dõi trạng thái file, xem trước rồi **Gửi duyệt**. Bảng PDF riêng của sinh viên trước đây (`DraftPdf`) đã bỏ. Khối "Trạng thái file tài liệu" đảm nhận việc tự chờ kết quả, kiểm tra lại PDF và báo lỗi file.
- Form đăng ký và form cấp tài khoản không còn chọn vai trò.
- Landing, hướng dẫn theo vai trò và trang `/project` mô tả hai vai trò.
- Bỏ các route `/workspace/lecturer/*` và `/workspace/admin/assignments`. Design brief của trang phân công được giữ lại làm hồ sơ, có ghi chú lịch sử. Brief "Học liệu của tôi" chuyển sang `app/workspace/student/materials/`.

## Kiểm chứng local

- API: lint, typecheck, 27 bộ unit test (224 pass, 2 skip) và toàn bộ test tích hợp trên PostgreSQL/Redis test đều đạt.
- Web: lint, typecheck và `pnpm build` đạt.
- E2E Playwright (Chromium, 1 worker): toàn bộ spec đạt, 206 pass. 4 skip là các test cần bật riêng: Word thật với converter/ClamAV và pilot với corpus thật. Đã sửa `pilot-local.spec.ts`, phần upload Word thật và `rehearsal-check.mjs` theo luồng mới; ngày 13/11 đã chạy lại cả ba với Docker thật và đều đạt, xem [mốc 13/11](2026-11-13-finish-open-gaps.md).

Chưa kiểm chứng trên production hoặc thiết bị thật.
