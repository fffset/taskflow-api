import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole, WorkspaceMember } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
} from './dto';
import {
  WorkspaceWithRole,
  WorkspaceDetail,
  WorkspaceMemberInfo,
} from './interfaces/workspace-with-member.interface';
import {
  WorkspaceNotFoundException,
  WorkspaceForbiddenException,
  WorkspaceSlugTakenException,
  WorkspaceInviteInvalidException,
  WorkspaceInviteExpiredException,
} from './exceptions/workspace.exceptions';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { EmailPublisherService } from '../../queue/email-publisher.service';
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
    private readonly emailPublisher: EmailPublisherService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    const existing = await this.prisma.workspace.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) throw new WorkspaceSlugTakenException();

    // Workspace oluştur + kullanıcıyı OWNER olarak ekle (transaction)
    const workspace = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: ws.id,
          userId,
          role: WorkspaceRole.OWNER,
        },
      });

      return ws;
    });
    await this.projectsService.createDefaultStatuses(workspace.id);
    await this.tasksService.createDefaultStatuses(workspace.id);

    return {
      ...workspace,
      role: WorkspaceRole.OWNER,
      memberCount: 1,
    };
  }

  // ─── Find All (kullanıcının workspace'leri) ────────────────────────────────

  async findAll(userId: string): Promise<WorkspaceWithRole[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      logoUrl: m.workspace.logoUrl,
      description: m.workspace.description,
      role: m.role,
      memberCount: m.workspace._count.members,
      createdAt: m.workspace.createdAt,
    }));
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(
    workspaceId: string,
    member: WorkspaceMember,
  ): Promise<WorkspaceDetail> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        members: {
          include: { user: true },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { members: true } },
      },
    });

    const members: WorkspaceMemberInfo[] = workspace.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      logoUrl: workspace.logoUrl,
      description: workspace.description,
      role: member.role,
      memberCount: workspace._count.members,
      createdAt: workspace.createdAt,
      members,
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    workspaceId: string,
    member: WorkspaceMember,
    dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    // Sadece OWNER ve ADMIN güncelleyebilir
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: dto,
      include: { _count: { select: { members: true } } },
    });

    return {
      ...workspace,
      role: member.role,
      memberCount: workspace._count.members,
    };
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  // workspaces.service.ts içindeki remove() metodunu bununla değiştir

  async remove(workspaceId: string, member: WorkspaceMember): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER]);

    await this.prisma.$transaction(async (tx) => {
      const boards = await tx.board.findMany({
        where: { project: { workspaceId } },
        select: { id: true },
      });
      const boardIds = boards.map((b) => b.id);

      const tasks = await tx.task.findMany({
        where: { boardId: { in: boardIds } },
        select: { id: true },
      });
      const taskIds = tasks.map((t) => t.id);

      await tx.activityLog.deleteMany({ where: { workspaceId } });
      await tx.comment.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.taskLabel.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.task.deleteMany({ where: { boardId: { in: boardIds } } });
      await tx.label.deleteMany({ where: { project: { workspaceId } } });
      await tx.board.deleteMany({ where: { project: { workspaceId } } });

      // Project, hem TaskStatus'a değil ama ProjectStatus'a FK ile bağlı.
      // Bu yüzden Project, ProjectStatus'tan ÖNCE silinmeli.
      await tx.project.deleteMany({ where: { workspaceId } });

      await tx.taskStatus.deleteMany({ where: { workspaceId } });
      await tx.projectStatus.deleteMany({ where: { workspaceId } });
      await tx.auditLog.deleteMany({ where: { workspaceId } });
      await tx.workspaceInvite.deleteMany({ where: { workspaceId } });
      await tx.workspaceMember.deleteMany({ where: { workspaceId } });
      await tx.workspace.delete({ where: { id: workspaceId } });
    });
  }

  // ─── Invite Member ─────────────────────────────────────────────────────────

  async inviteMember(
    workspaceId: string,
    member: WorkspaceMember,
    dto: InviteMemberDto,
  ): Promise<{ token: string }> {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    if (dto.role === WorkspaceRole.OWNER) {
      this.assertRole(member, [WorkspaceRole.OWNER]);
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });

    await this.prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt,
      },
    });

    // Davet email'i — worker.queue üzerinden asenkron gönderilir.
    this.emailPublisher.publishWorkspaceInvite({
      toEmail: dto.email,
      workspaceName: workspace.name,
      inviteToken: token,
    });

    return { token };
  }

  async cancelInvite(
    workspaceId: string,
    inviteId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const invite = await this.prisma.workspaceInvite.findFirst({
      where: { id: inviteId, workspaceId, acceptedAt: null },
    });

    if (!invite) throw new WorkspaceInviteInvalidException();

    await this.prisma.workspaceInvite.delete({ where: { id: inviteId } });
  }

  async findPendingInvites(workspaceId: string, member: WorkspaceMember) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    return this.prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: new Date() }, // süresi dolmamış olanlar
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Accept Invite ─────────────────────────────────────────────────────────

  async acceptInvite(
    token: string,
    userId: string,
  ): Promise<WorkspaceWithRole> {
    const invite = await this.prisma.workspaceInvite.findUnique({
      where: { token },
      include: {
        workspace: { include: { _count: { select: { members: true } } } },
      },
    });

    if (!invite || invite.acceptedAt)
      throw new WorkspaceInviteInvalidException();
    if (invite.expiresAt < new Date())
      throw new WorkspaceInviteExpiredException();

    // Daveti kabul eden kullanıcının email'i, davetin gönderildiği email
    // ile eşleşmeli. Aksi halde herhangi biri linki ele geçirip başka
    // birinin davetiyle workspace'e sızabilir.
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new WorkspaceInviteInvalidException();
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId,
          role: invite.role,
        },
      });

      await tx.workspaceInvite.update({
        where: { token },
        data: { acceptedAt: new Date() },
      });

      return member;
    });

    return {
      id: invite.workspace.id,
      name: invite.workspace.name,
      slug: invite.workspace.slug,
      logoUrl: invite.workspace.logoUrl,
      description: invite.workspace.description,
      role: result.role,
      memberCount: invite.workspace._count.members + 1,
      createdAt: invite.workspace.createdAt,
    };
  }

  // ─── Remove Member ─────────────────────────────────────────────────────────

  async removeMember(
    workspaceId: string,
    member: WorkspaceMember,
    targetUserId: string,
  ): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    if (!target) throw new WorkspaceNotFoundException();

    // OWNER çıkarılamaz
    if (target.role === WorkspaceRole.OWNER) {
      throw new WorkspaceForbiddenException();
    }

    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
  }

  // ─── Update Member Role ────────────────────────────────────────────────────

  async updateMemberRole(
    workspaceId: string,
    member: WorkspaceMember,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ) {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });

    if (!target) throw new WorkspaceNotFoundException();

    // GÜVENLİK: OWNER'ın rolü hiçbir şekilde başkası tarafından
    // değiştirilemez — removeMember()'daki "OWNER çıkarılamaz" korumasıyla
    // simetrik. Bu kontrol olmadan, bir ADMIN gerçek OWNER'ın userId'sini
    // bulup onu sessizce MEMBER'a indirebilir ve workspace'in fiili
    // kontrolünü ele geçirebilirdi — kurbanın kendini tekrar yükseltecek
    // yetkisi de kalmazdı.
    if (target.role === WorkspaceRole.OWNER) {
      throw new WorkspaceForbiddenException();
    }

    // OWNER rolü sadece mevcut OWNER tarafından verilebilir
    if (dto.role === WorkspaceRole.OWNER) {
      this.assertRole(member, [WorkspaceRole.OWNER]);
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    return updated;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  // Discriminated union yerine basit rol kontrolü — role array'i literal tuple olarak alıyoruz
  private assertRole(member: WorkspaceMember, allowed: WorkspaceRole[]): void {
    if (!allowed.includes(member.role)) {
      throw new WorkspaceForbiddenException();
    }
  }

  // workspaces.service.ts'e eklenecek metod

  async searchMembers(workspaceId: string, query?: string) {
    return this.prisma.workspaceMember
      .findMany({
        where: {
          workspaceId,
          ...(query && {
            user: {
              name: { contains: query, mode: 'insensitive' },
            },
          }),
        },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        take: 10,
      })
      .then((members) =>
        members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl,
        })),
      );
  }
}
