'use client';

import { useState } from 'react';

const guides = {
  'Sinh viên': [
    ['Nhận tài khoản', 'Sử dụng tài khoản sinh viên đã được quản trị viên cấp và xác minh.'],
    [
      'Tìm và đọc học liệu',
      'Mở Kho học liệu, tìm theo tiêu đề hoặc tác giả và lọc theo môn. Chọn Đọc tài liệu để mở PDF.',
    ],
    [
      'Ghi chú và học tiếp',
      'Ghi chú riêng theo trang hoặc tô sáng đoạn chữ. Thư viện của tôi giữ tài liệu đã lưu và đọc gần đây. Muốn đóng góp tài liệu bổ sung, mở Học liệu của tôi.',
    ],
  ],
  'Giảng viên': [
    [
      'Kiểm tra phân công',
      'Đăng nhập bằng tài khoản giảng viên, xem danh sách môn được phân công trong không gian của bạn.',
    ],
    [
      'Chuẩn bị học liệu',
      'Tạo bản nháp cho môn được phân công. Không bắt buộc tài liệu HUCE; nguồn tham khảo là tùy chọn.',
    ],
    [
      'Upload và công bố',
      'Lưu bản nháp rồi tải PDF lên. Khi file quét đạt, chọn Công bố; giảng viên không cần admin duyệt.',
    ],
  ],
  'Quản trị viên': [
    ['Cấp tài khoản', 'Cấp tài khoản sinh viên và giảng viên sau khi đối chiếu thông tin hợp lệ.'],
    [
      'Tổ chức danh mục',
      'Quản lý khoa, ngành, môn học và các liên kết để học liệu được tổ chức đúng chỗ.',
    ],
    [
      'Phân công giảng viên',
      'Gắn giảng viên với môn học phụ trách. Giảng viên tự công bố; tài liệu sinh viên bổ sung vẫn qua Kiểm duyệt học liệu.',
    ],
  ],
} as const;
type Role = keyof typeof guides;

export function RoleGuide() {
  const [role, setRole] = useState<Role>('Sinh viên');
  return (
    <div className="role-guide">
      <div className="guide-switcher" role="group" aria-label="Chọn vai trò xem hướng dẫn">
        {(Object.keys(guides) as Role[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={role === item}
            aria-controls="role-guide-content"
            onClick={() => setRole(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <section
        id="role-guide-content"
        className="guide-content"
        aria-label={`Hướng dẫn ${role}`}
        aria-live="polite"
      >
        <ol>
          {guides[role].map(([title, detail]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
