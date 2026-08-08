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

describe('Auth E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await prisma.taskLabel.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.label.deleteMany();
    await prisma.project.deleteMany();
    await prisma.projectStatus.deleteMany();
    await prisma.taskStatus.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
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
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('başarılı kayıt', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@test.com',
          password: 'StrongPass123!',
          name: 'E2E User',
        })
        .expect(201);

      expect(res.body.email).toBe('e2e@test.com');
    });

    it('aynı email ile tekrar kayıt — 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@test.com',
          password: 'StrongPass123!',
          name: 'E2E User',
        })
        .expect(409);
    });

    it('geçersiz email — 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid',
          password: 'StrongPass123!',
          name: 'E2E User',
        })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('başarılı login — cookie set edilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e@test.com', password: 'StrongPass123!' })
        .expect(200);

      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.email).toBe('e2e@test.com');
    });

    it('yanlış şifre — 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e@test.com', password: 'wrong' })
        .expect(401);
    });
  });
});
