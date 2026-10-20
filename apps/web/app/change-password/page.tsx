import type { Metadata } from 'next';
import Link from 'next/link';
import { ForcedPasswordChange } from '../../components/auth/forced-password-change';

export const metadata: Metadata = { title: 'Đổi mật khẩu được cấp — HUCEScholar' };
export const dynamic = 'force-dynamic';

export default function ChangePasswordPage() {
  return (
    <div className="auth-layout login-layout">
      <a href="#doi-mat-khau" className="skip-link">
        Đến biểu mẫu đổi mật khẩu
      </a>
      <section className="auth-story" aria-label="HUCEScholar">
        <Link className="brand" href="/" aria-label="HUCEScholar — trang chủ">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>HUCEScholar</span>
        </Link>
        <div className="auth-introduction">
          <h2>
            Một bước nữa
            <br />
            trước khi vào không gian.
          </h2>
          <p>
            Mật khẩu được cấp chỉ dùng để đăng nhập lần đầu. Sau khi đổi, các phiên đăng nhập khác
            sẽ kết thúc.
          </p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="doi-mat-khau" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Đổi mật khẩu được cấp</h1>
          <ForcedPasswordChange />
        </div>
      </main>
    </div>
  );
}
