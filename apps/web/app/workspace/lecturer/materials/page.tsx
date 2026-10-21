import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { MaterialManagement } from '../../../../components/materials/material-management';
export const metadata: Metadata = { title: 'Học liệu của tôi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function LecturerMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const draft = (await searchParams).draft;
  return (
    <RoleWorkspace
      role="LECTURER"
      title="Học liệu của tôi"
      description="Upload PDF hoặc DOCX và tự công bố tài liệu cho các môn được phân công."
      activeSection="materials"
    >
      <MaterialManagement
        role="LECTURER"
        initialDraft={
          typeof draft === 'string' && /^[1-9]\d{0,18}$/.test(draft) ? draft : undefined
        }
      />
    </RoleWorkspace>
  );
}
