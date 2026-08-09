import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, WorkspaceMember, WorkspaceRole } from '@prisma/client';
import {
  CreateTaskDto,
  UpdateTaskDto,
  MoveTaskDto,
  ReorderTasksDto,
  CreateTaskStatusDto,
  UpdateTaskStatusDto,
} from './dto';
import {
  TaskNotFoundException,
  TaskForbiddenException,
  TaskStatusNotFoundException,
} from './exceptions/task.exceptions';
import { BoardNotFoundException } from '../boards/exceptions/board.exceptions';
import { EmailPublisherService } from '../../queue/email-publisher.service';
import { WorkspaceGateway } from 'src/websocket/workspace.gateway';
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailPublisher: EmailPublisherService,
    private readonly workspaceGateway: WorkspaceGateway,
  ) {}

  // ─── Task Status CRUD ──────────────────────────────────────────────────────

  async createDefaultStatuses(workspaceId: string): Promise<void> {
    await this.prisma.taskStatus.createMany({
      data: [
        {
          workspaceId,
          name: 'Todo',
          color: '#6B7280',
          position: 0,
          isSystem: true,
        },
        {
          workspaceId,
          name: 'In Progress',
          color: '#3B82F6',
          position: 1,
          isSystem: true,
        },
        {
          workspaceId,
          name: 'In Review',
          color: '#F59E0B',
          position: 2,
          isSystem: true,
        },
        {
          workspaceId,
          name: 'Done',
          color: '#22C55E',
          position: 3,
          isSystem: true,
        },
      ],
    });
  }

  async createStatus(
    workspaceId: string,
    member: WorkspaceMember,
    dto: CreateTaskStatusDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const count = await this.prisma.taskStatus.count({
      where: { workspaceId },
    });

    return this.prisma.taskStatus.create({
      data: {
        workspaceId,
        name: dto.name,
        color: dto.color ?? '#6B7280',
        position: count,
      },
    });
  }

  async findAllStatuses(workspaceId: string) {
    return this.prisma.taskStatus.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });
  }

  async updateStatus(
    workspaceId: string,
    statusId: string,
    member: WorkspaceMember,
    dto: UpdateTaskStatusDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const status = await this.prisma.taskStatus.findFirst({
      where: { id: statusId, workspaceId },
    });

    if (!status) throw new TaskStatusNotFoundException();

    return this.prisma.taskStatus.update({
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

    const status = await this.prisma.taskStatus.findFirst({
      where: { id: statusId, workspaceId },
    });

    if (!status) throw new TaskStatusNotFoundException();
    if (status.isSystem) throw new TaskForbiddenException();

    await this.prisma.taskStatus.delete({ where: { id: statusId } });
  }

  // ─── Task CRUD ─────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    boardId: string,
    member: WorkspaceMember,
    dto: CreateTaskDto,
  ) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, project: { workspaceId } },
    });

    if (!board) throw new BoardNotFoundException();

    const status = await this.prisma.taskStatus.findFirst({
      where: { id: dto.statusId, workspaceId },
    });

    if (!status) throw new TaskStatusNotFoundException();

    // Assignee workspace üyesi mi?
    if (dto.assigneeId) {
      const assigneeMember = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: dto.assigneeId } },
      });
      if (!assigneeMember) throw new TaskNotFoundException();
    }

    const count = await this.prisma.task.count({ where: { boardId } });

    const task = await this.prisma.task.create({
      data: {
        workspaceId,
        boardId,
        title: dto.title,
        description: dto.description,
        statusId: dto.statusId,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId,
        parentId: dto.parentId,
        creatorId: member.userId,
        position: count,
      },
      include: {
        status: true,
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { subTasks: true, comments: true } },
      },
    });

    this.workspaceGateway.emitTaskCreated(workspaceId, task);

    return task;
  }

  async findAll(workspaceId: string, boardId: string) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, project: { workspaceId } },
    });

    if (!board) throw new BoardNotFoundException();

    return this.prisma.task.findMany({
      where: { boardId, parentId: null }, // sadece parent task'lar, sub-task'lar değil
      include: {
        status: true,
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
        _count: { select: { subTasks: true, comments: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: {
        status: true,
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, avatarUrl: true } },
        labels: { include: { label: true } },
        subTasks: {
          include: {
            status: true,
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { position: 'asc' },
        },
        _count: { select: { comments: true } },
      },
    });

    if (!task) throw new TaskNotFoundException();

    return task;
  }

  async update(
    workspaceId: string,
    taskId: string,
    member: WorkspaceMember,
    dto: UpdateTaskDto,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      include: { status: true },
    });

    if (!task) throw new TaskNotFoundException();

    if (dto.statusId) {
      const status = await this.prisma.taskStatus.findFirst({
        where: { id: dto.statusId, workspaceId },
      });
      if (!status) throw new TaskStatusNotFoundException();
    }

    if (dto.assigneeId) {
      const assigneeMember = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: dto.assigneeId } },
      });
      if (!assigneeMember) throw new TaskNotFoundException();
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        status: true,
        assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await this.logActivityChanges(
      workspaceId,
      taskId,
      member.userId,
      task,
      dto,
    );

    // Assignee değiştiyse ve yeni bir kişiye atandıysa (boşa alınmadıysa,
    // ve kendine atamadıysa — kendine atayan birine "sana atadın" email'i
    // göndermenin bir anlamı yok) email bildirimi tetikle.
    if (
      dto.assigneeId &&
      dto.assigneeId !== task.assigneeId &&
      dto.assigneeId !== member.userId
    ) {
      const assigner = await this.prisma.user.findUnique({
        where: { id: member.userId },
      });

      this.emailPublisher.publishTaskAssigned({
        toUserId: dto.assigneeId,
        taskTitle: updated.title,
        taskId: updated.id,
        assignedByName: assigner?.name ?? 'Bir kullanıcı',
      });
    }
    this.workspaceGateway.emitTaskUpdated(workspaceId, updated);

    return updated;
  }

  private async logActivityChanges(
    workspaceId: string,
    taskId: string,
    userId: string,
    before: { statusId: string; priority: string; assigneeId: string | null },
    changes: UpdateTaskDto,
  ): Promise<void> {
    const activities: { action: string; metadata: Record<string, unknown> }[] =
      [];

    if (changes.statusId && changes.statusId !== before.statusId) {
      activities.push({
        action: 'status_changed',
        metadata: { from: before.statusId, to: changes.statusId },
      });
    }

    if (changes.priority && changes.priority !== before.priority) {
      activities.push({
        action: 'priority_changed',
        metadata: { from: before.priority, to: changes.priority },
      });
    }

    if (
      changes.assigneeId !== undefined &&
      changes.assigneeId !== before.assigneeId
    ) {
      activities.push({
        action: 'assignee_changed',
        metadata: { from: before.assigneeId, to: changes.assigneeId },
      });
    }

    if (activities.length === 0) return;

    await this.prisma.activityLog.createMany({
      data: activities.map((a) => ({
        workspaceId,
        userId,
        taskId,
        action: a.action,
        metadata: a.metadata as Prisma.InputJsonValue,
      })),
    });
  }

  async move(workspaceId: string, taskId: string, dto: MoveTaskDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    const targetBoard = await this.prisma.board.findFirst({
      where: { id: dto.boardId, project: { workspaceId } },
    });

    if (!targetBoard) throw new BoardNotFoundException();

    const position =
      dto.position ??
      (await this.prisma.task.count({
        where: { boardId: dto.boardId },
      }));

    return this.prisma.task.update({
      where: { id: taskId },
      data: { boardId: dto.boardId, position },
      include: { status: true },
    });
  }

  async reorder(workspaceId: string, boardId: string, dto: ReorderTasksDto) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, project: { workspaceId } },
    });

    if (!board) throw new BoardNotFoundException();

    const validTaskCount = await this.prisma.task.count({
      where: { id: { in: dto.taskIds }, boardId },
    });

    if (validTaskCount !== dto.taskIds.length) {
      throw new TaskNotFoundException();
    }

    await this.prisma.$transaction(
      dto.taskIds.map((taskId, index) =>
        this.prisma.task.update({
          where: { id: taskId },
          data: { position: index },
        }),
      ),
    );

    return this.prisma.task.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: {
        status: true,
        assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async remove(
    workspaceId: string,
    taskId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    // Sadece creator veya OWNER/ADMIN silebilir
    const canDelete =
      task.creatorId === member.userId ||
      ([WorkspaceRole.OWNER, WorkspaceRole.ADMIN] as string[]).includes(
        member.role,
      );

    if (!canDelete) throw new TaskForbiddenException();

    await this.prisma.task.delete({ where: { id: taskId } });

    this.workspaceGateway.emitTaskDeleted(workspaceId, taskId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private assertRole(member: WorkspaceMember, allowed: WorkspaceRole[]): void {
    if (!allowed.includes(member.role)) {
      throw new TaskForbiddenException();
    }
  }

  async search(workspaceId: string, query: string) {
    if (!query || query.trim().length < 2) return [];

    // Kullanıcı girdisini tsquery'e vermeden önce sanitize ediyoruz.
    // PostgreSQL'in to_tsquery'si özel operatör karakterleri (& | ! ( ) : *)
    // içeren girdilerde sözdizimi hatası fırlatabilir — bu hem 500 hatasına
    // hem küçük ölçekli bir DoS'a yol açabilirdi (biri "((((" gönderip
    // sürekli hata tetikleyebilirdi). Bu karakterleri kaldırıp sadece
    // harf/rakam/boşluk bırakıyoruz.
    const sanitized = query
      .trim()
      .replace(/[&|!():*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (sanitized.length < 2) return [];

    const searchQuery = sanitized
      .split(/\s+/)
      .map((word) => `${word}:*`)
      .join(' & ');

    return this.prisma.$queryRaw`
    SELECT 
      t.id,
      t."workspaceId",
      t."boardId",
      p.id as "projectId",
      t.title,
      t.description,
      t.priority,
      t.position,
      t."dueDate",
      t."assigneeId",
      t."creatorId",
      t."parentId",
      t."statusId",
      t."createdAt",
      t."updatedAt",
      row_to_json(ts.*) as status,
      json_build_object('id', u.id, 'name', u.name, 'avatarUrl', u."avatarUrl") as assignee,
      json_build_object('id', b.id, 'name', b.name) as board
    FROM tasks t
    LEFT JOIN task_statuses ts ON t."statusId" = ts.id
    LEFT JOIN users u ON t."assigneeId" = u.id
    LEFT JOIN boards b ON t."boardId" = b.id
    LEFT JOIN projects p ON b."projectId" = p.id
    WHERE t."workspaceId" = ${workspaceId}
    AND t."searchVector" @@ to_tsquery('english', ${searchQuery})
    ORDER BY ts_rank(t."searchVector", to_tsquery('english', ${searchQuery})) DESC
    LIMIT 20
  `;
  }

  async findActivityLog(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    return this.prisma.activityLog.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
