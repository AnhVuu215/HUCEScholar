import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../../components/auth/role-workspace';
import { CatalogManagement } from '../../../../../components/academic/catalog-management';
export const metadata: Metadata = { title: 'Quản lý ngành — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function ProgramsPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Danh mục đào tạo"
      description="Quản lý ngành và khoa phụ trách."
      activeSection="catalog"
    >
      <CatalogManagement kind="programs" />
    </RoleWorkspace>
  );
}
