import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService } from './labels.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceRole } from '@prisma/client';
import {
  LabelNotFoundException,
  LabelForbiddenException,
} from './exceptions/label.exceptions';
import { ProjectNotFoundException } from '../projects/exceptions/project.exceptions';
import { TaskNotFoundException } from '../tasks/exceptions/task.exceptions';

const mockPrisma = {
  label: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
  },
  task: {
    findFirst: jest.fn(),
  },
  taskLabel: {
    upsert: jest.fn(),
    delete: jest.fn(),
  },
};

const mockMember = (role: WorkspaceRole) => ({
  id: 'member_1',
  workspaceId: 'ws_1',
  userId: 'user_1',
  role,
  joinedAt: new Date(),
});

const mockLabel = {
  id: 'label_1',
  projectId: 'project_1',
  name: 'Bug',
  color: '#EF4444',
};

describe('LabelsService', () => {
  let service: LabelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LabelsService>(LabelsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('label başarıyla oluşturulmalı', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: 'project_1' });
      mockPrisma.label.create.mockResolvedValue(mockLabel);

      const result = await service.create(
        'ws_1',
        'project_1',
        mockMember(WorkspaceRole.MANAGER),
        { name: 'Bug', color: '#EF4444' },
      );

      expect(result.name).toBe('Bug');
    });

    it('MEMBER label oluşturamamalı', async () => {
      await expect(
        service.create('ws_1', 'project_1', mockMember(WorkspaceRole.MEMBER), {
          name: 'Bug',
        }),
      ).rejects.toThrow(LabelForbiddenException);
    });

    it('proje bulunamazsa — 404', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create('ws_1', 'nonexistent', mockMember(WorkspaceRole.OWNER), {
          name: 'Bug',
        }),
      ).rejects.toThrow(ProjectNotFoundException);
    });
  });

  describe('update', () => {
    it('label güncellenebilmeli', async () => {
      mockPrisma.label.findFirst.mockResolvedValue(mockLabel);
      mockPrisma.label.update.mockResolvedValue({
        ...mockLabel,
        name: 'Feature',
      });

      const result = await service.update(
        'ws_1',
        'project_1',
        'label_1',
        mockMember(WorkspaceRole.OWNER),
        { name: 'Feature' },
      );

      expect(result.name).toBe('Feature');
    });

    it('label bulunamazsa — 404', async () => {
      mockPrisma.label.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'ws_1',
          'project_1',
          'nonexistent',
          mockMember(WorkspaceRole.OWNER),
          { name: 'Feature' },
        ),
      ).rejects.toThrow(LabelNotFoundException);
    });
  });

  describe('remove', () => {
    it('label silinebilmeli', async () => {
      mockPrisma.label.findFirst.mockResolvedValue(mockLabel);
      mockPrisma.label.delete.mockResolvedValue({});

      await service.remove(
        'ws_1',
        'project_1',
        'label_1',
        mockMember(WorkspaceRole.OWNER),
      );

      expect(mockPrisma.label.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('addToTask', () => {
    it("task'a label eklenebilmeli", async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'task_1' });
      mockPrisma.label.findFirst.mockResolvedValue(mockLabel);
      mockPrisma.taskLabel.upsert.mockResolvedValue({
        taskId: 'task_1',
        labelId: 'label_1',
      });

      const result = await service.addToTask('ws_1', 'task_1', 'label_1');

      expect(result.taskId).toBe('task_1');
    });

    it('task bulunamazsa — 404', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.addToTask('ws_1', 'nonexistent', 'label_1'),
      ).rejects.toThrow(TaskNotFoundException);
    });

    it('label bulunamazsa — 404', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'task_1' });
      mockPrisma.label.findFirst.mockResolvedValue(null);

      await expect(
        service.addToTask('ws_1', 'task_1', 'nonexistent'),
      ).rejects.toThrow(LabelNotFoundException);
    });
  });

  describe('removeFromTask', () => {
    it("task'tan label kaldırılabilmeli", async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: 'task_1' });
      mockPrisma.taskLabel.delete.mockResolvedValue({});

      await service.removeFromTask('ws_1', 'task_1', 'label_1');

      expect(mockPrisma.taskLabel.delete).toHaveBeenCalledTimes(1);
    });
  });
});
