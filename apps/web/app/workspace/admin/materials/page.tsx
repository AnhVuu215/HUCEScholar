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
      description="Bàn giao giảng viên và quản lý hiển thị toàn tài liệu."
      activeSection="lifecycle"
    >
      <LifecycleManagement />
    </RoleWorkspace>
  );
}
