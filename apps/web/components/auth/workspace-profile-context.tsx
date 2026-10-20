'use client';
import { createContext, useContext } from 'react';
import type { Profile } from '../../lib/auth';
export const WorkspaceProfileContext = createContext<{
  user: Profile;
  update: (user: Profile) => void;
} | null>(null);
export function useWorkspaceProfile() {
  const context = useContext(WorkspaceProfileContext);
  if (!context) throw new Error('Workspace profile provider required.');
  return context;
}
