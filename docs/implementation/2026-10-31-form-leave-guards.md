# UX-02 — Hỏi trước khi rời các form lịch và thẻ ôn tập

Ngày 31/10/2026. Nhánh `codex/e2e-rerun-form-guards`, xây trên `main` `2351ba1` (sau PR #60).

Hai mốc trước ghi các lỗ mất dữ liệu: [STUDY-01](2026-10-21-study-cards.md) nói form tạo thẻ chưa có bước hỏi trước khi rời trang, rời reader là mất nội dung. [CAL-01](2026-10-22-study-calendar.md) nói điều tương tự về form tạo/sửa lịch. Khi rà lại còn thấy hai chỗ cùng loại: form "Lên lịch đọc/ôn" trong reader và trên trang Lịch học, việc bấm sang ô hay mục lịch khác thì form đang sửa bị thay bằng form mới mà không hỏi, và form sửa thẻ trên trang Thẻ ôn tập.

Đã chốt theo lựa chọn khuyến nghị:

- **Dùng lại `useNotesLeaveGuard`** mà ghi chú, đoạn tô, hồ sơ và cài đặt đọc đang dùng. Hook này chặn link trong ứng dụng, nút lùi/tiến của trình duyệt, nút đăng xuất và đóng/tải lại tab. Mỗi form có câu hỏi riêng. Không viết cơ chế mới.
- **Chỉ hỏi khi thật sự có thay đổi.** Mở form rồi không gõ gì thì rời trang không hỏi. Form lịch so với giá trị lúc mở; đổi "Chỉ buổi này/Cả chuỗi" chỉ nạp lại ngày giờ của phạm vi đó nên không tính là sửa. Form "Lên lịch đọc" chỉ tính khi ngày, giờ hoặc thời lượng khác mặc định.
- **"Hủy" là bỏ có chủ ý**, không hỏi lại. Form thẻ ôn tập và form "Lên lịch đọc" nay xóa nội dung khi Hủy, mở lại thì bắt đầu từ trống hoặc mặc định. Trước đây hai form này giữ nội dung đã gõ cho lần mở sau.
- Trong lúc đang lưu thì vẫn không cho rời trang, giống ghi chú.

## Hành vi

| Form | Câu hỏi khi rời trang |
| --- | --- |
| Tạo thẻ ôn tập (tab Đoạn tô trong reader) | "Bạn có thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?" |
| Sửa thẻ (trang Thẻ ôn tập) | "Bạn có thay đổi thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?" |
| Lên lịch đọc / Lên lịch ôn | "Bạn có buổi đọc chưa thêm vào lịch…" / "Bạn có buổi ôn chưa thêm vào lịch…" |
| Thêm/sửa lịch học hoặc việc cần làm | "Bạn có mục lịch chưa lưu. Rời trang và bỏ thay đổi?" |

Trên trang Lịch học, khi form đang có thay đổi mà người dùng mở mục khác, bấm vào ô trống, bấm "Thêm lịch học" hay nhấn phím `N`, trang hỏi cùng câu trên. Chọn ở lại thì form giữ nguyên nội dung. Chọn bỏ thì form mới thay vào.

Không đổi API, schema hay quyền.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`:

- Browser, `tests/ux-02.spec.ts` (mới, tài khoản `ux02` thêm vào `scripts/test-environment.mjs`): 3/3 đạt.
  - Thẻ ôn tập: form trống rời trang không hỏi; có câu hỏi thì hỏi đúng câu, chọn ở lại vẫn ở reader và giữ chữ. Lưu thẻ rồi mở trang Thẻ ôn tập thì không hỏi. Sửa đáp án trên trang đó rồi rời thì hỏi, chọn ở lại giữ chữ, chọn rời thì sang Kho học liệu.
  - Lên lịch đọc: đổi giờ rồi rời trang thì hỏi và giữ giờ; Hủy rồi rời thì không hỏi.
  - Lịch học: form mới chưa gõ thì "Thêm lịch học" lần nữa không hỏi; đã gõ tiêu đề thì cả "Thêm lịch học" lẫn link sang trang khác đều hỏi, chọn ở lại giữ tiêu đề; chọn bỏ thì form mới trống; Hủy rồi rời không hỏi.
- `ux-02`, `study-01`, `cal-01`, `cal-04`: 6/6 đạt sau khi thêm form sửa thẻ. Cả bộ e2e (`--workers=1`, trước khi thêm form sửa thẻ): 191 đạt, 8 bỏ qua, xem [QA-02](2026-10-31-e2e-rerun.md).
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt. Không đổi API nên không chạy lại integration.
- Chưa thử với trình đọc màn hình. Hộp hỏi là `window.confirm` của trình duyệt, như các form khác.

## Chưa làm

- Lượt này chỉ chặn việc rời hẳn trang, cộng với việc thay form trên trang Lịch học. Chưa rà các thao tác trong cùng trang có thể gỡ form đang sửa, ví dụ chuyển trang danh sách ở trang Thẻ ôn tập. Đổi bộ lọc của khung "Cần xem lại" nay giữ form đang mở ([hoàn thiện "Cần xem lại"](2026-10-31-review-later-complete.md)).
