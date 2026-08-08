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
import { LabelsService } from './labels.service';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('workspaces/:workspaceId')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  // ─── Label CRUD ────────────────────────────────────────────────────────────

  @Post('projects/:projectId/labels')
  @ApiOperation({ summary: 'Label oluştur' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateLabelDto,
  ) {
    return this.labelsService.create(workspaceId, projectId, member, dto);
  }

  @Get('projects/:projectId/labels')
  @ApiOperation({ summary: "Proje label'larını listele" })
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.labelsService.findAll(workspaceId, projectId);
  }

  @Patch('projects/:projectId/labels/:labelId')
  @ApiOperation({ summary: 'Label güncelle' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelsService.update(
      workspaceId,
      projectId,
      labelId,
      member,
      dto,
    );
  }

  @Delete('projects/:projectId/labels/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Label sil' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.labelsService.remove(workspaceId, projectId, labelId, member);
  }

  // ─── Task Label ────────────────────────────────────────────────────────────

  @Post('tasks/:taskId/labels/:labelId')
  @ApiOperation({ summary: "Task'a label ekle" })
  addToTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labelsService.addToTask(workspaceId, taskId, labelId);
  }

  @Delete('tasks/:taskId/labels/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Task'tan label kaldır" })
  removeFromTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labelsService.removeFromTask(workspaceId, taskId, labelId);
  }
}
