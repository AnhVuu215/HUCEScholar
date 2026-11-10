import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { MaterialManagement } from '../../../../components/materials/material-management';
export const metadata: Metadata = { title: 'Học liệu của tôi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function StudentMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const draft = (await searchParams).draft;
  return (
    <RoleWorkspace
      role="STUDENT"
      title="Học liệu của tôi"
      description="Tải PDF hoặc Word lên theo môn học và gửi quản trị viên duyệt."
      activeSection="materials"
    >
      <MaterialManagement
        initialDraft={
          typeof draft === 'string' && /^[1-9]\d{0,18}$/.test(draft) ? draft : undefined
        }
      />
    </RoleWorkspace>
  );
}
