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
import { WorkspacesService } from './workspaces.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
} from './dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Throttle } from '@nestjs/throttler';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Workspace oluştur' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(user.id, dto);
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: "Üye olduğum workspace'leri listele" })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.findAll(user.id);
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  @Get(':workspaceId')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Workspace detayı' })
  findOne(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.workspacesService.findOne(workspaceId, member);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  @Patch(':workspaceId')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Workspace güncelle (OWNER, ADMIN)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(workspaceId, member, dto);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  @Delete(':workspaceId')
  @UseGuards(TenantGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Workspace sil (sadece OWNER)' })
  remove(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.workspacesService.remove(workspaceId, member);
  }

  // ─── Invite Member ─────────────────────────────────────────────────────────

  @Post(':workspaceId/invite')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Üye davet et' })
  inviteMember(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspacesService.inviteMember(workspaceId, member, dto);
  }

  // ─── Accept Invite ─────────────────────────────────────────────────────────

  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @Post('invite/accept/:token')
  @ApiOperation({ summary: 'Daveti kabul et' })
  acceptInvite(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workspacesService.acceptInvite(token, user.id);
  }

  // ─── Remove Member ─────────────────────────────────────────────────────────

  @Delete(':workspaceId/members/:userId')
  @UseGuards(TenantGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Üyeyi çıkar (OWNER, ADMIN)' })
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      member,
      targetUserId,
    );
  }

  // ─── Update Member Role ────────────────────────────────────────────────────

  @Patch(':workspaceId/members/:userId/role')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Üye rolünü değiştir (OWNER, ADMIN)' })
  updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @CurrentMember() member: WorkspaceMember,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspacesService.updateMemberRole(
      workspaceId,
      member,
      targetUserId,
      dto,
    );
  }

  @Get(':workspaceId/invites')
  @UseGuards(TenantGuard)
  @ApiOperation({
    summary: 'Bekleyen davetleri listele (OWNER, ADMIN, MANAGER)',
  })
  findPendingInvites(
    @Param('workspaceId') workspaceId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.workspacesService.findPendingInvites(workspaceId, member);
  }

  @Delete(':workspaceId/invites/:inviteId')
  @UseGuards(TenantGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bekleyen daveti iptal et (OWNER, ADMIN)' })
  cancelInvite(
    @Param('workspaceId') workspaceId: string,
    @Param('inviteId') inviteId: string,
    @CurrentMember() member: WorkspaceMember,
  ) {
    return this.workspacesService.cancelInvite(workspaceId, inviteId, member);
  }

  // workspaces.controller.ts'e eklenecek endpoint — mention autocomplete için
  // (zaten workspace detayında members var ama mention'da arama/filtreleme
  // yapabilmek adına ayrı, hafif bir endpoint daha kullanışlı)

  @Get(':workspaceId/members/search')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Mention/assignee autocomplete için üye ara' })
  searchMembers(
    @Param('workspaceId') workspaceId: string,
    @Query('q') query: string,
  ) {
    return this.workspacesService.searchMembers(workspaceId, query);
  }
}
