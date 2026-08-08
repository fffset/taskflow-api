import { Injectable, Logger } from '@nestjs/common';
import type {
  MentionNotificationPayload,
  TaskAssignedPayload,
  WorkspaceInvitePayload,
} from '../../queue/email-publisher.service';

// NOT: Gerçek SMTP entegrasyonu henüz yok — şimdilik sadece log basıyoruz
// ("simüle ediyoruz"). Gerçek email göndermek istediğimizde (nodemailer +
// SMTP_HOST/SMTP_USER/SMTP_PASS zaten .env.example'da tanımlıydı) sadece
// bu servisin içini değiştireceğiz, dışarıdan çağıran hiçbir yer
// etkilenmeyecek — bu da bu mimarinin asıl faydası.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  sendMentionNotification(payload: MentionNotificationPayload): void {
    this.logger.log(
      `[SIMÜLASYON] Email gönderildi → userId=${payload.toUserId}: ` +
        `"${payload.mentionedByName}" seni "${payload.taskTitle}" task'ında etiketledi`,
    );
    // TODO: gerçek SMTP entegrasyonu
  }

  sendTaskAssigned(payload: TaskAssignedPayload): void {
    this.logger.log(
      `[SIMÜLASYON] Email gönderildi → userId=${payload.toUserId}: ` +
        `"${payload.assignedByName}" sana "${payload.taskTitle}" task'ını atadı`,
    );
  }

  sendWorkspaceInvite(payload: WorkspaceInvitePayload): void {
    this.logger.log(
      `[SIMÜLASYON] Email gönderildi → email=${payload.toEmail}: ` +
        `"${payload.workspaceName}" workspace'ine davet edildin (token: ${payload.inviteToken})`,
    );
  }
}
