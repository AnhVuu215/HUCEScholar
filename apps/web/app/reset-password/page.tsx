import type { Metadata } from 'next';
import Link from 'next/link';
import { PasswordResetForm } from '../../components/auth/recovery-forms';

export const metadata: Metadata = { title: 'Đặt mật khẩu mới — HUCEScholar' };

export default function Page() {
  return (
    <div className="auth-layout login-layout">
      <a href="#dat-mat-khau" className="skip-link">
        Đến biểu mẫu
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
            Một mật khẩu mới,
            <br />
            các phiên cũ kết thúc.
          </h2>
          <p>Sau khi đặt lại, mọi thiết bị đang đăng nhập sẽ phải đăng nhập lại.</p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="dat-mat-khau" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Đặt mật khẩu mới</h1>
          <p className="auth-description">Nhập mật khẩu mới cho tài khoản của bạn.</p>
          <PasswordResetForm />
          <Link className="project-link" href="/login">
            Về trang đăng nhập
          </Link>
        </div>
      </main>
    </div>
  );
}
