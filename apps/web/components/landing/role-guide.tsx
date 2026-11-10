'use client';

import { useState } from 'react';

const guides = {
  'Sinh viên': [
    ['Nhận tài khoản', 'Tự đăng ký bằng email hoặc dùng tài khoản sinh viên do quản trị viên cấp.'],
    [
      'Tìm và đọc học liệu',
      'Mở Kho học liệu, tìm theo tiêu đề hoặc tác giả và lọc theo môn. Chọn Đọc tài liệu để mở PDF.',
    ],
    [
      'Ghi chú và học tiếp',
      'Ghi chú riêng theo trang hoặc tô sáng đoạn chữ. Thư viện của tôi giữ tài liệu đã lưu và đọc gần đây.',
    ],
    [
      'Đóng góp tài liệu',
      'Mở Học liệu của tôi, tải PDF hoặc Word lên kèm nguồn và căn cứ quyền, rồi gửi duyệt. Tài liệu xuất hiện trong kho sau khi quản trị viên duyệt.',
    ],
  ],
  'Quản trị viên': [
    ['Cấp tài khoản', 'Cấp tài khoản sinh viên sau khi đối chiếu thông tin hợp lệ.'],
    [
      'Tổ chức danh mục',
      'Quản lý khoa, ngành, môn học và các liên kết để học liệu được tổ chức đúng chỗ.',
    ],
    [
      'Duyệt và sắp xếp',
      'Duyệt tài liệu sinh viên gửi ở Kiểm duyệt học liệu, rồi soạn danh sách đọc cho từng môn.',
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
