import { Request } from 'express';
import { WorkspaceMember } from '@prisma/client';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

// Express request'ini genişletiyoruz.
// JwtAuthGuard user'ı ekliyor, TenantGuard workspaceMember'ı ekliyor.
export interface TaskflowRequest extends Request {
  user: AuthenticatedUser;
  workspaceMember?: WorkspaceMember;
}
