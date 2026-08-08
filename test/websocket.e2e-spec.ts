import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('WebSocket E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let accessToken: string;
  let workspaceId: string;
  let boardId: string;
  let clientSocket: Socket;

  const PORT = 8901; // test'e özel port — dev sunucusuyla çakışmasın

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

    // WebSocket testi için gerçek bir porta dinlememiz lazım — supertest'in
    // in-memory request mekanizması socket.io bağlantıları için yeterli değil.
    await app.listen(PORT);
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await cleanDb(prisma);

    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'ws-test@test.com',
      password: 'StrongPass123!',
      name: 'WS User',
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ws-test@test.com', password: 'StrongPass123!' });

    cookies = loginRes.headers['set-cookie'] as unknown as string[];

    // Socket.io auth'u için cookie'lerden access_token'ı çıkarıyoruz —
    // WebSocket handshake, HTTP cookie'lerini otomatik taşımaz, token'ı
    // elle `auth: { token }` ile göndermemiz gerekiyor.
    const accessTokenCookie = cookies.find((c) =>
      c.startsWith('access_token='),
    );
    accessToken = accessTokenCookie!.split(';')[0].split('=')[1];

    const wsRes = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', cookies)
      .send({ name: 'WS Test Corp', slug: 'ws-test-corp' });
    workspaceId = wsRes.body.id as string;

    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects/statuses`)
      .set('Cookie', cookies);
    const activeStatusId = (
      statusRes.body as Array<{ id: string; name: string }>
    ).find((s) => s.name === 'Active')!.id;

    const projectRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Cookie', cookies)
      .send({ name: 'WS Test Project', statusId: activeStatusId });

    const boardRes = await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${workspaceId}/projects/${projectRes.body.id}/boards`,
      )
      .set('Cookie', cookies)
      .send({ name: 'WS Test Board' });
    boardId = boardRes.body.id as string;
  });

  afterAll(async () => {
    if (clientSocket?.connected) clientSocket.disconnect();
    await cleanDb(prisma);
    await app.close();
  });

  afterEach(() => {
    if (clientSocket?.connected) clientSocket.disconnect();
  });

  it('geçersiz token ile bağlanılamamalı', (done) => {
    const badSocket = io(`http://localhost:${PORT}`, {
      auth: { token: 'invalid-token' },
      reconnection: false,
    });

    badSocket.on('connect_error', () => {
      badSocket.disconnect();
      done();
    });

    badSocket.on('connect', () => {
      badSocket.disconnect();
      done(new Error('Geçersiz token ile bağlantı kurulmamalıydı'));
    });
  });

  it('geçerli token ile bağlanıp workspace odasına katılabilmeli', (done) => {
    clientSocket = io(`http://localhost:${PORT}`, {
      auth: { token: accessToken },
      reconnection: false,
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('workspace:join', { workspaceId });
    });

    clientSocket.on('workspace:joined', (data: { workspaceId: string }) => {
      expect(data.workspaceId).toBe(workspaceId);
      done();
    });

    clientSocket.on('connect_error', (err) => {
      done(new Error(`Bağlantı hatası: ${err.message}`));
    });
  });

  it('üye olunmayan workspace odasına katılamamalı (IDOR koruması)', (done) => {
    clientSocket = io(`http://localhost:${PORT}`, {
      auth: { token: accessToken },
      reconnection: false,
    });

    const fakeWorkspaceId = 'cnonexistent00000000000000';

    clientSocket.on('connect', () => {
      clientSocket.emit('workspace:join', { workspaceId: fakeWorkspaceId });
    });

    clientSocket.on('workspace:joined', () => {
      done(new Error('Üye olunmayan workspace odasına katılmamalıydı'));
    });

    clientSocket.on('exception', (err: { message: string }) => {
      expect(err.message).toContain('yetkiniz yok');
      done();
    });

    clientSocket.on('connect_error', (err) => {
      done(new Error(`Bağlantı hatası: ${err.message}`));
    });
  }, 10000);

  it("task oluşunca aynı workspace odasındaki client'a anlık bildirilmeli", (done) => {
    clientSocket = io(`http://localhost:${PORT}`, {
      auth: { token: accessToken },
      reconnection: false,
    });

    clientSocket.on('connect', () => {
      clientSocket.emit('workspace:join', { workspaceId });
    });

    clientSocket.on('workspace:joined', () => {
      void (async () => {
        const taskStatusRes = await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${workspaceId}/tasks/statuses`)
          .set('Cookie', cookies);
        const todoStatusId = (
          taskStatusRes.body as Array<{ id: string; name: string }>
        ).find((s) => s.name === 'Todo')!.id;

        await request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/boards/${boardId}/tasks`)
          .set('Cookie', cookies)
          .send({ title: 'WS Broadcast Task', statusId: todoStatusId });
      })();
    });

    clientSocket.on('task:created', (task: { title: string }) => {
      expect(task.title).toBe('WS Broadcast Task');
      done();
    });

    clientSocket.on('connect_error', (err) => {
      done(new Error(`Bağlantı hatası: ${err.message}`));
    });
  }, 10000); // task oluşturma + broadcast'i beklemek için timeout'u artırdık
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
