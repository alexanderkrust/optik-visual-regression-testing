import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditActor } from '@optik/shared';
import { currentRequest } from './request-context';

/** An event as reported by the code where it happens. */
export interface AuditEntry {
  action: AuditAction;
  project?: { id: string; slug: string } | null;
  target?: { type: string; id: string; label?: string | null } | null;
  details?: Record<string, unknown>;
  /** Defaults to the user or API token of the current request */
  actor?: AuditActor;
}

/** An event with everything the request knows about it. */
export interface CompleteAuditEntry {
  action: AuditAction;
  actor: AuditActor;
  project: { id: string; slug: string } | null;
  target: { type: string; id: string; label: string | null } | null;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditSink {
  write(entry: CompleteAuditEntry): Promise<void>;
}

/**
 * Where code reports security-relevant events (reviews, permissions, tokens,
 * sign-ins). By itself it records nothing; the Enterprise audit log
 * (ee/audit) registers a sink that stores them.
 */
@Injectable()
export class AuditTrail {
  private readonly logger = new Logger(AuditTrail.name);
  private readonly sinks: AuditSink[] = [];

  register(sink: AuditSink) {
    this.sinks.push(sink);
  }

  /** Never throws: a failing audit sink must not undo what already happened. */
  async record(entry: AuditEntry): Promise<void> {
    if (this.sinks.length === 0) return;
    const request = currentRequest();
    const complete: CompleteAuditEntry = {
      action: entry.action,
      actor: entry.actor ?? actorOf(request),
      project: entry.project ?? null,
      target: entry.target ? { ...entry.target, label: entry.target.label ?? null } : null,
      details: entry.details ?? {},
      ip: request?.ip ?? null,
      userAgent: request?.userAgent ?? null,
    };
    for (const sink of this.sinks) {
      try {
        await sink.write(complete);
      } catch (err) {
        this.logger.error(`Audit event "${entry.action}" could not be recorded: ${(err as Error).message}`);
      }
    }
  }
}

function actorOf(request: ReturnType<typeof currentRequest>): AuditActor {
  if (request?.user) return { type: 'user', id: request.user.id, label: request.user.email };
  if (request?.apiToken) return { type: 'token', id: request.apiToken.id, label: request.apiToken.name };
  return { type: 'anonymous', id: null, label: null };
}
