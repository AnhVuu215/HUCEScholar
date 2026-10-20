import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { ReportManagement } from '../../../../components/reports/report-management';
export const metadata: Metadata = { title: 'Báo cáo tài liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function ReportsPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Báo cáo tài liệu"
      description="Xem báo cáo của người đọc, ghi kết quả và ẩn tài liệu khi cần."
      activeSection="reports"
    >
      <ReportManagement />
    </RoleWorkspace>
  );
}
