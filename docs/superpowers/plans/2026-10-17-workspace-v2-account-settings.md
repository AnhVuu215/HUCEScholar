# HUCEScholar V2 — Hồ sơ, bảo mật và cài đặt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Đây là kế hoạch đề xuất, chưa có chức năng mới chỉ vì checkbox tồn tại.

**Goal:** Người dùng tự sửa tên hiển thị, đổi mật khẩu và lưu tùy chọn reader thật, trong trang tài khoản rõ ràng và gọn.

**Architecture:** Module Account nhỏ cho dữ liệu self-service; Auth giữ mật khẩu/session. Profile dùng `users.revision` hiện hữu, preferences dùng bảng riêng và revision riêng. Không thay API admin hoặc biến email/role thành trường tự sửa.

**Tech Stack:** TypeScript, Next.js/React, NestJS, Prisma/PostgreSQL SQL migrations, Jest/Supertest, Playwright, pnpm.

**Spec:** [Workspace V2](../specs/2026-10-17-workspace-v2-design.md), mục tài khoản và đợt C. AUTH-01 kế thừa [spec mật khẩu](../specs/2026-10-17-self-service-password-change.md) và [plan mật khẩu](2026-10-17-self-service-password-change.md), không lập một contract mật khẩu khác.

## Global Constraints

- Scope theo session: mọi role chỉ sửa chính mình. Không nhận userId/role/email/status/phân công từ request self-service.
- Mọi mutation dùng session + CSRF/origin, transaction và response no-store. Không log password, name/email đầy đủ hoặc preferences payload không cần thiết.
- `displayName` trim, 1..150 ký tự theo validator admin hiện hữu; không thêm bio/ngày sinh/số điện thoại/mã sinh viên chưa có nhu cầu xác minh.
- Đổi tên không thu hồi phiên; đổi mật khẩu dùng AUTH-01 thu hồi phiên cũ/xoay cookie. Giữ trigger session invalidation ở migration002.
- User đang bị khóa/mất xác minh không ghi được dù đã load form trước đó; kiểm trong transaction và khóa cùng thứ tự với thao tác account hiện hữu.
- Settings ban đầu chỉ cho reader đã có hành vi tương ứng. Avatar dùng chữ cái, chưa upload ảnh. Chưa tự đổi email, tự đổi role, SMTP hoặc theme tối.

## Review Focus

1. Request chèn role/email/userId hoặc đổi ID đường dẫn → ACCOUNT-01 rejects unknown fields và owner lấy session.
2. Admin đổi user trong lúc chủ sửa tên → ACCOUNT-01 CAS409 giữ draft, đọc lại để đối chiếu.
3. Hai tab cùng tạo preferences chưa có row → PREF-01 revision0/unique user tạo một row, tab còn lại409.
4. Đổi mật khẩu commit nhưng response mất hoặc login đồng thời → AUTH-01 kiểm transaction/rotation/reconciliation theo plan cũ.
5. Settings trả response muộn sau logout/chuyển người dùng → PREF-01 abort/reset, không lộ hoặc áp dụng settings của người trước.

## Routes và file map

| File hiện có / file mới đề xuất                                                                                 | Trách nhiệm                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/api/src/account/account.module.ts`, `account.controller.ts`, `account.service.ts`, `account.dto.ts` (mới) | Profile/preferences chỉ bản thân                                                                |
| `apps/api/src/app.module.ts`                                                                                    | Đăng ký AccountModule                                                                           |
| `apps/api/src/auth/*`                                                                                           | Thực hiện AUTH-01 theo plan cũ, không copy logic sang Account                                   |
| `apps/api/prisma/schema.prisma`                                                                                 | Quan hệ users → user_preferences                                                                |
| `apps/api/prisma/migrations/202610170009_user_preferences/migration.sql` (đường dẫn dự kiến)                    | Migration mới additive; kiểm sequence trước tạo, nếu009 đã có thì dùng số tiếp theo và sửa plan |
| `apps/web/app/workspace/profile/page.tsx` (mới)                                                                 | Trang profile chung ba role                                                                     |
| `apps/web/app/workspace/settings/page.tsx` (mới)                                                                | Bảo mật và tùy chọn reader                                                                      |
| `apps/web/app/workspace/[role]/page.tsx`                                                                        | Giữ route cũ, hiển thị profile mới                                                              |
| `apps/web/components/account/account-workspace.tsx`, `profile-editor.tsx`, `reader-preferences.tsx` (mới)       | Auth-aware wrapper và các form độc lập                                                          |
| `apps/web/components/auth/workspace-profile-context.tsx` (mới)                                                  | User trong shell + cập nhật tên từ response API đã xác nhận, không làm auth store mới           |
| `apps/web/components/auth/role-workspace.tsx`, `workspace-header.tsx`                                           | Dùng profile context và menu dẫn route mới khi có                                               |
| `apps/web/lib/account.ts` (mới)                                                                                 | Decode profile/preferences; API client CSRF/no-store hiện hữu                                   |
| `apps/web/components/library/library-reader.tsx`, `reader-highlights.tsx`                                       | Áp dụng default từ preferences, không ghi đè draft/annotation cũ                                |
| `apps/api/test/account.integration.spec.ts` (mới), `schema.integration.spec.ts`                                 | Self-service/race/quyền và migration constraints                                                |
| `tests/account.spec.ts` (mới), `tests/auth.spec.ts`, `tests/users.spec.ts`                                      | Hành trình profile/settings và regression admin/auth                                            |
| `apps/web/app/workspace/profile/DESIGN_BRIEF.md`, `settings/DESIGN_BRIEF.md` (mới)                              | Mode Operate, profile/security riêng nội dung, cùng shell                                       |

`AccountWorkspace` dùng pattern xác định role từ `/auth/me` tương tự `LibraryWorkspace`, rồi render `RoleWorkspace`. Không thêm layout shell thứ hai hoặc gọi `/workspace/{role}` như endpoint sửa profile.

## Contract đề xuất

Giữ `GET /auth/me` và `Profile` hiện hữu để không phá callers. Endpoint mới trả revision cho form self-service, ID là string.

```ts
// GET /api/v1/account/profile
// PATCH cùng đường dẫn, body: { displayName: string; revision: number }
type AccountProfileResponse = {
  user: { id: string; email: string; displayName: string; role: Role; revision: number };
};

type ReaderPreferences = {
  highlightColor: HighlightColor; // 8 màu từ READ-02
  defaultZoom: 'fit-width' | '100' | '125' | '150';
  annotationPanelOpen: boolean;
};
// GET /api/v1/account/preferences
type PreferencesResponse = { preferences: ReaderPreferences; revision: number };
// PUT cùng đường dẫn; gửi toàn bộ settings để CAS rõ ràng
type PreferencesUpdate = { preferences: ReaderPreferences; revision: number };
```

- Revision user >=1; preferences revision0 nghĩa là chưa có row, GET trả defaults nhưng không tạo row. PUT revision0 tạo row revision1; đụng unique trả409, không ghi đè settings tab khác. Row có rồi update expected revision và tăng1.
- Defaults: `#FFF59D`, `fit-width`, panel đóng. Chỉ đổi mặc định cho lần mở reader/tạo highlight tiếp theo; thao tác zoom/chọn màu đang soạn vẫn ưu tiên lựa chọn hiện tại.
- Unknown fields/enum/invalid revision trả400; 401 phiên hết hạn; 409 `REVISION_CONFLICT` có UI tải lại đối chiếu, dùng quy ước API hiện hữu khi triển khai. Không trả password hash/session/reset token trong bất cứ response nào.

## Task ACCOUNT-01 — Hồ sơ dùng được cho ba role

- [ ] Viết integration GET/PATCH cho cả ba role, giả userId/email/role/status, tên rỗng/150/151, Unicode/HTML, revision cũ; khóa user giữa GET/PATCH. Assert chỉ tên thay đổi, audit không ghi content nhạy cảm.
- [ ] Implement AccountModule/controller/DTO/service, user row lock + CAS transaction, audit `SELF_PROFILE_UPDATED` bằng actor/entity ID. Tái dùng quy tắc users hiện hữu, không gọi admin update với đặc quyền giả.
- [ ] Profile layout: avatar chữ cái/tên/email/role, form tên inline, trường quản lý chỉ đọc, link tới Bảo mật. Không hiển thị số ngày học/điểm/biểu đồ giả để lấp trang.
- [ ] Thêm route `/workspace/profile`; giữ `/workspace/{role}` hiện cùng editor. Header menu trỏ canonical profile, tên shell cập nhật từ response thành công; request lỗi không làm UI giả đã lưu.
- [ ] Trạng thái pristine/dirty/saving/saved/error/409; Hủy trả tên API đã xác nhận, rời trang dirty có guard. Mất response sau PATCH không retry mù: đọc lại revision/tên rồi cho đối chiếu; không tự báo đã lưu nếu chưa xác nhận.
- [ ] Test người dùng sửa tên, refresh/login lại còn tên mới; header đồng bộ; admin đổi email/name song song gây409 và draft giữ nguyên; HTML hiển thị như text; không đổi email/role từ DevTools được.
- [ ] Chạy `pnpm test:integration`, `pnpm test:e2e tests/account.spec.ts tests/users.spec.ts`, `pnpm check`; không thêm migration cho đổi display_name.

Nghiệm thu: profile sửa được đúng phạm vi, route cũ không chết, trạng thái lưu trung thực và không nâng quyền.

## Task AUTH-01 — Đổi mật khẩu, tái sử dụng kế hoạch đã có

- [ ] Rà lại [plan AUTH-01](2026-10-17-self-service-password-change.md) với auth/session hiện hành trước làm; kế hoạch đó là nguồn chính cho policy/quota/locking. Tái dùng `POST /auth/change-password` trong plan đó, không mở `/account/password` song song.
- [ ] Đặt form Bảo mật tại `/workspace/settings`, ba trường mật khẩu hiện tại/mới/xác nhận, show/hide có nhãn, không điền sẵn credential demo. Nếu đổi vị trí form so plan cũ, cập nhật file map/link, không đổi policy âm thầm.
- [ ] Thực hiện transaction/Argon2id/limiter/rotate cookie sau commit và giữ thời hạn tuyệt đối theo plan cũ. Mật khẩu không nằm trong profile context, URL, log, storage hoặc screenshot kiểm thử.
- [ ] Nghiệm thu tối thiểu: sai current password, new same as current, CSRF/origin sai, quota, user bị khóa, login đồng thời, mất response, session khác bị thu hồi và phiên thao tác đúng cookie mới.
- [ ] Chạy đầy đủ lệnh/tests trong plan AUTH-01, thêm navigation/dirty state từ settings. Cập nhật PRODUCT và mốc triển khai chỉ khi có kết quả thật.

## Task PREF-01 — Cài đặt reader có tác dụng thật

- [ ] Tạo migration SQL additive `user_preferences`: `user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `highlight_color varchar(7)` CHECK8 màu, `default_zoom varchar(16)` CHECK4 giá trị, `annotation_panel_open boolean NOT NULL DEFAULT false`, `revision integer NOT NULL DEFAULT1 CHECK(1..2147483646)`, `updated_at timestamptz NOT NULL DEFAULT now()`. Hai trường màu/zoom có defaults như contract, NOT NULL.
- [ ] Cập nhật Prisma và tests schema: FK/CHECK mới cùng constraints/triggers/partial indexes cũ còn nguyên. Migrate database test từ schema trước và database trống; không `db push`, không backfill cài đặt giả cho mọi người.
- [ ] API GET defaults không ghi, PUT complete representation với owner từ session, khóa user rồi preferences theo thứ tự nhất quán; chỉ ghi nếu actor còn ACTIVE/verified và revision khớp. Nếu revision gần trần, trả lỗi có thể xử lý thay vì overflow.
- [ ] Integration race: hai revision0, hai revision1; chỉ một thắng, không lost update; user khác/admin không đổi row người khác; enum/field thừa bị400; rollback không có row dở dang.
- [ ] UI Settings: ba control có mô tả phạm vi “áp dụng mặc định khi mở tài liệu/tạo vùng tô mới”, Save/Hủy/khôi phục mặc định bằng thao tác rõ. Khôi phục mặc định chỉ reset draft rồi Save, không xóa annotations.
- [ ] Reader tải settings khi xác thực; request lỗi dùng defaults của phiên và thông báo nhẹ/retry, không tự ghi defaults lên server. Người dùng tương tác trước response thì không áp response muộn lên zoom/color/draft đang chỉnh. Abort/reset khi đổi account/logout.
- [ ] Tạo highlight dùng default hiện hành khi bắt đầu draft, edit highlight dùng màu bản ghi. Giữ lựa chọn mới trong draft khi settings thay đổi ở tab khác. Zoom áp lúc khởi tạo, không làm đổi progress/trang đã resume.
- [ ] Browser: login lại thấy settings, profile khác thấy defaults riêng; lưu lỗi giữ draft, 409 có đối chiếu; settings thay đổi không recolor note cũ. Test PDF lẫn DOCX rendition, responsive/keyboard.
- [ ] Chạy `pnpm --filter @hucescholar/api db:generate`, `pnpm test:integration`, `pnpm test:e2e tests/account.spec.ts tests/reader-v2.spec.ts`, `pnpm format:check`, `pnpm check`. Chạy migration demo chỉ trong bước triển khai đã chuẩn bị backup, không áp schema chỉ vì đang viết plan.

Nghiệm thu: tùy chọn đồng bộ đúng account, có hành vi thật, không ghi đè nội dung/annotations và không có row trùng.

## Task V2-QA — Đóng lát cắt A–C

- [ ] Chạy `pnpm format:check`, `pnpm check`, `pnpm test:integration`, `pnpm test:e2e` trên commit cuối; ghi kết quả/pass/skip đúng từng lượt. Worker thật/S3/thiết bị thật chỉ claim khi đã bật và có bằng chứng tương ứng.
- [ ] Kịch bản liền mạch: giảng viên upload/công bố → sinh viên đọc/tô hai màu/note hai trang → copy quote → đóng/mở tìm lại → sửa profile → đổi mật khẩu → cài default reader → mở tài liệu khác. API notes vẫn chỉ chủ xem được.
- [ ] Kiểm desktop/mobile viewport, keyboard, 200% zoom, nguồn chữ dài, scan không text, timeout/retry, hidden version, account khóa và CAS. Không gắn nhãn “đạt WCAG” chỉ từ screenshot.
- [ ] Cập nhật implementation notes, PRODUCT, roadmap và test evidence; ghi các IDEA chưa được chọn vẫn planned. Full pilot vẫn phụ thuộc AUTH-02/03, REPORT/OPS và môi trường thật theo roadmap trước.

## Ranh giới bàn giao

ACCOUNT-01, AUTH-01 và PREF-01 là ba PR/lát cắt riêng. Database migration chỉ thuộc PREF-01; AUTH-02 buộc đổi lần đầu là task khác, không thêm cờ và ép tài khoản cũ đổi trong PR profile. Các lựa chọn cá nhân không đổi quyền truy cập hoặc mở thêm quyền công bố.
