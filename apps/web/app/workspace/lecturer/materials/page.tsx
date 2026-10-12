import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { MaterialManagement } from '../../../../components/materials/material-management';
export const metadata: Metadata = { title: 'Học liệu của tôi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function LecturerMaterialsPage() {
  return (
    <RoleWorkspace
      role="LECTURER"
      title="Học liệu của tôi"
      description="Chuẩn bị bản nháp cho các môn được phân công."
      activeSection="materials"
    >
      <MaterialManagement role="LECTURER" />
    </RoleWorkspace>
  );
}
