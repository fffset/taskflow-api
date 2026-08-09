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
import { WorkspaceRole, type WorkspaceMember } from '@prisma/client';
import { BoardsService } from './boards.service';
import { CreateBoardDto, UpdateBoardDto, ReorderBoardsDto } from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('workspaces/:workspaceId/projects/:projectId/boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MANAGER)
  @ApiOperation({ summary: 'Board oluştur' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: CreateBoardDto,
  ) {
    return this.boardsService.create(workspaceId, projectId, member, dto);
  }

  @Get()
  @ApiOperation({ summary: "Project board'larını listele" })
  findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.boardsService.findAll(workspaceId, projectId);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Board sırasını güncelle' })
  reorder(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: ReorderBoardsDto,
  ) {
    return this.boardsService.reorder(workspaceId, projectId, member, dto);
  }

  @Patch(':boardId')
  @ApiOperation({ summary: 'Board güncelle' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(
      workspaceId,
      projectId,
      boardId,
      member,
      dto,
    );
  }

  @Delete(':boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Board sil (OWNER, ADMIN)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('boardId') boardId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.boardsService.remove(workspaceId, projectId, boardId, member);
  }
}
