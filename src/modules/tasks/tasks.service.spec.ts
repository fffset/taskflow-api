import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import {
  TaskNotFoundException,
  TaskForbiddenException,
  TaskStatusNotFoundException,
} from './exceptions/task.exceptions';
import { BoardNotFoundException } from '../boards/exceptions/board.exceptions';
import { EmailPublisherService } from 'src/queue/email-publisher.service';
import { WorkspaceGateway } from 'src/websocket/workspace.gateway';

const mockPrisma = {
  task: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  taskStatus: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  board: {
    findFirst: jest.fn(),
  },
  workspaceMember: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};
const mockEmailPublisher = {
  publishMentionNotification: jest.fn(),
  publishTaskAssigned: jest.fn(),
  publishWorkspaceInvite: jest.fn(),
};

const mockWorkspaceGateway = {
  emitTaskCreated: jest.fn(),
  emitTaskUpdated: jest.fn(),
  emitTaskDeleted: jest.fn(),
  emitCommentAdded: jest.fn(),
};

const mockMember = (role: WorkspaceRole, userId = 'user_1') => ({
  id: 'member_1',
  workspaceId: 'ws_1',
  userId,
  role,
  joinedAt: new Date(),
});

const mockBoard = {
  id: 'board_1',
  projectId: 'project_1',
  name: 'Sprint 1',
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTaskStatus = {
  id: 'status_1',
  workspaceId: 'ws_1',
  name: 'Todo',
  color: '#6B7280',
  position: 0,
  isSystem: true,
  createdAt: new Date(),
};

const mockTask = {
  id: 'task_1',
  workspaceId: 'ws_1',
  boardId: 'board_1',
  title: 'Test Task',
  description: 'Test description',
  priority: 'HIGH',
  position: 0,
  dueDate: null,
  assigneeId: null,
  creatorId: 'user_1',
  parentId: null,
  statusId: 'status_1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailPublisherService, useValue: mockEmailPublisher },
        { provide: WorkspaceGateway, useValue: mockWorkspaceGateway },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
  });

  // ─── Task Status ──────────────────────────────────────────────────────────

  describe('createDefaultStatuses', () => {
    it('4 default status oluşturulmalı', async () => {
      mockPrisma.taskStatus.createMany.mockResolvedValue({ count: 4 });

      await service.createDefaultStatuses('ws_1');

      expect(mockPrisma.taskStatus.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Todo', isSystem: true }),
          expect.objectContaining({ name: 'In Progress', isSystem: true }),
          expect.objectContaining({ name: 'In Review', isSystem: true }),
          expect.objectContaining({ name: 'Done', isSystem: true }),
        ]),
      });
    });
  });

  describe('deleteStatus', () => {
    it("sistem status'u silinemez — 403", async () => {
      mockPrisma.taskStatus.findFirst.mockResolvedValue({
        ...mockTaskStatus,
        isSystem: true,
      });

      await expect(
        service.deleteStatus(
          'ws_1',
          'status_1',
          mockMember(WorkspaceRole.OWNER),
        ),
      ).rejects.toThrow(TaskForbiddenException);
    });

    it('MEMBER status silemez — 403', async () => {
      await expect(
        service.deleteStatus(
          'ws_1',
          'status_1',
          mockMember(WorkspaceRole.MEMBER),
        ),
      ).rejects.toThrow(TaskForbiddenException);
    });

    it('status bulunamazsa — 404', async () => {
      mockPrisma.taskStatus.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteStatus(
          'ws_1',
          'status_1',
          mockMember(WorkspaceRole.ADMIN),
        ),
      ).rejects.toThrow(TaskStatusNotFoundException);
    });
  });

  // ─── Task CRUD ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('task başarıyla oluşturulmalı', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard);
      mockPrisma.taskStatus.findFirst.mockResolvedValue(mockTaskStatus);
      mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.task.create.mockResolvedValue({
        ...mockTask,
        status: mockTaskStatus,
        assignee: null,
        creator: { id: 'user_1', name: 'Test User', avatarUrl: null },
        _count: { subTasks: 0, comments: 0 },
      });

      const result = await service.create(
        'ws_1',
        'board_1',
        mockMember(WorkspaceRole.MEMBER),
        {
          title: 'Test Task',
          statusId: 'status_1',
        },
      );

      expect(result.title).toBe('Test Task');
      expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
    });

    it('board bulunamazsa — 404', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'ws_1',
          'nonexistent_board',
          mockMember(WorkspaceRole.MEMBER),
          {
            title: 'Test Task',
            statusId: 'status_1',
          },
        ),
      ).rejects.toThrow(BoardNotFoundException);
    });

    it('geçersiz statusId — 404', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard);
      mockPrisma.taskStatus.findFirst.mockResolvedValue(null);

      await expect(
        service.create('ws_1', 'board_1', mockMember(WorkspaceRole.MEMBER), {
          title: 'Test Task',
          statusId: 'nonexistent_status',
        }),
      ).rejects.toThrow(TaskStatusNotFoundException);
    });
  });

  describe('findOne', () => {
    it('task detayı gelmeli', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        ...mockTask,
        status: mockTaskStatus,
        assignee: null,
        creator: { id: 'user_1', name: 'Test User', avatarUrl: null },
        labels: [],
        subTasks: [],
        _count: { comments: 0 },
      });

      const result = await service.findOne('ws_1', 'task_1');

      expect(result.id).toBe('task_1');
    });

    it('task bulunamazsa — 404', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ws_1', 'nonexistent_task')).rejects.toThrow(
        TaskNotFoundException,
      );
    });
  });

  describe('remove', () => {
    it("creator task'ı silebilmeli", async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        ...mockTask,
        creatorId: 'user_1',
      });
      mockPrisma.task.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'task_1',
        mockMember(WorkspaceRole.MEMBER, 'user_1'),
      );

      expect(mockPrisma.task.delete).toHaveBeenCalledTimes(1);
    });

    it("OWNER başkasının task'ını silebilmeli", async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        ...mockTask,
        creatorId: 'other_user',
      });
      mockPrisma.task.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'task_1',
        mockMember(WorkspaceRole.OWNER, 'user_1'),
      );

      expect(mockPrisma.task.delete).toHaveBeenCalledTimes(1);
    });

    it("başkasının task'ını silemez — 403", async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        ...mockTask,
        creatorId: 'other_user',
      });

      await expect(
        service.remove(
          'ws_1',
          'task_1',
          mockMember(WorkspaceRole.MEMBER, 'user_1'),
        ),
      ).rejects.toThrow(TaskForbiddenException);
    });
  });

  describe('search', () => {
    it('2 karakterden az sorgu boş array döndürmeli', async () => {
      const result = await service.search('ws_1', 'a');
      expect(result).toEqual([]);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('geçerli sorgu ile arama yapılmalı', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([mockTask]);

      const result = await service.search('ws_1', 'test task');
      expect(result).toHaveLength(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
