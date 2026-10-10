// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type {
  IdentityProvider,
  PasswordLogin,
  ProjectRole,
  SaveIdentityProviderDto,
  SsoLoginOption,
  SsoRoleMapping,
  SsoSettings,
} from '@optik/shared';
import type { IdentityProvider as ProviderRow, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SecretBox } from '../../common/secret-box';
import { publicUrl } from '../../common/public-url';
import { AuditTrail } from '../../audit/audit-trail';
import { AuthService, SessionTokens } from '../../auth/auth.service';
import { LoginPolicy } from '../../auth/login-policy';
import { LicenseService } from '../../license/license.service';
import { authorizationUrl, completeSignIn, discover, randomToken } from './oidc';
import { describeCertificate, profileClaims, samlClient, SamlRequestStore, spMetadata, SpUrls } from './saml';
import { TeamsService } from '../teams/teams.service';

export const STATE_COOKIE = 'optik_sso';
/** Ties a SAML response to the browser that started the sign-in */
export const SAML_COOKIE = 'optik_saml';
const STATE_TTL_S = 600;
const LOGIN_CODE_TTL_MS = 60_000;
const PASSWORD_SETTING = 'sso.password_login';
const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, reviewer: 2, maintainer: 3 };
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/** What the browser keeps (encrypted) between leaving for the provider and coming back. */
interface SignInState {
  providerId: string;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  exp: number;
}

/** The parts of a request the sign-in needs. */
export interface RequestInfo {
  protocol: string;
  hostname: string;
  cookieHeader?: string;
}

/**
 * Single sign-on with OpenID Connect providers (Entra ID, Okta, Keycloak,
 * Google, …): authorization code flow with PKCE, accounts created on first
 * sign-in, roles mapped from the provider's groups.
 */
@Injectable()
export class SsoService implements OnModuleInit {
  private readonly logger = new Logger(SsoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly config: ConfigService,
    private readonly audit: AuditTrail,
    private readonly auth: AuthService,
    private readonly loginPolicy: LoginPolicy,
    private readonly license: LicenseService,
    private readonly teams: TeamsService,
  ) {}

  onModuleInit() {
    // Admins keep their password as a way in when the provider is down
    this.loginPolicy.register(async (user) => {
      if (user.role === 'admin' || !(await this.license.has('sso'))) return null;
      if ((await this.settings()).passwordLogin === 'admins') {
        return 'Sign in with single sign-on — passwords are only for admins';
      }
      return null;
    });
  }

  // ------------------------------------------------------------ administration

  async list(req: RequestInfo): Promise<IdentityProvider[]> {
    const rows = await this.prisma.identityProvider.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.toDto(r, req));
  }

  async create(dto: SaveIdentityProviderDto, req: RequestInfo): Promise<IdentityProvider> {
    const data = validate(dto, null);
    const row = await this.prisma.identityProvider.create({
      data: {
        ...data,
        clientSecretEncrypted: dto.clientSecret?.trim() ? this.secrets.encrypt(dto.clientSecret.trim()) : null,
      },
    });
    await this.audit.record({
      action: 'sso.provider_created',
      target: { type: 'identity_provider', id: row.id, label: row.name },
      details: { issuer: row.issuer, mappings: data.roleMappings.length },
    });
    return this.toDto(row, req);
  }

  async update(id: string, dto: SaveIdentityProviderDto, req: RequestInfo): Promise<IdentityProvider> {
    const current = await this.find(id);
    const data = validate(dto, current);
    const secret = dto.clientSecret?.trim();
    const row = await this.prisma.identityProvider.update({
      where: { id },
      data: {
        ...data,
        // A stored secret is only kept for the issuer it was entered for
        clientSecretEncrypted:
          secret !== undefined && secret !== ''
            ? this.secrets.encrypt(secret)
            : data.issuer !== current.issuer
              ? null
              : undefined,
      },
    });
    await this.audit.record({
      action: 'sso.provider_updated',
      target: { type: 'identity_provider', id, label: row.name },
      details: { issuer: row.issuer, enabled: row.enabled, mappings: data.roleMappings.length, secretChanged: !!secret },
    });
    return this.toDto(row, req);
  }

  async remove(id: string): Promise<void> {
    const row = await this.find(id);
    await this.prisma.identityProvider.delete({ where: { id } });
    await this.audit.record({
      action: 'sso.provider_removed',
      target: { type: 'identity_provider', id, label: row.name },
    });
  }

  /** Reads the provider's discovery document — to check the issuer URL. */
  async check(id: string): Promise<{ ok: boolean; message: string }> {
    const row = await this.find(id);
    if (row.protocol === 'saml') return describeCertificate(row.samlCertificate ?? '');
    try {
      const d = await discover(row.issuer, { fresh: true });
      return { ok: true, message: `Found ${d.issuer} (sign-in at ${new URL(d.authorization_endpoint).host})` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async settings(): Promise<SsoSettings> {
    const row = await this.prisma.instanceSetting.findUnique({ where: { key: PASSWORD_SETTING } });
    return { passwordLogin: row?.value === 'admins' ? 'admins' : 'all' };
  }

  async updateSettings(dto: SsoSettings): Promise<SsoSettings> {
    const value: PasswordLogin | undefined = (['all', 'admins'] as const).find((v) => v === dto?.passwordLogin);
    if (!value) throw new BadRequestException('passwordLogin must be "all" or "admins"');
    if (value === 'admins' && !(await this.prisma.identityProvider.count({ where: { enabled: true } }))) {
      throw new BadRequestException('Set up an identity provider before turning off passwords');
    }
    await this.prisma.instanceSetting.upsert({
      where: { key: PASSWORD_SETTING },
      create: { key: PASSWORD_SETTING, value },
      update: { value },
    });
    await this.audit.record({ action: 'sso.settings_updated', details: { passwordLogin: value } });
    return { passwordLogin: value };
  }

  // ------------------------------------------------------------------- sign-in

  /** Buttons for the sign-in page — none without the Enterprise edition. */
  async loginOptions(): Promise<SsoLoginOption[]> {
    if (!(await this.license.has('sso'))) return [];
    const rows = await this.prisma.identityProvider.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    return rows;
  }

  /** Sends the browser to the provider; returns its URL and the state cookie to set. */
  async start(id: string, returnTo: string | undefined, req: RequestInfo): Promise<{ url: string; cookie: string }> {
    await this.license.require('sso');
    const provider = await this.enabledProvider(id);
    if (provider.protocol === 'saml') return this.startSaml(provider, returnTo, req);
    const d = await discover(provider.issuer).catch((err) => {
      throw new BadRequestException(`${provider.name} can't be reached: ${(err as Error).message}`);
    });
    const state: SignInState = {
      providerId: id,
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
      returnTo: safePath(returnTo),
      exp: Date.now() + STATE_TTL_S * 1000,
    };
    return {
      url: authorizationUrl(d, this.client(provider, req), state),
      cookie: this.cookie(this.secrets.encrypt(JSON.stringify(state)), STATE_TTL_S, req),
    };
  }

  /**
   * The provider sends the browser back here. On success the browser goes on
   * to the web UI with a one-time code; on failure to the sign-in page.
   */
  async callback(
    id: string,
    query: { code?: string; state?: string; error?: string; error_description?: string },
    req: RequestInfo,
  ): Promise<{ redirect: string; clearCookie: string }> {
    const base = this.baseUrl(req);
    const clearCookie = this.cookie('', 0, req);
    try {
      await this.license.require('sso');
      if (query.error) throw new Error(query.error_description ?? query.error);

      const state = this.readState(req.cookieHeader);
      if (!state || state.providerId !== id || state.state !== query.state || state.exp < Date.now()) {
        throw new Error('The sign-in expired or was started in another browser — please try again');
      }
      if (!query.code) throw new Error('The provider sent no authorization code');

      const provider = await this.enabledProvider(id);
      const d = await discover(provider.issuer);
      const claims = await completeSignIn(d, this.client(provider, req), {
        code: query.code,
        verifier: state.verifier,
        nonce: state.nonce,
      });
      const user = await this.signIn(provider, claims);
      return { redirect: await this.handOver(user.id, state.returnTo, base), clearCookie };
    } catch (err) {
      return { redirect: this.failed(id, err, base), clearCookie };
    }
  }

  // ---------------------------------------------------------------------- SAML

  private async startSaml(provider: ProviderRow, returnTo: string | undefined, req: RequestInfo) {
    const store = new SamlRequestStore(this.prisma);
    const saml = samlClient(provider, this.spUrls(provider.id, req), store);
    // The request ID is the RelayState (at most 80 bytes); the rest stays here
    const url = await saml.getAuthorizeUrlAsync('', undefined, {});
    const requestId = store.saved!;
    await this.prisma.samlRequest.update({ where: { id: requestId }, data: { returnTo: safePath(returnTo) } });
    const withRelayState = new URL(url);
    withRelayState.searchParams.set('RelayState', requestId);
    return { url: withRelayState.toString(), cookie: this.samlCookie(requestId, req) };
  }

  /**
   * The provider posts the SAML response here (HTTP-POST binding). It must be
   * signed with the configured certificate, meant for optik, recent, and
   * answer a request this browser started.
   */
  async samlCallback(
    id: string,
    body: { SAMLResponse?: string; RelayState?: string },
    req: RequestInfo,
  ): Promise<{ redirect: string; clearCookie: string }> {
    const base = this.baseUrl(req);
    const clearCookie = this.samlCookie('', req, 0);
    try {
      await this.license.require('sso');
      const provider = await this.enabledProvider(id);
      if (provider.protocol !== 'saml' || !body?.SAMLResponse) throw new Error('This is not a SAML sign-in');

      const request = body.RelayState
        ? await this.prisma.samlRequest.findUnique({ where: { id: body.RelayState } })
        : null;
      if (!request) throw new Error('The sign-in expired or was not started here — please try again');
      const cookie = readCookie(req.cookieHeader, SAML_COOKIE);
      // Browsers only send the cookie with the provider's POST over HTTPS (SameSite=None)
      if ((cookie || base.startsWith('https:')) && cookie !== request.id) {
        throw new Error('The sign-in was started in another browser — please try again');
      }

      const saml = samlClient(provider, this.spUrls(id, req), new SamlRequestStore(this.prisma));
      const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: body.SAMLResponse }).catch((err) => {
        throw new Error(`The SAML response is not valid: ${(err as Error).message}`);
      });
      if (!profile) throw new Error('The provider sent no assertion');
      // node-saml checks the signature, not who issued the assertion
      if (profile.issuer !== provider.issuer) {
        throw new Error(`The assertion was issued by "${profile.issuer}", not by "${provider.issuer}"`);
      }

      const claims = profileClaims(profile, provider);
      const user = await this.signIn(provider, claims);
      return { redirect: await this.handOver(user.id, request.returnTo, base), clearCookie };
    } catch (err) {
      return { redirect: this.failed(id, err, base), clearCookie };
    }
  }

  /** optik's SAML metadata, to import at the identity provider. */
  async metadata(id: string, req: RequestInfo): Promise<string> {
    const provider = await this.find(id);
    if (provider.protocol !== 'saml') throw new NotFoundException('This provider does not use SAML');
    return spMetadata(this.spUrls(id, req));
  }

  private spUrls(id: string, req: RequestInfo): SpUrls {
    return { entityId: `${this.baseUrl(req)}/api/auth/sso/${id}`, acsUrl: this.redirectUri(id, req) };
  }

  private samlCookie(value: string, req: RequestInfo, maxAge = Math.round(STATE_TTL_S)) {
    const https = this.baseUrl(req).startsWith('https:');
    const sameSite = https ? 'SameSite=None; Secure' : 'SameSite=Lax';
    return `${SAML_COOKIE}=${value}; Path=/api/auth/sso; HttpOnly; ${sameSite}; Max-Age=${maxAge}`;
  }

  // ------------------------------------------------------------ both protocols

  /** Sends the browser to the web UI with a one-time code for the session. */
  private async handOver(userId: string, returnTo: string, base: string): Promise<string> {
    const code = randomToken();
    await this.prisma.ssoLoginCode.create({
      data: { codeHash: hash(code), userId, expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) },
    });
    return `${base}/login/sso?${new URLSearchParams({ code, returnTo })}`;
  }

  private failed(id: string, err: unknown, base: string): string {
    const message = (err as Error).message;
    this.logger.warn(`Single sign-on with provider ${id} failed: ${message}`);
    return `${base}/login?${new URLSearchParams({ sso_error: message })}`;
  }

  /** Trades the one-time code for a session (used by the web UI's server). */
  async exchange(code: string): Promise<SessionTokens> {
    const row = await this.prisma.ssoLoginCode.findUnique({
      where: { codeHash: hash(typeof code === 'string' ? code : '') },
      include: { user: true },
    });
    if (row) await this.prisma.ssoLoginCode.delete({ where: { codeHash: row.codeHash } });
    if (!row || row.expiresAt < new Date()) throw new UnauthorizedException('The sign-in code is invalid or expired');
    return this.auth.issueTokens(row.user);
  }

  /** Finds or creates the account for the provider's claims and applies the role mapping. */
  private async signIn(provider: ProviderRow, claims: Record<string, unknown>) {
    const subject = typeof claims.sub === 'string' ? claims.sub : null;
    const email = [claims.email, claims.preferred_username, claims.upn]
      .find((v): v is string => typeof v === 'string' && EMAIL.test(v))
      ?.toLowerCase();
    if (!subject || !email) throw new Error('The provider sent no subject or e-mail address');
    if (claims.email_verified === false) throw new Error(`The provider has not verified ${email}`);
    const domain = email.split('@')[1];
    if (provider.allowedDomains.length > 0 && !provider.allowedDomains.includes(domain)) {
      throw new Error(`Accounts from ${domain} may not sign in`);
    }

    const identity = await this.prisma.userIdentity.findUnique({
      where: { providerId_subject: { providerId: provider.id, subject } },
      include: { user: true },
    });
    let user = identity?.user ?? (await this.prisma.user.findUnique({ where: { email } }));
    if (!user) {
      if (!provider.createUsers) throw new Error(`There is no optik account for ${email} — ask an admin to invite you`);
      user = await this.prisma.user.create({ data: { email, password: null, role: 'member' } });
    }
    await this.prisma.userIdentity.upsert({
      where: { providerId_subject: { providerId: provider.id, subject } },
      create: { providerId: provider.id, subject, userId: user.id, email },
      update: { email, lastLoginAt: new Date() },
    });

    const groups = groupsOf(claims[provider.groupsClaim]);
    user = await this.applyRoles(user, provider, groups);
    await this.audit.record({
      action: 'auth.login',
      actor: { type: 'user', id: user.id, label: user.email },
      target: { type: 'user', id: user.id, label: user.email },
      details: { method: 'sso', provider: provider.name, groups: groups.slice(0, 50) },
    });
    return user;
  }

  /**
   * Roles that mappings cover follow the provider's groups on every sign-in:
   * the instance admin role if a mapping without project exists, and the role
   * in each project a mapping names. Everything else stays as set in optik.
   */
  private async applyRoles<U extends { id: string; email: string; role: 'admin' | 'member' }>(
    user: U,
    provider: ProviderRow,
    groups: string[],
  ): Promise<U> {
    const mappings = provider.roleMappings as unknown as SsoRoleMapping[];
    const matching = mappings.filter((m) => groups.includes(m.group));
    const actor = { type: 'user' as const, id: user.id, label: user.email };
    const source = { source: 'sso', provider: provider.name };

    const isAdminMapping = (m: SsoRoleMapping) => m.project === null && !m.team;
    if (mappings.some(isAdminMapping)) {
      const role = matching.some(isAdminMapping) ? 'admin' : 'member';
      const lastAdmin =
        user.role === 'admin' && role === 'member' && (await this.prisma.user.count({ where: { role: 'admin' } })) <= 1;
      if (role !== user.role && !lastAdmin) {
        await this.prisma.user.update({ where: { id: user.id }, data: { role } });
        await this.audit.record({
          action: 'user.role_changed',
          actor,
          target: { type: 'user', id: user.id, label: user.email },
          details: { from: user.role, to: role, ...source },
        });
        user = { ...user, role };
      }
    }

    const slugs = [...new Set(mappings.map((m) => m.project).filter((p): p is string => !!p))];
    const projects = await this.prisma.project.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    for (const project of projects) {
      const roles = matching.filter((m) => m.project === project.slug).map((m) => m.role as ProjectRole);
      const wanted = roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null;
      const current = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
      });
      if ((current?.role ?? null) === wanted) continue;
      if (wanted) {
        await this.prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: user.id } },
          create: { projectId: project.id, userId: user.id, role: wanted },
          update: { role: wanted },
        });
      } else {
        await this.prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: user.id } } });
      }
      await this.audit.record({
        action: !current ? 'member.added' : wanted ? 'member.role_changed' : 'member.removed',
        actor,
        project,
        target: { type: 'user', id: user.id, label: user.email },
        details: { ...(current ? { from: current.role } : {}), ...(wanted ? { to: wanted } : {}), ...source },
      });
    }

    const coveredTeams = [...new Set(mappings.map((m) => m.team).filter((t): t is string => !!t))];
    if (coveredTeams.length > 0) {
      const wantedTeams = matching.map((m) => m.team).filter((t): t is string => !!t);
      await this.teams.syncMemberships(user, coveredTeams, wantedTeams, source);
    }
    return user;
  }

  // ------------------------------------------------------------------- helpers

  private async find(id: string) {
    const row = await this.prisma.identityProvider.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Identity provider "${id}" not found`);
    return row;
  }

  private async enabledProvider(id: string) {
    const row = await this.prisma.identityProvider.findUnique({ where: { id } });
    if (!row?.enabled) throw new NotFoundException('This sign-in option is not available');
    return row;
  }

  private client(provider: ProviderRow, req: RequestInfo) {
    return {
      issuer: provider.issuer,
      clientId: provider.clientId ?? '',
      clientSecret: provider.clientSecretEncrypted ? this.secrets.decrypt(provider.clientSecretEncrypted) : null,
      scopes: provider.scopes,
      redirectUri: this.redirectUri(provider.id, req),
    };
  }

  /** optik's address as the browser sees it: PUBLIC_URL, or the request's host. */
  private baseUrl(req: RequestInfo) {
    return publicUrl(this.config) ?? `${req.protocol}://${req.hostname}`;
  }

  private redirectUri(id: string, req: RequestInfo) {
    return `${this.baseUrl(req)}/api/auth/sso/${id}/callback`;
  }

  private cookie(value: string, maxAge: number, req: RequestInfo) {
    const secure = this.baseUrl(req).startsWith('https:') ? '; Secure' : '';
    return `${STATE_COOKIE}=${value}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }

  private readState(cookieHeader: string | undefined): SignInState | null {
    const raw = readCookie(cookieHeader, STATE_COOKIE);
    const json = raw ? this.secrets.decrypt(raw) : null;
    try {
      return json ? (JSON.parse(json) as SignInState) : null;
    } catch {
      return null;
    }
  }

  private toDto(r: ProviderRow, req: RequestInfo): IdentityProvider {
    return {
      id: r.id,
      name: r.name,
      protocol: r.protocol,
      issuer: r.issuer,
      clientId: r.clientId,
      clientSecretConfigured: r.clientSecretEncrypted !== null,
      scopes: r.scopes,
      groupsClaim: r.groupsClaim,
      roleMappings: r.roleMappings as unknown as SsoRoleMapping[],
      allowedDomains: r.allowedDomains,
      createUsers: r.createUsers,
      enabled: r.enabled,
      samlEntryPoint: r.samlEntryPoint,
      samlCertificate: r.samlCertificate,
      emailAttribute: r.emailAttribute,
      redirectUri: this.redirectUri(r.id, req),
      spEntityId: this.spUrls(r.id, req).entityId,
      metadataUrl: `${this.baseUrl(req)}/api/auth/sso/${r.id}/metadata`,
    };
  }
}

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

function readCookie(header: string | undefined, name: string): string | null {
  return (
    header
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) || null
  );
}

/** Only paths inside optik — never a redirect to another site. */
function safePath(value: string | undefined): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value.slice(0, 500) : '/';
}

/** Groups as a list, whether the claim is an array or a single string. */
function groupsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((g): g is string => typeof g === 'string');
  return typeof value === 'string' ? [value] : [];
}

/** A certificate in PEM form; bare base64 (as some providers show it) is wrapped. */
function pem(value: string): string {
  const body = value.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(body)) throw new BadRequestException('samlCertificate must be a PEM certificate');
  const certificate = `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
  // An expired certificate can still be saved (and replaced later); garbage can't
  if (describeCertificate(certificate).message.includes('not a valid')) {
    throw new BadRequestException('samlCertificate is not a valid certificate');
  }
  return certificate;
}

function validate(dto: SaveIdentityProviderDto, current: ProviderRow | null) {
  const text = (v: unknown, name: string, max = 500) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw new BadRequestException(`${name} is required`);
    return v.trim();
  };
  const protocol = current?.protocol ?? dto?.protocol ?? 'oidc';
  if (protocol !== 'oidc' && protocol !== 'saml') throw new BadRequestException('protocol must be "oidc" or "saml"');
  if (current && dto?.protocol && dto.protocol !== current.protocol) {
    throw new BadRequestException('The protocol of a provider cannot change — add a new one');
  }
  const httpUrl = (value: string, name: string) => {
    try {
      if (['http:', 'https:'].includes(new URL(value).protocol)) return value;
    } catch {
      // fall through
    }
    throw new BadRequestException(`${name} must be an http(s) URL`);
  };

  // SAML entity IDs may be URNs; OIDC issuers are URLs
  let issuer = text(dto?.issuer, protocol === 'saml' ? 'The entity ID of the provider' : 'issuer');
  if (protocol === 'oidc') issuer = httpUrl(issuer.replace(/\/+$/, ''), 'issuer');
  const scopes = (dto.scopes ?? current?.scopes ?? 'openid email profile').trim();
  if (protocol === 'oidc' && !scopes.split(/\s+/).includes('openid')) {
    throw new BadRequestException('scopes must include "openid"');
  }
  const saml =
    protocol === 'saml'
      ? {
          samlEntryPoint: httpUrl(text(dto.samlEntryPoint ?? current?.samlEntryPoint, 'samlEntryPoint'), 'samlEntryPoint'),
          samlCertificate: pem(text(dto.samlCertificate ?? current?.samlCertificate, 'samlCertificate', 20_000)),
        }
      : { samlEntryPoint: null, samlCertificate: null };

  const roleMappings = (dto.roleMappings ?? (current?.roleMappings as unknown as SsoRoleMapping[]) ?? []).map((m) => {
    const group = typeof m?.group === 'string' ? m.group.trim() : '';
    const project = typeof m?.project === 'string' && m.project.trim() ? m.project.trim() : null;
    const team = typeof m?.team === 'string' && m.team.trim() ? m.team.trim() : null;
    if (!group) throw new BadRequestException('Every role mapping needs a group');
    if (team) {
      if (project) throw new BadRequestException('A mapping goes to a project or a team, not both');
      return { group, project: null, team, role: 'member' as const };
    }
    if (project === null && m.role !== 'admin') throw new BadRequestException('Without a project, a group can only map to admin');
    if (project !== null && !(m.role in ROLE_RANK)) {
      throw new BadRequestException('Project roles are viewer, reviewer or maintainer');
    }
    return { group, project, role: m.role };
  });
  if (roleMappings.length > 200) throw new BadRequestException('At most 200 role mappings');

  const allowedDomains = (dto.allowedDomains ?? current?.allowedDomains ?? [])
    .map((d) => (typeof d === 'string' ? d.trim().toLowerCase().replace(/^@/, '') : ''))
    .filter(Boolean);
  if (!allowedDomains.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))) {
    throw new BadRequestException('allowedDomains must be domains like "acme.com"');
  }

  return {
    name: text(dto.name, 'name', 100),
    protocol,
    issuer,
    clientId: protocol === 'oidc' ? text(dto.clientId, 'clientId') : null,
    scopes,
    ...saml,
    emailAttribute: (dto.emailAttribute ?? current?.emailAttribute ?? 'email').trim() || 'email',
    groupsClaim: (dto.groupsClaim ?? current?.groupsClaim ?? 'groups').trim() || 'groups',
    roleMappings: roleMappings as unknown as Prisma.InputJsonValue & SsoRoleMapping[],
    allowedDomains,
    createUsers: typeof dto.createUsers === 'boolean' ? dto.createUsers : (current?.createUsers ?? true),
    enabled: typeof dto.enabled === 'boolean' ? dto.enabled : (current?.enabled ?? true),
  };
}
