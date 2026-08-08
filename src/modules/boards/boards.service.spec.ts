import { Test, TestingModule } from '@nestjs/testing';
import { BoardsService } from './boards.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import {
  BoardNotFoundException,
  BoardForbiddenException,
} from './exceptions/board.exceptions';
import { ProjectNotFoundException } from '../projects/exceptions/project.exceptions';

const mockPrisma = {
  board: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockMember = (role: WorkspaceRole) => ({
  id: 'member_1',
  workspaceId: 'ws_1',
  userId: 'user_1',
  role,
  joinedAt: new Date(),
});

const mockProject = {
  id: 'project_1',
  workspaceId: 'ws_1',
  name: 'Test Project',
  description: null,
  position: 0,
  statusId: 'status_1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockBoard = {
  id: 'board_1',
  projectId: 'project_1',
  name: 'Sprint 1',
  position: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('BoardsService', () => {
  let service: BoardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BoardsService>(BoardsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('board başarıyla oluşturulmalı', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.board.count.mockResolvedValue(0);
      mockPrisma.board.create.mockResolvedValue(mockBoard);

      const result = await service.create(
        'ws_1',
        'project_1',
        mockMember(WorkspaceRole.MANAGER),
        { name: 'Sprint 1' },
      );

      expect(result.name).toBe('Sprint 1');
      expect(result.position).toBe(0);
    });

    it('MEMBER board oluşturamamalı', async () => {
      await expect(
        service.create('ws_1', 'project_1', mockMember(WorkspaceRole.MEMBER), {
          name: 'Sprint 1',
        }),
      ).rejects.toThrow(BoardForbiddenException);
    });

    it('proje bulunamazsa — 404', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create('ws_1', 'nonexistent', mockMember(WorkspaceRole.OWNER), {
          name: 'Sprint 1',
        }),
      ).rejects.toThrow(ProjectNotFoundException);
    });
  });

  describe('findAll', () => {
    it('board listesi gelmeli', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.board.findMany.mockResolvedValue([
        { ...mockBoard, _count: { tasks: 3 } },
      ]);

      const result = await service.findAll('ws_1', 'project_1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Sprint 1');
    });

    it('proje bulunamazsa — 404', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findAll('ws_1', 'nonexistent')).rejects.toThrow(
        ProjectNotFoundException,
      );
    });
  });

  describe('update', () => {
    it('board güncellenebilmeli', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard);
      mockPrisma.board.update.mockResolvedValue({
        ...mockBoard,
        name: 'Sprint 2',
      });

      const result = await service.update(
        'ws_1',
        'project_1',
        'board_1',
        mockMember(WorkspaceRole.OWNER),
        { name: 'Sprint 2' },
      );

      expect(result.name).toBe('Sprint 2');
    });

    it('board bulunamazsa — 404', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'ws_1',
          'project_1',
          'nonexistent',
          mockMember(WorkspaceRole.OWNER),
          { name: 'Sprint 2' },
        ),
      ).rejects.toThrow(BoardNotFoundException);
    });
  });

  describe('reorder', () => {
    it('board sırası güncellenebilmeli', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.$transaction.mockResolvedValue([]);
      mockPrisma.board.findMany.mockResolvedValue([mockBoard]);

      const result = await service.reorder(
        'ws_1',
        'project_1',
        mockMember(WorkspaceRole.OWNER),
        { boardIds: ['board_1', 'board_2'] },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('OWNER board silebilmeli', async () => {
      mockPrisma.board.findFirst.mockResolvedValue(mockBoard);
      mockPrisma.board.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'project_1',
        'board_1',
        mockMember(WorkspaceRole.OWNER),
      );

      expect(mockPrisma.board.delete).toHaveBeenCalledTimes(1);
    });

    it('MANAGER board silemez — 403', async () => {
      await expect(
        service.remove(
          'ws_1',
          'project_1',
          'board_1',
          mockMember(WorkspaceRole.MANAGER),
        ),
      ).rejects.toThrow(BoardForbiddenException);
    });
  });
});
