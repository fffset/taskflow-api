import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { WorkspaceForbiddenException } from '../../modules/workspaces/exceptions/workspace.exceptions';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const mockContext = (
    workspaceMember: { role: WorkspaceRole } | undefined,
    requiredRoles: WorkspaceRole[] | undefined,
  ): ExecutionContext => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

    return {
      switchToHttp: () => ({
        getRequest: () => ({ workspaceMember }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  it("@Roles() işaretlenmemiş endpoint'te her zaman true dönmeli", () => {
    const context = mockContext(undefined, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('gerekli rol boş dizi ise true dönmeli', () => {
    const context = mockContext({ role: WorkspaceRole.MEMBER }, []);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('üyenin rolü gerekli roller arasındaysa true dönmeli', () => {
    const context = mockContext({ role: WorkspaceRole.MANAGER }, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('üyenin rolü gerekli roller arasında DEĞİLSE reddedilmeli (asıl güvenlik testi)', () => {
    const context = mockContext({ role: WorkspaceRole.MEMBER }, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);
    expect(() => guard.canActivate(context)).toThrow(
      WorkspaceForbiddenException,
    );
  });

  it("request'te workspaceMember yoksa (TenantGuard çalışmamış) reddedilmeli", () => {
    const context = mockContext(undefined, [WorkspaceRole.OWNER]);
    expect(() => guard.canActivate(context)).toThrow(
      WorkspaceForbiddenException,
    );
  });
});
