import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from './email/email.module';
// İleride: import { ReminderModule } from './reminder/reminder.module';
// İleride: import { BatchModule } from './batch/batch.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EmailModule,
    // ReminderModule,
    // BatchModule,
  ],
})
export class WorkerModule {}
