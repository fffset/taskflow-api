import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import {
  ProjectNotFoundException,
  ProjectForbiddenException,
  ProjectStatusNotFoundException,
} from './exceptions/project.exceptions';

const mockPrisma = {
  project: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  projectStatus: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

const mockMember = (role: WorkspaceRole) => ({
  id: 'member_1',
  workspaceId: 'ws_1',
  userId: 'user_1',
  role,
  joinedAt: new Date(),
});

const mockStatus = {
  id: 'status_1',
  workspaceId: 'ws_1',
  name: 'Active',
  color: '#22C55E',
  position: 0,
  isSystem: true,
  createdAt: new Date(),
};

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

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  describe('createDefaultStatuses', () => {
    it('3 default status oluşturulmalı', async () => {
      mockPrisma.projectStatus.createMany.mockResolvedValue({ count: 3 });

      await service.createDefaultStatuses('ws_1');

      expect(mockPrisma.projectStatus.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Active', isSystem: true }),
          expect.objectContaining({ name: 'Completed', isSystem: true }),
          expect.objectContaining({ name: 'Archived', isSystem: true }),
        ]),
      });
    });
  });

  describe('deleteStatus', () => {
    it("sistem status'u silinemez — 403", async () => {
      mockPrisma.projectStatus.findFirst.mockResolvedValue({
        ...mockStatus,
        isSystem: true,
      });

      await expect(
        service.deleteStatus(
          'ws_1',
          'status_1',
          mockMember(WorkspaceRole.OWNER),
        ),
      ).rejects.toThrow(ProjectForbiddenException);
    });

    it('custom status silinebilmeli', async () => {
      mockPrisma.projectStatus.findFirst.mockResolvedValue({
        ...mockStatus,
        isSystem: false,
      });
      mockPrisma.projectStatus.delete.mockResolvedValue({});

      await service.deleteStatus(
        'ws_1',
        'status_1',
        mockMember(WorkspaceRole.OWNER),
      );

      expect(mockPrisma.projectStatus.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('proje başarıyla oluşturulmalı', async () => {
      mockPrisma.projectStatus.findFirst.mockResolvedValue(mockStatus);
      mockPrisma.project.count.mockResolvedValue(0);
      mockPrisma.project.create.mockResolvedValue({
        ...mockProject,
        status: mockStatus,
      });

      const result = await service.create(
        'ws_1',
        mockMember(WorkspaceRole.MANAGER),
        {
          name: 'Test Project',
          statusId: 'status_1',
        },
      );

      expect(result.name).toBe('Test Project');
    });

    it('MEMBER proje oluşturamamalı', async () => {
      await expect(
        service.create('ws_1', mockMember(WorkspaceRole.MEMBER), {
          name: 'Test Project',
          statusId: 'status_1',
        }),
      ).rejects.toThrow(ProjectForbiddenException);
    });

    it('geçersiz statusId — 404', async () => {
      mockPrisma.projectStatus.findFirst.mockResolvedValue(null);

      await expect(
        service.create('ws_1', mockMember(WorkspaceRole.OWNER), {
          name: 'Test Project',
          statusId: 'nonexistent',
        }),
      ).rejects.toThrow(ProjectStatusNotFoundException);
    });
  });

  describe('findOne', () => {
    it('proje detayı gelmeli', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        ...mockProject,
        status: mockStatus,
        boards: [],
        labels: [],
        _count: { boards: 0 },
      });

      const result = await service.findOne('ws_1', 'project_1');

      expect(result.id).toBe('project_1');
    });

    it('proje bulunamazsa — 404', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne('ws_1', 'nonexistent')).rejects.toThrow(
        ProjectNotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('OWNER proje silebilmeli', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.project.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'project_1',
        mockMember(WorkspaceRole.OWNER),
      );

      expect(mockPrisma.project.delete).toHaveBeenCalledTimes(1);
    });

    it('MANAGER proje silemez — 403', async () => {
      await expect(
        service.remove('ws_1', 'project_1', mockMember(WorkspaceRole.MANAGER)),
      ).rejects.toThrow(ProjectForbiddenException);
    });
  });
});
