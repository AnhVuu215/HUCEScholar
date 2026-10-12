import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { ModerationManagement } from '../../../../components/moderation/moderation-management';
export const metadata: Metadata = { title: 'Kiểm duyệt học liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function ModerationPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Kiểm duyệt học liệu"
      description="Xem yêu cầu, yêu cầu sửa, từ chối hoặc duyệt bản hiện hành."
      activeSection="moderation"
    >
      <ModerationManagement />
    </RoleWorkspace>
  );
}
