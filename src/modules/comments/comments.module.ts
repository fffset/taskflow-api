import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { RabbitMQModule } from 'src/queue/rabbitmq.module';
import { WebsocketModule } from 'src/websocket/websocket.module';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
  imports: [RabbitMQModule, WebsocketModule],
})
export class CommentsModule {}
