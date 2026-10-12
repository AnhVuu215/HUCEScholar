import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../../components/auth/role-workspace';
import { CatalogManagement } from '../../../../../components/academic/catalog-management';
export const metadata: Metadata = { title: 'Quản lý khoa — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function FacultiesPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Danh mục đào tạo"
      description="Quản lý danh mục dùng để tổ chức học liệu."
      activeSection="catalog"
    >
      <CatalogManagement kind="faculties" />
    </RoleWorkspace>
  );
}
