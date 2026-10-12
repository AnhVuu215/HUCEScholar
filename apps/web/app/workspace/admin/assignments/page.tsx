import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { AssignmentManagement } from '../../../../components/academic/assignment-management';
export const metadata: Metadata = { title: 'Phân công giảng viên — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function AssignmentsPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Phân công giảng viên"
      description="Cấp và thu hồi phạm vi phụ trách môn học."
      activeSection="assignments"
    >
      <AssignmentManagement />
    </RoleWorkspace>
  );
}
