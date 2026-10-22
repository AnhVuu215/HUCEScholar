import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupRequestForm } from '../../components/auth/signup-forms';

export const metadata: Metadata = { title: 'Đăng ký — HUCEScholar' };

export default function Page() {
  return (
    <div className="auth-layout login-layout">
      <a href="#dang-ky" className="skip-link">
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
            Tự tạo tài khoản
            <br />
            sinh viên hoặc giảng viên.
          </h2>
          <p>Bạn xác nhận email trước, rồi mới chọn vai trò và đặt mật khẩu.</p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="dang-ky" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Đăng ký</h1>
          <p className="auth-description">
            Nhập email của bạn. Chúng tôi gửi một liên kết xác nhận; mở liên kết trong 24 giờ để
            nhập tên, chọn vai trò và đặt mật khẩu.
          </p>
          <SignupRequestForm />
          <Link className="project-link" href="/login">
            Về trang đăng nhập
          </Link>
        </div>
      </main>
    </div>
  );
}
