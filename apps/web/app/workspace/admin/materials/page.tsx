import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { LifecycleManagement } from '../../../../components/materials/lifecycle-management';
export const metadata: Metadata = { title: 'Quản lý học liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function MaterialsPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Quản lý học liệu"
      description="Quản lý hiển thị toàn tài liệu và xem lịch sử quản lý."
      activeSection="lifecycle"
    >
      <LifecycleManagement />
    </RoleWorkspace>
  );
}
