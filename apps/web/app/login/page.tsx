import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../components/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập — HUCEScholar' };

export default function LoginPage() {
  return (
    <div className="auth-layout">
      <a href="#dang-nhap" className="skip-link">
        Đến biểu mẫu đăng nhập
      </a>
      <section className="auth-story" aria-label="HUCEScholar">
        <Link className="brand" href="/" aria-label="HUCEScholar — trang dự án">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>HUCEScholar</span>
        </Link>
        <div className="auth-introduction">
          <h2>
            Học liệu đúng chỗ.
            <br />
            Ghi chú đúng trang.
          </h2>
          <p>
            HUCEScholar hướng tới một không gian chung để tìm tài liệu theo môn, đọc và giữ lại điều
            bạn cần nhớ.
          </p>
          <p className="auth-progress">
            Bản phát triển đã có kho học liệu, trình đọc, ghi chú riêng và lịch sử phiên bản. Nội
            dung chỉ được đọc khi đủ điều kiện công bố và quyền sử dụng.
          </p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE.
          <br />
          Chưa phải hệ thống chính thức của trường.
        </p>
      </section>
      <main id="dang-nhap" className="auth-main" tabIndex={-1}>
        <div className="auth-box">
          <h1>Đăng nhập</h1>
          <p className="auth-description">
            Chào bạn trở lại. Sử dụng tài khoản đã được cấp và xác minh để vào không gian của mình.
          </p>
          <LoginForm />
          <p className="account-help">
            Chưa có tài khoản hoặc cần hỗ trợ mật khẩu? Liên hệ quản trị viên học liệu để được hỗ
            trợ.
          </p>
          <Link className="project-link" href="/project">
            Xem tiến độ dự án
          </Link>
          <br />
          <Link className="project-link" href="/install">
            Cài ứng dụng trên thiết bị
          </Link>
        </div>
      </main>
    </div>
  );
}
