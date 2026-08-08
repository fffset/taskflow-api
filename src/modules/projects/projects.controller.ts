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
import { ProjectsService } from './projects.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
} from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('workspaces/:workspaceId/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ─── Project Status Endpoints ──────────────────────────────────────────────

  @Get('statuses')
  @ApiOperation({ summary: 'Workspace project statuslarını listele' })
  findAllStatuses(@Param('workspaceId') workspaceId: string) {
    return this.projectsService.findAllStatuses(workspaceId);
  }

  @Post('statuses')
  @ApiOperation({ summary: 'Yeni project status ekle' })
  createStatus(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateProjectStatusDto,
  ) {
    return this.projectsService.createStatus(workspaceId, member, dto);
  }

  @Patch('statuses/:statusId')
  @ApiOperation({ summary: 'Project status güncelle' })
  updateStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateProjectStatusDto,
  ) {
    return this.projectsService.updateStatus(
      workspaceId,
      statusId,
      member,
      dto,
    );
  }

  @Delete('statuses/:statusId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Project status sil (sistem statusları silinemez)' })
  deleteStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('statusId') statusId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.projectsService.deleteStatus(workspaceId, statusId, member);
  }

  // ─── Project Endpoints ─────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Proje oluştur' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(workspaceId, member, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Workspace projelerini listele' })
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.projectsService.findAll(workspaceId);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Proje detayı' })
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.findOne(workspaceId, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Proje güncelle' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(workspaceId, projectId, member, dto);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Proje sil (OWNER, ADMIN)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.projectsService.remove(workspaceId, projectId, member);
  }
}
