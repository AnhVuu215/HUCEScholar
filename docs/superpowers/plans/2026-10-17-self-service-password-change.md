# AUTH-01 Self-service Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Đề xuất thực hiện trực tiếp trong một nhánh, review độc lập trước khi bàn giao; không tự mở thêm task hoặc triển khai production.

**Goal:** Cho phép cả ba vai trò tự đổi mật khẩu hiện tại trên web, thu hồi phiên cũ và giữ phiên thao tác bằng cookie mới.

**Architecture:** Mở rộng AuthService/controller và limiter Redis hiện hữu; transaction PostgreSQL dùng khóa user cùng thứ tự với login/account update. Form inline dùng client API/CSRF hiện có. Không thêm bảng hoặc dependency cho AUTH-01.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Argon2id, ioredis, Next.js App Router, React, Jest/Supertest, Playwright, pnpm.

**Spec:** [2026-10-17-self-service-password-change.md](../specs/2026-10-17-self-service-password-change.md). Trạng thái: kế hoạch đề xuất, mọi checkbox chưa thực hiện.

## Global Constraints

- `newPassword`: ít nhất 16 Unicode code point, tối đa 128 đơn vị UTF-16; `currentPassword`: không rỗng, tối đa 128 đơn vị UTF-16; không trim/normalize password.
- Request auth tối đa16 KiB; response `no-store`; SessionGuard và CSRF/origin do API kiểm.
- Quota riêng 5 request/user/15 phút và 30 request/IP/15 phút; login giữ 60/IP/phút và 10/email/15 phút.
- Session mới không có hạn tuyệt đối muộn hơn session đang thay thế; cookie chỉ gửi sau commit.
- Không migration, SMTP, reset UI, force-first-change hoặc đổi mật khẩu tài khoản demo thật.
- Không log/commit password, hash/token/cookie; ảnh form trống, trace tắt.
- Giữ Next.js/NestJS hiện hữu; đọc `apps/web/AGENTS.md` và bundled Next docs trước code UI.

## Review Focus

1. Hai browser và login đồng thời với thay đổi credential: không cấp phiên từ hash cũ sau thay đổi; kiểm bằng transaction/race test ở Task 1.
2. Session hết hạn hoặc bị thu hồi khi request đang chờ khóa: kiểm lại trong transaction, dùng thời gian thực DB; Task 1.
3. Mất phản hồi sau commit: không suy ra thất bại an toàn để retry hoặc suy ra thành công từ `/auth/me`; Task 2.
4. Unicode, khoảng trắng, password manager và maxlength: giữ nguyên secret; thống nhất quy tắc validation client/API và test ranh giới; Task 1/2.
5. Fixture password bị đổi làm test sau sai ngầm: reset hash trước mỗi ca integration, tài khoản browser riêng; Task 1/2.

## Task 1 — API đổi mật khẩu nguyên tử và kiểm thử

**Files:**

- Create `apps/api/src/auth/change-password.dto.ts` — DTO, validator và mã input.
- Modify `apps/api/src/auth/auth.controller.ts` — endpoint 204 với SessionGuard.
- Modify `apps/api/src/auth/auth.service.ts` — phương thức đổi mật khẩu, helper cookie/session tối thiểu nếu cần; không sửa hợp đồng login.
- Modify `apps/api/src/auth/login-rate-limiter.ts` — thêm `checkPasswordChange(ip: string, userId: string): Promise<void>` với key `hs:password-change:*`; dùng lại Redis connection/lifecycle, không đổi key/quota login.
- Modify `apps/api/test/auth.integration.spec.ts`, `apps/api/test/auth-login-race.spec.ts`, `apps/api/test/rate-limiter.spec.ts`.
- Create `apps/api/test/password-change-race.spec.ts` — barrier có kiểm soát để tái hiện credential/session thay đổi lúc chờ khóa.

**Interfaces:**

```ts
class ChangePasswordDto {
  currentPassword!: string;
  newPassword!: string;
}
// Contract của method mới trên AuthService; không cần tạo interface này trong code.
interface PasswordChangeContract {
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    request: Request,
    response: Response,
  ): Promise<void>;
}
```

Profile JSON giữ nguyên. Không nhận userId từ request body. Rate limiter chỉ trả void hoặc ném 429/503.

- [ ] Đọc constraint timestamp trong migration hiện hữu và cookie config; đối chiếu spec trước khi viết transaction. Xác nhận không cần migration.
- [ ] Mở rộng fixture integration: giữ hash gốc trong bộ nhớ, restore `password_hash` trong beforeEach. Cleanup audit/reset-token của các user test trước khi xóa users để không vướng FK. Chỉ dùng database `_test` và Redis15 như setup hiện có.
- [ ] Viết ca integration RED dưới đây trong cùng describe hiện có, dùng `app`, `login`, `csrf`, `password`, `origin` đã được định nghĩa; `randomBytes` đã import:

```ts
it('rotates the current session and revokes another browser', async () => {
  const first = request.agent(app.getHttpServer());
  const second = request.agent(app.getHttpServer());
  expect((await login(first)).status).toBe(200);
  expect((await login(second)).status).toBe(200);
  const replacement = randomBytes(24).toString('base64url');
  await first
    .post('/api/v1/auth/change-password')
    .set('Origin', origin)
    .set('X-CSRF-Token', await csrf(first))
    .send({ currentPassword: password, newPassword: replacement })
    .expect(204);
  await first.get('/api/v1/auth/me').expect(200);
  await second.get('/api/v1/auth/me').expect(401);
  expect((await login(request.agent(app.getHttpServer()), 'STUDENT', password)).status).toBe(401);
  expect((await login(request.agent(app.getHttpServer()), 'STUDENT', replacement)).status).toBe(
    200,
  );
});
```

- [ ] Chạy targeted integration và xác nhận thất bại do endpoint chưa có, không do môi trường/credential. Từ repo root:

```powershell
pnpm --filter @hucescholar/api test:integration --runTestsByPath test/auth.integration.spec.ts -t 'rotates the current session'
```

- [ ] Viết DTO dùng `IsString`, `MinLength`, `MaxLength` và validator giới hạn UTF-16 ngay trong DTO; không Transform cho password. Test 15 ASCII bị chặn,16 ASCII được nhận,15 emoji bị chặn,64 emoji được nhận,65 emoji bị chặn vì vượt 128 đơn vị UTF-16. Controller `@Post('change-password')`, `@HttpCode(204)`, `@UseGuards(SessionGuard)` gọi method trên. CSRF global guard đã tồn tại, không tạo một bypass mới.
- [ ] Thực hiện thuật toán7 bước trong spec: verify/hash ngoài khóa → khóa user/re-read → kiểm session/time hiện hành → update hash/revision → revoke session và reset token → create session/audit → cookie sau commit. Dùng đúng schema `audit_events`, event `ACCOUNT_PASSWORD_CHANGED`, entity `USER`.
- [ ] Thêm limiter method với Lua atomic cho hai key đã hash; trả 503 khi Redis lỗi. Unit test quota 4/5/6, namespace không tiêu thụ bucket login, Redis error không fail open; không giảm limiter sản phẩm để test qua.
- [ ] Thêm các ca integration: đủ ba role; current sai; mới trùng cũ; thiếu/thừa trường; min/max và Unicode/khoảng trắng; CSRF/origin; session revoked/expired; reset token cũ bị đánh dấu; audit chỉ metadata; hạn session không tăng; không Set-Cookie khi rollback. Kiểm body lỗi không chứa input bằng so sánh boolean, không assertion in secret.
- [ ] Tạo race tests dùng barrier thay vì sleep: hai change-password; login đọc hash cũ rồi đổi; account bị khóa; session bị revoke/hết hạn trong lúc chờ; DB lỗi tại create session/audit rollback toàn transaction. Trong PostgreSQL integration, chặn bằng connection giữ row lock, phát request, thay đổi fixture rồi thả khóa; tránh dùng clock fake để che sai khác `now()`/`clock_timestamp()`.
- [ ] Chạy unit và integration, kiểm lại suite login/account cũ. Không giữ fake endpoint hoặc helper không dùng trong production.

```powershell
pnpm --filter @hucescholar/api test --runInBand
pnpm test:integration
```

- [ ] Review diff/secret, checkpoint commit phần API sau khi test đạt: `feat(auth): add transactional self-service password change`.

## Task 2 — form tài khoản và hồi quy trình duyệt

**Files:**

- Create `apps/web/components/auth/change-password-form.tsx` — form/states/focus.
- Modify `apps/web/lib/auth.ts` — `changePassword(currentPassword: string, newPassword: string): Promise<void>` lấy CSRF rồi POST, không retry.
- Modify `apps/web/components/auth/role-workspace.tsx` — đặt form trong phần tài khoản mặc định, không gắn vào mọi trang con.
- Modify `apps/web/app/globals.css` chỉ khi class hiện hữu chưa đủ; `apps/web/app/login/DESIGN_BRIEF.md` cập nhật surface tài khoản.
- Modify `scripts/test-environment.mjs` — account test riêng cho đổi mật khẩu, tách khỏi auth/materials. Fixture được khởi tạo lại bằng test setup; không dùng demo local.
- Create `tests/password-change.spec.ts` — Playwright.

**Interfaces:** helper frontend chỉ gửi hai trường DTO, dùng `csrfToken`/`apiRequest` sẵn có, timeout hiện hữu, không lưu secret. API errors phân biệt theo status/code trong spec. Component không cần biết schema, session token hoặc tự thay Profile.

- [ ] Viết RED browser cho ba vai trò với account riêng: login → mở tài khoản → đổi → thông báo thành công → trường trống → reload vẫn đăng nhập. Không assert password bằng `toHaveValue(secret)` hoặc chụp form có credential.
- [ ] Viết RED cho hai browser trước thay đổi: context còn lại gọi API mới bị401. Kiểm cookie cũ qua API; không chỉ dựa vào frontend ẩn nút.
- [ ] Thêm helper API theo contract; form có 3 label, autocomplete, xác nhận khớp và min/max; password không bị trim. Dùng primary/secondary/form-field/form-error hiện hữu.
- [ ] Form pending chống submit kép;204 xóa trường/focus status;400 định vị lỗi;401/409 xóa trường và link login. Network/timeout/5xx xóa input, hiển thị trạng thái chưa xác nhận và hướng dẫn đăng nhập lại, không tự retry.
- [ ] Viết test mất phản hồi thực sự sau commit bằng proxy route: fetch request tới API rồi abort response. Kiểm số POST là1 và form không hiển thị “đã đổi”; test server xác nhận password mới dùng được bằng account test. Thử thêm503 trước gửi, SessionGuard 401 và xung đột 409; không tự thử đăng nhập hàng loạt.
- [ ] Test pending double-click chỉ một mutation; mismatch không POST; password Unicode/khoảng trắng không bị client làm khác server; Tab/focus/error/Enter;320/360/768/1440px không tràn. Ảnh chỉ khi trường trống; trace tắt.
- [ ] Chạy browser targeted với config chuẩn. Có thể dùng config prebuilt local đã có nếu còn hợp lệ, nhưng không đưa `.local` vào source hoặc CI. Build/codegen xong trước khi chạy browser, không chạy song song với Nest watch/Next build.

```powershell
pnpm test:setup
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm exec playwright test tests/password-change.spec.ts --workers=1
```

`test:setup` chỉ được chạy sau khi xác nhận môi trường test tách biệt; lệnh này thay fixture test, không phải cách đổi mật khẩu người dùng local.

- [ ] Checkpoint commit sau khi API+UI test đạt: `feat(web): add account password change form`.

## Task 3 — kiểm chứng và bàn giao

**Files:** `README.md`, `PRODUCT.md`, `apps/web/app/project/page.tsx`, create `docs/implementation/2026-10-17-self-service-password-change.md`. Không sửa Word/prototype lịch sử.

- [ ] Ghi điều gì đã làm và giới hạn: AUTH-01 có, AUTH-02/03 chưa có; không ghi đã có reset/force-first-change chỉ vì bảng reset tồn tại.
- [ ] Chạy `pnpm format:check`, `pnpm check`, `pnpm test:integration`, `pnpm test:e2e` theo thứ tự. Nếu ca real-worker vẫn opt-in/skipped, ghi đúng; không gộp thành chứng minh scan thật.
- [ ] Kiểm rollback/cookie/limiter/race qua review độc lập; đối chiếu cả năm Review Focus. Sửa finding quan trọng rồi chạy lại phần bị ảnh hưởng.
- [ ] Smoke API chưa đăng nhập không đổi password; route private no-store; form blank trên bản build local. Không dùng tài khoản thật để “thử đổi” thay người dùng.
- [ ] Kiểm staged không secrets/generated/log/screenshot; ghi evidence local so với CI/production. Commit tài liệu; push khi được yêu cầu. Không deploy hoặc gửi email trong task này.

## Phần việc sau AUTH-01

AUTH-02 cần spec/migration riêng cho `must_change_password` và API enforcement, gồm chính sách account cũ. AUTH-03 cần SMTP, token lifecycle và delivery retry. Không mở rộng phạm vi AUTH-01 sang hai phần này giữa chừng. Đợt trải nghiệm học tập tiếp theo là LEARN-01 trong roadmap.
