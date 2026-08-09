# Taskflow API

Enterprise-grade, multi-tenant project and task management REST API.

---

## Tech Stack

NestJS · TypeScript · Prisma 6 · PostgreSQL + pgvector · Redis · RabbitMQ · WebSocket (Socket.io) · JWT · Helmet · Docker · AWS · Grafana Cloud + Loki · Claude API

---

## Architecture

```
Client
  ↓
AWS VPC
  ↓
NestJS API (EC2)
  ↓       ↓           ↓         ↓
RDS    ElastiCache  RabbitMQ  WebSocket
PG     Redis            ↓      Gateway
+pgv   Cache +      Worker (email, batch, reminder)
(RAG)  Rate Limit       ↓
                    Claude API
                        ↓
                    Grafana Cloud
```

**Multi-tenancy:** Shared DB, Shared Schema — her tabloda `workspaceId`. `TenantGuard` her request'te workspace üyeliğini kontrol eder, `request.workspaceMember`'a yazar. Controller'lar `@CurrentMember()` ile okur. Bu izolasyon **REST** tarafında geçerli — WebSocket tarafında ayrı bir üyelik kontrolü var (aşağıda "WebSocket — Connection ve Room Authorization" bölümüne bakın).

**Producer/Consumer (Worker) Mimarisi:** Ana API (`src/main.ts`) ve worker (`src/worker/main.ts`) aynı repo içinde ama **tamamen ayrı process** olarak çalışır — biri HTTP sunucusu, diğeri RabbitMQ `worker.queue`'sunu dinleyen bağımsız bir NestJS microservice. Ana API, `EmailPublisherService.emit()` ile "fire and forget" mesajlar atar; worker bu mesajları `@EventPattern` handler'larıyla işler. Tek bir kuyruk üzerinden birden fazla iş türü (email, ileride reminder/batch) desteklenecek şekilde genelleştirildi.

**Real-time (WebSocket):** `WorkspaceGateway`, Socket.io tabanlı bir gateway — kullanıcılar bir workspace'e bağlanınca `workspace:{id}` odasına (room) katılır. İki katmanlı yetkilendirme var: (1) bağlantı kurulurken bir middleware JWT'yi doğrular, (2) bir odaya katılma isteğinde ayrıca o workspace'e gerçekten üye olunduğu doğrulanır. Task/comment servisleri, bir işlem tamamlanınca `emitTaskCreated`/`emitTaskUpdated`/`emitCommentAdded` gibi metotlarla aynı odadaki diğer bağlı kullanıcılara anlık olay yayınlar.

**Güvenlik Header'ları:** `helmet()` middleware'i tüm response'lara `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options` gibi header'ları otomatik ekler; `X-Powered-By` header'ını kaldırır (sunucunun Express olduğu bilgisini gizler).

---

## Data Model

```
User
  └── WorkspaceMember → Workspace
                          ├── ProjectStatus (custom + sistem)
                          ├── TaskStatus    (custom + sistem)
                          ├── Project
                          │     └── Board
                          │           └── Task
                          │                 ├── Comment       → mention'lar Notification + email + WS'e düşer
                          │                 ├── TaskLabel
                          │                 └── ActivityLog   → status/priority/assignee/comment geçmişi
                          ├── WorkspaceInvite   → oluşunca email publish edilir
                          └── AuditLog

Task
  ├── searchVector  (tsvector — full-text search, sanitize edilmiş girdi)
  └── embedding     (vector(1536) — RAG/pgvector)

Notification
  └── readAt  (nullable timestamp — null ise okunmamış, dolu ise okunma zamanı)

RefreshToken
  └── tek kullanımlık (rotation) — kullanılan token silinir, tekrar kullanılırsa
      "reuse detection" tetiklenir (bkz. Notlar)
```

**Workspace Rolleri:** `OWNER` · `ADMIN` · `MANAGER` · `MEMBER`

**Status Sistemi:** Enum yerine tablo — her workspace kendi project ve task status setini özelleştirebilir. `isSystem=true` olanlar silinemez.

**Rol Kısıtlaması Deseni:** Yapısal/organizasyonel işlemler (board oluşturma, board sıralama, proje oluşturma) `OWNER`/`ADMIN`/`MANAGER` ile sınırlı; günlük iş öğeleri (task oluşturma, task güncelleme, task sıralama) her workspace üyesine (`MEMBER` dahil) açık. Bu ayrım tüm modüllerde tutarlı uygulanıyor.

**Yorum & Mention Sistemi:** Yorumlar `@[isim](userId)` formatında gömülü mention içerebilir (Slack/Notion tarzı). `mention-parser.ts` bunları ayrıştırır; sadece workspace'e gerçekten üye olan (ve yorumu yazan kişinin kendisi olmayan) kullanıcılara hem `Notification` (in-app) hem email (worker üzerinden) gönderilir. Ayrıca yorum oluşunca, aynı workspace'i açık tutan tüm bağlı client'lara WebSocket üzerinden anlık bildirilir.

**Aktivite Akışı:** `TasksService.update()` çağrısı, `statusId`/`priority`/`assigneeId` değişikliklerini otomatik olarak `ActivityLog`'a `{from, to}` metadata'sıyla kaydeder. Yorum eklenince de ayrı bir `comment_added` aktivitesi düşer. `GET /workspaces/:wId/tasks/:tId/activity` ile tarih sırasına göre (en yeni üstte) listelenir.

**Email Bildirimleri (asenkron, worker üzerinden):**
- Mention edildiğinde
- Task atandığında (kendine atama hariç)
- Workspace davet linki oluştuğunda

Şu an gerçek SMTP entegrasyonu yok — `EmailService` (worker içinde) sadece log basarak simüle ediyor. Davet email'i loglanırken **token asla log satırına yazılmıyor** — sadece "davet gönderildi" bilgisi loglanıyor (token, bir bearer sırrı olduğu için log dosyasına sızmasını önlemek adına).

**Real-time Bildirimler (WebSocket üzerinden):**
- Task oluşturulduğunda/güncellendiğinde/silindiğinde (`task:created`/`task:updated`/`task:deleted`)
- Yorum eklendiğinde (`comment:added`)

**In-app Bildirimler:** `Notification` tablosu şu an sadece mention'larda dolduruluyor. `readAt: DateTime?` alanı tek doğruluk kaynağı — `null` okunmamış, dolu ise okunma zamanı.

---

## Project Structure

```
src/
  common/
    decorators/     → @CurrentUser, @CurrentMember, @Public, @Roles
    exceptions/     → BaseException, ErrorCode enum
    filters/        → GlobalExceptionFilter
    guards/         → JwtAuthGuard, TenantGuard
    interceptors/   → LoggingInterceptor, AuditInterceptor
    logger/         → Winston (console + file + daily rotate)
    types/          → TaskflowRequest, AuthenticatedUser
  modules/
    auth/           → JWT, refresh token (transaction + reuse detection), httpOnly cookie, 2FA
    users/          → profil, şifre değiştir, hesap sil
    workspaces/     → CRUD, davet sistemi (email publish), üye yönetimi, roller, üye arama
    projects/       → CRUD + custom status yönetimi
    boards/         → CRUD, sıralama (IDOR korumalı + rol kısıtlı), reorder
    tasks/          → CRUD, atama (email publish), öncelik, deadline, sub-task, move, reorder (IDOR korumalı), custom status, aktivite akışı, WS broadcast, sanitize edilmiş full-text search
    labels/         → CRUD, task'a etiket ekle/kaldır
    comments/       → CRUD, mention parsing + bildirim + email publish + WS broadcast
    notifications/  → listeleme, okunmamış sayısı, tekli/toplu okundu işaretleme
    ai/             → Claude API, RAG, task asistanı
    analytics/      → big data pipeline, sprint istatistikleri
  queue/
    rabbitmq.constants.ts     → queue adı + tüm pattern sabitleri
    rabbitmq.module.ts        → ana API tarafı, ClientsModule ile mesaj gönderme
    email-publisher.service.ts → mention/task-assigned/workspace-invite publish metodları
  websocket/
    authenticated-socket.type.ts → client.data.user için tip güvenliği
    ws-auth.guard.ts              → mesaj bazlı ekstra doğrulama katmanı
    workspace.gateway.ts          → asıl gateway; afterInit'te connection-level JWT middleware'i + workspace:join'de üyelik kontrolü (IDOR fix)
    websocket.module.ts
  worker/
    main.ts                   → BAĞIMSIZ process, HTTP yok, sadece worker.queue dinler
    worker.module.ts          → EmailModule'ü (ileride ReminderModule, BatchModule) import eder
    email/
      email.module.ts
      email.controller.ts     → @EventPattern handler'ları
      email.service.ts        → gerçek gönderim burada (şimdilik simüle, token loglamıyor)
  prisma/
    prisma.service.ts
    prisma.module.ts
  app.module.ts
  main.ts                      → helmet() burada uygulanıyor

prisma/
  _config.prisma
  _enums.prisma       → TaskPriority
  user.prisma         → User, RefreshToken
  workspace.prisma    → Workspace, WorkspaceMember, WorkspaceInvite
  project.prisma      → Project, ProjectStatus
  board.prisma        → Board
  task.prisma         → Task, TaskLabel, TaskStatus
  label.prisma        → Label
  comment.prisma      → Comment
  activity.prisma     → ActivityLog
  notification.prisma → Notification (readAt tabanlı okundu/okunmadı)
  audit.prisma        → AuditLog
  migrations/

test/
  app.e2e-spec.ts          → security header testi (Helmet) dahil
  workspace.e2e-spec.ts    → CRUD + cascade delete testi
  project.e2e-spec.ts
  board.e2e-spec.ts        → reorder IDOR + rol kısıtlama regresyon testleri
  task.e2e-spec.ts         → reorder IDOR + search sanitization regresyon testleri
  label.e2e-spec.ts
  comment.e2e-spec.ts      → yorum CRUD, mention bildirimi, aktivite akışı, yetki kontrolleri
  websocket.e2e-spec.ts    → connection-level auth + workspace:join IDOR regresyon testi

.husky/
  pre-commit    → npm run lint
  pre-push      → npm test

test-websocket.js  → manuel WS test script'i (env variable ile token alır, hardcode YOK)
```

---

## API Endpoints

### Auth
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /auth/register | Kayıt |
| POST | /auth/login | Giriş |
| POST | /auth/login/2fa | 2FA ile giriş |
| POST | /auth/logout | Çıkış |
| POST | /auth/refresh | Token yenile (transaction + reuse detection korumalı) |
| GET | /auth/me | Mevcut kullanıcı |
| POST | /auth/2fa/enable | 2FA aktifleştir |
| POST | /auth/2fa/verify | 2FA doğrula |

### Users
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | /users/me | Profil bilgisi |
| PATCH | /users/me | Profil güncelle |
| PATCH | /users/me/password | Şifre değiştir |
| DELETE | /users/me | Hesabı sil |

### Workspaces
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces | Workspace oluştur |
| GET | /workspaces | Üye olduğum workspace'ler |
| GET | /workspaces/:id | Workspace detayı |
| PATCH | /workspaces/:id | Güncelle |
| DELETE | /workspaces/:id | Sil (OWNER) — ilişkili tüm veri cascade silinir |
| POST | /workspaces/:id/invite | Üye davet et (davet email'i worker'a publish edilir, token loglanmaz) |
| POST | /workspaces/invite/accept/:token | Daveti kabul et (email doğrulamalı) |
| GET | /workspaces/:id/invites | Bekleyen davetleri listele |
| DELETE | /workspaces/:id/invites/:inviteId | Daveti iptal et |
| DELETE | /workspaces/:id/members/:userId | Üyeyi çıkar |
| PATCH | /workspaces/:id/members/:userId/role | Rol değiştir |
| GET | /workspaces/:id/members/search | Üye ara (mention/assignee autocomplete için) |

### Projects
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces/:wId/projects | Proje oluştur |
| GET | /workspaces/:wId/projects | Projeleri listele |
| GET | /workspaces/:wId/projects/:id | Proje detayı |
| PATCH | /workspaces/:wId/projects/:id | Güncelle |
| DELETE | /workspaces/:wId/projects/:id | Sil |
| GET | /workspaces/:wId/projects/statuses | Status listele |
| POST | /workspaces/:wId/projects/statuses | Status ekle |
| PATCH | /workspaces/:wId/projects/statuses/:id | Status güncelle |
| DELETE | /workspaces/:wId/projects/statuses/:id | Status sil |

### Boards
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces/:wId/projects/:pId/boards | Board oluştur (OWNER/ADMIN/MANAGER) |
| GET | /workspaces/:wId/projects/:pId/boards | Board listele |
| PATCH | /workspaces/:wId/projects/:pId/boards/:id | Güncelle |
| PATCH | /workspaces/:wId/projects/:pId/boards/reorder | Sırala (OWNER/ADMIN/MANAGER, ID sahiplik doğrulamalı — IDOR korumalı) |
| DELETE | /workspaces/:wId/projects/:pId/boards/:id | Sil |

### Tasks
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces/:wId/boards/:bId/tasks | Task oluştur (WS: task:created broadcast) |
| GET | /workspaces/:wId/boards/:bId/tasks | Task listele |
| GET | /workspaces/:wId/tasks/:id | Task detayı |
| GET | /workspaces/:wId/tasks/search?q= | Full-text search (girdi sanitize edilir) |
| PATCH | /workspaces/:wId/tasks/:id | Güncelle (assignee değişince email publish, WS: task:updated broadcast) |
| PATCH | /workspaces/:wId/tasks/:id/move | Board'a taşı |
| PATCH | /workspaces/:wId/boards/:bId/tasks/reorder | Sırala (ID sahiplik doğrulamalı — IDOR korumalı, tüm üyeler kullanabilir) |
| DELETE | /workspaces/:wId/tasks/:id | Sil (WS: task:deleted broadcast) |
| GET | /workspaces/:wId/tasks/statuses | Status listele |
| POST | /workspaces/:wId/tasks/statuses | Status ekle |
| PATCH | /workspaces/:wId/tasks/statuses/:id | Status güncelle |
| DELETE | /workspaces/:wId/tasks/statuses/:id | Status sil |
| GET | /workspaces/:wId/tasks/:id/activity | Task aktivite akışı |

### Labels
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces/:wId/projects/:pId/labels | Label oluştur |
| GET | /workspaces/:wId/projects/:pId/labels | Label listele |
| PATCH | /workspaces/:wId/projects/:pId/labels/:id | Güncelle |
| DELETE | /workspaces/:wId/projects/:pId/labels/:id | Sil |
| POST | /workspaces/:wId/tasks/:tId/labels/:lId | Task'a ekle |
| DELETE | /workspaces/:wId/tasks/:tId/labels/:lId | Task'tan kaldır |

### Comments
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /workspaces/:wId/tasks/:tId/comments | Yorum ekle (mention destekli, in-app + email + WS bildirimi) |
| GET | /workspaces/:wId/tasks/:tId/comments | Yorumları listele |
| PATCH | /workspaces/:wId/comments/:id | Yorumu düzenle (sadece sahibi) |
| DELETE | /workspaces/:wId/comments/:id | Yorumu sil (sahibi veya OWNER/ADMIN moderasyon) |

### Notifications
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | /notifications | Bildirimlerimi listele (?unreadOnly=true ile filtrelenebilir, son 50) |
| GET | /notifications/unread-count | Okunmamış bildirim sayısı (header badge için) |
| PATCH | /notifications/:id/read | Bir bildirimi okundu işaretle |
| PATCH | /notifications/read-all | Tüm bildirimleri okundu işaretle |

### WebSocket Events

Bağlantı: `io('http://localhost:8000', { auth: { token: accessToken } })`

| Yön | Event | Payload | Açıklama |
|-----|-------|---------|----------|
| Client → Server | `workspace:join` | `{ workspaceId }` | Bir workspace odasına katıl (üyelik doğrulanır) |
| Client → Server | `workspace:leave` | `{ workspaceId }` | Workspace odasından ayrıl |
| Server → Client | `workspace:joined` | `{ workspaceId }` | Katılım onayı |
| Server → Client | (exception) | `{ status: 'error', message, cause }` | Yetkisiz katılma denemesi reddedildi |
| Server → Client | `task:created` | `Task` | Yeni task oluştu |
| Server → Client | `task:updated` | `Task` | Task güncellendi |
| Server → Client | `task:deleted` | `{ taskId }` | Task silindi |
| Server → Client | `comment:added` | `{ taskId, comment }` | Yeni yorum eklendi |

---

## Error Response Format

```json
{
  "statusCode": 409,
  "errorCode": "AUTH_002",
  "message": "Email address is already in use",
  "path": "/api/v1/auth/register",
  "method": "POST",
  "timestamp": "2026-08-09T..."
}
```

---

## Error Codes

| Code      | Constant                  | Açıklama                     |
|-----------|---------------------------|------------------------------|
| AUTH_001  | AUTH_INVALID_CREDENTIALS  | Hatalı email/şifre           |
| AUTH_002  | AUTH_EMAIL_ALREADY_EXISTS | Email zaten kayıtlı          |
| AUTH_003  | AUTH_TOKEN_EXPIRED        | JWT süresi dolmuş            |
| AUTH_004  | AUTH_TOKEN_INVALID        | Geçersiz token (reuse detection dahil) |
| AUTH_005  | AUTH_NO_REFRESH_TOKEN     | Refresh token yok            |
| AUTH_006  | AUTH_2FA_REQUIRED         | 2FA kodu gerekli             |
| AUTH_007  | AUTH_2FA_INVALID_CODE     | Hatalı 2FA kodu              |
| WS_001    | WORKSPACE_NOT_FOUND       | Workspace bulunamadı         |
| WS_002    | WORKSPACE_FORBIDDEN       | Yetkisiz erişim              |
| WS_003    | WORKSPACE_SLUG_TAKEN      | Slug kullanımda              |
| WS_004    | WORKSPACE_INVITE_INVALID  | Geçersiz davet               |
| WS_005    | WORKSPACE_INVITE_EXPIRED  | Süresi dolmuş davet          |
| PRJ_001   | PROJECT_NOT_FOUND         | Proje bulunamadı             |
| PRJ_002   | PROJECT_FORBIDDEN         | Yetkisiz erişim              |
| BOARD_001 | BOARD_NOT_FOUND           | Board bulunamadı (IDOR reddi dahil) |
| BOARD_002 | BOARD_FORBIDDEN           | Yetkisiz erişim              |
| TASK_001  | TASK_NOT_FOUND            | Task bulunamadı (IDOR reddi dahil) |
| TASK_002  | TASK_FORBIDDEN            | Yetkisiz erişim              |
| LBL_001   | LABEL_NOT_FOUND           | Label bulunamadı             |
| LBL_002   | LABEL_FORBIDDEN           | Yetkisiz erişim              |
| CMT_001   | COMMENT_NOT_FOUND         | Yorum bulunamadı             |
| CMT_002   | COMMENT_FORBIDDEN         | Yetkisiz erişim (sahiplik)   |
| NTF_001   | NOTIFICATION_NOT_FOUND    | Bildirim bulunamadı          |
| USER_001  | USER_NOT_FOUND            | Kullanıcı bulunamadı         |
| RATE_001  | RATE_LIMIT_EXCEEDED       | Çok fazla istek              |

---

## Environment Variables

```env
# App
NODE_ENV=development
PORT=8000

# Database
DATABASE_URL=postgresql://taskflow:taskflow_pass@localhost:5432/taskflow_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://taskflow:taskflow_pass@localhost:5672

# JWT
JWT_SECRET=...
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=...
REFRESH_TOKEN_EXPIRES_IN=7d

# Frontend
FRONTEND_URL=http://localhost:3000

# Anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

---

## Development

```bash
# Docker servislerini başlat (Postgres, Redis, RabbitMQ)
docker compose up -d

# Migrate
npx prisma migrate dev

# Ana API (Terminal 1)
npm run start:dev
# Swagger: http://localhost:8000/api/docs
# WebSocket: ws://localhost:8000

# Worker (Terminal 2) — ayrı process, HTTP yok, sadece worker.queue dinler
npm run start:worker

# RabbitMQ Management UI
# http://localhost:15672

# Unit testler
npm test

# E2E testler (izole test DB, WebSocket testi gerçek bir porta [8901] dinler)
npm run test:e2e

# Manuel WebSocket testi (token'ı ASLA hardcode etme, env variable kullan)
TEST_ACCESS_TOKEN='<access_token>' TEST_WORKSPACE_ID='<workspace_id>' node test-websocket.js

# Bağımlılık güvenlik denetimi
npm audit
```

## Test Environment Setup

```bash
# Test DB oluştur
docker exec -it taskflow_postgres psql -U taskflow -d taskflow_db -c "CREATE DATABASE taskflow_test_db;"

# Test DB'ye migrate et
DATABASE_URL=postgresql://taskflow:taskflow_pass@localhost:5432/taskflow_test_db npx prisma migrate deploy

# .env.test oluştur
echo "NODE_ENV=test" > .env.test
echo "DATABASE_URL=postgresql://taskflow:taskflow_pass@localhost:5432/taskflow_test_db" >> .env.test
```

## Git Hooks (Husky)

- **pre-commit** → `npm run lint` — lint hatası varsa commit engellenir
- **pre-push** → `npm test` — unit testler geçmezse push engellenir
- E2E testler hook'lara dahil değil (uzun sürdüğü için), CI/CD'de çalıştırılır

---

## Workspace Oluşturulunca Otomatik Eklenenler

**Project Statuses:**
- Active `#22C55E`
- Completed `#6366F1`
- Archived `#6B7280`

**Task Statuses:**
- Todo `#6B7280`
- In Progress `#3B82F6`
- In Review `#F59E0B`
- Done `#22C55E`

---

## Notlar

### Workspace Silme — Cascade Sırası

`WorkspacesService.remove()` workspace'i silerken ilişkili tüm veriyi **manuel ve belirli bir sırada** siler. Silme sırası:
```
ActivityLog → Comment → TaskLabel → Task → Label → Board
  → Project → TaskStatus → ProjectStatus
  → AuditLog → WorkspaceInvite → WorkspaceMember → Workspace
```
Bu sıra `workspace.e2e-spec.ts` testiyle regresyona karşı korunur.

### Rate Limiting

`@nest-lab/throttler-storage-redis` ile Redis-backed rate limiting. Test ortamında (`NODE_ENV=test`) devre dışı.

### Audit Log

`AuditInterceptor` global olarak tüm `POST`/`PATCH`/`DELETE` isteklerini otomatik loglar.

### Mention Sistemi

Yorumlarda mention, gömülü `@[isim](userId)` formatında yazılır (bkz. `mention-parser.ts`). `handleMentions()` üç güvenlik kontrolü yapar: (1) mention edilen `userId` gerçekten workspace üyesi mi, (2) kendini mention edince bildirim gitmez, (3) aynı kişi birden fazla kez mention edilirse tek bildirim gider.

### Worker / Producer-Consumer Mimarisi

```
npm run start:dev     → src/main.ts        → HTTP sunucu, :8000
npm run start:worker  → src/worker/main.ts → RabbitMQ worker.queue dinleyici, HTTP yok
```

Biri çökse diğerinin etkilenmediği gerçek bir process izolasyonu — email sunucusu/worker geçici durursa ana API'nin CRUD işlevleri etkilenmez, bildirimler kuyrukta birikip worker geri gelince işlenir.

### WebSocket — Connection ve Room Authorization (İki Katmanlı)

**1. Connection-level (bağlantı seviyesi):** `WorkspaceGateway.afterInit()` içinde kayıtlı bir `server.use()` middleware'i, handshake tamamlanmadan önce JWT'yi doğrular. Geçersiz/eksik token'la bağlanmaya çalışan bir client, `connect` event'i hiç almadan `connect_error` alır.

**2. Room-level (oda seviyesi):** JWT'nin geçerli olması, kullanıcının **o workspace'e üye olduğu** anlamına gelmez — bu ayrı bir kontrol. `handleJoinWorkspace()`, `workspace:join` isteğinde `WorkspaceMember` tablosunda gerçek bir üyelik kaydı arar; yoksa `WsException` fırlatıp katılımı reddeder. Bu ikinci katman olmadan, kimliği doğrulanmış herhangi bir kullanıcı başka bir workspace'in ID'sini tahmin edip o workspace'in tüm real-time olaylarını (task içerikleri, yorumlar) dinleyebilirdi — bu, bir güvenlik denetiminde bulunup kapatılan gerçek bir IDOR açığıydı, `websocket.e2e-spec.ts`'te regresyon testiyle korunuyor.

### Reorder Endpoint'leri — IDOR Koruması

`tasks.reorder()` ve `boards.reorder()`, hedef kaynağın (board/project) doğru workspace'e ait olduğunu doğrulamanın **yeterli olmadığını** varsayar — `dto.taskIds`/`dto.boardIds` dizisindeki **her bir ID'nin** de gerçekten o board'a/project'e ait olduğu ayrıca `count()` ile doğrulanır (`validCount !== dto.ids.length` ise reddedilir). Bu kontrol olmadan, bir kullanıcı kendi erişimi olan bir board'a başka bir workspace'e ait task/board ID'leri vererek onların `position` alanını manipüle edebilirdi. `task.e2e-spec.ts` ve `board.e2e-spec.ts`'te regresyon testleriyle korunuyor.

`boards.reorder()` ayrıca `boards.create()` ile tutarlı olacak şekilde `OWNER`/`ADMIN`/`MANAGER` rol kısıtlaması taşır (board sıralaması, board oluşturma gibi yapısal bir karar); `tasks.reorder()` ise rol kısıtlaması taşımaz (herhangi bir workspace üyesi kendi board'undaki task'ları sıralayabilir, `tasks.create()` ile tutarlı).

### Refresh Token — Race Condition ve Reuse Detection

Eski implementasyonda token silme + yeni token oluşturma iki ayrı (transaction'sız) işlemdi ve token tekrar kullanıldığında (çalıntı senaryosu) hiçbir tespit mekanizması yoktu. İki düzeltme yapıldı:

1. **Race condition:** `delete` + `create`, artık tek bir `$transaction` içinde, atomik. Aynı token'la eşzamanlı iki istek gelirse, PostgreSQL'in row-level kilitlemesi sayesinde ikinci istek birincinin commit'ini bekler, token'ın silinmiş olduğunu görür.

2. **Reuse detection:** `refreshTokens()` çağrıldığında token DB'de bulunamazsa (daha önce kullanılıp silinmiş demektir — JWT imzası zaten doğrulanmış olduğu için bu rastgele bir saldırı denemesi değil, **geçerli ama tekrar kullanılan** bir token'dır), kullanıcının **tüm** refresh token'ları iptal edilir. Bu, klasik "refresh token replay" saldırısının (token çalınıp hem saldırgan hem gerçek kullanıcı aynı token'ı kullanmaya çalışması) tespit mekanizmasıdır.

**Bilinen trade-off:** Bu mekanizma, iki farklı **tarayıcı sekmesinin** (her biri kendi JS belleğinde, frontend'deki `refreshTokens()` kilidi sekmeler arası paylaşılmadığı için) aynı anda refresh denemesi yapması durumunda, nadir de olsa yanlış pozitif üretip kullanıcının tüm oturumlarını iptal edebilir. Bu, endüstri standardı bir trade-off (Auth0 dahil aynı yaklaşımı kullanır) — güvenlik kazancı, bu nadir UX maliyetine değer görülüyor.

Manuel olarak curl ile uçtan uca doğrulandı: normal refresh → başarılı; eski token'ı tekrar kullanma → 401; bu noktada **yeni** (teorik olarak hâlâ geçerli olması gereken) token bile 401 dönüyor — reuse detection'ın tüm oturumları iptal ettiğinin kanıtı.

### Full-text Search — Girdi Sanitization

`tasks.search()`, kullanıcı girdisini `to_tsquery`'e vermeden önce sanitize eder — `& | ! ( ) : *` gibi PostgreSQL tsquery operatör karakterlerini boşlukla değiştirir. Bu olmadan, `((((` gibi bozuk sözdizimli bir girdi `to_tsquery` syntax error'ı fırlatıp 500 hatası (ve tekrarlanabilir bir küçük ölçekli DoS) üretebilirdi. `task.e2e-spec.ts`'te regresyon testleriyle korunuyor.

### Bağımlılık Güvenliği

`npm audit` ile düzenli kontrol ediliyor, şu an **0 bilinen zafiyet**. `js-yaml`'ın `@nestjs/swagger` altında sabitlenmiş eski bir versiyonu `npm audit fix`'in çözemediği bir durumdaydı — `package.json`'a `overrides: { "js-yaml": "^5.2.3" }` eklenerek bağımlılık ağacının tamamında zorla güncel/güvenli versiyon kullanılması sağlandı.

### In-app Bildirimler — readAt Deseni

`Notification.readAt` nullable bir `DateTime` — ayrı bir `isRead: boolean` alanı **kasıtlı olarak** tutulmuyor, iki alanın senkron kalma riskini önlemek için (aynı desen `WorkspaceInvite.acceptedAt`'te de var). `NotificationsService.markAsRead()`, sorgusunda hem `id` hem `userId`'yi birlikte filtreler — bu, IDOR (Insecure Direct Object Reference) tarzı bir açığı engelliyor ve özel bir testle doğrulanıyor.

---

## Bilinen Eksikler / Notlar

- **2FA devre dışı bırakma:** `DELETE /auth/2fa` endpoint'i henüz yok (Faz 2.15).
- **Mention frontend entegrasyonu:** Backend hazır, frontend'de mention autocomplete henüz yok.
- **Gerçek SMTP entegrasyonu yok:** Email gönderimi şu an sadece simüle ediliyor (Faz 2.16).
- **Frontend Faz 2'ye hiç girmedi:** Backend'de yorum, mention, aktivite akışı, WebSocket real-time senkronizasyon, in-app bildirimler tamamen çalışır durumda ama frontend'de (`taskflow-web`) bunların hiçbiri için UI yok — sıradaki öncelik bu.
- **Pagination bilinçli olarak ertelendi:** Hiçbir listeleme endpoint'inde `skip`/`take` yok. Bu, bir güvenlik denetiminde bulundu ve **bilinçli olarak** ertelendi çünkü: (1) task listesi kanban board'u besliyor, pagination eklemek frontend'de "sonsuz kaydırma" gibi büyük bir UX değişikliği gerektirir; (2) yorum/aktivite akışı gibi gerçekten pagination'a uygun yerlerde bile, kapsamı genişletmeden önce frontend'in buna hazır olması gerekiyor. İleride ele alınacak (Faz 2.17).
- **Kolon bazlı filtreleme yok:** Task'ları status/priority/assignee/label'a göre filtreleme (query param ile, örn. `?status=DONE&priority=HIGH`) backend'de henüz yok. Frontend roadmap'inde (Faz 3.1 — "Task filtreleme") zaten planlıydı, backend karşılığı bu README'nin Faz 3'üne eklendi (3.19).

---

## Roadmap

### Faz 1 — Core ✅

| # | Özellik | Durum |
|---|---------|-------|
| 1.1 | Proje setup — NestJS + Prisma + Docker Compose | ✅ |
| 1.2 | Prisma multi-file schema — tüm modeller + migration | ✅ |
| 1.3 | GlobalExceptionFilter + ErrorCode enum | ✅ |
| 1.4 | LoggingInterceptor | ✅ |
| 1.5 | Custom decorators (@CurrentUser, @CurrentMember, @Public, @Roles) | ✅ |
| 1.6 | Auth — register, login, logout | ✅ |
| 1.7 | Auth — JWT + httpOnly cookie | ✅ |
| 1.8 | Auth — refresh token rotasyonu | ✅ |
| 1.9 | Auth — 2FA (TOTP / Google Authenticator) | ✅ |
| 1.10 | JwtAuthGuard — global guard | ✅ |
| 1.11 | TenantGuard — workspace izolasyonu | ✅ |
| 1.12 | Workspace CRUD | ✅ |
| 1.13 | Workspace davet sistemi (email token) | ✅ |
| 1.14 | Project CRUD + custom status | ✅ |
| 1.15 | Board CRUD + sıralama | ✅ |
| 1.16 | Task CRUD + atama + öncelik + deadline | ✅ |
| 1.17 | Task — sub-task desteği | ✅ |
| 1.18 | Label CRUD + task'a etiket ekleme | ✅ |
| 1.19 | Rate limiting — Redis ile (throttler) | ✅ |
| 1.20 | Audit log — before/after, global interceptor | ✅ |
| 1.21 | Full-text search — task (PostgreSQL tsvector + trigger) | ✅ |
| 1.22 | Winston logger + daily rotate | ✅ |
| 1.23 | Unit testler — Auth, Workspace, Tasks, Boards, Projects, Labels | ✅ |
| 1.24 | E2E testler — auth, workspaces (cascade delete dahil), projects, boards, tasks, labels — 46 test | ✅ |
| 1.25 | Users modülü — profil, şifre değiştir, hesap sil | ✅ |
| 1.26 | Husky — pre-commit lint, pre-push test | ✅ |
| 1.27 | Workspace silme — ilişkili veri cascade sırası düzeltmesi + regresyon testi | ✅ |

---

### Faz 2 — Collaboration 🚧

| # | Özellik | Durum |
|---|---------|-------|
| 2.1 | Yorum sistemi — task'a yorum ekle/düzenle/sil (unit + E2E test edildi) | ✅ |
| 2.2 | Mention sistemi — `@[isim](userId)` parsing + Notification (unit + E2E test edildi) | ✅ |
| 2.3 | Aktivite akışı — task geçmişi (status/priority/assignee/comment otomatik loglama) | ✅ |
| 2.4 | RabbitMQ kurulum + genelleştirilmiş worker.queue yapısı (email/reminder/batch pattern'leri) | ✅ |
| 2.5 | Worker uygulaması — ayrı process, `@EventPattern` handler'ları, şimdilik email (unit test edildi) | ✅ |
| 2.6 | Email bildirimi — task atandığında (uçtan uca test edildi) | ✅ |
| 2.7 | Email bildirimi — workspace daveti (uçtan uca test edildi, token loglanmıyor) | ✅ |
| 2.8 | WebSocket gateway — NestJS + Socket.io, connection-level JWT middleware auth (E2E test edildi) | ✅ |
| 2.9 | Real-time bildirim — task CRUD + comment eklendiğinde broadcast (uçtan uca E2E test edildi) | ✅ |
| 2.10 | In-app bildirim — listeleme, okunmamış sayısı, tekli/toplu okundu işaretleme, IDOR koruması (unit test edildi) | ✅ |
| 2.11 | **Güvenlik denetimi** — statik kod analizi, 4 kritik + 4 yüksek öncelikli bulgu tespit edildi ve kapatıldı (bkz. Notlar) | ✅ |
| 2.12 | Webhook sistemi — Slack entegrasyonu | ⬜ |
| 2.13 | Webhook sistemi — Teams entegrasyonu | ⬜ |
| 2.14 | Redis cache — workspace/project/task hot data | ⬜ |
| 2.15 | Cache invalidation stratejisi | ⬜ |
| 2.16 | 2FA devre dışı bırakma endpoint'i (bkz. Bilinen Eksikler) | ⬜ |
| 2.17 | Gerçek SMTP entegrasyonu (bkz. Bilinen Eksikler) | ⬜ |
| 2.18 | Pagination — bilinçli olarak ertelendi, frontend UX kararı netleşince ele alınacak (bkz. Bilinen Eksikler) | ⬜ |

---

### Faz 3 — AI + RAG + Big Data ⬜

| # | Özellik | Durum |
|---|---------|-------|
| 3.1 | pgvector kurulum + embedding pipeline | ⬜ |
| 3.2 | RAG — döküman yükle + chunk + index | ⬜ |
| 3.3 | RAG — semantic search + bağlam alma | ⬜ |
| 3.4 | Claude API entegrasyonu | ⬜ |
| 3.5 | Task asistanı — başlık ver, AI açıklama + alt görev önersin | ⬜ |
| 3.6 | Sprint planlama asistanı — AI kapasite bazlı öneri | ⬜ |
| 3.7 | Otomatik önceliklendirme — AI task önceliği atasın | ⬜ |
| 3.8 | Worker'a AI event pipeline eklenmesi — task oluşunca AI analiz (mevcut worker.queue altyapısı kullanılacak) | ⬜ |
| 3.9 | Faker.js seed script — 1 milyon activity log | ⬜ |
| 3.10 | Workspace Analytics Pipeline — gece cron job (worker içinde yeni bir BatchModule olarak) | ⬜ |
| 3.11 | Batch processing — 1000'erlik gruplar | ⬜ |
| 3.12 | Worker concurrency (concurrency: 10) | ⬜ |
| 3.13 | Dead letter queue — başarısız job'lar | ⬜ |
| 3.14 | Idempotency — aynı job 2x çalışırsa sorun olmasın | ⬜ |
| 3.15 | Cursor-based pagination — büyük veri setleri | ⬜ |
| 3.16 | Anomali tespiti — "Bu sprint %40 yavaş" | ⬜ |
| 3.17 | Sprint istatistikleri dashboard | ⬜ |
| 3.18 | PDF/CSV export | ⬜ |
| 3.19 | Task filtreleme — status/priority/assignee/label bazlı query param filtreleri (frontend Faz 3.1 ile eşleşiyor) | ⬜ |

---

### Faz 4 — AWS Deploy + Production ⬜

| # | Özellik | Durum |
|---|---------|-------|
| 4.1 | AWS VPC kurulumu — private network | ⬜ |
| 4.2 | EC2 (t2.micro) — NestJS backend deploy | ⬜ |
| 4.3 | RDS (t3.micro) — PostgreSQL | ⬜ |
| 4.4 | ElastiCache — Redis | ⬜ |
| 4.5 | S3 — dosya ve avatar storage | ⬜ |
| 4.6 | ECS/ECR — Docker container yönetimi (ana API ve worker ayrı container image'lar olarak) | ⬜ |
| 4.7 | RabbitMQ — EC2'da self-hosted | ⬜ |
| 4.8 | GitHub Actions CI/CD — AWS'ye otomatik deploy | ⬜ |
| 4.9 | Grafana Cloud + Loki — log monitoring | ⬜ |
| 4.10 | Production migration stratejisi | ⬜ |
| 4.11 | Health check endpoint (@nestjs/terminus ile DB/Redis/RabbitMQ kontrolü) | ⬜ |
| 4.12 | E2E test coverage artırma (controller-level testler, users modülü testleri) | ⬜ |
| 4.13 | Performans optimizasyonu + load testing | ⬜ |
| 4.14 | Forgot/reset password akışı | ⬜ |
| 4.15 | RolesGuard + @Roles() decorator'ı gerçekten devreye alma (şu an ölü kod, manuel assertRole() deseni kullanılıyor) | ⬜ |

---

### Bonus — npm Package ⬜

| # | Özellik | Durum |
|---|---------|-------|
| B.1 | Generic Repository Pattern — Taskflow'da implement et | ⬜ |
| B.2 | `@fffset/nestjs-repository` — npm'e publish et | ⬜ |