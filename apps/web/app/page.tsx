import { ApiStatus } from '../components/api-status';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="app-shell min-h-screen">
      <a href="#noi-dung" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <aside className="sidebar">
        <a className="brand" href="#noi-dung" aria-label="HUCEScholar — đầu trang">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>HUCEScholar</span>
        </a>
        <p className="sidebar-description">
          Không gian học liệu
          <br />
          dành cho sinh viên HUCE
        </p>
        <nav aria-label="Điều hướng trang khởi tạo">
          <a href="#ket-noi">Kết nối hệ thống</a>
          <a href="#pham-vi">Phạm vi hiện tại</a>
          <a href="#tiep-theo">Mốc tiếp theo</a>
          <Link href="/login">Đăng nhập</Link>
        </nav>
        <p className="sidebar-note">
          Dự án độc lập đang phát triển. Chưa phải hệ thống chính thức của trường.
        </p>
      </aside>
      <main id="noi-dung" tabIndex={-1} className="workspace">
        <header className="page-heading">
          <h1>HUCEScholar</h1>
          <p className="intro">Nền tảng học liệu điện tử dành cho sinh viên HUCE.</p>
          <p className="development-note">
            Bản phát triển với tài khoản, danh mục đào tạo, phân công và bản nháp học liệu.
          </p>
        </header>

        <div id="ket-noi" className="section-anchor">
          <ApiStatus />
        </div>

        <section id="pham-vi" className="content-section" aria-labelledby="scope-heading">
          <h2 id="scope-heading">Phạm vi hiện tại</h2>
          <p>Web responsive và API đã được khởi tạo theo kiến trúc đã chốt.</p>
          <p className="scope-disclosure">
            Đã có tài khoản, danh mục, phân công và bản nháp học liệu. Chưa có PDF được công bố.
          </p>
          <dl className="scope-list">
            <div>
              <dt>Thiết bị</dt>
              <dd>Máy tính, điện thoại và máy tính bảng dùng chung giao diện web.</dd>
            </div>
            <div>
              <dt>Dữ liệu</dt>
              <dd>
                PostgreSQL đã có migration và lưu tài khoản, phiên đăng nhập. Quyền truy cập được
                kiểm tra tại API.
              </dd>
            </div>
            <div>
              <dt>PWA</dt>
              <dd>
                Đã có manifest cơ bản. Khả năng cài đặt trên từng thiết bị sẽ được kiểm tra ở mốc
                PWA; chưa hỗ trợ đọc offline.
              </dd>
            </div>
          </dl>
        </section>

        <section
          id="tiep-theo"
          className="content-section next-section"
          aria-labelledby="next-heading"
        >
          <h2 id="next-heading">Mốc tiếp theo: gửi duyệt và công bố</h2>
          <p>
            Bản nháp đã có upload PDF riêng tư và kiểm tra kỹ thuật. Tiếp theo là gửi kiểm duyệt,
            công bố rồi bổ sung trình đọc và ghi chú.
          </p>
          <ul className="role-list">
            <li>
              <strong>Quản trị viên</strong>
              <span>Cấp tài khoản, phân công và kiểm duyệt.</span>
            </li>
            <li>
              <strong>Giảng viên</strong>
              <span>Biên soạn và gửi công bố giáo trình.</span>
            </li>
            <li>
              <strong>Sinh viên</strong>
              <span>Tìm, đọc, ghi chú riêng và đóng góp học liệu.</span>
            </li>
          </ul>
        </section>
        <footer className="page-footer">HUCEScholar · Đang phát triển</footer>
      </main>
    </div>
  );
}
