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

describe('Workspaces E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let workspaceId: string;

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

    // Önceki test verisini temizle
    await cleanDb(prisma);

    // Test kullanıcısı oluştur ve login ol
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'ws-e2e@test.com',
      password: 'StrongPass123!',
      name: 'WS E2E User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ws-e2e@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  describe('POST /workspaces', () => {
    it('workspace başarıyla oluşturulmalı', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({
          name: 'Test Corp',
          slug: 'test-corp',
          description: 'E2E test workspace',
        })
        .expect(201);

      expect(res.body.name).toBe('Test Corp');
      expect(res.body.slug).toBe('test-corp');
      expect(res.body.role).toBe('OWNER');
      expect(res.body.memberCount).toBe(1);

      workspaceId = res.body.id as string;
    });

    it('aynı slug ile workspace — 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Test Corp 2', slug: 'test-corp' })
        .expect(409);
    });

    it('geçersiz slug (büyük harf) — 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Test', slug: 'Test-Corp' })
        .expect(400);
    });

    it("default project ve task status'lar oluşturulmalı", async () => {
      const projectStatuses = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
        .set('Cookie', cookies)
        .expect(200);

      expect(projectStatuses.body).toHaveLength(3);
      expect(projectStatuses.body[0].name).toBe('Active');

      const taskStatuses = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
        .set('Cookie', cookies)
        .expect(200);

      expect(taskStatuses.body).toHaveLength(4);
      expect(taskStatuses.body[0].name).toBe('Todo');
    });
  });

  // ─── Find All ──────────────────────────────────────────────────────────────

  describe('GET /workspaces', () => {
    it("üye olunan workspace'leri listele", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('OWNER');
    });
  });

  // ─── Find One ──────────────────────────────────────────────────────────────

  describe('GET /workspaces/:id', () => {
    it('workspace detayı', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${workspaceId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.id).toBe(workspaceId);
      expect(res.body.members).toHaveLength(1);
    });

    it('üye olmadığın workspace — 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/workspaces/nonexistent_id')
        .set('Cookie', cookies)
        .expect(404);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /workspaces/:id', () => {
    it('workspace güncelle', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${workspaceId}`)
        .set('Cookie', cookies)
        .send({ name: 'Updated Corp' })
        .expect(200);

      expect(res.body.name).toBe('Updated Corp');
    });
  });

  // ─── Invite ────────────────────────────────────────────────────────────────

  describe('POST /workspaces/:id/invite', () => {
    it("davet token'ı üretilmeli", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${workspaceId}/invite`)
        .set('Cookie', cookies)
        .send({ email: 'invited@test.com', role: 'MEMBER' })
        .expect(201);

      expect(res.body.token).toBeDefined();
    });
  });

  // workspace.e2e-spec.ts içine, mevcut testlerin sonuna (son describe bloğundan sonra) ekle:

  describe('DELETE /workspaces/:id — with data', () => {
    it('proje/board/task içeren workspace tam olarak silinmeli', async () => {
      // Yeni bir workspace oluştur — bu teste özel, diğer testleri etkilemesin
      const wsRes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Delete Test Corp', slug: 'delete-test-corp' });

      const deleteWorkspaceId = wsRes.body.id as string;

      const statusRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${deleteWorkspaceId}/projects/statuses`)
        .set('Cookie', cookies);
      const activeStatusId = (
        statusRes.body as Array<{ id: string; name: string }>
      ).find((s) => s.name === 'Active')!.id;

      const projectRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${deleteWorkspaceId}/projects`)
        .set('Cookie', cookies)
        .send({ name: 'Delete Test Project', statusId: activeStatusId });
      const deleteProjectId = projectRes.body.id as string;

      const boardRes = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${deleteWorkspaceId}/projects/${deleteProjectId}/boards`,
        )
        .set('Cookie', cookies)
        .send({ name: 'Delete Test Board' });
      const deleteBoardId = boardRes.body.id as string;

      const taskStatusRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${deleteWorkspaceId}/tasks/statuses`)
        .set('Cookie', cookies);
      const todoStatusId = (
        taskStatusRes.body as Array<{ id: string; name: string }>
      ).find((s) => s.name === 'Todo')!.id;

      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${deleteWorkspaceId}/boards/${deleteBoardId}/tasks`,
        )
        .set('Cookie', cookies)
        .send({ title: 'Delete Test Task', statusId: todoStatusId });

      // Şimdi workspace'i sil — proje, board, task, status'lar dolu olsa bile başarılı olmalı
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${deleteWorkspaceId}`)
        .set('Cookie', cookies)
        .expect(204);

      // Workspace gerçekten silinmiş mi kontrol et
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${deleteWorkspaceId}`)
        .set('Cookie', cookies)
        .expect(404);
    });
  });

  describe('PATCH /workspaces/:id/members/:userId/role — OWNER koruması', () => {
    it("ADMIN, OWNER'ın rolünü değiştirememeli (Broken Access Control fix)", async () => {
      // Bu teste özel, izole bir workspace kur — OWNER (cookies, ana
      // kullanıcı) + bir ADMIN kullanıcısı.
      const wsRes = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Cookie', cookies)
        .send({ name: 'Owner Protection Test', slug: 'owner-protection-test' });
      const ownerProtectionWsId = wsRes.body.id as string;

      // OWNER'ın kendi userId'sini öğren
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', cookies);
      const ownerUserId = meRes.body.id as string;

      // İkinci kullanıcı — ADMIN olacak
      await request(app.getHttpServer()).post('/api/v1/auth/register').send({
        email: 'admin-attacker@test.com',
        password: 'StrongPass123!',
        name: 'Admin Attacker',
      });

      const adminLoginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin-attacker@test.com', password: 'StrongPass123!' });
      const adminCookies = adminLoginRes.headers[
        'set-cookie'
      ] as unknown as string[];

      const inviteRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${ownerProtectionWsId}/invite`)
        .set('Cookie', cookies)
        .send({ email: 'admin-attacker@test.com', role: 'ADMIN' });

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/invite/accept/${inviteRes.body.token}`)
        .set('Cookie', adminCookies);

      // SALDIRI SENARYOSU: ADMIN, OWNER'ı MEMBER'a indirmeye çalışıyor
      await request(app.getHttpServer())
        .patch(
          `/api/v1/workspaces/${ownerProtectionWsId}/members/${ownerUserId}/role`,
        )
        .set('Cookie', adminCookies)
        .send({ role: 'MEMBER' })
        .expect(403);

      // Doğrulama: OWNER'ın rolü hâlâ OWNER olmalı
      const wsDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${ownerProtectionWsId}`)
        .set('Cookie', cookies);

      const ownerMember = (
        wsDetailRes.body.members as Array<{ id: string; role: string }>
      ).find((m) => m.id === ownerUserId);

      expect(ownerMember?.role).toBe('OWNER');
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
