# AUTH-02 — Buộc đổi mật khẩu được cấp và admin cấp lại mật khẩu

Ngày 20/10/2026. Nhánh `codex/auth-02-forced-password-change`, xây trên `main` sau PR #8 (`979c76d`). Phạm vi là AUTH-02 trong [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md), tái dùng `POST /auth/change-password` của AUTH-01. Không làm SMTP, quên mật khẩu tự phục vụ (AUTH-03) hoặc chính sách hết hạn mật khẩu.

## Quyết định của chủ dự án

- **Tài khoản đang có không bị gắn cờ.** Migration thêm cột mặc định `false`; không ai bị chặn bất ngờ sau khi triển khai. Admin muốn buộc một tài khoản cũ đổi thì dùng **Cấp lại mật khẩu**.
- **Admin cấp lại mật khẩu tạm làm chung lát cắt này**, vì chưa có SMTP nên người quên mật khẩu chỉ có cách nhờ admin.

## Hành vi

- Migration additive `202610200001_must_change_password`: `users.must_change_password boolean NOT NULL DEFAULT false`. Không backfill, không đổi trigger thu hồi phiên hiện có.
- Admin **cấp tài khoản** → cờ `true`. Admin **cấp lại mật khẩu** (`POST /admin/users/{id}/password`, body `{ password, revision }`): chỉ ADMIN đang hoạt động, chỉ tài khoản giảng viên/sinh viên, CAS theo `revision` (409 khi cũ), mật khẩu 16–128 ký tự như khi cấp mới. Trong một transaction: đổi hash, bật cờ, tăng revision, vô hiệu token reset còn lại, audit `ACCOUNT_PASSWORD_RESET` (không ghi mật khẩu/hash). Trigger `tr_revoke_user_sessions` thu hồi mọi phiên khi `password_hash` đổi.
- Khi cờ bật, `SessionGuard` trả `403 { code: 'PASSWORD_CHANGE_REQUIRED' }` cho mọi route cần phiên, trừ route gắn `@AllowPendingPasswordChange()`: `GET /auth/me` và `POST /auth/change-password`. `POST /auth/logout` và `GET /auth/csrf` vốn không cần phiên. Quyền được quyết định ở API; frontend chỉ chuyển hướng.
- Đổi mật khẩu thành công tắt cờ trong cùng transaction AUTH-01 (xoay cookie, thu hồi phiên khác, giữ hạn tuyệt đối của phiên).
- Profile phiên (`/auth/login`, `/auth/me`, `/workspace/{role}`), hồ sơ `/account/profile` và danh sách admin trả thêm `mustChangePassword`. Kiểu `SessionProfile` tách khỏi `Profile` vì các tác nhân nội bộ dựng để kiểm quyền (người nhận chuyển giao, người quản lý tài liệu) không phải phiên đăng nhập.
- Web: đăng nhập với cờ bật → `/change-password`. `RoleWorkspace` gặp `PASSWORD_CHANGE_REQUIRED` cũng chuyển về đó, nên mọi URL workspace gõ trực tiếp đều dẫn về form. Trang đứng riêng (không sidebar/menu), dùng lại form AUTH-01 với nhãn **Mật khẩu được cấp**, có **Đăng xuất**. Đổi xong chuyển về `/workspace/{role}`; trang tự rời đi nếu cờ đã tắt.
- Admin: danh sách hiện **Chờ đổi mật khẩu** dưới trạng thái; mỗi tài khoản không phải ADMIN có **Cấp lại mật khẩu**. Hướng dẫn form cấp tài khoản không còn ghi “chưa hỗ trợ đổi mật khẩu”.

## Kiểm chứng

Lượt local cuối (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check` và `pnpm check` (lint, typecheck, 89 unit, build API/web): đạt.
- `pnpm test:integration`: 183 passed, 1 skipped (worker thật opt-in). Bốn ca mới trong `users.integration.spec.ts`: tài khoản được cấp chỉ gọi được `/auth/me`/đổi mật khẩu, các route khác 403 `PASSWORD_CHANGE_REQUIRED`, đổi xong tắt cờ; tài khoản chờ đổi vẫn đăng xuất được và tài khoản fixture cũ giữ `false`; cấp lại mật khẩu thu hồi phiên, mật khẩu cũ hết hiệu lực, CAS 409/400, audit đúng actor; chỉ ADMIN cấp lại được và không áp lên ADMIN.
- `pnpm test:e2e --workers=2`: 147 passed, 1 skipped (DOCX thật opt-in). `users.spec.ts` mở rộng luồng admin: cấp tài khoản → nhãn chờ đổi → đăng nhập bị đưa về `/change-password`, gõ URL workspace cũng quay về → đổi mật khẩu vào workspace → cấp lại mật khẩu tạm → đăng xuất từ trang đổi → đổi lần nữa. Ca này đặt timeout 90 giây vì có hai lần băm Argon2id; lặp 3 lần đều đạt.

Chưa kiểm chứng production, HTTPS, thiết bị thật hoặc dữ liệu HUCE thật. Bảng `docs/database/HUCEScholar_schema_postgresql.sql` là thiết kế baseline, không được cập nhật theo từng migration (giống `user_preferences`); nguồn đúng là thư mục migration.

## Còn lại

- AUTH-03 khôi phục tài khoản cần SMTP và origin HTTPS.
- Admin chưa có nút “tạo mật khẩu ngẫu nhiên”; admin tự nhập mật khẩu tạm như khi cấp tài khoản.
- Tài khoản ADMIN không bị gắn cờ và không cấp lại được qua UI; admin tự đổi ở **Cài đặt**.
