# HUCEScholar — UI và điều hướng V2

Ngày17/10/2026. Nhánh `codex/workspace-v2-ui-navigation`, xây trên tính năng PDF/DOCX ở `77cec0a`. Phạm vi là đợt A của [kế hoạch V2](../superpowers/plans/2026-10-17-workspace-v2-ui-navigation.md), không gồm reader nâng cao hoặc API hồ sơ/cài đặt.

## Thay đổi

- Bộ tokens điều khiển: mặc định44px, form/filter48px, control radius8px, popup radius12px. Primary không còn margin-top ngầm; spacing đặt ở form/actions phù hợp. Button/link dùng cùng cách căn giữa, line-height và trạng thái focus/disabled/pending.
- `Button` nhỏ tái dùng native props/ref; `SelectField` controlled có listbox portal, keyboard/typeahead, Escape/Tab, click ngoài, selected state và định vị theo viewport/scroll. Không thêm dependency.
- Source/type ở kho, zoom và màu tô ở reader dùng SelectField. Chỉ thay UI điều khiển, giữ ba màu/CRUD/anchor và nghiệp vụ cũ. Select môn, danh mục, phân công, loại trong form upload và quản lý admin tiếp tục native; trường form dùng cùng chiều cao/radius. Popup native do browser/OS quyết định.
- Sidebar chia Học tập và nhóm công việc theo role: sinh viên3, giảng viên4, admin7 đích. Tài khoản chuyển lên header; project chuyển footer; install không nằm trong điều hướng tác vụ. `/install` và `/project` vẫn hoạt động, không triển khai cài PWA.
- Menu tài khoản dẫn route `/workspace/{role}` hiện hữu và đăng xuất; chưa có link Cài đặt không hoạt động. Profile hiện tại vẫn giữ nội dung/đường dẫn. Header dùng tên đã lấy từ API; không thêm nguồn auth hoặc quyền ở frontend.
- Giữ document-capture guards. Menu đóng không tháo DOM logout button để flow xác nhận bỏ bản nháp replay đúng thao tác. Menu mobile vẫn nhận Escape/trả focus và không đóng khi draft guard hủy rời trang.

## Inventory và ranh giới

| Surface | Điều khiển chuẩn hóa | Popup |
| --- | --- | --- |
| Kho học liệu | Search/course/source/type/submit48px, action/link44px | Source/type custom; course native |
| Reader | Page/zoom/rotate/download44px, highlight color44px | Zoom/color custom; editor ghi chú giữ nguyên |
| Upload PDF/DOCX và notes | Fields48px, action groups44px, bo góc chung | Form loại/môn còn native |
| Account/admin/catalog/moderation | Fields48px và actions44px, filter actions48px | Native, không refactor nghiệp vụ |
| Shared shell | Menu/account target≥44px, header/nav role-aware | Account navigation disclosure |

API, schema, private storage, scan/conversion, moderation và visibility không đổi. Giảng viên tiếp tục tự công bố; notes vẫn riêng theo owner/version/page. Chưa có tám màu, citation, tìm chữ, panel annotations toàn tài liệu, profile sửa được hoặc settings server.

## Kiểm chứng

Không coi kế hoạch hoặc ảnh chụp là bằng chứng toàn hệ thống đã chạy qua; các kết quả dưới đây là bằng chứng local của đợt UI.

- RED: geometry lệch4px, sidebar counts cũ10/7, native popup không có listbox của ứng dụng.
- Baseline unit:68/68 đạt. Sandbox ban đầu chặn mock localhost bằng EACCES; chạy lại với loopback được phép đạt, không sửa nghiệp vụ để né lỗi.
- Typecheck và web lint ban đầu đạt. Lượt UI/auth đầu19/21 đạt; hai lỗi kiểm thử do chia sẻ login quota và click trước khi account load. Tách fixture UI riêng, không nới auth limiter. Lượt tiếp20/21 đạt, lỗi còn lại do locator trùng Next route announcer; sửa locator theo nội dung lỗi.
- `pnpm test:e2e tests/workspace-ui.spec.ts --workers=1`: 8/8 đạt, gồm desktop, mobile 320/390, keyboard listbox, logout retry và emulation 200%.
- `pnpm test:e2e tests/auth.spec.ts tests/ui-refinements.spec.ts --workers=1`: 14/15 đạt; một lượt tablet bị timeout do route remount trong lúc locator click. Chạy lại riêng tablet đạt, và sau khi giữ navigation ổn định trong loading thì case tablet đạt lại.
- `pnpm test:e2e tests/ui-refinements.spec.ts --grep "narrow" --workers=1 --repeat-each=2`: 2/2 đạt.
- `pnpm test:e2e tests/materials.spec.ts --grep "student searches the library|private PDF text highlights survive retry|dirty logout confirms" --workers=1`: 2/3 đạt. Luồng đọc PDF và dirty logout đạt; test highlight riêng còn flaky ở bước browser selection không tạo được candidate anchor, không phải lỗi popup/menu mới.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `git diff --check`: đạt sau lần sửa cuối. Playwright Chromium runtime được cài local để chạy browser tests.
- Full browser parallel trước đó đạt 85 test và có 6 lỗi; các lỗi gồm login contention khi chạy nhiều worker, PDF selection race và logout retry mobile. Logout retry và navigation loading đã được sửa; không nới auth limiter.
- Detector chạy một lần:22 advisory, không có anti-pattern mức khác. Chủ yếu so palette/type production với DESIGN lịch sử; màu mới được mô tả trong shell brief, không ghi đè wireframe.

Ảnh local trong `.impeccable/review/workspace-v2/`, Git bỏ qua. Review ảnh có desktop1440 và mobile320; đợt xác nhận thêm390. Zoom2x là emulation viewport720CSSpx/deviceScaleFactor2, chưa tuyên bố thao tác zoom OS hoặc máy cảm ứng thật. Không chạy cloud/S3/pilot production trong đợt UI này.
