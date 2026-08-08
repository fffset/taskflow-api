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

describe('Projects E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let workspaceId: string;
  let activeStatusId: string;
  let projectId: string;

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
      email: 'prj-e2e@test.com',
      password: 'StrongPass123!',
      name: 'PRJ E2E User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'prj-e2e@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Workspace oluştur
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'PRJ Test Corp', slug: 'prj-test-corp' });

    workspaceId = wsRes.body.id as string;

    // Active status id'yi al
    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookies);

    activeStatusId = (
      statusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ─── Project Status ────────────────────────────────────────────────────────

  describe('GET /workspaces/:id/projects/statuses', () => {
    it("default status'lar gelmeli", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(res.body[0].isSystem).toBe(true);
    });
  });

  describe('POST /workspaces/:id/projects/statuses', () => {
    it('custom status ekle', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
        .set('Cookie', cookies)
        .send({ name: 'On Hold', color: '#F59E0B' })
        .expect(201);

      expect(res.body.name).toBe('On Hold');
      expect(res.body.isSystem).toBe(false);
    });

    it("sistem status'unu silmeye çalışmak — 403", async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/projects/statuses/${activeStatusId}`,
        )
        .set('Cookie', cookies)
        .expect(403);
    });
  });

  // ─── Project CRUD ──────────────────────────────────────────────────────────

  describe('POST /workspaces/:id/projects', () => {
    it('proje oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Cookie', cookies)
        .send({ name: 'E2E Project', statusId: activeStatusId })
        .expect(201);

      expect(res.body.name).toBe('E2E Project');
      expect(res.body.status.name).toBe('Active');
      projectId = res.body.id as string;
    });

    it('geçersiz statusId — 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Cookie', cookies)
        .send({ name: 'E2E Project 2', statusId: 'nonexistent_id' })
        .expect(404);
    });
  });

  describe('GET /workspaces/:id/projects', () => {
    it('proje listesi gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('E2E Project');
    });
  });

  describe('GET /workspaces/:id/projects/:projectId', () => {
    it('proje detayı gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.id).toBe(projectId);
      expect(res.body.boards).toBeDefined();
      expect(res.body.labels).toBeDefined();
    });
  });

  describe('PATCH /workspaces/:id/projects/:projectId', () => {
    it('proje güncellemeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Cookie', cookies)
        .send({ name: 'Updated E2E Project' })
        .expect(200);

      expect(res.body.name).toBe('Updated E2E Project');
    });
  });

  describe('DELETE /workspaces/:id/projects/:projectId', () => {
    it('proje silinmeli', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Cookie', cookies)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Cookie', cookies)
        .expect(404);
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
