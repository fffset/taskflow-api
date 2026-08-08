import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import {
  LabelNotFoundException,
  LabelForbiddenException,
} from './exceptions/label.exceptions';
import { ProjectNotFoundException } from '../projects/exceptions/project.exceptions';
import { TaskNotFoundException } from '../tasks/exceptions/task.exceptions';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Label CRUD ────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    projectId: string,
    member: WorkspaceMember,
    dto: CreateLabelDto,
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

    return this.prisma.label.create({
      data: {
        projectId,
        name: dto.name,
        color: dto.color ?? '#6B7280',
      },
    });
  }

  async findAll(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    return this.prisma.label.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
  }

  async update(
    workspaceId: string,
    projectId: string,
    labelId: string,
    member: WorkspaceMember,
    dto: UpdateLabelDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const label = await this.prisma.label.findFirst({
      where: { id: labelId, projectId, project: { workspaceId } },
    });

    if (!label) throw new LabelNotFoundException();

    return this.prisma.label.update({
      where: { id: labelId },
      data: dto,
    });
  }

  async remove(
    workspaceId: string,
    projectId: string,
    labelId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const label = await this.prisma.label.findFirst({
      where: { id: labelId, projectId, project: { workspaceId } },
    });

    if (!label) throw new LabelNotFoundException();

    await this.prisma.label.delete({ where: { id: labelId } });
  }

  // ─── Task Label ────────────────────────────────────────────────────────────

  async addToTask(workspaceId: string, taskId: string, labelId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    const label = await this.prisma.label.findFirst({
      where: { id: labelId, project: { workspaceId } },
    });

    if (!label) throw new LabelNotFoundException();

    // upsert — zaten ekliyse hata verme
    return this.prisma.taskLabel.upsert({
      where: { taskId_labelId: { taskId, labelId } },
      create: { taskId, labelId },
      update: {},
    });
  }

  async removeFromTask(
    workspaceId: string,
    taskId: string,
    labelId: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    await this.prisma.taskLabel.delete({
      where: { taskId_labelId: { taskId, labelId } },
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private assertRole(member: WorkspaceMember, allowed: WorkspaceRole[]): void {
    if (!allowed.includes(member.role)) {
      throw new LabelForbiddenException();
    }
  }
}
