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
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { WorkspaceMember } from '@prisma/client';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  MoveTaskDto,
  ReorderTasksDto,
  CreateTaskStatusDto,
  UpdateTaskStatusDto,
} from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('workspaces/:workspaceId')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ─── Task Status Endpoints ─────────────────────────────────────────────────

  @Get('tasks/statuses')
  @ApiOperation({ summary: 'Workspace task statuslarını listele' })
  findAllStatuses(@Param('workspaceId') workspaceId: string) {
    return this.tasksService.findAllStatuses(workspaceId);
  }

  @Post('tasks/statuses')
  @ApiOperation({ summary: 'Yeni task status ekle' })
  createStatus(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateTaskStatusDto,
  ) {
    return this.tasksService.createStatus(workspaceId, member, dto);
  }

  @Patch('tasks/statuses/:statusId')
  @ApiOperation({ summary: 'Task status güncelle' })
  updateStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(workspaceId, statusId, member, dto);
  }

  @Delete('tasks/statuses/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Task status sil (sistem statusları silinemez)' })
  deleteStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.tasksService.deleteStatus(workspaceId, statusId, member);
  }

  // ─── Task Endpoints ────────────────────────────────────────────────────────

  @Post('boards/:boardId/tasks')
  @ApiOperation({ summary: 'Task oluştur' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(workspaceId, boardId, member, dto);
  }

  @Get('boards/:boardId/tasks')
  @ApiOperation({ summary: "Board task'larını listele" })
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.tasksService.findAll(workspaceId, boardId);
  }

  @Get('tasks/search')
  @ApiOperation({ summary: "Task'larda full-text search" })
  search(@Param('workspaceId') workspaceId: string, @Query('q') query: string) {
    return this.tasksService.search(workspaceId, query);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Task detayı' })
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.findOne(workspaceId, taskId);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Task güncelle' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(workspaceId, taskId, member, dto);
  }

  @Patch('tasks/:taskId/move')
  @ApiOperation({ summary: "Task'ı farklı board'a taşı" })
  move(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(workspaceId, taskId, dto);
  }

  @Patch('boards/:boardId/tasks/reorder')
  @ApiOperation({ summary: 'Task sırasını güncelle' })
  reorder(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @Body() dto: ReorderTasksDto,
  ) {
    return this.tasksService.reorder(workspaceId, boardId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Task sil' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.tasksService.remove(workspaceId, taskId, member);
  }

  @Get('tasks/:taskId/activity')
  @ApiOperation({ summary: "Task'ın aktivite akışını listele" })
  findActivityLog(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.findActivityLog(workspaceId, taskId);
  }
}
