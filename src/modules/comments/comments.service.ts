// comments.service.ts dosyasının tamamı — WorkspaceGateway de eklendi

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WorkspaceMember,
  WorkspaceRole,
  NotificationType,
} from '@prisma/client';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import {
  CommentNotFoundException,
  CommentForbiddenException,
} from './exceptions/comment.exceptions';
import { TaskNotFoundException } from '../tasks/exceptions/task.exceptions';
import { parseMentions } from './mention-parser';
import { EmailPublisherService } from '../../queue/email-publisher.service';
import { WorkspaceGateway } from '../../websocket/workspace.gateway';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailPublisher: EmailPublisherService,
    private readonly workspaceGateway: WorkspaceGateway,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    taskId: string,
    member: WorkspaceMember,
    dto: CreateCommentDto,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    const comment = await this.prisma.comment.create({
      data: {
        taskId,
        authorId: member.userId,
        content: dto.content,
      },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await this.prisma.activityLog.create({
      data: {
        workspaceId,
        userId: member.userId,
        taskId,
        action: 'comment_added',
        metadata: { commentId: comment.id },
      },
    });

    await this.handleMentions(
      workspaceId,
      taskId,
      member.userId,
      comment.author.name,
      dto.content,
      comment.id,
      task.title,
    );

    // Aynı workspace'i açık tutan diğer kullanıcılara anlık bildir —
    // örn. bir task detay modalını açık tutuyorlarsa yeni yorum anında görünsün.
    this.workspaceGateway.emitCommentAdded(workspaceId, taskId, comment);

    return comment;
  }

  private async handleMentions(
    workspaceId: string,
    taskId: string,
    authorId: string,
    authorName: string,
    content: string,
    commentId: string,
    taskTitle: string,
  ): Promise<void> {
    const mentions = parseMentions(content);
    if (mentions.length === 0) return;

    const validMemberIds = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: mentions.map((m) => m.userId) },
      },
      select: { userId: true },
    });

    const validUserIds = new Set(validMemberIds.map((m) => m.userId));

    const notifiableUserIds = [
      ...new Set(mentions.map((m) => m.userId)),
    ].filter((userId) => validUserIds.has(userId) && userId !== authorId);

    if (notifiableUserIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: notifiableUserIds.map((userId) => ({
        userId,
        type: NotificationType.MENTION,
        title: 'Bir yorumda etiketlendin',
        body: `"${taskTitle}" task'ındaki bir yorumda etiketlendin`,
        metadata: { taskId, commentId },
      })),
    });

    for (const userId of notifiableUserIds) {
      this.emailPublisher.publishMentionNotification({
        toUserId: userId,
        taskTitle,
        taskId,
        mentionedByName: authorName,
      });
    }
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) throw new TaskNotFoundException();

    return this.prisma.comment.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    workspaceId: string,
    commentId: string,
    member: WorkspaceMember,
    dto: UpdateCommentDto,
  ) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, task: { workspaceId } },
    });

    if (!comment) throw new CommentNotFoundException();

    if (comment.authorId !== member.userId) {
      throw new CommentForbiddenException();
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: dto,
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(
    workspaceId: string,
    commentId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, task: { workspaceId } },
    });

    if (!comment) throw new CommentNotFoundException();

    const canDelete =
      comment.authorId === member.userId ||
      ([WorkspaceRole.OWNER, WorkspaceRole.ADMIN] as string[]).includes(
        member.role,
      );

    if (!canDelete) throw new CommentForbiddenException();

    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
