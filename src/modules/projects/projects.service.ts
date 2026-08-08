import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceMember, WorkspaceRole } from '@prisma/client';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
} from './dto';
import {
  ProjectNotFoundException,
  ProjectForbiddenException,
  ProjectStatusNotFoundException,
} from './exceptions/project.exceptions';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Project Status CRUD ───────────────────────────────────────────────────
  // Workspace oluşturulunca 3 default status otomatik eklenir.
  // Kullanıcılar bunlara ek olarak custom status ekleyebilir.
  // isSystem=true olanlar silinemez.

  async createDefaultStatuses(workspaceId: string): Promise<void> {
    await this.prisma.projectStatus.createMany({
      data: [
        {
          workspaceId,
          name: 'Active',
          color: '#22C55E',
          position: 0,
          isSystem: true,
        },
        {
          workspaceId,
          name: 'Completed',
          color: '#6366F1',
          position: 1,
          isSystem: true,
        },
        {
          workspaceId,
          name: 'Archived',
          color: '#6B7280',
          position: 2,
          isSystem: true,
        },
      ],
    });
  }

  async createStatus(
    workspaceId: string,
    member: WorkspaceMember,
    dto: CreateProjectStatusDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const count = await this.prisma.projectStatus.count({
      where: { workspaceId },
    });

    return this.prisma.projectStatus.create({
      data: {
        workspaceId,
        name: dto.name,
        color: dto.color ?? '#6B7280',
        position: count,
      },
    });
  }

  async findAllStatuses(workspaceId: string) {
    return this.prisma.projectStatus.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });
  }

  async updateStatus(
    workspaceId: string,
    statusId: string,
    member: WorkspaceMember,
    dto: UpdateProjectStatusDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const status = await this.prisma.projectStatus.findFirst({
      where: { id: statusId, workspaceId },
    });

    if (!status) throw new ProjectStatusNotFoundException();

    return this.prisma.projectStatus.update({
      where: { id: statusId },
      data: dto,
    });
  }

  async deleteStatus(
    workspaceId: string,
    statusId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const status = await this.prisma.projectStatus.findFirst({
      where: { id: statusId, workspaceId },
    });

    if (!status) throw new ProjectStatusNotFoundException();
    if (status.isSystem) throw new ProjectForbiddenException();

    await this.prisma.projectStatus.delete({ where: { id: statusId } });
  }

  // ─── Project CRUD ──────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    member: WorkspaceMember,
    dto: CreateProjectDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const status = await this.prisma.projectStatus.findFirst({
      where: { id: dto.statusId, workspaceId },
    });

    if (!status) throw new ProjectStatusNotFoundException();

    const count = await this.prisma.project.count({ where: { workspaceId } });

    return this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        statusId: dto.statusId,
        position: count,
      },
      include: { status: true },
    });
  }

  async findAll(workspaceId: string) {
    return this.prisma.project.findMany({
      where: { workspaceId },
      include: {
        status: true,
        _count: { select: { boards: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      include: {
        status: true,
        boards: {
          orderBy: { position: 'asc' },
        },
        labels: true,
        _count: { select: { boards: true } },
      },
    });

    if (!project) throw new ProjectNotFoundException();

    return project;
  }

  async update(
    workspaceId: string,
    projectId: string,
    member: WorkspaceMember,
    dto: UpdateProjectDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    if (dto.statusId) {
      const status = await this.prisma.projectStatus.findFirst({
        where: { id: dto.statusId, workspaceId },
      });
      if (!status) throw new ProjectStatusNotFoundException();
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: dto,
      include: { status: true },
    });
  }

  async remove(
    workspaceId: string,
    projectId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    await this.prisma.project.delete({ where: { id: projectId } });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private assertRole(member: WorkspaceMember, allowed: WorkspaceRole[]): void {
    if (!allowed.includes(member.role)) {
      throw new ProjectForbiddenException();
    }
  }
}
