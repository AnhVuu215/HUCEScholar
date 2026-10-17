# HUCEScholar V2 — UI và điều hướng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Chưa thực hiện checkbox nào; không tự tạo thread hoặc triển khai production.

**Goal:** Đồng bộ button/input/select và làm sidebar/header gọn theo vai trò, giữ mọi đường đi nghiệp vụ hiện hữu.

**Architecture:** Cải tiến CSS/tokens và thêm primitives nhỏ vào Next.js hiện có; `RoleWorkspace` vẫn chịu trách nhiệm trạng thái phiên/role, tách navigation và utility header khỏi nội dung profile. API giữ nguyên.

**Tech Stack:** TypeScript, Next.js App Router, React, CSS variables/Tailwind hiện hữu, Playwright, pnpm.

**Spec:** [Workspace V2](../specs/2026-10-17-workspace-v2-design.md), mục 2–4. Phạm vi UI-01/02, NAV-01; chỉ đề xuất.

## Global Constraints

- Đọc `apps/web/AGENTS.md` và tài liệu Next.js bundled trước code. Không sửa `design/wireframe/` hoặc ghi đè DESIGN lịch sử.
- Giữ navy/blue, tiếng Việt, 44px target tối thiểu, không icon-only mất nhãn. Chuẩn 44px, form dài 48px bằng variant rõ ràng.
- Không thêm dependency UI chỉ để bo góc. Nếu primitives hiện hữu không đủ, đánh giá một dependency truy cập được trong task UI-02 trước khi chọn; pin và ghi lý do, không tự thêm cả framework.
- Session/CSRF/API authorization giữ nguyên. Điều hướng ẩn không phải cơ chế quyền.
- Reader guard cho dirty/pending/CAS phải bao phủ link header, account menu và logout. Không bỏ guard để làm menu mượt hơn.

## Review Focus

1. Primary button margin-top làm lệch cùng hàng với select → UI-01 so sánh geometry ở toolbar thật.
2. Popup nằm sát mép hoặc dưới sticky header bị che/cắt → UI-02 kiểm collision/scroll/zoom.
3. Escape/Tab chọn nhầm, focus mất sau đóng menu → UI-02 test keyboard và lựa chọn dài.
4. Link mới/logout bỏ qua bản soạn reader → NAV-01 test đang soạn/đang lưu và Back/Forward.
5. Đường dẫn cũ hoặc role sai làm active nav sai/lộ nội dung → NAV-01 direct-load/reload/403 tests.

## File map và trách nhiệm

| File hiện có / file mới đề xuất                                               | Trách nhiệm                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/app/globals.css`                                                    | Tokens, control variants, bỏ margin ngầm, layout shell responsive   |
| `apps/web/components/ui/button.tsx` (mới)                                     | Button semantic, size/variant/pending, forward native props/ref     |
| `apps/web/components/ui/select-field.tsx` (mới)                               | Single-select popup có label/error/keyboard, không kiêm menu        |
| `apps/web/components/auth/role-workspace.tsx`                                 | Auth state, composition header/nav/content, giữ 401/403/loading     |
| `apps/web/components/auth/workspace-navigation.tsx` (mới)                     | Cấu hình nhóm/link theo role, active route                          |
| `apps/web/components/auth/workspace-header.tsx` (mới)                         | Breadcrumb ngắn, account menu, logout feedback                      |
| `apps/web/lib/workspace-navigation.ts` (mới)                                  | Route/section mapping thuần, không fetch hoặc quyết định quyền      |
| `tests/workspace-ui.spec.ts` (mới)                                            | Hình học controls, overflow, keyboard, header/nav cho 3 role        |
| `tests/materials.spec.ts`, `tests/ui-refinements.spec.ts`                     | Regression reader/guard và layout hiện hữu; không sao chép fixtures |
| `apps/web/app/workspace/library/DESIGN_BRIEF.md` và brief từng surface bị đổi | Ghi bố cục mới, ranh giới visual QA                                 |

Đầu vào navigation: `role`, current section/path và tên người đã được auth. Đầu ra: nhóm/link và utility actions; không đổi `workspacePath(role)` trong `lib/auth.ts`.

## Task UI-01 — Chuẩn hóa controls và khoảng cách

- [ ] Ghi inventory button/select/input tại kho, reader, upload, users, catalog, moderation; ghi rõ control chuẩn/form dài và kích thước hiện tại. Không biến toàn CSS thành design-system rewrite.
- [ ] Tạo tokens control-height/radius/popup-radius/gap; `Button` dùng `variant: primary|secondary|quiet|danger`, `size: default|form`, `pending?: boolean` kèm native button props. Link tiếp tục là link, có style class tương ứng; không lồng `<button>` trong `<a>`.
- [ ] Bỏ `margin-top` khỏi primary dùng chung; thêm khoảng cách ở form actions/container tương ứng. Textarea giữ chiều cao theo nội dung, không ép 44px.
- [ ] Áp dụng lát cắt đầu tại kho/reader và upload; sau đó account/admin. Loading giữ chiều rộng tránh nhảy hàng; disabled có nhãn/nguyên nhân phù hợp, focus vẫn nhìn thấy.
- [ ] Playwright đo chênh top/height ≤1 CSS px với cùng variant; test nhãn dài và 200% zoom không clip. Không snapshot mọi pixel của toàn app để kiểm một token.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e tests/workspace-ui.spec.ts`; xem batched desktop/mobile rồi sửa một đợt và xác nhận. Ghi rõ browser/viewport đã thử.

Nghiệm thu: controls cùng hàng thẳng, cùng variant cùng cỡ; khác cỡ có lý do; không thêm 16px margin trên nút inline; không tràn 320px.

## Task UI-02 — Dropdown bo góc và menu truy cập được

- [ ] Chọn một filter ngắn ở kho làm ca đầu. Contract `SelectField`: `id`, `label`, `value`, `options: {value,label,disabled?}[]`, `onChange(value)`, `disabled?`, `error?`, `hint?`, `size?`; controlled value, giữ label accessible và form behavior nếu có `name`.
- [ ] Đặc tả interaction trước component: Enter/Space mở; Arrow lên/xuống; Home/End; typeahead nhãn tiếng Việt; Enter chọn; Escape hủy/trả focus; Tab rời không trap; click ngoài đóng. Disabled options bỏ qua. Dùng select-only combobox/listbox đúng semantics; account actions dùng menu/navigation riêng.
- [ ] Popup có nền/border/radius12px, max-height/scroll, selected/focus rõ; mở lên khi mép dưới thiếu chỗ; không cắt bởi overflow ancestor, z-index có quy ước. Không thay behavior bằng div click-only.
- [ ] Viết `tests/workspace-ui.spec.ts`: keyboard chọn/chưa chọn, Escape không đổi value, Tab không kẹt, click ngoài, option dài, scroll, pending/error/retry; kiểm accessible name và focus trả đúng trigger.
- [ ] Chuyển select ngắn của kho/reader sang component. Giữ native file input, date và control khác không liên quan; môn quá dài chưa thêm search trong task này. Nếu chọn giữ native tại một surface, ghi rõ popup do OS quyết định, không tuyên bố đã bo popup đó.
- [ ] Chạy targeted e2e và `pnpm check`; ghi inventory còn native, lý do và scope. Chỉ thêm dependency nếu chứng minh cần trong bước đầu.

Nghiệm thu: trigger lẫn popup của component mới bo góc đồng nhất; touch/keyboard dùng được; select vẫn đúng giá trị sau reload/filter/back.

## Task NAV-01 — Sidebar theo công việc, header theo tài khoản

- [ ] Tách cấu hình role: 3 mục sinh viên, 4 giảng viên, 7 admin như spec; nhóm Học tập/Quản trị/Đóng góp. Không tạo `Sổ tay` riêng trước khi có trang toàn kho. Link project chuyển chân trang phụ, install bỏ khỏi primary nav.
- [ ] Tách header/account menu từ `RoleWorkspace`; header không lặp description dài và nút logout ở mỗi màn hình. Menu dẫn Hồ sơ và Cài đặt chỉ khi route đã có; trước ACCOUNT-01/PREF-01 chỉ hiện tài khoản hiện hữu và logout, không có link chết.
- [ ] Giữ `/workspace/{role}` làm tài khoản; role mismatch vẫn theo 403 hiện tại. Menu active dùng route/section rõ, không đánh dấu Tài khoản là active trên mọi route con.
- [ ] Nối guard reader cho mọi link/logout mới; thao tác đang lưu chặn rời, dirty cho lựa chọn ở lại/bỏ, logout lỗi giữ nội dung và retry. Không gửi logout trước khi người dùng chấp nhận bỏ draft.
- [ ] Desktop sidebar ổn định, header thấp, main có `min-width:0`; mobile dùng menu hiện hữu với Escape/trả focus. Giữ skip link, landmark nav/main và aria-current. Không dùng icon-only sidebar bắt người mới đoán.
- [ ] Test ba role direct-load từng route, reload, Back/Forward, auth hết hạn, lỗi profile, menu logout lỗi; kiểm link cài đặt chỉ xuất hiện khi có route. Regression admin tạo/sửa, giảng viên upload và sinh viên reader còn tới được.
- [ ] Chạy `pnpm format:check`, `pnpm check`, targeted UI + materials/browser guard; trước tích hợp chạy `pnpm test:e2e`. Cập nhật surface brief và implementation log với ảnh desktop/mobile, không claim hỗ trợ thiết bị chưa thử.

Nghiệm thu: gọn sidebar theo spec, không mất chức năng, một header tiện ích, profile cũ còn tới được, không mất bản soạn khi di chuyển.

## Bàn giao / ranh giới PR

- [ ] UI-01 commit/PR riêng, UI-02 riêng, NAV-01 riêng; liên kết bằng ID trong mô tả, không push/merge nếu chưa nằm trong yêu cầu thực hiện.
- [ ] Ghi rõ route/component đã migrate và control native còn lại. Review keyboard/guard trước mở sang reader V2.
- [ ] Test chỉ dùng tài khoản/fixture demo của môi trường test; `Playwright` hiện chạy 3100/3101, không dùng database demo ở 3000 để test phá dữ liệu.
