import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { RABBITMQ_CONSTANTS } from '../queue/rabbitmq.constants';

// Bu, taskflow-api'den TAMAMEN AYRI bir process olarak çalışır.
// HTTP endpoint'i yok — sadece worker.queue'yu dinler, gelen mesajları
// pattern'ine göre ilgili modüle (EmailModule, ileride ReminderModule,
// BatchModule) yönlendirir.
//
// Çalıştırma: node dist/worker/main.js (ana API'den bağımsız, ayrı bir
// terminal/container/process olarak başlatılır)
async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WorkerModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [
          process.env.RABBITMQ_URL ??
            'amqp://taskflow:taskflow_pass@localhost:5672',
        ],
        queue: RABBITMQ_CONSTANTS.WORKER_QUEUE,
        queueOptions: { durable: true },
      },
    },
  );

  await app.listen();
  logger.log(
    `Taskflow Worker başladı — ${RABBITMQ_CONSTANTS.WORKER_QUEUE} dinleniyor`,
  );
}

void bootstrap();
