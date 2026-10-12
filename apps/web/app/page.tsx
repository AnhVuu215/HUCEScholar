import type { Metadata } from 'next';
import Link from 'next/link';
import localFont from 'next/font/local';
import { RoleGuide } from '../components/landing/role-guide';
import './landing.css';

const landingFont = localFont({
  src: [
    { path: './fonts/be-vietnam-pro-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/be-vietnam-pro-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/be-vietnam-pro-700.ttf', weight: '700', style: 'normal' },
  ],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HUCEScholar — Học liệu đúng chỗ, vững nền kiến thức',
  description:
    'Không gian học liệu dành cho cộng đồng HUCE. Chuẩn bị bản nháp, đóng góp tài liệu và xây dựng nền tảng học tập cùng nhau.',
};

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Brand() {
  return (
    <span className="landing-brand">
      <svg width="36" height="38" viewBox="0 0 36 38" fill="none" aria-hidden="true">
        <path
          d="M5 33V5h8v11h10V5h8v28h-8V22H13v11H5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M9 29V9m18 20V9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span>
        HUCE<span className="landing-brand-light">Scholar</span>
      </span>
    </span>
  );
}

const subjects = [
  {
    title: 'Sức bền vật liệu',
    field: 'Xây dựng',
    theme: 'navy',
    subtitle: 'Từ lực tác dụng đến kết cấu bền vững',
    diagram: 'frame',
  },
  {
    title: 'Cơ học kết cấu',
    field: 'Kỹ thuật',
    theme: 'blue',
    subtitle: 'Hiểu nguyên lý. Vững phương pháp.',
    diagram: 'beam',
  },
  {
    title: 'Kiến trúc cơ sở',
    field: 'Kiến trúc',
    theme: 'sand',
    subtitle: 'Không gian bắt đầu từ một ý tưởng',
    diagram: 'plan',
  },
  {
    title: 'Toán cao cấp',
    field: 'Đại cương',
    theme: 'slate',
    subtitle: 'Nền tảng cho những bài toán lớn',
    diagram: 'axis',
  },
] as const;

function Cover({ subject }: { subject: (typeof subjects)[number] }) {
  return (
    <div className={`landing-cover cover-${subject.theme}`} aria-hidden="true">
      <span className="cover-imprint">HUCE / SCHOLAR</span>
      <strong>{subject.title}</strong>
      <svg className="cover-diagram" viewBox="0 0 180 140" fill="none">
        {subject.diagram === 'frame' && (
          <path d="M20 120V25h140v95M65 25v95m50-95v95M20 70h140M10 120h160M20 25l45 45 50-45 45 45M20 70l45 50 50-50 45 50" />
        )}
        {subject.diagram === 'beam' && (
          <path d="M12 87h156M28 87l-12 22h24L28 87Zm124 0-12 22h24l-12-22ZM45 22v46m-7-8 7 8 7-8m38-38v46m-7-8 7 8 7-8m38-38v46m-7-8 7 8 7-8M20 35h140M20 128h140m-140-6v12m140-12v12" />
        )}
        {subject.diagram === 'plan' && (
          <path d="M25 15h130v110H25V15Zm0 60h80V15m0 65v45M75 75v50m30-70h50M35 25h25v30H35V25Zm82 45h25v40h-25V70ZM12 15v110m-5-110h10M7 125h10M25 137h130" />
        )}
        {subject.diagram === 'axis' && (
          <path d="M20 115h145M42 125V15m-5 8 5-8 5 8m110 87 8 5-8 5M20 100c25-5 36-58 65-65s42 60 70 65M68 110v10m28-10v10m28-10v10M37 85h10m-10-30h10" />
        )}
      </svg>
      <span className="cover-subtitle">{subject.subtitle}</span>
      <span className="cover-edition">KHÔNG GIAN HỌC LIỆU</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className={`landing ${landingFont.className}`}>
      <a href="#noi-dung" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" aria-label="HUCEScholar — trang chủ">
            <Brand />
          </Link>
          <nav aria-label="Điều hướng trang chủ">
            <a href="#khong-gian">Không gian học tập</a>
            <a href="#huong-dan">Hướng dẫn</a>
            <a href="#cau-hoi">Câu hỏi thường gặp</a>
          </nav>
          <Link href="/login" className="landing-header-login">
            Đăng nhập <Arrow diagonal />
          </Link>
        </div>
      </header>
      <main id="noi-dung" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-container hero-layout">
            <div className="hero-copy">
              <h1 id="landing-title">
                Học liệu đúng chỗ. <span>Vững nền kiến thức.</span>
              </h1>
              <p>
                Một không gian học liệu dành cho cộng đồng HUCE. Cùng tập hợp tài liệu theo môn, giữ
                nguồn rõ ràng và chuẩn bị cho mỗi chặng đường học tập.
              </p>
              <div className="landing-actions">
                <Link href="/login" className="landing-button">
                  Đăng nhập HUCEScholar <Arrow />
                </Link>
                <a href="#khong-gian" className="landing-text-link">
                  Tìm hiểu không gian học tập <Arrow diagonal />
                </a>
              </div>
              <p className="hero-access-note">
                Phiên bản đang phát triển · Tài khoản do quản trị viên cấp
              </p>
            </div>
            <figure className="hero-shelf" aria-label="Bìa minh họa các chủ đề kỹ thuật xây dựng">
              <div className="hero-books">
                <div className="hero-book hero-book-back">
                  <Cover subject={subjects[2]} />
                </div>
                <div className="hero-book hero-book-main">
                  <Cover subject={subjects[0]} />
                </div>
                <div className="hero-book hero-book-front">
                  <Cover subject={subjects[1]} />
                </div>
              </div>
              <figcaption>Bìa minh họa · Không phải tài liệu đã công bố</figcaption>
            </figure>
          </div>
        </section>
        <div className="landing-principles">
          <div className="landing-container">
            <p>Học tập có nền tảng.</p>
            <ul>
              <li>Tài liệu theo môn</li>
              <li>Nguồn rõ ràng</li>
              <li>Đóng góp cùng nhau</li>
            </ul>
          </div>
        </div>

        <section
          id="khong-gian"
          className="landing-container landing-section"
          aria-labelledby="learning-heading"
        >
          <div className="landing-section-heading">
            <h2 id="learning-heading">
              Từ môn đại cương
              <br />
              đến đồ án chuyên ngành.
            </h2>
            <p>
              Mỗi môn học là một viên gạch trên hành trình của bạn. HUCEScholar hướng tới kết nối
              những tài liệu đang nằm rải rác thành một không gian dễ tìm, dễ học.
            </p>
          </div>
          <div className="subject-shelf">
            {subjects.map((subject) => (
              <figure className="subject-item" key={subject.title}>
                <div className="subject-cover-wrap">
                  <Cover subject={subject} />
                </div>
                <figcaption>
                  <span>{subject.field}</span>
                  <h3>{subject.title}</h3>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="landing-catalog-note">
            <p>Chưa có học liệu được công bố.</p>
            <span>Các chủ đề trên chỉ minh họa cách tổ chức học liệu trong tương lai.</span>
          </div>
        </section>

        <section className="landing-current" aria-labelledby="current-heading">
          <div className="landing-container current-layout">
            <div className="draft-demonstration">
              <div className="demo-toolbar">
                <Brand />
                <span>Bản nháp riêng</span>
              </div>
              <div className="demo-sheet">
                <p className="demo-document-title">
                  Bắt đầu từ những
                  <br />
                  trang bạn đã học.
                </p>
                <dl>
                  <div>
                    <dt>Phân loại</dt>
                    <dd>Tài liệu bổ sung</dd>
                  </div>
                  <div>
                    <dt>Môn liên quan</dt>
                    <dd>Sức bền vật liệu</dd>
                  </div>
                  <div>
                    <dt>Nguồn</dt>
                    <dd>Tài liệu tự biên soạn</dd>
                  </div>
                </dl>
                <div className="demo-file">
                  <svg width="26" height="30" viewBox="0 0 26 30" fill="none" aria-hidden="true">
                    <path
                      d="M4 2h11l7 7v19H4V2Zm11 0v8h7M8 16h10M8 21h7"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div>
                    <strong>tailieu-minhhoa.pdf</strong>
                    <span>PDF riêng tư · Đang kiểm tra</span>
                  </div>
                </div>
              </div>
              <p className="demo-caption">
                Minh họa giao diện · Không phải bản nháp của người dùng
              </p>
            </div>
            <div className="current-copy">
              <h2 id="current-heading">
                Góp một tài liệu.
                <br />
                Xây thêm một nền tảng.
              </h2>
              <p>
                Bạn đã có thể chuẩn bị học liệu của mình ngay trên web, từ máy tính, điện thoại hoặc
                máy tính bảng.
              </p>
              <ul className="current-feature-list">
                <li>
                  <strong>Bản nháp của riêng bạn</strong>
                  <span>
                    Lưu thông tin, chọn môn liên quan và ghi rõ nguồn, căn cứ quyền sử dụng.
                  </span>
                </li>
                <li>
                  <strong>PDF được kiểm tra trước</strong>
                  <span>
                    Đính kèm PDF tối đa 25 MiB vào bản nháp và theo dõi kết quả kiểm tra kỹ thuật.
                  </span>
                </li>
                <li>
                  <strong>Mỗi vai trò, một không gian</strong>
                  <span>
                    Giảng viên chuẩn bị giáo trình theo phân công. Sinh viên đóng góp tài liệu bổ
                    sung.
                  </span>
                </li>
              </ul>
              <p className="current-next">
                Đã có gửi và rút yêu cầu duyệt. Tiếp theo: admin duyệt, công bố, trình đọc PDF và
                ghi chú riêng. Cài đặt PWA sẽ được bổ sung sau.
              </p>
            </div>
          </div>
        </section>

        <section
          id="huong-dan"
          className="landing-container landing-section"
          aria-labelledby="guide-heading"
        >
          <div className="landing-section-heading guide-heading">
            <h2 id="guide-heading">Bắt đầu cùng HUCEScholar.</h2>
            <p>
              Chọn vai trò của bạn để xem những bước đầu tiên. Chỉ cần tài khoản đã được cấp và một
              trình duyệt.
            </p>
          </div>
          <RoleGuide />
        </section>
        <section
          id="cau-hoi"
          className="landing-faq landing-container"
          aria-labelledby="faq-heading"
        >
          <div>
            <h2 id="faq-heading">Bạn có thể đang thắc mắc.</h2>
            <p>Một vài điều cần biết trước khi bắt đầu.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>Làm thế nào để có tài khoản?</summary>
              <p>
                Liên hệ quản trị viên của dự án để được cấp và xác minh tài khoản. HUCEScholar chưa
                mở đăng ký tự do hoặc đăng nhập bằng tài khoản trường.
              </p>
            </details>
            <details>
              <summary>Đã đọc và ghi chú trên PDF được chưa?</summary>
              <p>
                Đã có kho học liệu và trình đọc PDF cho tài khoản được cấp. Tài liệu phải đã duyệt,
                an toàn, đang hiển thị và còn quyền sử dụng; tải bản gốc cần được cho phép riêng.
                Ghi chú riêng và lưu tiến độ đang được phát triển. Chưa có học liệu trường được cấp
                quyền thật.
              </p>
            </details>
            <details>
              <summary>Đây có phải hệ thống chính thức của trường?</summary>
              <p>
                HUCEScholar là dự án độc lập dành cho cộng đồng HUCE, chưa phải hệ thống chính thức
                của Trường Đại học Xây dựng Hà Nội. Dữ liệu sách và quyền sử dụng từ thư viện trường
                chưa được kết nối hoặc xác nhận.
              </p>
            </details>
            <details>
              <summary>Có cần tải ứng dụng về máy không?</summary>
              <p>
                Bạn sử dụng trực tiếp trên trình duyệt của máy tính, điện thoại và máy tính bảng.
                Khả năng cài đặt PWA đang được hoàn thiện; chưa có ứng dụng native hoặc hỗ trợ đọc
                PDF offline.
              </p>
            </details>
          </div>
        </section>
        <section className="landing-closing" aria-labelledby="closing-heading">
          <div className="landing-container">
            <div>
              <h2 id="closing-heading">
                Trang tiếp theo,
                <br />
                cùng nhau xây dựng.
              </h2>
              <p>Bắt đầu với một bản nháp học liệu của bạn.</p>
            </div>
            <Link href="/login" className="landing-button landing-button-light">
              Vào không gian của bạn <Arrow />
            </Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <div>
          <Link href="/" aria-label="HUCEScholar — về đầu trang">
            <Brand />
          </Link>
          <p>
            Dự án độc lập dành cho cộng đồng HUCE.
            <br />
            Chưa phải hệ thống chính thức của trường.
          </p>
        </div>
        <div className="landing-footer-links">
          <a href="#huong-dan">Hướng dẫn bắt đầu</a>
          <Link href="/project">Tiến độ dự án</Link>
          <a href="https://huce.edu.vn/" target="_blank" rel="noopener noreferrer">
            Website HUCE <Arrow diagonal />
          </a>
        </div>
        <p className="landing-copyright">HUCEScholar · Cùng xây nền kiến thức</p>
      </footer>
    </div>
  );
}
