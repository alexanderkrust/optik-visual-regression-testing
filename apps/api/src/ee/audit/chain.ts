// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { createHash } from 'crypto';

/** prev_hash of the first event */
export const GENESIS = '0'.repeat(64);

export interface HashedFields {
  createdAt: Date;
  action: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  projectId: string | null;
  projectSlug: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: unknown;
  ip: string | null;
  userAgent: string | null;
}

/**
 * SHA-256 over the previous event's hash and this event's fields. JSON keys
 * are sorted, because PostgreSQL's jsonb doesn't keep their order.
 */
export function eventHash(prevHash: string, e: HashedFields): string {
  const fields = [
    e.createdAt.toISOString(),
    e.action,
    e.actorType,
    e.actorId,
    e.actorLabel,
    e.projectId,
    e.projectSlug,
    e.targetType,
    e.targetId,
    e.targetLabel,
    sortKeys(e.details ?? {}),
    e.ip,
    e.userAgent,
  ];
  return createHash('sha256').update(`${prevHash}\n${JSON.stringify(fields)}`).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
