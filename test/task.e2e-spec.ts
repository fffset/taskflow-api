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

describe('Tasks E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let workspaceId: string;
  let boardId: string;
  let todoStatusId: string;
  let inProgressStatusId: string;
  let taskId: string;

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
      email: 'task-e2e@test.com',
      password: 'StrongPass123!',
      name: 'Task E2E User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'task-e2e@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Workspace oluştur
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Task Test Corp', slug: 'task-test-corp' });

    workspaceId = wsRes.body.id as string;

    // Task status'ları al
    const taskStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
      .set('Cookie', cookies);

    const statuses = taskStatusRes.body as Array<{ id: string; name: string }>;
    todoStatusId = statuses.find((s) => s.name === 'Todo')!.id;
    inProgressStatusId = statuses.find((s) => s.name === 'In Progress')!.id;

    // Project + Board oluştur
    const projectStatusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookies);

    const activeStatusId = (
      projectStatusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookies)
      .send({ name: 'Task E2E Project', statusId: activeStatusId });

    const projectId = projectRes.body.id as string;

    const boardRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
      .set('Cookie', cookies)
      .send({ name: 'Sprint 1' });

    boardId = boardRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ─── Task Status ───────────────────────────────────────────────────────────

  describe('GET /workspaces/:id/tasks/statuses', () => {
    it("default status'lar gelmeli", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(4);
      expect(res.body[0].name).toBe('Todo');
    });
  });

  // ─── Task CRUD ─────────────────────────────────────────────────────────────

  describe('POST /workspaces/:id/boards/:boardId/tasks', () => {
    it('task oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
        .set('Cookie', cookies)
        .send({
          title: 'E2E Task',
          description: 'E2E task description',
          statusId: todoStatusId,
          priority: 'HIGH',
        })
        .expect(201);

      expect(res.body.title).toBe('E2E Task');
      expect(res.body.priority).toBe('HIGH');
      expect(res.body.status.name).toBe('Todo');
      taskId = res.body.id as string;
    });

    it('geçersiz statusId — 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
        .set('Cookie', cookies)
        .send({ title: 'E2E Task 2', statusId: 'nonexistent_id' })
        .expect(404);
    });
  });

  describe('GET /workspaces/:id/boards/:boardId/tasks', () => {
    it('board task listesi gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('E2E Task');
    });
  });

  describe('GET /workspaces/:id/tasks/:taskId', () => {
    it('task detayı gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.id).toBe(taskId);
      expect(res.body.subTasks).toBeDefined();
      expect(res.body.labels).toBeDefined();
    });
  });

  describe('PATCH /workspaces/:id/tasks/:taskId', () => {
    it('task güncellemeli — status değişmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies)
        .send({ statusId: inProgressStatusId, priority: 'URGENT' })
        .expect(200);

      expect(res.body.status.name).toBe('In Progress');
      expect(res.body.priority).toBe('URGENT');
    });
  });

  describe('PATCH /boards/:boardId/tasks/reorder — IDOR koruması', () => {
    it("başka workspace'e ait task ID'si ile reorder reddedilmeli", async () => {
      // Bu workspace'e ait GERÇEK bir task (setup'ta oluşturulan taskId
      // kullanılabilir), ama ikinci ID tamamen uydurma/başka bir workspace'e
      // ait olabilir.
      await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks/reorder`,
        )
        .set('Cookie', cookies)
        .send({ taskIds: [taskId, 'cnonexistent00000000000000'] })
        .expect(404);
    });
  });

  describe('GET /workspaces/:id/tasks/search', () => {
    it('full-text search çalışmalı', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/search?q=E2E`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect((res.body[0] as { title: string }).title).toContain('E2E');
    });
  });

  describe('DELETE /workspaces/:id/tasks/:taskId', () => {
    it('task silinmeli', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
        .set('Cookie', cookies)
        .expect(404);
    });
  });

  describe('GET /tasks/search — sanitization', () => {
    it('özel tsquery karakterleri 500 hatası vermemeli', async () => {
      // Parantez, &, |, ! gibi PostgreSQL tsquery operatör karakterleri
      // sanitize edilmeden gönderilirse to_tsquery syntax error fırlatıp
      // 500 dönerdi. Artık bu karakterler temizleniyor.
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/search`)
        .query({ q: '((((' })
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('& | ! karakterleri içeren sorgu 500 vermemeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/search`)
        .query({ q: 'test & | !' })
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('sanitize sonrası anlamlı arama hâlâ çalışmalı', async () => {
      // Not: bu noktada 'DELETE' bloğu 'E2E Task'ı zaten silmiş oluyor —
      // bu yüzden kendi, benzersiz başlıklı yeni bir task oluşturup
      // onu arıyoruz.
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
        .set('Cookie', cookies)
        .send({
          title: 'SanitizationSearchTestUnique',
          statusId: todoStatusId,
        });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/search`)
        .query({ q: 'SanitizationSearchTestUnique' })
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(
        (res.body as Array<{ title: string }>).some(
          (t) => t.title === 'SanitizationSearchTestUnique',
        ),
      ).toBe(true);
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
