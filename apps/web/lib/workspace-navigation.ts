import type { Role } from './auth';

export type WorkspaceSection =
  | 'users'
  | 'catalog'
  | 'assignments'
  | 'materials'
  | 'moderation'
  | 'reports'
  | 'library'
  | 'lifecycle'
  | 'personal'
  | 'readingLists'
  | 'readingEditor'
  | 'study'
  | 'calendar';
export interface WorkspaceLink {
  section: WorkspaceSection;
  href: string;
  label: string;
}
export interface WorkspaceGroup {
  label: string;
  links: WorkspaceLink[];
}

export function workspaceNavigation(role: Role): WorkspaceGroup[] {
  const learning: WorkspaceGroup = {
    label: 'Học tập',
    links: [
      { section: 'library', href: '/workspace/library', label: 'Kho học liệu' },
      {
        section: 'readingLists',
        href: '/workspace/library/reading-lists',
        label: 'Danh sách đọc',
      },
      { section: 'personal', href: '/workspace/personal-library', label: 'Thư viện của tôi' },
      { section: 'study', href: '/workspace/study', label: 'Thẻ ôn tập' },
      { section: 'calendar', href: '/workspace/calendar', label: 'Lịch học' },
    ],
  };
  if (role === 'ADMIN')
    return [
      learning,
      {
        label: 'Quản trị',
        links: [
          { section: 'lifecycle', href: '/workspace/admin/materials', label: 'Quản lý học liệu' },
          {
            section: 'moderation',
            href: '/workspace/admin/moderation',
            label: 'Kiểm duyệt học liệu',
          },
          { section: 'reports', href: '/workspace/admin/reports', label: 'Báo cáo tài liệu' },
          { section: 'users', href: '/workspace/admin/users', label: 'Quản lý tài khoản' },
          {
            section: 'catalog',
            href: '/workspace/admin/catalog/faculties',
            label: 'Danh mục đào tạo',
          },
          {
            section: 'assignments',
            href: '/workspace/admin/assignments',
            label: 'Phân công giảng viên',
          },
        ],
      },
    ];
  return [
    learning,
    {
      label: role === 'LECTURER' ? 'Giảng dạy' : 'Đóng góp',
      links: [
        {
          section: 'materials',
          href: `/workspace/${role.toLowerCase()}/materials`,
          label: 'Học liệu của tôi',
        },
        ...(role === 'LECTURER'
          ? [
              {
                section: 'assignments' as const,
                href: '/workspace/lecturer/assignments',
                label: 'Phân công của tôi',
              },
              {
                section: 'readingEditor' as const,
                href: '/workspace/lecturer/reading-lists',
                label: 'Soạn danh sách đọc',
              },
            ]
          : []),
      ],
    },
  ];
}
