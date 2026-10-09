import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSnapshotCommentDto, SnapshotComment } from '@optik/shared';
import { PrismaService } from '../database/prisma.service';
import { AccessService, CurrentUser } from '../access/access.service';
import { AuditTrail } from '../audit/audit-trail';

const MAX_LENGTH = 5000;
const WITH_AUTHOR = { author: { select: { email: true } } } as const;

/**
 * Comments on a snapshot. Everyone in the project can read them; reviewers
 * and up can write. Authors delete their own comments, maintainers any.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditTrail,
  ) {}

  async list(user: CurrentUser, snapshotId: string): Promise<SnapshotComment[]> {
    await this.access.requireSnapshot(user, snapshotId, 'viewer');
    const rows = await this.prisma.snapshotComment.findMany({
      where: { snapshotId },
      include: WITH_AUTHOR,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(
    user: CurrentUser,
    snapshotId: string,
    dto: CreateSnapshotCommentDto,
  ): Promise<SnapshotComment> {
    const { project } = await this.access.requireSnapshot(user, snapshotId, 'reviewer');
    const body = typeof dto?.body === 'string' ? dto.body.trim() : '';
    if (!body) throw new BadRequestException('The comment is empty');
    if (body.length > MAX_LENGTH) {
      throw new BadRequestException(`Comments can have at most ${MAX_LENGTH} characters`);
    }
    const row = await this.prisma.snapshotComment.create({
      data: { snapshotId, authorId: user.id, body },
      include: { ...WITH_AUTHOR, snapshot: { select: { name: true } } },
    });
    await this.audit.record({
      action: 'comment.created',
      project: { id: project.id, slug: project.slug },
      target: { type: 'snapshot', id: snapshotId, label: row.snapshot.name },
      details: { commentId: row.id },
    });
    return toDto(row);
  }

  async remove(user: CurrentUser, snapshotId: string, commentId: string): Promise<void> {
    const { project, role } = await this.access.requireSnapshot(user, snapshotId, 'viewer');
    const comment = await this.prisma.snapshotComment.findFirst({
      where: { id: commentId, snapshotId },
      select: {
        authorId: true,
        body: true,
        author: { select: { email: true } },
        snapshot: { select: { name: true } },
      },
    });
    if (!comment) throw new NotFoundException(`Comment "${commentId}" not found`);
    const mayDelete = comment.authorId === user.id || role === 'maintainer' || role === 'admin';
    if (!mayDelete) throw new ForbiddenException('Only the author or a maintainer can delete this comment');
    await this.prisma.snapshotComment.delete({ where: { id: commentId } });
    // Deleted comments are gone from the UI — the audit log keeps what they said
    await this.audit.record({
      action: 'comment.deleted',
      project: { id: project.id, slug: project.slug },
      target: { type: 'snapshot', id: snapshotId, label: comment.snapshot.name },
      details: { commentId, author: comment.author?.email ?? null, body: comment.body.slice(0, 1000) },
    });
  }
}

function toDto(row: {
  id: string;
  snapshotId: string;
  authorId: string | null;
  author: { email: string } | null;
  body: string;
  createdAt: Date;
}): SnapshotComment {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    author: row.author?.email ?? null,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
