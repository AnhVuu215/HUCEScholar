import Link from 'next/link';
import type { Role } from '../../lib/auth';
import { workspaceNavigation, type WorkspaceSection } from '../../lib/workspace-navigation';

export function WorkspaceNavigation({
  role,
  activeSection,
  onNavigate,
}: {
  role?: Role;
  activeSection?: WorkspaceSection;
  onNavigate: () => void;
}) {
  return (
    <nav
      id="workspace-navigation"
      aria-label="Điều hướng không gian"
      onClick={(event) => {
        if ((event.target as Element).closest('a')) onNavigate();
      }}
    >
      {role &&
        workspaceNavigation(role).map((group) => (
          <div className="workspace-nav-group" key={group.label}>
            <p className="workspace-nav-label">{group.label}</p>
            {group.links.map((link) => (
              <Link
                key={link.section}
                href={link.href}
                aria-current={activeSection === link.section ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
    </nav>
  );
}
