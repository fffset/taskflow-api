# TaskFlow API — Kod Analizi Raporu

**Tarih:** 2026-08-08
**Kapsam:** Tüm `src/`, `prisma/`, `test/`, kök dizin dosyaları, `package.json`, `docker-compose.yml`, `README.md`
**Yöntem:** Statik kod okuma (manuel), otomatik tarayıcı kullanılmadı. Her bulgu dosya yolu + satır referansı ile doğrulanmıştır.

---

## Genel Değerlendirme

TaskFlow API; NestJS + Prisma 6 + PostgreSQL(pgvector) + Redis + RabbitMQ + Socket.io üzerine kurulu, çok kiracılı (multi-tenant) bir proje/görev yönetim REST API'si. README'ye göre:

- **Faz 1 (Core):** ✅ Tamamlanmış — auth, JWT+cookie, 2FA, tenant izolasyonu, CRUD'lar, rate limiting, audit log, testler
- **Faz 2 (Collaboration):** 🚧 Kısmen tamamlanmış (10/16) — yorum/mention/bildirim/WS var; Slack/Teams, Redis cache, gerçek SMTP eksik
- **Faz 3 (AI + RAG):** ⬜ Hiç başlanmamış — `ai`/`analytics` dizinleri boş
- **Faz 4 (AWS Deploy):** ⬜ Hiç başlanmamış — Dockerfile, CI/CD, health check yok

Genel mimari disiplinli (TenantGuard, global ValidationPipe, düzenli Prisma migration'ları, audit log). Ancak canlıya çıkmadan önce kapatılması gereken birkaç **kritik** güvenlik açığı ve çok sayıda **eksik** var.

---

## 🔴 Kritik Bulgular

### 1. Git geçmişine commit edilmiş gerçek bir JWT access token
**Dosya:** [test-websocket.js:3](test-websocket.js#L3) — commit `c020324`

```js
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Bu, gerçek bir kullanıcının (`email: newnew@gmail.com`, gerçek bir `userId`) plaintext JWT'si. Token'ın süresi doğrulandı: **2026-08-07'de (dün) dolmuş**, yani şu an istismar edilemez. Ancak:
- Kod, "test scripti yazarken gerçek token'ı hardcode edip commit etme" pratiğinin canlı bir örneği — alışkanlık sürerse bir sonraki sefer süresi dolmamış bir token commit edilebilir.
- Git geçmişi kalıcıdır; repo public olursa veya başka biriyle paylaşılırsa (fork, CI log, vs.) bu desen tekrar edecektir.

**Öneri:** Dosyayı `.env`'den okuyacak şekilde güncelle (`process.env.TEST_ACCESS_TOKEN`), git geçmişinden bu commit'i temizlemeyi değerlendir (BFG/filter-repo — repo henüz paylaşılmadıysa düşük maliyetli), `.gitignore`'a benzer manuel test scriptlerini eklemeyi düşün.

### 2. `cookies.txt` içinde plaintext refresh token (disk üzerinde)
**Dosya:** `cookies.txt` (repo kökü)

`.gitignore`'da olduğu için commit edilmemiş, ancak diskte curl cookie-jar formatında gerçek bir refresh token duruyor. Geliştirme sırasında oluşmuş bir yan ürün olsa da, paylaşılan makinelerde veya yanlışlıkla arşivlenip gönderilen zip'lerde sızma riski taşır.

**Öneri:** Sil, `.gitignore`'da olduğunu teyit et (zaten var), README'ye "test cookie dosyalarını commit etmeyin" notu ekle.

### 3. WebSocket `workspace:join` — IDOR (yetkisiz oda erişimi)
**Dosya:** [src/websocket/workspace.gateway.ts:76-90](src/websocket/workspace.gateway.ts#L76-L90)

```ts
@UseGuards(WsAuthGuard)
@SubscribeMessage('workspace:join')
handleJoinWorkspace(@ConnectedSocket() client, @MessageBody() data: { workspaceId: string }) {
  void client.join(workspaceRoom(data.workspaceId));
  ...
}
```

`WsAuthGuard` yalnızca JWT'nin **geçerli** olduğunu doğruluyor; kullanıcının verdiği `workspaceId`'ye gerçekten **üye olup olmadığı hiç kontrol edilmiyor**. Kimliği doğrulanmış herhangi bir kullanıcı, başka bir workspace'in ID'sini tahmin edip/öğrenip o odaya katılabilir ve `task:created`, `task:updated`, `comment:added` gibi olayları (task başlığı, açıklama, yorum içeriği dahil) gerçek zamanlı dinleyebilir. REST tarafındaki `TenantGuard` korumasının WebSocket tarafında karşılığı yok.

**Öneri:** `handleJoinWorkspace` içinde `prisma.workspaceMember.findFirst({ where: { workspaceId, userId: client.user.id } })` kontrolü ekle, üye değilse `client.emit('error', ...)` ile reddet.

### 4. Task/Board reorder — IDOR (cross-tenant kaynak manipülasyonu)
**Dosyalar:** [src/modules/tasks/tasks.service.ts:382-403](src/modules/tasks/tasks.service.ts#L382-L403), `src/modules/boards/boards.service.ts` (`reorder`, ~satır 94-113)

```ts
async reorder(workspaceId: string, boardId: string, dto: ReorderTasksDto) {
  const board = await this.prisma.board.findFirst({ where: { id: boardId, project: { workspaceId } } });
  if (!board) throw new BoardNotFoundException();
  await this.prisma.$transaction(
    dto.taskIds.map((taskId, index) =>
      this.prisma.task.update({ where: { id: taskId }, data: { position: index } }),
    ),
  );
}
```

`boardId`'nin bu workspace'e ait olduğu doğrulanıyor, ama `dto.taskIds` dizisindeki **her bir ID'nin gerçekten bu board'a ait olduğu hiç kontrol edilmiyor**. Bir workspace üyesi, başka bir workspace'e (hatta başka bir tenant'a) ait task/board ID'lerini bu endpoint'e vererek onların `position` alanını değiştirebilir — veri bütünlüğü ihlali ve tenant izolasyonu ihlali.

**Öneri:** `updateMany({ where: { id: { in: taskIds }, boardId } })` kullanarak sahiplik filtresini sorguya dahil et, ya da update öncesi `count()` ile tüm ID'lerin beklenen `boardId`/`projectId`'ye ait olduğunu doğrula.

---

## 🟠 Yüksek Öncelikli Bulgular

### 5. `@Roles()` decorator tanımlı ama hiç uygulanmıyor — yanıltıcı ölü kod
**Dosya:** [src/common/decorators/roles.decorator.ts](src/common/decorators/roles.decorator.ts)

`@Roles(...)` decorator'ı ve `ROLES_KEY` tanımlı, ancak:
- Karşılık gelen bir `RolesGuard` **hiçbir yerde yok**
- `@Roles(...)` hiçbir controller'da kullanılmıyor

Rol kontrolü bunun yerine her serviste tekrarlanan manuel `assertRole()` metoduna dayanıyor (bkz. bulgu #11). Bu, kod tabanına yeni katılan birinin `@Roles()` decorator'ının aktif bir güvenlik katmanı olduğunu sanıp yanlış yere güvenmesine yol açabilir.

**Öneri:** Ya `RolesGuard`'ı yazıp decorator'ı gerçekten devreye al, ya da decorator'ı kaldırıp mevcut `assertRole()` deseninin resmi yaklaşım olduğunu dokümante et.

### 6. Helmet / güvenlik HTTP header'ları yok
**Dosya:** [src/main.ts](src/main.ts)

`helmet` paketi bağımlılıklarda yok (package-lock.json'da da yok), `main.ts`'de herhangi bir güvenlik header middleware'i uygulanmıyor. CSP, X-Frame-Options, X-Content-Type-Options, HSTS gibi temel korumalar eksik.

**Öneri:** `npm i helmet`, `app.use(helmet())` (WebSocket/Swagger UI ile çakışmayacak şekilde CSP'yi ayarlayarak).

### 7. Refresh token akışı transaction'sız — race condition + reuse detection yok
**Dosya:** [src/modules/auth/auth.service.ts:114-142](src/modules/auth/auth.service.ts#L114-L142)

Token kontrolü, eski token `delete`, yeni token `create` işlemleri ayrı ayrı (transaction dışında) yapılıyor. İki eşzamanlı refresh isteği aynı `oldRefreshToken` ile gelirse, ikinci istek ilk `delete`'ten önce `findUnique` çağırabilir ve iki farklı token çifti üretilebilir. Ayrıca çalınmış/yeniden kullanılan bir refresh token'ı tespit eden bir mekanizma (reuse detection) yok.

**Öneri:** İşlemleri `$transaction` içine al; token silindiğinde ama tekrar kullanılmaya çalışıldığında ("refresh token reuse") tüm kullanıcı oturumlarını iptal eden bir güvenlik kontrolü ekle.

### 8. Full-text search — sanitize edilmemiş kullanıcı girdisi `to_tsquery`'e veriliyor
**Dosya:** [src/modules/tasks/tasks.service.ts:438-480](src/modules/tasks/tasks.service.ts#L438-L480)

```ts
const searchQuery = query.trim().split(/\s+/).map((word) => `${word}:*`).join(' & ');
... AND t."searchVector" @@ to_tsquery('english', ${searchQuery}) ...
```

Prisma'nın `$queryRaw` tagged template'i parametreyi bind param olarak gönderdiği için klasik SQL injection oluşmuyor. Ancak kullanıcı girdisi hiç temizlenmeden PostgreSQL `to_tsquery` sözdizimine besleniyor. Kullanıcı `&`, `|`, `!`, `(`, `)` gibi tsquery operatörleri veya bozuk sözdizimi göndererek sorguyu hataya düşürebilir (500 hatası / küçük ölçekli DoS).

**Öneri:** `to_tsquery` yerine `plainto_tsquery`/`websearch_to_tsquery` kullan, ya da girdiyi tsquery özel karakterlerinden regex ile temizle.

### 9. Invite token'ları log dosyasına plaintext yazılıyor
**Dosya:** [src/worker/email/email.service.ts:29-33](src/worker/email/email.service.ts#L29-L33)

```ts
this.logger.log(`... workspace'ine davet edildin (token: ${payload.inviteToken})`);
```

Bu token, tek başına (ek doğrulama olmadan, sadece email eşleşmesiyle) workspace'e erişim veren bir bearer sırrı. Winston logger bunu `logs/combined-%DATE%.log` dosyasına 7 gün boyunca JSON formatında saklıyor.

**Öneri:** Token'ı loglama, sadece "davet gönderildi" bilgisini logla.

### 10. Bilinen zafiyetli transitive bağımlılıklar
`npm audit` bulguları:
- `body-parser` 2.0.0–2.2.2 → DoS (GHSA-v422-hmwv-36x6), `@nestjs/platform-express` üzerinden
- `js-yaml` 4.0.0–4.3.0 → Quadratic-complexity DoS, `@nestjs/swagger` üzerinden
- `multer` 1.0.0–2.1.1 → DoS (GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm), `@nestjs/platform-express` üzerinden (proje aktif file upload kullanmıyor ama paket transitive olarak yükleniyor)

**Öneri:** `npm audit fix`, gerekirse `@nestjs/platform-express` / `@nestjs/swagger` sürümlerini güncelle.

### 11. Hiçbir listeleme endpoint'inde pagination yok
**Dosyalar:** `tasks.service.ts` (`findAll`), `projects.service.ts` (`findAll`), `boards.service.ts` (`findAll`), `labels.service.ts` (`findAll`), `comments.service.ts` (`findAll`), `workspaces.service.ts` (`findAll`), `tasks.service.ts` (`findActivityLog`)

Tüm liste endpoint'leri ilgili tüm kayıtları döndürüyor. `notifications.service.ts:16`'da sabit `take: 50` var ama gerçek offset/cursor pagination yok (kod içi yorumda da bu itiraf edilmiş). Büyük workspace'lerde (yüzlerce task/comment) yüksek payload boyutu ve performans sorunu doğurur.

**Öneri:** Tüm `findAll` metodlarına `skip`/`take` + toplam sayı (`count`) parametreleri ekle, Swagger'da `@ApiQuery` ile dokümante et.

---

## 🟡 Orta Öncelikli Bulgular

### 12. `loginWith2fa` DTO'sunda `code` alanı validasyondan geçmiyor
**Dosya:** [src/modules/auth/auth.controller.ts:78-85](src/modules/auth/auth.controller.ts#L78-L85)

`@Body() dto: LoginDto & { code: string }` — intersection type gerçek bir class olmadığı için `class-validator` bunu tanımıyor; `code` alanı üzerinde hiçbir format/uzunluk kontrolü uygulanmıyor.

**Öneri:** Ayrı bir `Login2faDto` class'ı tanımla (mevcut `Verify2faDto`'daki 6 haneli kod validasyonunu miras alacak şekilde).

### 13. Position hesaplayan `count()` + `create()` kalıpları — TOCTOU race condition
**Dosyalar:** `projects.service.ts:145,147`, `boards.service.ts:36,38`, `tasks.service.ts:166,168`

Yeni kayıt oluştururken `position` değeri `count()` ile hesaplanıp sonra `create()` ile yazılıyor; aradaki adım transaction'da değil. Eşzamanlı iki create isteği aynı `position` değerini alabilir.

**Öneri:** İşlemi `$transaction` içine al veya DB seviyesinde sıra numarası üreten bir mekanizma kullan.

### 14. `assertRole` ve rol izin dizileri — DRY ihlali
**Dosyalar:** `projects.service.ts:238-242`, `tasks.service.ts:432-436`, `labels.service.ts:145-149`, `boards.service.ts:161-165`, `workspaces.service.ts:408-412`

Aynı `if (!allowed.includes(member.role)) throw new XxxForbiddenException()` mantığı 6 serviste tekrarlanmış; `[OWNER, ADMIN, MANAGER]` gibi rol dizileri de en az 8 yerde literal olarak tekrar ediyor.

**Öneri:** Ortak bir `assertRole(member, allowedRoles, ExceptionClass)` helper'ı veya paylaşılan sabitler (`MANAGE_ROLES`) tanımla.

### 15. `GlobalExceptionFilter` — validation hatalarında yanlış `errorCode`
**Dosya:** [src/common/filters/global-exception.filter.ts:39-42](src/common/filters/global-exception.filter.ts#L39-L42)

Düz `HttpException` (örn. `ValidationPipe`'ın fırlattığı 400 hataları) yakalandığında `errorCode` alanı set edilmiyor ve varsayılan `INTERNAL_ERROR` olarak kalıyor — bir DTO validation hatasında client `errorCode: INTERNAL_ERROR` görüyor, yanıltıcı.

**Öneri:** `HttpException` durumunda status koduna göre anlamlı bir `errorCode` (örn. `VALIDATION_ERROR`) ata.

### 16. Health check endpoint yok
`@nestjs/terminus` bağımlılığı yok, `src` içinde "health" ile ilgili hiçbir route/modül yok. Production'da load balancer/orchestrator (K8s liveness/readiness probe) için önemli bir eksiklik — README Faz 4'te planlanmış ama uygulanmamış.

**Öneri:** `@nestjs/terminus` ile DB/Redis/RabbitMQ health check'i olan bir `/health` endpoint'i ekle.

### 17. `.env`'deki secret'lar placeholder değerler taşıyor
`.env` dosyasında (git'e commit edilmemiş, sadece local) `JWT_SECRET=taskflow_jwt_secret_change_in_production` ve `REFRESH_TOKEN_SECRET=...change_in_production` gibi kendini açıklayan ama zayıf/tahmin edilebilir default değerler var. Production'a geçerken unutulma riski taşır.

**Öneri:** Deploy sürecine (Faz 4 planlanınca) secret'ların rastgele üretilip bir secret manager'a (AWS Secrets Manager vb.) konulduğunu doğrulayan bir kontrol adımı ekle.

### 18. Silme stratejisi tutarsız: bazı yerlerde manuel cascade, bazılarında DB cascade'e güvenme
`workspaces.service.ts:173-203`'te workspace silinirken ilişkili kayıtlar elle, sıralı şekilde transaction içinde siliniyor. Ancak `projects.service.ts:220-233`, `tasks.service.ts:405-428`, `boards.service.ts:128-139`, `labels.service.ts:83-102`'de silme işlemi transaction'sız, doğrudan DB'nin `onDelete: Cascade`'ine güveniliyor. İki farklı strateji aynı kod tabanında bir arada — riski azaltıyor olsa da tutarsız.

**Öneri:** Tek bir stratejiye standardize et (tercihen DB cascade + gerektiğinde ek iş mantığı için transaction).

---

## 🟢 Düşük Öncelikli / İyileştirme Önerileri

| # | Bulgu | Konum |
|---|---|---|
| 19 | `users.service.spec.ts` yok — profil güncelleme/şifre değiştirme/hesap silme test edilmemiş | `src/modules/users/` |
| 20 | Hiçbir controller için `.controller.spec.ts` yok (9/9 modül) | tüm `src/modules/*/` |
| 21 | `websocket/`, `queue/`, `worker/`, `common/guards`, `common/filters`, `common/interceptors` katmanlarında hiç unit test yok | ilgili dizinler |
| 22 | `ai/`, `analytics/` modül dizinleri tamamen boş (Faz 3 hiç başlanmamış) | `src/modules/ai/`, `src/modules/analytics/` |
| 23 | Dockerfile yok, CI/CD pipeline (`.github/`) yok | proje kökü |
| 24 | Gerçek SMTP entegrasyonu yok, email gönderimi sadece log ile simüle ediliyor | [src/worker/email/email.service.ts:22](src/worker/email/email.service.ts#L22) (TODO yorumu mevcut) |
| 25 | Swagger'da `@ApiResponse` (400/403/404) dokümantasyonu ve pagination `@ApiQuery` eksik | tüm controller'lar |
| 26 | 2FA `verify` endpoint'i için ayrı/sıkı throttle yok — TOTP brute-force'a karşı yalnızca genel limit geçerli | `auth.controller.ts` |
| 27 | Forgot/reset password akışı hiç yok | `src/modules/auth/` |
| 28 | `TaskStatus`/`ProjectStatus` CRUD kodu yapısal olarak neredeyse birebir tekrarlanmış | `tasks.service.ts:30-136`, `projects.service.ts:25-124` |
| 29 | `speakeasy.totp.verify` çağrılarında `window` parametresi yok (saat kayması toleransı 0) — güvenlik değil kullanılabilirlik notu | 2FA doğrulama kodu |
| 30 | `test-websocket.js` jest'e dahil değil, elle çalıştırılan manuel script (bkz. bulgu #1) | proje kökü |

---

## ✅ İyi Uygulamalar (dengeli değerlendirme için)

- `bcrypt.hash(password, 12)` — makul salt round sayısı
- JWT httpOnly cookie + refresh token rotasyonu + şifre değişince tüm refresh token'ların iptali
- `TenantGuard` ile tutarlı workspace izolasyonu (REST tarafında)
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — mass assignment koruması (bulgu #12 hariç)
- Redis-backed `@nestjs/throttler` ile rate limiting, auth endpoint'lerinde ek throttle
- `GlobalExceptionFilter` stack trace'i asla client'a sızdırmıyor
- Düzenli Prisma migration disiplini (4 temiz migration, açıklayıcı isimlendirme)
- Audit log interceptor (POST/PATCH/DELETE otomatik loglanıyor)
- WebSocket handshake seviyesinde JWT doğrulama (bulgu #3'teki oda-seviyesi eksikliğe rağmen bağlantı seviyesinde koruma var)
- Şifre hash'leri hiçbir response'ta sızmıyor (select/manuel mapping ile tutarlı şekilde hariç tutuluyor)

---

## Öncelik Sıralı Aksiyon Listesi

| Öncelik | Bulgu | Dosya |
|---|---|---|
| 🔴 1 | Commit edilmiş plaintext JWT token | [test-websocket.js:3](test-websocket.js#L3) |
| 🔴 2 | `cookies.txt` içinde plaintext refresh token | `cookies.txt` |
| 🔴 3 | WebSocket workspace join IDOR | [src/websocket/workspace.gateway.ts:76-90](src/websocket/workspace.gateway.ts#L76-L90) |
| 🔴 4 | Task/Board reorder IDOR | `tasks.service.ts` / `boards.service.ts` reorder |
| 🟠 5 | Kullanılmayan `@Roles()`/eksik `RolesGuard` | [src/common/decorators/roles.decorator.ts](src/common/decorators/roles.decorator.ts) |
| 🟠 6 | Helmet eksik | [src/main.ts](src/main.ts) |
| 🟠 7 | Refresh token race condition + reuse detection yok | [src/modules/auth/auth.service.ts:114-142](src/modules/auth/auth.service.ts#L114-L142) |
| 🟠 8 | Sanitize edilmemiş `to_tsquery` girdisi | [src/modules/tasks/tasks.service.ts:438-480](src/modules/tasks/tasks.service.ts#L438-L480) |
| 🟠 9 | Invite token loglanıyor | [src/worker/email/email.service.ts:29-33](src/worker/email/email.service.ts#L29-L33) |
| 🟠 10 | Zafiyetli transitive bağımlılıklar | `package.json` |
| 🟠 11 | Pagination hiçbir yerde yok | tüm `findAll` metodları |
| 🟡 12-18 | DTO validation, race condition, DRY, health check, secret hijyeni, tutarsız silme stratejisi | bkz. ilgili bölüm |
| 🟢 19-30 | Test kapsamı, boş modüller, Dockerfile/CI, dokümantasyon eksikleri | bkz. ilgili bölüm |

---

*Bu rapor statik kod incelemesiyle hazırlanmıştır; runtime/penetrasyon testi içermez. Üretime almadan önce, özellikle 🔴 ve 🟠 işaretli maddelerin giderilmesi ve bir güvenlik uzmanı tarafından bağımsız gözden geçirme yapılması önerilir.*
