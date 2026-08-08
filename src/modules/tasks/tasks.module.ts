import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { RabbitMQModule } from 'src/queue/rabbitmq.module';
import { WebsocketModule } from 'src/websocket/websocket.module';

@Module({
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
  imports: [RabbitMQModule, WebsocketModule],
})
export class TasksModule {}
