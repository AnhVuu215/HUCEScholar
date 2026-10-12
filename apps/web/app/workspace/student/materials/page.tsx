import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { MaterialManagement } from '../../../../components/materials/material-management';
export const metadata: Metadata = { title: 'Học liệu của tôi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function StudentMaterialsPage() {
  return (
    <RoleWorkspace
      role="STUDENT"
      title="Học liệu của tôi"
      description="Chuẩn bị tài liệu bổ sung của bạn theo môn học."
      activeSection="materials"
    >
      <MaterialManagement role="STUDENT" />
    </RoleWorkspace>
  );
}
