'use client';

import { useState } from 'react';

const guides = {
  'Sinh viên': [
    ['Nhận tài khoản', 'Sử dụng tài khoản sinh viên đã được quản trị viên cấp và xác minh.'],
    [
      'Chuẩn bị tài liệu bổ sung',
      'Vào Học liệu của tôi, tạo bản nháp và chọn môn liên quan. Ghi rõ nguồn và căn cứ quyền sử dụng.',
    ],
    [
      'Đính kèm PDF',
      'Lưu thông tin, mở lại bản nháp rồi tải PDF lên. Bấm Cập nhật trạng thái để xem kết quả kiểm tra.',
    ],
  ],
  'Giảng viên': [
    [
      'Kiểm tra phân công',
      'Đăng nhập bằng tài khoản giảng viên, xem danh sách môn được phân công trong không gian của bạn.',
    ],
    [
      'Chuẩn bị học liệu',
      'Tạo bản nháp cho môn được phân công. Bổ sung thông tin tác giả, nguồn và căn cứ quyền sử dụng.',
    ],
    [
      'Đính kèm và kiểm tra',
      'Lưu bản nháp rồi tải PDF lên. Qua kiểm tra kỹ thuật chưa đồng nghĩa học liệu được duyệt hoặc công bố.',
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
      'Gắn giảng viên với môn học phụ trách. Chức năng kiểm duyệt và công bố sẽ được bổ sung sau.',
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
