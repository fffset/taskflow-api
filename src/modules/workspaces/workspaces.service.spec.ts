import { Test, TestingModule } from '@nestjs/testing';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { WorkspaceRole } from '@prisma/client';
import {
  WorkspaceSlugTakenException,
  WorkspaceForbiddenException,
  WorkspaceInviteInvalidException,
  WorkspaceInviteExpiredException,
} from './exceptions/workspace.exceptions';
import { EmailPublisherService } from 'src/queue/email-publisher.service';

const mockPrisma = {
  workspace: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workspaceMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workspaceInvite: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEmailPublisher = {
  publishMentionNotification: jest.fn(),
  publishTaskAssigned: jest.fn(),
  publishWorkspaceInvite: jest.fn(),
};

const mockProjectsService = {
  createDefaultStatuses: jest.fn().mockResolvedValue(undefined),
};

const mockTasksService = {
  createDefaultStatuses: jest.fn().mockResolvedValue(undefined),
};

const mockMember = (role: WorkspaceRole) => ({
  id: 'member_1',
  workspaceId: 'ws_1',
  userId: 'user_1',
  role,
  joinedAt: new Date(),
});

describe('WorkspacesService', () => {
  let service: WorkspacesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: TasksService, useValue: mockTasksService },
        { provide: EmailPublisherService, useValue: mockEmailPublisher },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('workspace başarıyla oluşturulmalı', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
          fn({
            ...mockPrisma,
            workspace: {
              ...mockPrisma.workspace,
              create: jest.fn().mockResolvedValue({
                id: 'ws_1',
                name: 'Test',
                slug: 'test',
                logoUrl: null,
                description: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
            },
            workspaceMember: {
              ...mockPrisma.workspaceMember,
              create: jest.fn(),
            },
          }),
      );

      const result = await service.create('user_1', {
        name: 'Test',
        slug: 'test',
      });

      expect(result.role).toBe(WorkspaceRole.OWNER);
      expect(result.memberCount).toBe(1);
      expect(mockProjectsService.createDefaultStatuses).toHaveBeenCalledTimes(
        1,
      );
      expect(mockTasksService.createDefaultStatuses).toHaveBeenCalledTimes(1);
    });

    it('slug zaten varsa WorkspaceSlugTakenException fırlatmalı', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws_1' });

      await expect(
        service.create('user_1', { name: 'Test', slug: 'test' }),
      ).rejects.toThrow(WorkspaceSlugTakenException);
    });
  });

  describe('findAll', () => {
    it("kullanıcının workspace'lerini listelenmeli", async () => {
      mockPrisma.workspaceMember.findMany.mockResolvedValue([
        {
          role: WorkspaceRole.OWNER,
          workspace: {
            id: 'ws_1',
            name: 'Test',
            slug: 'test',
            logoUrl: null,
            description: null,
            createdAt: new Date(),
            _count: { members: 1 },
          },
        },
      ]);

      const result = await service.findAll('user_1');

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(WorkspaceRole.OWNER);
    });
  });

  describe('update', () => {
    it("OWNER workspace'i güncelleyebilmeli", async () => {
      mockPrisma.workspace.update.mockResolvedValue({
        id: 'ws_1',
        name: 'Updated',
        slug: 'test',
        logoUrl: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { members: 1 },
      });

      const result = await service.update(
        'ws_1',
        mockMember(WorkspaceRole.OWNER),
        { name: 'Updated' },
      );

      expect(result.name).toBe('Updated');
    });

    it("MEMBER workspace'i güncelleyememeli", async () => {
      await expect(
        service.update('ws_1', mockMember(WorkspaceRole.MEMBER), {
          name: 'Updated',
        }),
      ).rejects.toThrow(WorkspaceForbiddenException);
    });
  });

  describe('remove', () => {
    it("OWNER workspace'i silebilmeli", async () => {
      const mockTx = {
        board: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        task: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        activityLog: { deleteMany: jest.fn() },
        comment: { deleteMany: jest.fn() },
        taskLabel: { deleteMany: jest.fn() },
        label: { deleteMany: jest.fn() },
        project: { deleteMany: jest.fn() },
        taskStatus: { deleteMany: jest.fn() },
        projectStatus: { deleteMany: jest.fn() },
        auditLog: { deleteMany: jest.fn() },
        workspaceInvite: { deleteMany: jest.fn() },
        workspaceMember: { deleteMany: jest.fn() },
        workspace: { delete: jest.fn().mockResolvedValue({}) },
      };

      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
      );

      await service.remove('ws_1', mockMember(WorkspaceRole.OWNER));

      expect(mockTx.workspace.delete).toHaveBeenCalledWith({
        where: { id: 'ws_1' },
      });
    });

    it("ADMIN workspace'i silememeli", async () => {
      await expect(
        service.remove('ws_1', mockMember(WorkspaceRole.ADMIN)),
      ).rejects.toThrow(WorkspaceForbiddenException);
    });
  });

  describe('inviteMember', () => {
    it('OWNER üye davet edebilmeli', async () => {
      mockPrisma.workspace.findUniqueOrThrow.mockResolvedValue({
        id: 'ws_1',
        name: 'Test Workspace',
      });
      mockPrisma.workspaceInvite.create.mockResolvedValue({
        token: 'mock_token',
      });

      const result = await service.inviteMember(
        'ws_1',
        mockMember(WorkspaceRole.OWNER),
        { email: 'invite@test.com', role: WorkspaceRole.MEMBER },
      );

      expect(result.token).toBeDefined();
    });

    it('MEMBER üye davet edememeli', async () => {
      await expect(
        service.inviteMember('ws_1', mockMember(WorkspaceRole.MEMBER), {
          email: 'invite@test.com',
          role: WorkspaceRole.MEMBER,
        }),
      ).rejects.toThrow(WorkspaceForbiddenException);
    });
  });

  describe('acceptInvite', () => {
    it('geçersiz token — WorkspaceInviteInvalidException', async () => {
      mockPrisma.workspaceInvite.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptInvite('invalid_token', 'user_1'),
      ).rejects.toThrow(WorkspaceInviteInvalidException);
    });

    it('süresi dolmuş token — WorkspaceInviteExpiredException', async () => {
      mockPrisma.workspaceInvite.findUnique.mockResolvedValue({
        token: 'expired_token',
        acceptedAt: null,
        expiresAt: new Date(Date.now() - 1000), // geçmiş tarih
        workspaceId: 'ws_1',
        role: WorkspaceRole.MEMBER,
        workspace: {
          id: 'ws_1',
          name: 'Test',
          slug: 'test',
          logoUrl: null,
          description: null,
          createdAt: new Date(),
          _count: { members: 1 },
        },
      });

      await expect(
        service.acceptInvite('expired_token', 'user_1'),
      ).rejects.toThrow(WorkspaceInviteExpiredException);
    });
  });
});
