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

describe('Boards E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let workspaceId: string;
  let projectId: string;
  let boardId: string;

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
      email: 'board-e2e@test.com',
      password: 'StrongPass123!',
      name: 'Board E2E User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'board-e2e@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Workspace oluştur
    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'Board Test Corp', slug: 'board-test-corp' });

    workspaceId = wsRes.body.id as string;

    // Project status al
    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookies);

    const activeStatusId = (
      statusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;

    // Project oluştur
    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookies)
      .send({ name: 'Board E2E Project', statusId: activeStatusId });

    projectId = projectRes.body.id as string;
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  describe('POST /workspaces/:wId/projects/:pId/boards', () => {
    it('board başarıyla oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
        .set('Cookie', cookies)
        .send({ name: 'Sprint 1' })
        .expect(201);

      expect(res.body.name).toBe('Sprint 1');
      expect(res.body.position).toBe(0);
      boardId = res.body.id as string;
    });

    it('geçersiz body — 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
        .set('Cookie', cookies)
        .send({})
        .expect(400);
    });
  });

  describe('GET /workspaces/:wId/projects/:pId/boards', () => {
    it('board listesi gelmeli', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Sprint 1');
    });
  });

  describe('PATCH /workspaces/:wId/projects/:pId/boards/reorder', () => {
    it('reorder çalışmalı', async () => {
      // İkinci board ekle
      const boardRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards`)
        .set('Cookie', cookies)
        .send({ name: 'Sprint 2' });

      const board2Id = boardRes.body.id as string;

      // Sırayı tersine çevir
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards/reorder`,
        )
        .set('Cookie', cookies)
        .send({ boardIds: [board2Id, boardId] })
        .expect(200);

      expect(res.body[0].name).toBe('Sprint 2');
      expect(res.body[0].position).toBe(0);
    });
  });

  describe('PATCH /workspaces/:wId/projects/:pId/boards/:boardId', () => {
    it('board güncellenebilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards/${boardId}`,
        )
        .set('Cookie', cookies)
        .send({ name: 'Sprint 1 Updated' })
        .expect(200);

      expect(res.body.name).toBe('Sprint 1 Updated');
    });
  });

  describe('PATCH /projects/:projectId/boards/reorder — IDOR koruması', () => {
    it("başka workspace'e ait board ID'si ile reorder reddedilmeli", async () => {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards/reorder`,
        )
        .set('Cookie', cookies)
        .send({ boardIds: [boardId, 'cnonexistent00000000000000'] })
        .expect(404);
    });
  });

  describe('DELETE /workspaces/:wId/projects/:pId/boards/:boardId', () => {
    it('board silinebilmeli', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/boards/${boardId}`,
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
