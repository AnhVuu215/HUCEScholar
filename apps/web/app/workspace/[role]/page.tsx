import { notFound } from 'next/navigation';
import { RoleWorkspace } from '../../../components/auth/role-workspace';
import { roleLabels, type Role } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const key = role.toUpperCase();
  if (!Object.hasOwn(roleLabels, key) || role !== key.toLowerCase()) notFound();
  return <RoleWorkspace role={key as Role} />;
}
