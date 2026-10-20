BEGIN;
-- AUTH-02: accounts issued or reset by an admin must replace the temporary password.
-- Existing accounts keep false; an admin can opt them in with a password reset.
ALTER TABLE hucescholar.users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN hucescholar.users.must_change_password IS
  'TRUE khi mật khẩu do quản trị viên cấp; API chỉ cho xem hồ sơ, đổi mật khẩu và đăng xuất.';
COMMIT;
