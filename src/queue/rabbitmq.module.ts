import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RABBITMQ_CONSTANTS } from './rabbitmq.constants';
import { EmailPublisherService } from './email-publisher.service';

// Bu modül, ANA API tarafında kullanılır — worker.queue'ya mesaj GÖNDERMEK
// için. Worker uygulamasının kendisi (src/worker/) ayrı bir bootstrap,
// bu modülü kullanmaz — o, aynı kuyruğu DİNLER (consumer tarafı).
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_CONSTANTS.WORKER_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              config.get<string>(
                'RABBITMQ_URL',
                'amqp://taskflow:taskflow_pass@localhost:5672',
              ),
            ],
            queue: RABBITMQ_CONSTANTS.WORKER_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  providers: [EmailPublisherService],
  exports: [EmailPublisherService],
})
export class RabbitMQModule {}
