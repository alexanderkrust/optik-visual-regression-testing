// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { CreatedScimToken, ScimTokenInfo } from '@optik/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditTrail } from '../../audit/audit-trail';
import { UsersService } from '../../users/users.service';
import { TeamsService } from '../teams/teams.service';

export const SCHEMA = {
  user: 'urn:ietf:params:scim:schemas:core:2.0:User',
  group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  list: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  patch: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  error: 'urn:ietf:params:scim:api:messages:2.0:Error',
};

const TOKEN_SETTING = 'scim.token';
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const MAX_PAGE = 200;
const AS_SCIM = { source: 'scim' };

/** A SCIM request error with the "scimType" the spec defines. */
export class ScimError extends BadRequestException {
  constructor(
    message: string,
    readonly scimType: string,
  ) {
    super(message);
  }
}

interface ScimUserInput {
  userName?: string;
  externalId?: string;
  active?: boolean | string;
  emails?: { value?: string; primary?: boolean; type?: string }[];
}

interface ScimGroupInput {
  displayName?: string;
  externalId?: string;
  members?: { value?: string }[];
}

interface PatchOperation {
  op?: string;
  path?: string;
  value?: unknown;
}

/**
 * SCIM 2.0 provisioning (RFC 7643/7644) as Entra ID and Okta use it: users
 * become optik accounts (deactivated instead of locked out), groups become
 * teams. Authenticated with one bearer token per instance.
 */
@Injectable()
export class ScimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditTrail,
    private readonly users: UsersService,
    private readonly teams: TeamsService,
  ) {}

  // -------------------------------------------------------------------- token

  async tokenInfo(base: string): Promise<ScimTokenInfo> {
    const stored = await this.storedToken();
    return {
      configured: !!stored,
      prefix: stored?.prefix ?? null,
      createdAt: stored?.createdAt ?? null,
      endpoint: `${base}/api/scim/v2`,
    };
  }

  /** A new token; replaces the old one. Shown once — only its hash is stored. */
  async createToken(base: string): Promise<CreatedScimToken> {
    const token = `optik_scim_${randomBytes(32).toString('hex')}`;
    const value = JSON.stringify({ hash: hash(token), prefix: token.slice(0, 16), createdAt: new Date().toISOString() });
    await this.prisma.instanceSetting.upsert({
      where: { key: TOKEN_SETTING },
      create: { key: TOKEN_SETTING, value },
      update: { value },
    });
    await this.audit.record({ action: 'scim.token_created', details: { prefix: token.slice(0, 16) } });
    return { ...(await this.tokenInfo(base)), token };
  }

  async revokeToken(): Promise<void> {
    const { count } = await this.prisma.instanceSetting.deleteMany({ where: { key: TOKEN_SETTING } });
    if (count) await this.audit.record({ action: 'scim.token_revoked' });
  }

  async tokenValid(token: string): Promise<boolean> {
    const stored = await this.storedToken();
    if (!stored || !token) return false;
    const a = Buffer.from(hash(token));
    const b = Buffer.from(stored.hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async storedToken(): Promise<{ hash: string; prefix: string; createdAt: string } | null> {
    const row = await this.prisma.instanceSetting.findUnique({ where: { key: TOKEN_SETTING } });
    try {
      return row ? JSON.parse(row.value) : null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------- users

  async listUsers(base: string, query: { filter?: string; startIndex?: string; count?: string }) {
    const where = userFilter(query.filter);
    return this.page(base, query, where, 'user');
  }

  async getUser(base: string, id: string) {
    return userResource(base, await this.findUser(id));
  }

  async createUser(base: string, input: ScimUserInput) {
    const email = emailOf(input);
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ScimConflict(`A user with userName "${email}" exists`);
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        password: null,
        role: 'member',
        scimExternalId: str(input.externalId),
        deactivatedAt: activeOf(input.active) === false ? new Date() : null,
      },
    });
    await this.audit.record({ action: 'user.provisioned', target: { type: 'user', id: user.id, label: email }, details: AS_SCIM });
    return userResource(base, user);
  }

  async replaceUser(base: string, id: string, input: ScimUserInput) {
    await this.findUser(id);
    await this.changeUser(id, {
      email: emailOf(input),
      externalId: str(input.externalId) ?? null,
      active: activeOf(input.active) ?? true,
    });
    return this.getUser(base, id);
  }

  async patchUser(base: string, id: string, body: { Operations?: PatchOperation[] }) {
    await this.findUser(id);
    const change: { email?: string; externalId?: string | null; active?: boolean } = {};
    for (const op of operations(body)) {
      if (op.op === 'remove') {
        if (op.path === 'externalid') change.externalId = null;
        continue;
      }
      // Without a path, the value is an object of attributes
      const values: Record<string, unknown> = op.path ? { [op.path]: op.value } : lowerKeys(op.value);
      for (const [path, value] of Object.entries(values)) {
        if (path === 'active') change.active = activeOf(value as boolean | string) ?? change.active;
        else if (path === 'username' && typeof value === 'string') change.email = emailOf({ userName: value });
        else if (path === 'externalid') change.externalId = str(value) ?? null;
        else if (path.startsWith('emails') && !change.email) {
          const email = Array.isArray(value) ? (value[0] as { value?: string })?.value : value;
          if (typeof email === 'string' && EMAIL.test(email)) change.email = email.toLowerCase();
        }
        // name.*, displayName, title, … are not kept by optik
      }
    }
    await this.changeUser(id, change);
    return this.getUser(base, id);
  }

  async deleteUser(id: string) {
    const user = await this.findUser(id);
    if (user.role === 'admin' && (await this.prisma.user.count({ where: { role: 'admin', deactivatedAt: null } })) <= 1) {
      throw new ScimError('optik needs at least one admin', 'mutability');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit.record({ action: 'user.removed', target: { type: 'user', id, label: user.email }, details: AS_SCIM });
  }

  private async changeUser(id: string, change: { email?: string; externalId?: string | null; active?: boolean }) {
    const user = await this.findUser(id);
    const data: Prisma.UserUpdateInput = {};
    if (change.email && change.email !== user.email) {
      if (await this.prisma.user.findUnique({ where: { email: change.email } })) {
        throw new ScimConflict(`A user with userName "${change.email}" exists`);
      }
      data.email = change.email;
    }
    if (change.externalId !== undefined && change.externalId !== user.scimExternalId) data.scimExternalId = change.externalId;
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id }, data });
      if (data.email) {
        await this.audit.record({
          action: 'user.updated',
          target: { type: 'user', id, label: change.email },
          details: { email: { from: user.email, to: change.email }, ...AS_SCIM },
        });
      }
    }
    if (change.active !== undefined) {
      await this.users.applyActive(id, change.active, AS_SCIM).catch((err) => {
        throw new ScimError((err as Error).message, 'mutability');
      });
    }
  }

  private async findUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } }).catch(() => null);
    if (!user) throw new NotFoundException(`User "${id}" not found`);
    return user;
  }

  // ------------------------------------------------------------------- groups

  async listGroups(base: string, query: { filter?: string; startIndex?: string; count?: string; excludedAttributes?: string }) {
    return this.page(base, query, groupFilter(query.filter), 'group', !/members/i.test(query.excludedAttributes ?? ''));
  }

  async getGroup(base: string, id: string, excludedAttributes?: string) {
    return groupResource(base, await this.findGroup(id), !/members/i.test(excludedAttributes ?? ''));
  }

  async createGroup(base: string, input: ScimGroupInput) {
    const name = str(input.displayName);
    if (!name) throw new ScimError('displayName is required', 'invalidValue');
    const team = await this.teams.create({ name }).catch((err) => {
      throw err instanceof ConflictException ? new ScimConflict(`A group called "${name}" exists`) : err;
    });
    await this.prisma.team.update({ where: { id: team.id }, data: { scimExternalId: str(input.externalId) } });
    await this.teams.addMembersById(team.id, memberIds(input.members), AS_SCIM);
    return this.getGroup(base, team.id);
  }

  async replaceGroup(base: string, id: string, input: ScimGroupInput) {
    const team = await this.findGroup(id);
    await this.renameGroup(team, str(input.displayName));
    await this.prisma.team.update({ where: { id }, data: { scimExternalId: str(input.externalId) ?? null } });
    await this.teams.setMembersById(id, memberIds(input.members), AS_SCIM);
    return this.getGroup(base, id);
  }

  async patchGroup(base: string, id: string, body: { Operations?: PatchOperation[] }) {
    const team = await this.findGroup(id);
    for (const op of operations(body)) {
      const path = op.path ?? '';
      // remove members[value eq "id"]
      const single = /^members\[value eq "([^"]+)"\]$/.exec(path);
      if (op.op === 'remove' && single) {
        await this.teams.removeMembersById(id, [single[1]], AS_SCIM);
      } else if (path === 'members') {
        const ids = memberIds(op.value as ScimGroupInput['members']);
        if (op.op === 'add') await this.teams.addMembersById(id, ids, AS_SCIM);
        else if (op.op === 'remove') await this.teams.removeMembersById(id, op.value ? ids : null, AS_SCIM);
        else await this.teams.setMembersById(id, ids, AS_SCIM);
      } else if (path === 'displayname') {
        await this.renameGroup(team, str(op.value));
      } else if (path === 'externalid') {
        await this.prisma.team.update({ where: { id }, data: { scimExternalId: str(op.value) ?? null } });
      } else if (!path && op.value && typeof op.value === 'object') {
        const value = lowerKeys(op.value);
        if (value.displayname !== undefined) await this.renameGroup(team, str(value.displayname));
        if (value.externalid !== undefined) {
          await this.prisma.team.update({ where: { id }, data: { scimExternalId: str(value.externalid) ?? null } });
        }
        if (value.members !== undefined) {
          await this.teams.setMembersById(id, memberIds(value.members as ScimGroupInput['members']), AS_SCIM);
        }
      }
    }
    return this.getGroup(base, id);
  }

  async deleteGroup(id: string) {
    await this.findGroup(id);
    await this.teams.remove(id);
  }

  private async renameGroup(team: { id: string; name: string; description: string | null }, name: string | undefined) {
    if (!name || name === team.name) return;
    await this.teams.update(team.id, { name, description: team.description }).catch((err) => {
      throw err instanceof ConflictException ? new ScimConflict(`A group called "${name}" exists`) : err;
    });
  }

  private async findGroup(id: string) {
    const team = await this.prisma.team
      .findUnique({ where: { id }, include: { members: { include: { user: { select: { email: true } } } } } })
      .catch(() => null);
    if (!team) throw new NotFoundException(`Group "${id}" not found`);
    return team;
  }

  // ------------------------------------------------------------------ helpers

  private async page(
    base: string,
    query: { startIndex?: string; count?: string },
    where: Prisma.UserWhereInput | Prisma.TeamWhereInput,
    kind: 'user' | 'group',
    withMembers = true,
  ) {
    const startIndex = Math.max(1, Number(query.startIndex) || 1);
    const count = Math.min(MAX_PAGE, Math.max(0, query.count === undefined ? 100 : Number(query.count) || 0));
    const [total, rows] =
      kind === 'user'
        ? await Promise.all([
            this.prisma.user.count({ where: where as Prisma.UserWhereInput }),
            this.prisma.user.findMany({ where: where as Prisma.UserWhereInput, orderBy: { createdAt: 'asc' }, skip: startIndex - 1, take: count }),
          ])
        : await Promise.all([
            this.prisma.team.count({ where: where as Prisma.TeamWhereInput }),
            this.prisma.team.findMany({
              where: where as Prisma.TeamWhereInput,
              orderBy: { createdAt: 'asc' },
              skip: startIndex - 1,
              take: count,
              include: { members: { include: { user: { select: { email: true } } } } },
            }),
          ]);
    const resources =
      kind === 'user'
        ? (rows as Parameters<typeof userResource>[1][]).map((r) => userResource(base, r))
        : (rows as Parameters<typeof groupResource>[1][]).map((r) => groupResource(base, r, withMembers));
    return { schemas: [SCHEMA.list], totalResults: total, startIndex, itemsPerPage: resources.length, Resources: resources };
  }
}

export class ScimConflict extends ConflictException {
  readonly scimType = 'uniqueness';
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function lowerKeys(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Entra sends "True"/"False" strings, Okta booleans. */
function activeOf(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return undefined;
}

/** The account's e-mail: the userName if it is one, else the primary e-mail. */
function emailOf(input: ScimUserInput): string {
  const candidates = [input.userName, input.emails?.find((e) => e.primary)?.value, input.emails?.[0]?.value];
  const email = candidates.find((v): v is string => typeof v === 'string' && EMAIL.test(v.trim()));
  if (!email) throw new ScimError('userName or emails must contain an e-mail address', 'invalidValue');
  return email.trim().toLowerCase();
}

function memberIds(members: ScimGroupInput['members']): string[] {
  return (Array.isArray(members) ? members : []).map((m) => m?.value).filter((v): v is string => typeof v === 'string');
}

/** PATCH operations with lower-case op and path. */
function operations(body: { Operations?: PatchOperation[] }): Required<Pick<PatchOperation, 'op'>> & PatchOperation[] {
  const ops = Array.isArray(body?.Operations) ? body.Operations : null;
  if (!ops) throw new ScimError('Operations are required', 'invalidSyntax');
  return ops.map((o) => ({
    op: String(o?.op ?? '').toLowerCase(),
    path: typeof o?.path === 'string' ? normalizePath(o.path) : undefined,
    value: o?.value,
  })) as never;
}

/** "userName" → "username"; values in filters keep their case. */
function normalizePath(path: string) {
  return path.replace(/^([^[]+)/, (attr) => attr.toLowerCase());
}

/** `attribute eq "value"` — the filters Entra ID and Okta send. */
function parseFilter(filter: string | undefined): { attribute: string; value: string } | null {
  if (!filter) return null;
  const match = /^\s*([\w.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(filter);
  if (!match) throw new ScimError(`Unsupported filter "${filter}" — only attribute eq "value"`, 'invalidFilter');
  return { attribute: match[1].toLowerCase(), value: match[2].replace(/\\(.)/g, '$1') };
}

function userFilter(filter: string | undefined): Prisma.UserWhereInput {
  const parsed = parseFilter(filter);
  if (!parsed) return {};
  if (['username', 'emails.value', 'emails'].includes(parsed.attribute)) return { email: parsed.value.toLowerCase() };
  if (parsed.attribute === 'externalid') return { scimExternalId: parsed.value };
  if (parsed.attribute === 'id') return { id: parsed.value };
  throw new ScimError(`Filtering by ${parsed.attribute} is not supported`, 'invalidFilter');
}

function groupFilter(filter: string | undefined): Prisma.TeamWhereInput {
  const parsed = parseFilter(filter);
  if (!parsed) return {};
  if (parsed.attribute === 'displayname') return { name: parsed.value };
  if (parsed.attribute === 'externalid') return { scimExternalId: parsed.value };
  if (parsed.attribute === 'id') return { id: parsed.value };
  throw new ScimError(`Filtering by ${parsed.attribute} is not supported`, 'invalidFilter');
}

function userResource(
  base: string,
  u: { id: string; email: string; scimExternalId: string | null; deactivatedAt: Date | null; createdAt: Date },
) {
  return {
    schemas: [SCHEMA.user],
    id: u.id,
    ...(u.scimExternalId ? { externalId: u.scimExternalId } : {}),
    userName: u.email,
    emails: [{ value: u.email, type: 'work', primary: true }],
    active: !u.deactivatedAt,
    meta: { resourceType: 'User', created: u.createdAt.toISOString(), location: `${base}/api/scim/v2/Users/${u.id}` },
  };
}

function groupResource(
  base: string,
  t: {
    id: string;
    name: string;
    scimExternalId: string | null;
    createdAt: Date;
    members: { userId: string; user: { email: string } }[];
  },
  withMembers: boolean,
) {
  return {
    schemas: [SCHEMA.group],
    id: t.id,
    ...(t.scimExternalId ? { externalId: t.scimExternalId } : {}),
    displayName: t.name,
    ...(withMembers ? { members: t.members.map((m) => ({ value: m.userId, display: m.user.email })) } : {}),
    meta: { resourceType: 'Group', created: t.createdAt.toISOString(), location: `${base}/api/scim/v2/Groups/${t.id}` },
  };
}
