'use client';
import type { ReactNode } from 'react';
import { LibraryWorkspace } from '../library/library-workspace';
export function AccountWorkspace({
  children,
  settings = false,
}: {
  children: ReactNode;
  settings?: boolean;
}) {
  return (
    <LibraryWorkspace
      title={settings ? 'Cài đặt' : 'Hồ sơ của tôi'}
      description={
        settings
          ? 'Bảo mật tài khoản và mặc định khi đọc học liệu.'
          : 'Cập nhật tên hiển thị. Email và vai trò do quản trị viên quản lý.'
      }
      account
    >
      {children}
    </LibraryWorkspace>
  );
}
