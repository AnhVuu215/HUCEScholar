import type { Metadata } from 'next';
import Link from 'next/link';
import { RecoveryRequestForm } from '../../components/auth/recovery-forms';

export const metadata: Metadata = { title: 'Quên mật khẩu — HUCEScholar' };

export default function Page() {
  return (
    <div className="auth-layout login-layout">
      <a href="#quen-mat-khau" className="skip-link">
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
            Lấy lại quyền vào
            <br />
            không gian của bạn.
          </h2>
          <p>Liên kết đặt lại chỉ dùng được một lần và hết hạn sau 30 phút.</p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="quen-mat-khau" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Quên mật khẩu</h1>
          <p className="auth-description">
            Nhập email của tài khoản. Nếu email thuộc một tài khoản đang hoạt động, bạn sẽ nhận thư
            hướng dẫn. Tài khoản bị khóa hoặc chưa xác minh cần liên hệ quản trị viên.
          </p>
          <RecoveryRequestForm />
          <Link className="project-link" href="/login">
            Về trang đăng nhập
          </Link>
        </div>
      </main>
    </div>
  );
}
