import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationNotFoundException } from './exceptions/notification.exceptions';

const mockPrisma = {
  notification: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockNotification = {
  id: 'notif_1',
  userId: 'user_1',
  type: 'MENTION',
  title: 'Bir yorumda etiketlendin',
  body: "Test task'ında etiketlendin",
  readAt: null,
  metadata: { taskId: 'task_1', commentId: 'comment_1' },
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('tüm bildirimler listelenmeli', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findAll('user_1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('unreadOnly=true ile sadece okunmamışlar filtrelenmeli', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([mockNotification]);

      await service.findAll('user_1', true);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('countUnread', () => {
    it('okunmamış bildirim sayısını dönmeli', async () => {
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.countUnread('user_1');

      expect(result).toEqual({ count: 3 });
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user_1', readAt: null },
      });
    });
  });

  describe('markAsRead', () => {
    it('bildirim okundu işaretlenmeli', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(mockNotification);
      mockPrisma.notification.update.mockResolvedValue({
        ...mockNotification,
        readAt: new Date(),
      });

      const result = await service.markAsRead('user_1', 'notif_1');

      expect(result.readAt).not.toBeNull();
    });

    it('bildirim bulunamazsa — 404', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead('user_1', 'nonexistent')).rejects.toThrow(
        NotificationNotFoundException,
      );
    });

    it('başka kullanıcının bildirimi okundu işaretlenememeli — 404 (sızıntı önleme)', async () => {
      // findFirst zaten where'de userId filtreliyor — başka kullanıcının
      // bildirimini sorgularsak null döner, bu da 404 fırlatır. Bu, IDOR
      // (Insecure Direct Object Reference) tarzı bir güvenlik açığını
      // engelliyor — kullanıcı başkasının bildirim ID'sini tahmin etse
      // bile erişemiyor.
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(
        service.markAsRead('attacker_user', 'notif_1'),
      ).rejects.toThrow(NotificationNotFoundException);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif_1', userId: 'attacker_user' },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('tüm okunmamış bildirimler okundu işaretlenmeli', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead('user_1');

      expect(result).toEqual({ count: 5 });
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
