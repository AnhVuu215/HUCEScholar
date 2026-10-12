# Material lifecycle implementation plan

Goal: owner tạo version mới; admin bàn giao và ẩn/khôi phục an toàn. Spec: ../specs/2026-10-12-material-lifecycle-design.md. Stack Nest/Prisma/PostgreSQL, Next/React/TypeScript, pnpm; reuse controls/guards/schema.

## Tasks

- [x] TDD API version: materials integration RED, create version + latest-only list + version history + selected request history GREEN. Owner/course/revision/concurrency/retention. Commit d2fc392.
- [x] TDD API admin: list/detail/recipients/transfer/visibility/history và regression concurrency/rollback/validation/privacy RED→GREEN. Reuse shared catalog advisory/actor locks. Commit 5bb10ab.
- [x] UI RED→GREEN: owner version actions/history trong editor; admin quản lý học liệu + navigation, typed client/picker. No speculative redesign. Bounded screenshots desktop/tablet/mobile, detector một lần, finish reviewer/documenter. Owner UI 74270ee; admin UI 137deef.
- [x] Final: docs trạng thái/evidence, format/check, full integration/browser, fresh whole-branch review + fix; local runtime; push nhánh, không merge main. Bốn commit chức năng đã push; tài liệu này đi trong commit docs cuối.

## Ledger

- Baseline 8ef66df trên codex/reader-notes-progress đã push/sạch; nhánh mới codex/material-lifecycle xếp trên milestone trước, main không đổi.
- Ruling: ở checkout hiện tại trên nhánh riêng để dùng runtime/dependencies có sẵn; không cần thêm worktree hoặc hỏi lại quyền triển khai.
- Ruling: bản kế tiếp reset PDF/nguồn/quyền/download để không tự kéo giấy phép hết hạn sang phiên bản khác; copy nội dung nhận diện và môn. Chi phí: người biên soạn phải xác nhận nguồn/quyền/upload lại.
- Ruling: bàn giao xét hợp của tất cả môn trên các version (đúng BR17), không chỉ bản đang chỉnh sửa; môn lịch sử ngừng hoạt động sẽ cần admin xử lý phân công/danh mục trước.
- RED owner API: endpoint versions chưa tồn tại; GREEN 51 materials. RED admin API: routes chưa tồn tại; GREEN 56 materials. Historical-course fixture sửa để môn bị thu hồi chỉ tồn tại ở bản cũ.
- Fresh branch reviewer phát hiện P1 revision reset gây ABA giữa các phiên bản. RED `.local/lifecycle-revision-red.log`: expected successor revision5 got1; stale V1 metadata expected409 got200. Fix successor revision=predecessor+1, guard int; test stale metadata/PDF và delayed successor sau terminal V2. Publication year copy bổ sung. GREEN `.local/lifecycle-api-green.log`: 57/57. Reviewer recheck: no remaining material findings, code review only.
- Browser RED: thiếu owner action/admin link. Trong quá trình nối UI phát hiện query kind/visibility rỗng bị DTO từ chối; bỏ enum query rỗng. Một lần login ECONNRESET trong test dev watch; lần sau với source ổn định đạt. `.local/lifecycle-ui-green.log`: 2/2, gồm lost response và stale visibility recovery.
- Captures batch1 owner/admin 1440/768/360 validated; detector scoped materials một lần `[]`. Finish reviewer disposition fix: history pager mobile vượt inset. Sửa scoped wrapping/nowrap và thêm bounds assertion. Batch2 cả sáu capture validated; reviewer verdict disposition **ship** trong phạm vi fix pager: resolved, desktop/tablet không regression thấy được. Không tuyên bố verdict fix là review mới toàn surface.
- Sửa lỗi có sẵn trong capture-only library test: bỏ canvas poll bị đặt nhầm ở catalog (không có reader-stage). Normal browser flow giữ nguyên.
- `.local/lifecycle-check.log`: lint/types, 50 unit và build API/web đạt. Sau pager, final check bắt thiếu DOM.Iterable trong tool tsconfig ở test; đổi spread HTMLCollection sang Array.from, không đổi cấu hình. `.local/lifecycle-pager-recheck.log`: admin browser 1/1 đạt, không thêm capture. `.local/lifecycle-final-check.log`: lint/types, 50 unit và build API/web cuối đạt.
- `.local/lifecycle-integration.log`: **123 đạt, 1 skip có chủ ý**, 5 suite đạt và scanner thật opt-in bỏ qua. Chạy riêng với browser để tránh reset rate limiter.
- `.local/lifecycle-browser-full.log`: **48/51 đạt**; 3 fail do assertion nội dung tiến độ cũ và selector `.publication-history` không scope sau khi thêm version history. Cập nhật copy + scope region Yêu cầu duyệt, `.local/lifecycle-browser-recheck.log` `--last-failed`: **3/3 đạt**. Tổng 51 hành trình được xác nhận, không mô tả full run đầu là xanh.
- Documenter readonly kiểm tra PRODUCT, hai briefs, source/CSS và sáu captures cuối: consistent, không material contradiction; giữ root DESIGN.md/.impeccable/design.json wireframe. Không raster mới. `git diff 8ef66df -- DESIGN.md .impeccable/design.json design` rỗng.
- Format toàn workspace đạt; docs mới được format riêng. Không thêm migration/dependency và không đưa secrets/test env/captures vào Git.
- Local production build đã restart sau kiểm tra chính xác PID/port/command. API session62573, web session6928; ports3001/3000. `.local/lifecycle-runtime-smoke.json`: health/landing/login/admin materials shell200; API admin materials và owner version history chưa login401/no-store; shell authenticated route no-store/private. Không coi shell200 là xác nhận đăng nhập.
- `git push -u origin codex/material-lifecycle` đã thành công tới137deef (4 commit chức năng); không merge main. Commit docs cuối bổ sung trạng thái và bằng chứng này rồi push cùng nhánh.
