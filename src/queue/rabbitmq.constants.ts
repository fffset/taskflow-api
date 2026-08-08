// Tek bir "worker.queue" kullanıyoruz — birden fazla iş türü (email,
// reminder, batch job) aynı kuyruğa düşüyor, worker uygulaması içindeki
// farklı @EventPattern handler'ları mesajın "pattern" alanına göre doğru
// modüle yönlendiriyor. Bu, NestJS microservices'in standart yaklaşımı —
// kuyruk başına ayrı RabbitMQ altyapısı kurmaya gerek yok.

export const RABBITMQ_CONSTANTS = {
  WORKER_QUEUE: 'worker.queue',
  WORKER_SERVICE: 'WORKER_SERVICE', // NestJS DI token'ı (ana API tarafında)
} as const;

// ─── Email işleri ────────────────────────────────────────────────────────────
export const EMAIL_PATTERNS = {
  MENTION_NOTIFICATION: 'email.mention_notification',
  TASK_ASSIGNED: 'email.task_assigned',
  WORKSPACE_INVITE: 'email.workspace_invite',
} as const;

// ─── Hatırlatıcı işleri (ileride kullanılacak) ──────────────────────────────
export const REMINDER_PATTERNS = {
  TASK_DUE_SOON: 'reminder.task_due_soon',
} as const;

// ─── Batch/analitik işleri (Faz 3'te kullanılacak) ──────────────────────────
export const BATCH_PATTERNS = {
  WORKSPACE_ANALYTICS: 'batch.workspace_analytics',
} as const;
