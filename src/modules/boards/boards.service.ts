import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceMember, WorkspaceRole } from '@prisma/client';
import { CreateBoardDto, UpdateBoardDto, ReorderBoardsDto } from './dto';
import {
  BoardNotFoundException,
  BoardForbiddenException,
} from './exceptions/board.exceptions';
import { ProjectNotFoundException } from '../projects/exceptions/project.exceptions';

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    projectId: string,
    member: WorkspaceMember,
    dto: CreateBoardDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    // Project bu workspace'e ait mi?
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    const count = await this.prisma.board.count({ where: { projectId } });

    return this.prisma.board.create({
      data: {
        projectId,
        name: dto.name,
        position: count,
      },
    });
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    return this.prisma.board.findMany({
      where: { projectId },
      include: {
        _count: { select: { tasks: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(
    workspaceId: string,
    projectId: string,
    boardId: string,
    member: WorkspaceMember,
    dto: UpdateBoardDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const board = await this.findBoard(workspaceId, projectId, boardId);

    return this.prisma.board.update({
      where: { id: board.id },
      data: dto,
    });
  }

  // ─── Reorder ───────────────────────────────────────────────────────────────
  // Kanban'da sürükle-bırak ile board sırasını güncelle.
  // Transaction içinde tüm board'ların position'ı güncellenir.

  async reorder(
    workspaceId: string,
    projectId: string,
    member: WorkspaceMember,
    dto: ReorderBoardsDto,
  ) {
    this.assertRole(member, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
    ]);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) throw new ProjectNotFoundException();

    // Her board'a yeni position'ını ata — transaction garantisi
    await this.prisma.$transaction(
      dto.boardIds.map((boardId, index) =>
        this.prisma.board.update({
          where: { id: boardId },
          data: { position: index },
        }),
      ),
    );

    return this.prisma.board.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
    });
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async remove(
    workspaceId: string,
    projectId: string,
    boardId: string,
    member: WorkspaceMember,
  ): Promise<void> {
    this.assertRole(member, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);

    const board = await this.findBoard(workspaceId, projectId, boardId);

    await this.prisma.board.delete({ where: { id: board.id } });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async findBoard(
    workspaceId: string,
    projectId: string,
    boardId: string,
  ) {
    const board = await this.prisma.board.findFirst({
      where: {
        id: boardId,
        projectId,
        project: { workspaceId },
      },
    });

    if (!board) throw new BoardNotFoundException();

    return board;
  }

  private assertRole(member: WorkspaceMember, allowed: WorkspaceRole[]): void {
    if (!allowed.includes(member.role)) {
      throw new BoardForbiddenException();
    }
  }
}
