import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupCompleteForm } from '../../../components/auth/signup-forms';

export const metadata: Metadata = { title: 'Hoàn tất đăng ký — HUCEScholar' };

export default function Page() {
  return (
    <div className="auth-layout login-layout">
      <a href="#hoan-tat-dang-ky" className="skip-link">
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
            Email đã xác nhận.
            <br />
            Còn một bước nữa.
          </h2>
          <p>Liên kết chỉ dùng được một lần. Tài khoản quản trị chỉ do quản trị viên cấp.</p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="hoan-tat-dang-ky" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Hoàn tất đăng ký</h1>
          <p className="auth-description">Nhập tên, chọn vai trò và đặt mật khẩu cho tài khoản.</p>
          <SignupCompleteForm />
          <Link className="project-link" href="/login">
            Về trang đăng nhập
          </Link>
        </div>
      </main>
    </div>
  );
}
