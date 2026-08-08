import { WorkspaceRole } from '@prisma/client';

export interface WorkspaceWithRole {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  role: WorkspaceRole;
  memberCount: number;
  createdAt: Date;
}

export interface WorkspaceDetail extends WorkspaceWithRole {
  members: WorkspaceMemberInfo[];
}

export interface WorkspaceMemberInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
}
