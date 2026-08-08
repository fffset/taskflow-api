import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { WorkspaceMember } from '@prisma/client';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('workspaces/:workspaceId')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('tasks/:taskId/comments')
  @ApiOperation({ summary: "Task'a yorum ekle" })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(workspaceId, taskId, member, dto);
  }

  @Get('tasks/:taskId/comments')
  @ApiOperation({ summary: "Task'ın yorumlarını listele" })
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.commentsService.findAll(workspaceId, taskId);
  }

  @Patch('comments/:commentId')
  @ApiOperation({ summary: 'Yorumu düzenle (sadece sahibi)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(workspaceId, commentId, member, dto);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Yorumu sil (sahibi veya OWNER/ADMIN)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('commentId') commentId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.commentsService.remove(workspaceId, commentId, member);
  }
}
