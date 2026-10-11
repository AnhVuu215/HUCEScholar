import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { AssignmentManagement } from '../../../../components/academic/assignment-management';
export const metadata: Metadata = { title: 'Phân công của tôi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function OwnAssignmentsPage() {
  return (
    <RoleWorkspace
      role="LECTURER"
      title="Phân công của tôi"
      description="Theo dõi các môn đang phụ trách và lịch sử phân công."
      activeSection="assignments"
    >
      <AssignmentManagement own />
    </RoleWorkspace>
  );
}
