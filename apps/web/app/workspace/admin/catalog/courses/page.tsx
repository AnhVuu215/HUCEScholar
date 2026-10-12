import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../../components/auth/role-workspace';
import { CatalogManagement } from '../../../../../components/academic/catalog-management';
export const metadata: Metadata = { title: 'Quản lý môn học — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function CoursesPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Danh mục đào tạo"
      description="Quản lý môn học và các ngành sử dụng môn."
      activeSection="catalog"
    >
      <CatalogManagement kind="courses" />
    </RoleWorkspace>
  );
}
