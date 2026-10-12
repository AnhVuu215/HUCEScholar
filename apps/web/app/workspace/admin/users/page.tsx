import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { UserManagement } from '../../../../components/users/user-management';

export const metadata: Metadata = { title: 'Quản lý tài khoản — HUCEScholar' };
export const dynamic = 'force-dynamic';

export default function UsersPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Quản lý tài khoản"
      description="Quản lý quyền truy cập của giảng viên và sinh viên."
      activeSection="users"
    >
      <UserManagement />
    </RoleWorkspace>
  );
}
