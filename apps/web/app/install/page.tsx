import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallGuide } from '../../components/pwa/install-guide';

export const metadata: Metadata = { title: 'Cài ứng dụng — HUCEScholar' };

export default function InstallPage() {
  return (
    <div className="auth-layout">
      <a className="skip-link" href="#cai-ung-dung">
        Đến hướng dẫn cài đặt
      </a>
      <aside className="auth-story" aria-label="HUCEScholar">
        <Link className="brand" href="/">
          HUCEScholar
        </Link>
        <div className="auth-introduction">
          <h2>
            Không gian học liệu,
            <br />
            ngay trên màn hình chính.
          </h2>
          <p>
            Mở HUCEScholar như một ứng dụng trên thiết bị hỗ trợ, với cùng tài khoản và tài liệu của
            bạn.
          </p>
          <p className="auth-progress">PDF và ghi chú vẫn cần kết nối mạng.</p>
        </div>
        <p className="auth-foot">
          Dự án độc lập dành cho cộng đồng HUCE. Chưa phải hệ thống chính thức của trường.
        </p>
      </aside>
      <main id="cai-ung-dung" className="auth-main" tabIndex={-1}>
        <div className="auth-box install-box">
          <h1>Cài HUCEScholar trên thiết bị</h1>
          <InstallGuide />
          <Link className="project-link" href="/login">
            Đăng nhập để bắt đầu
          </Link>
          <br />
          <Link className="project-link" href="/">
            Về trang chủ
          </Link>
        </div>
      </main>
    </div>
  );
}
