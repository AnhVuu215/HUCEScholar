BEGIN;
-- AUTH-04: self-service sign-up for STUDENT and LECTURER. Step 1 mails a one-time link to the
-- address; step 2 (from the link) sets name, role and password and creates an ACTIVE account.
-- No account exists before the mailbox owner completes step 2.
CREATE TABLE hucescholar.signup_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email varchar(254) NOT NULL
    CONSTRAINT ck_signup_email CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  token_hash varchar(128) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT ck_signup_expiry CHECK (expires_at > created_at),
  CONSTRAINT ck_signup_used CHECK (used_at IS NULL OR used_at >= created_at)
);
CREATE INDEX ix_signup_email ON hucescholar.signup_tokens(email);
COMMENT ON TABLE hucescholar.signup_tokens IS
  'Token tự đăng ký một lần gửi tới email; chỉ lưu hash. Tài khoản chỉ được tạo khi dùng token.';
COMMENT ON TABLE hucescholar.users IS
  'Tài khoản nội bộ; một role chính. Admin cấp mọi role; sinh viên và giảng viên có thể tự đăng ký qua email (AUTH-04). Chưa có SSO.';
COMMENT ON COLUMN hucescholar.users.verified_at IS
  'Admin xác minh, hoặc thời điểm người tự đăng ký chứng minh giữ hộp thư (verified_by NULL)';
COMMIT;
