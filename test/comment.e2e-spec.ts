import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Comments E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookiesA: string[];
  let cookiesB: string[];
  let workspaceId: string;
  let taskId: string;
  let userBId: string;
  let commentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await cleanDb(prisma);

    // Kullanıcı A — workspace sahibi
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'comment-a@test.com',
      password: 'StrongPass123!',
      name: 'User A',
    });

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'comment-a@test.com', password: 'StrongPass123!' });
    cookiesA = loginA.headers['set-cookie'] as unknown as string[];

    // Kullanıcı B — mention edilecek kişi
    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'comment-b@test.com',
        password: 'StrongPass123!',
        name: 'User B',
      });
    userBId = registerB.body.id as string;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'comment-b@test.com', password: 'StrongPass123!' });
    cookiesB = loginB.headers['set-cookie'] as unknown as string[];

    // Workspace, project, board, task oluştur (User A)
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookiesA)
      .send({ name: 'Comment Test Corp', slug: 'comment-test-corp' });
    workspaceId = wsRes.body.id as string;

    // User B'yi workspace'e davet et ve katıl
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .set('Cookie', cookiesA)
      .send({ email: 'comment-b@test.com', role: 'MEMBER' });

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/invite/accept/${inviteRes.body.token}`)
      .set('Cookie', cookiesB);

    const projectStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookiesA);
    const activeStatusId = (
      projectStatusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookiesA)
      .send({ name: 'Comment E2E Project', statusId: activeStatusId });

    const boardRes = await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${workspaceId}/projects/${projectRes.body.id}/boards`,
      )
      .set('Cookie', cookiesA)
      .send({ name: 'Sprint 1' });

    const taskStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
      .set('Cookie', cookiesA);
    const todoStatusId = (
      taskStatusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Todo')!.id;

    const taskRes = await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${workspaceId}/boards/${boardRes.body.id}/tasks`,
      )
      .set('Cookie', cookiesA)
      .send({ title: 'Comment E2E Task', statusId: todoStatusId });

    taskId = taskRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('POST /tasks/:taskId/comments', () => {
    it('yorum oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/comments`)
        .set('Cookie', cookiesA)
        .send({ content: 'İlk yorum' })
        .expect(201);

      expect(res.body.content).toBe('İlk yorum');
      expect(res.body.author.name).toBe('User A');
      commentId = res.body.id as string;
    });

    it('geçerli mention için bildirim oluşturulmalı', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/comments`)
        .set('Cookie', cookiesA)
        .send({ content: `Bak @[User B](${userBId})` })
        .expect(201);

      const notifications = await prisma.notification.findMany({
        where: { userId: userBId, type: 'MENTION' },
      });

      expect(notifications).toHaveLength(1);
    });

    it('task bulunamazsa — 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/tasks/nonexistent/comments`)
        .set('Cookie', cookiesA)
        .send({ content: 'Test' })
        .expect(404);
    });
  });

  describe('GET /tasks/:taskId/comments', () => {
    it('yorum listesi gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/comments`)
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PATCH /comments/:commentId', () => {
    it('sahibi yorumu düzenleyebilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`)
        .set('Cookie', cookiesA)
        .send({ content: 'Düzenlenmiş yorum' })
        .expect(200);

      expect(res.body.content).toBe('Düzenlenmiş yorum');
    });

    it('başkası düzenleyemez — 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`)
        .set('Cookie', cookiesB)
        .send({ content: 'Hacked' })
        .expect(403);
    });
  });

  describe('GET /tasks/:taskId/activity', () => {
    it('aktivite akışında yorum kayıtları olmalı', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}/activity`)
        .set('Cookie', cookiesA)
        .expect(200);

      const commentActivities = (res.body as Array<{ action: string }>).filter(
        (a) => a.action === 'comment_added',
      );

      expect(commentActivities.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('DELETE /comments/:commentId', () => {
    it('başkası silemez — 403', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`)
        .set('Cookie', cookiesB)
        .expect(403);
    });

    it('sahibi silebilmeli', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/comments/${commentId}`)
        .set('Cookie', cookiesA)
        .expect(204);
    });
  });
});

async function cleanDb(prisma: PrismaService) {
  await prisma.notification.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.board.deleteMany();
  await prisma.label.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectStatus.deleteMany();
  await prisma.taskStatus.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspaceInvite.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}
