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

describe('Labels E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let workspaceId: string;
  let projectId: string;
  let boardId: string;
  let taskId: string;
  let labelId: string;
  let todoStatusId: string;

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

    // Kullanıcı oluştur ve login ol
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'label-e2e@test.com',
      password: 'StrongPass123!',
      name: 'Label E2E User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'label-e2e@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Workspace
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Label Test Corp', slug: 'label-test-corp' });

    workspaceId = wsRes.body.id as string;

    // Project status
    const projectStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookies);

    const activeStatusId = (
      projectStatusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;

    // Task status
    const taskStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
      .set('Cookie', cookies);

    todoStatusId = (
      taskStatusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Todo')!.id;

    // Project
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookies)
      .send({ name: 'Label E2E Project', statusId: activeStatusId });

    projectId = projectRes.body.id as string;

    // Board
    const boardRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
      .set('Cookie', cookies)
      .send({ name: 'Sprint 1' });

    boardId = boardRes.body.id as string;

    // Task
    const taskRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
      .set('Cookie', cookies)
      .send({ title: 'Label E2E Task', statusId: todoStatusId });

    taskId = taskRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('POST /workspaces/:wId/projects/:pId/labels', () => {
    it('label başarıyla oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels`)
        .set('Cookie', cookies)
        .send({ name: 'Bug', color: '#EF4444' })
        .expect(201);

      expect(res.body.name).toBe('Bug');
      expect(res.body.color).toBe('#EF4444');
      labelId = res.body.id as string;
    });

    it('geçersiz renk kodu — 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels`)
        .set('Cookie', cookies)
        .send({ name: 'Bug', color: 'red' })
        .expect(400);
    });
  });

  describe('GET /workspaces/:wId/projects/:pId/labels', () => {
    it('label listesi gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Bug');
    });
  });

  describe('PATCH /workspaces/:wId/projects/:pId/labels/:labelId', () => {
    it('label güncellenebilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}`,
        )
        .set('Cookie', cookies)
        .send({ name: 'Critical Bug' })
        .expect(200);

      expect(res.body.name).toBe('Critical Bug');
    });
  });

  describe('POST /workspaces/:wId/tasks/:taskId/labels/:labelId', () => {
    it("task'a label eklenebilmeli", async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/labels/${labelId}`,
        )
        .set('Cookie', cookies)
        .expect(201);

      expect(res.body.taskId).toBe(taskId);
      expect(res.body.labelId).toBe(labelId);
    });

    it('task detayında label gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.labels).toHaveLength(1);
      expect(res.body.labels[0].label.name).toBe('Critical Bug');
    });
  });

  describe('DELETE /workspaces/:wId/tasks/:taskId/labels/:labelId', () => {
    it("task'tan label kaldırılabilmeli", async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/tasks/${taskId}/labels/${labelId}`,
        )
        .set('Cookie', cookies)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies);

      expect(res.body.labels).toHaveLength(0);
    });
  });

  describe('DELETE /workspaces/:wId/projects/:pId/labels/:labelId', () => {
    it('label silinebilmeli', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}`,
        )
        .set('Cookie', cookies)
        .expect(204);
    });
  });
});

async function cleanDb(prisma: PrismaService) {
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
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();
}
