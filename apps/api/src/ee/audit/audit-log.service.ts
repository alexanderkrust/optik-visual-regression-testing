// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import type { AuditAction, AuditEvent, AuditEventPage, AuditVerification } from '@optik/shared';
import type { AuditEvent as AuditRow, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditTrail, CompleteAuditEntry } from '../../audit/audit-trail';
import { LicenseService } from '../../license/license.service';
import { eventHash, GENESIS } from './chain';

/** Serialises writes, so the hash chain follows the sequence numbers. */
const CHAIN_LOCK = 482114;
const MAX_PAGE = 200;
const EXPORT_BATCH = 1000;

export interface AuditQuery {
  /** Words matched against actor, target, project and action */
  q?: string;
  /** "snapshot.approved", or a prefix like "snapshot." */
  action?: string;
  /** Project slug */
  project?: string;
  /** YYYY-MM-DD or ISO date-time, inclusive */
  from?: string;
  to?: string;
  /** Only events before this sequence number (paging) */
  before?: string;
  limit?: string;
}

/**
 * Stores what the AuditTrail reports — while the Enterprise edition is in
 * effect — in an append-only, hash-chained table, and lets admins search,
 * export and verify it.
 */
@Injectable()
export class AuditLogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trail: AuditTrail,
    private readonly license: LicenseService,
  ) {}

  onModuleInit() {
    this.trail.register({ write: (entry) => this.write(entry) });
  }

  async write(entry: CompleteAuditEntry): Promise<void> {
    if (!(await this.license.has('audit_log'))) return;
    const fields = {
      createdAt: new Date(),
      action: entry.action,
      actorType: entry.actor.type,
      actorId: entry.actor.id,
      actorLabel: entry.actor.label,
      projectId: entry.project?.id ?? null,
      projectSlug: entry.project?.slug ?? null,
      targetType: entry.target?.type ?? null,
      targetId: entry.target?.id ?? null,
      targetLabel: entry.target?.label ?? null,
      details: entry.details as Prisma.InputJsonValue,
      ip: entry.ip,
      userAgent: entry.userAgent,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK})`;
      const last = await tx.auditEvent.findFirst({ orderBy: { seq: 'desc' }, select: { hash: true } });
      const prevHash = last?.hash ?? GENESIS;
      await tx.auditEvent.create({ data: { ...fields, prevHash, hash: eventHash(prevHash, fields) } });
    });
  }

  async list(query: AuditQuery): Promise<AuditEventPage> {
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(query.limit) || 50));
    const rows = await this.prisma.auditEvent.findMany({
      where: this.where(query),
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
    const events = rows.slice(0, limit).map(toDto);
    return { events, nextCursor: rows.length > limit ? events[events.length - 1].seq : null };
  }

  /** All matching events, oldest first, in batches — for exports of any size. */
  async *all(query: AuditQuery): AsyncGenerator<AuditEvent> {
    const where = this.where({ ...query, before: undefined });
    let after: bigint | undefined;
    for (;;) {
      const rows = await this.prisma.auditEvent.findMany({
        where: after === undefined ? where : { AND: [where, { seq: { gt: after } }] },
        orderBy: { seq: 'asc' },
        take: EXPORT_BATCH,
      });
      for (const row of rows) yield toDto(row);
      if (rows.length < EXPORT_BATCH) return;
      after = rows[rows.length - 1].seq;
    }
  }

  /** Recomputes the hash chain from the first event on. */
  async verify(): Promise<AuditVerification> {
    let prevHash = GENESIS;
    let checked = 0;
    let after: bigint | undefined;
    for (;;) {
      const rows = await this.prisma.auditEvent.findMany({
        where: after === undefined ? {} : { seq: { gt: after } },
        orderBy: { seq: 'asc' },
        take: EXPORT_BATCH,
      });
      for (const row of rows) {
        if (row.prevHash !== prevHash || eventHash(prevHash, row) !== row.hash) {
          return { valid: false, checked, firstInvalidSeq: Number(row.seq) };
        }
        prevHash = row.hash;
        checked++;
      }
      if (rows.length < EXPORT_BATCH) return { valid: true, checked, firstInvalidSeq: null };
      after = rows[rows.length - 1].seq;
    }
  }

  private where(query: AuditQuery): Prisma.AuditEventWhereInput {
    const and: Prisma.AuditEventWhereInput[] = [];
    if (query.action) {
      and.push(query.action.endsWith('.') ? { action: { startsWith: query.action } } : { action: query.action });
    }
    if (query.project) and.push({ projectSlug: query.project });
    if (query.from) and.push({ createdAt: { gte: date(query.from, 'from') } });
    if (query.to) {
      // A plain date includes the whole day
      const to = date(query.to, 'to');
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCDate(to.getUTCDate() + 1);
      and.push({ createdAt: /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? { lt: to } : { lte: to } });
    }
    if (query.before) {
      if (!/^\d+$/.test(query.before)) throw new BadRequestException('before must be a sequence number');
      and.push({ seq: { lt: BigInt(query.before) } });
    }
    for (const word of (query.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)) {
      const contains = { contains: word, mode: 'insensitive' as const };
      and.push({
        OR: [
          { actorLabel: contains },
          { targetLabel: contains },
          { projectSlug: contains },
          { action: contains },
          { ip: contains },
        ],
      });
    }
    return { AND: and };
  }
}

function date(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${name} must be a date`);
  return parsed;
}

function toDto(r: AuditRow): AuditEvent {
  return {
    seq: Number(r.seq),
    createdAt: r.createdAt.toISOString(),
    action: r.action as AuditAction,
    actor: { type: r.actorType as AuditEvent['actor']['type'], id: r.actorId, label: r.actorLabel },
    project: r.projectId ? { id: r.projectId, slug: r.projectSlug ?? '' } : null,
    target: r.targetType ? { type: r.targetType, id: r.targetId ?? '', label: r.targetLabel } : null,
    details: (r.details ?? {}) as Record<string, unknown>,
    ip: r.ip,
    userAgent: r.userAgent,
  };
}
