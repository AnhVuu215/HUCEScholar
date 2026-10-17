'use client';

import { useRef } from 'react';
import { useInstall, type InstallStatus } from './install-provider';

const messages: Record<InstallStatus, string> = {
  idle: 'Nếu trình duyệt hỗ trợ cài đặt, bạn có thể thêm HUCEScholar vào màn hình chính.',
  prompting: 'Đang mở hộp thoại cài đặt của trình duyệt…',
  accepted: 'Bạn đã chọn cài. Trình duyệt sẽ hoàn tất cài đặt ứng dụng.',
  dismissed: 'Bạn đã đóng hộp thoại cài đặt. Bạn vẫn có thể dùng HUCEScholar trên trình duyệt.',
  failed: 'Chưa mở được hộp thoại cài đặt. Hãy dùng menu trình duyệt theo hướng dẫn bên dưới.',
  installed: 'HUCEScholar đã được cài. Bạn có thể mở từ màn hình chính.',
  standalone: 'HUCEScholar đang được dùng dưới dạng ứng dụng.',
};

export function InstallGuide() {
  const { status, available, install } = useInstall();
  const statusRef = useRef<HTMLParagraphElement>(null);
  async function requestInstall() {
    await install();
    statusRef.current?.focus();
  }

  return (
    <section className="install-guide" aria-label="Hướng dẫn cài ứng dụng">
      <p role="status" ref={statusRef} tabIndex={-1}>
        {messages[status]}
      </p>
      {available && status !== 'installed' && status !== 'standalone' && status !== 'accepted' ? (
        <button
          className="primary-button"
          onClick={requestInstall}
          disabled={status === 'prompting'}
        >
          {status === 'prompting' ? 'Đang mở cài đặt…' : 'Cài ứng dụng'}
        </button>
      ) : null}
      <h2>Android, Chrome và Edge</h2>
      <p>
        Mở menu trình duyệt, chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính” nếu có, rồi làm
        theo hướng dẫn.
      </p>
      <h2>iPhone và iPad</h2>
      <p>
        Mở trang này trong Safari, chọn Chia sẻ → Thêm vào Màn hình chính. Tùy phiên bản, bạn có thể
        cần bật “Mở dưới dạng ứng dụng web”.
      </p>
      <h2>Nếu chưa thấy tùy chọn cài</h2>
      <p>
        Bạn vẫn dùng đầy đủ trên trình duyệt. Khả năng cài phụ thuộc thiết bị và trình duyệt; bản
        triển khai cần HTTPS.
      </p>
    </section>
  );
}
