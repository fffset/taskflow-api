import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailPublisherService } from '../../queue/email-publisher.service';
import { WorkspaceRole } from '@prisma/client';
import {
  CommentNotFoundException,
  CommentForbiddenException,
} from './exceptions/comment.exceptions';
import { TaskNotFoundException } from '../tasks/exceptions/task.exceptions';
import { WorkspaceGateway } from 'src/websocket/workspace.gateway';

const mockPrisma = {
  task: {
    findFirst: jest.fn(),
  },
  comment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
  },
  workspaceMember: {
    findMany: jest.fn(),
  },
  notification: {
    createMany: jest.fn(),
  },
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

const mockTask = {
  id: 'task_1',
  workspaceId: 'ws_1',
  title: 'Test Task',
};

const mockComment = {
  id: 'comment_1',
  taskId: 'task_1',
  authorId: 'user_1',
  content: 'Test comment',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailPublisherService, useValue: mockEmailPublisher },
        { provide: WorkspaceGateway, useValue: mockWorkspaceGateway },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('yorum başarıyla oluşturulmalı', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);
      mockPrisma.comment.create.mockResolvedValue({
        ...mockComment,
        author: { id: 'user_1', name: 'Test User', avatarUrl: null },
      });
      mockPrisma.activityLog.create.mockResolvedValue({});

      const result = await service.create(
        'ws_1',
        'task_1',
        mockMember(WorkspaceRole.MEMBER),
        { content: 'Test comment' },
      );

      expect(result.content).toBe('Test comment');
      expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1);
    });

    it('task bulunamazsa — 404', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          'ws_1',
          'nonexistent',
          mockMember(WorkspaceRole.MEMBER),
          {
            content: 'Test',
          },
        ),
      ).rejects.toThrow(TaskNotFoundException);
    });

    it('geçerli mention için bildirim ve email publish edilmeli', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);
      mockPrisma.comment.create.mockResolvedValue({
        ...mockComment,
        content: 'Bak @[Ayşe](user_2)',
        author: { id: 'user_1', name: 'Test User', avatarUrl: null },
      });
      mockPrisma.activityLog.create.mockResolvedValue({});
      mockPrisma.workspaceMember.findMany.mockResolvedValue([
        { userId: 'user_2' },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });

      await service.create('ws_1', 'task_1', mockMember(WorkspaceRole.MEMBER), {
        content: 'Bak @[Ayşe](user_2)',
      });

      expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(1);
      expect(
        mockEmailPublisher.publishMentionNotification,
      ).toHaveBeenCalledTimes(1);
    });

    it('kendi kendini mention edince bildirim/email oluşmamalı', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);
      mockPrisma.comment.create.mockResolvedValue({
        ...mockComment,
        content: 'Ben @[Erkan](user_1) yaptım',
        author: { id: 'user_1', name: 'Erkan', avatarUrl: null },
      });
      mockPrisma.activityLog.create.mockResolvedValue({});
      mockPrisma.workspaceMember.findMany.mockResolvedValue([
        { userId: 'user_1' },
      ]);

      await service.create(
        'ws_1',
        'task_1',
        mockMember(WorkspaceRole.MEMBER, 'user_1'),
        {
          content: 'Ben @[Erkan](user_1) yaptım',
        },
      );

      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
      expect(
        mockEmailPublisher.publishMentionNotification,
      ).not.toHaveBeenCalled();
    });

    it('workspace üyesi olmayan mention için bildirim/email oluşmamalı', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);
      mockPrisma.comment.create.mockResolvedValue({
        ...mockComment,
        content: 'Bak @[Yabancı](fake_user_id)',
        author: { id: 'user_1', name: 'Erkan', avatarUrl: null },
      });
      mockPrisma.activityLog.create.mockResolvedValue({});
      mockPrisma.workspaceMember.findMany.mockResolvedValue([]); // üye değil

      await service.create('ws_1', 'task_1', mockMember(WorkspaceRole.MEMBER), {
        content: 'Bak @[Yabancı](fake_user_id)',
      });

      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
      expect(
        mockEmailPublisher.publishMentionNotification,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('yorum listesi gelmeli', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);
      mockPrisma.comment.findMany.mockResolvedValue([
        {
          ...mockComment,
          author: { id: 'user_1', name: 'Test', avatarUrl: null },
        },
      ]);

      const result = await service.findAll('ws_1', 'task_1');

      expect(result).toHaveLength(1);
    });

    it('task bulunamazsa — 404', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(service.findAll('ws_1', 'nonexistent')).rejects.toThrow(
        TaskNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('yorum sahibi düzenleyebilmeli', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(mockComment);
      mockPrisma.comment.update.mockResolvedValue({
        ...mockComment,
        content: 'Updated',
        author: { id: 'user_1', name: 'Test', avatarUrl: null },
      });

      const result = await service.update(
        'ws_1',
        'comment_1',
        mockMember(WorkspaceRole.MEMBER, 'user_1'),
        { content: 'Updated' },
      );

      expect(result.content).toBe('Updated');
    });

    it('başkasının yorumunu düzenleyemez — 403', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(mockComment);

      await expect(
        service.update(
          'ws_1',
          'comment_1',
          mockMember(WorkspaceRole.OWNER, 'other_user'),
          { content: 'Hacked' },
        ),
      ).rejects.toThrow(CommentForbiddenException);
    });

    it('yorum bulunamazsa — 404', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'ws_1',
          'nonexistent',
          mockMember(WorkspaceRole.MEMBER),
          {
            content: 'Test',
          },
        ),
      ).rejects.toThrow(CommentNotFoundException);
    });
  });

  describe('remove', () => {
    it('yorum sahibi silebilmeli', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(mockComment);
      mockPrisma.comment.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'comment_1',
        mockMember(WorkspaceRole.MEMBER, 'user_1'),
      );

      expect(mockPrisma.comment.delete).toHaveBeenCalledTimes(1);
    });

    it('OWNER başkasının yorumunu silebilmeli (moderasyon)', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(mockComment);
      mockPrisma.comment.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'comment_1',
        mockMember(WorkspaceRole.OWNER, 'other_user'),
      );

      expect(mockPrisma.comment.delete).toHaveBeenCalledTimes(1);
    });

    it('MEMBER başkasının yorumunu silemez — 403', async () => {
      mockPrisma.comment.findFirst.mockResolvedValue(mockComment);

      await expect(
        service.remove(
          'ws_1',
          'comment_1',
          mockMember(WorkspaceRole.MEMBER, 'other_user'),
        ),
      ).rejects.toThrow(CommentForbiddenException);
    });
  });
});
