// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Readable } from 'stream';
import type { AuditEvent } from '@optik/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccessService, CurrentUser } from '../../access/access.service';
import { User } from '../../access/current-user.decorator';
import { LicenseService } from '../../license/license.service';
import { AuditLogService, AuditQuery } from './audit-log.service';

const CSV_COLUMNS = [
  'seq', 'created_at', 'action', 'actor_type', 'actor_id', 'actor', 'project',
  'target_type', 'target_id', 'target', 'details', 'ip', 'user_agent',
] as const;

@ApiTags('audit log (Enterprise)')
@Controller('audit-events')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(
    private readonly audit: AuditLogService,
    private readonly access: AccessService,
    private readonly license: LicenseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search the audit log, newest first (admins; maintainers with ?project=)' })
  async list(@User() user: CurrentUser, @Query() query: AuditQuery) {
    await this.authorize(user, query);
    return this.audit.list(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export matching events as CSV or JSON Lines (?format=csv|jsonl)' })
  async export(@User() user: CurrentUser, @Query() query: AuditQuery & { format?: string }, @Res() res: any) {
    await this.authorize(user, query);
    const format = query.format ?? 'csv';
    if (format !== 'csv' && format !== 'jsonl') throw new BadRequestException('format must be csv or jsonl');

    const events = this.audit.all(query);
    async function* lines() {
      if (format === 'csv') yield `${CSV_COLUMNS.join(',')}\n`;
      for await (const event of events) yield format === 'csv' ? csvRow(event) : `${JSON.stringify(event)}\n`;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res
      .header('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson')
      .header('Content-Disposition', `attachment; filename="optik-audit-${stamp}.${format}"`)
      .send(Readable.from(lines()));
  }

  @Get('verify')
  @ApiOperation({ summary: 'Check that no event was changed or removed (admins)' })
  async verify(@User() user: CurrentUser) {
    await this.license.require('audit_log');
    this.access.requireAdmin(user);
    return this.audit.verify();
  }

  /** Admins see everything; project maintainers the events of their project. */
  private async authorize(user: CurrentUser, query: AuditQuery) {
    await this.license.require('audit_log');
    if (user.role === 'admin') return;
    if (!query.project) this.access.requireAdmin(user);
    await this.access.requireProject(user, { slug: query.project! }, 'maintainer');
  }
}

function csvRow(e: AuditEvent): string {
  const values = [
    e.seq, e.createdAt, e.action, e.actor.type, e.actor.id, e.actor.label, e.project?.slug,
    e.target?.type, e.target?.id, e.target?.label, JSON.stringify(e.details), e.ip, e.userAgent,
  ];
  return `${values.map(csvCell).join(',')}\n`;
}

/** Quotes a CSV cell, and defuses values a spreadsheet would run as a formula. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
