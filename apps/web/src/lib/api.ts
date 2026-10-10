import type {
  ApiToken,
  AuditEventPage,
  AuditVerification,
  IdentityProvider,
  SaveIdentityProviderDto,
  SsoSettings,
  CreateApiTokenDto,
  CreatedApiTokenDto,
  CreatedInvitation,
  CreatedNotificationChannel,
  CreateNotificationChannelDto,
  NotificationChannel,
  CreateInvitationDto,
  Invitation,
  LicenseInfo,
  Project,
  ProjectMember,
  ProjectRole,
  Run,
  Snapshot,
  SnapshotComment,
  SnapshotSettings,
  UpdateProjectDto,
  UpdateSnapshotStatusDto,
  User,
  UserRole,
} from '@optik/shared';

/** The API is served under /api on the same origin as the web UI. */
const BROWSER_BASE_URL = '/api';

function makeRequest(baseUrl: string, accessToken?: string, extraHeaders: Record<string, string> = {}) {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeaders: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};
    // Only declare JSON when there is a body — Fastify rejects an empty JSON body.
    const contentType: Record<string, string> = init?.body
      ? { 'Content-Type': 'application/json' }
      : {};
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...contentType, ...extraHeaders, ...authHeaders, ...init?.headers },
    });
    if (!res.ok) {
      // "400 Bad Request: optik needs at least one admin" — keeps the API's message for the UI
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const detail = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };
}

/**
 * API client. In the browser it uses relative /api URLs; server-side code must
 * pass an absolute base URL — use `serverApi()` from `$lib/server/api`.
 */
export function createApi(
  accessToken?: string,
  baseUrl = BROWSER_BASE_URL,
  /** Server side only: client address and browser for the API's audit log */
  extraHeaders: Record<string, string> = {},
) {
  const request = makeRequest(baseUrl, accessToken, extraHeaders);
  return {
    auth: {
      me: () => request<Pick<User, 'id' | 'email' | 'role'>>('/auth/me'),
    },
    audit: {
      /** Query string as the API takes it (q, action, project, from, to, before, limit) */
      list: (query: string) => request<AuditEventPage>(`/audit-events?${query}`),
      verify: () => request<AuditVerification>('/audit-events/verify'),
    },
    sso: {
      providers: () => request<IdentityProvider[]>('/sso/providers'),
      create: (dto: SaveIdentityProviderDto) =>
        request<IdentityProvider>('/sso/providers', { method: 'POST', body: JSON.stringify(dto) }),
      update: (id: string, dto: SaveIdentityProviderDto) =>
        request<IdentityProvider>(`/sso/providers/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),
      remove: (id: string) => request<void>(`/sso/providers/${id}`, { method: 'DELETE' }),
      check: (id: string) => request<{ ok: boolean; message: string }>(`/sso/providers/${id}/check`, { method: 'POST' }),
      settings: () => request<SsoSettings>('/sso/settings'),
      updateSettings: (dto: SsoSettings) =>
        request<SsoSettings>('/sso/settings', { method: 'PUT', body: JSON.stringify(dto) }),
    },
    license: {
      get: () => request<LicenseInfo>('/license'),
      set: (key: string) => request<LicenseInfo>('/license', { method: 'PUT', body: JSON.stringify({ key }) }),
      remove: () => request<LicenseInfo>('/license', { method: 'DELETE' }),
    },
    users: {
      list: () => request<User[]>('/users'),
      setRole: (id: string, role: UserRole) =>
        request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
      remove: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
    },
    invitations: {
      list: () => request<Invitation[]>('/invitations'),
      create: (body: CreateInvitationDto) =>
        request<CreatedInvitation>('/invitations', { method: 'POST', body: JSON.stringify(body) }),
      revoke: (id: string) => request<void>(`/invitations/${id}`, { method: 'DELETE' }),
    },
    notifications: {
      list: (slug: string) => request<NotificationChannel[]>(`/projects/${slug}/notifications`),
      create: (slug: string, body: CreateNotificationChannelDto) =>
        request<CreatedNotificationChannel>(`/projects/${slug}/notifications`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      remove: (slug: string, id: string) =>
        request<void>(`/projects/${slug}/notifications/${id}`, { method: 'DELETE' }),
      test: (slug: string, id: string) =>
        request<{ delivered: boolean }>(`/projects/${slug}/notifications/${id}/test`, { method: 'POST' }),
    },
    members: {
      list: (slug: string) => request<ProjectMember[]>(`/projects/${slug}/members`),
      set: (slug: string, body: { email: string; role: ProjectRole }) =>
        request<ProjectMember>(`/projects/${slug}/members`, { method: 'PUT', body: JSON.stringify(body) }),
      remove: (slug: string, userId: string) =>
        request<void>(`/projects/${slug}/members/${userId}`, { method: 'DELETE' }),
    },
    projects: {
      list: () => request<Project[]>('/projects'),
      create: (body: { name: string; slug: string }) =>
        request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
      get: (slug: string) => request<Project>(`/projects/${slug}`),
      update: (slug: string, body: UpdateProjectDto) =>
        request<Project>(`/projects/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    },
    tokens: {
      list: (projectSlug: string) => request<ApiToken[]>(`/projects/${projectSlug}/tokens`),
      create: (projectSlug: string, body: CreateApiTokenDto) =>
        request<CreatedApiTokenDto>(`/projects/${projectSlug}/tokens`, {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      revoke: (projectSlug: string, tokenId: string) =>
        request<void>(`/projects/${projectSlug}/tokens/${tokenId}`, { method: 'DELETE' }),
    },
    runs: {
      list: (project: string) => request<Run[]>(`/runs?project=${project}`),
      get: (id: string) => request<Run>(`/runs/${id}`),
    },
    snapshots: {
      list: (runId: string) => request<Snapshot[]>(`/snapshots?runId=${runId}`),
      approve: (id: string) =>
        request<Snapshot>(`/snapshots/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' } satisfies UpdateSnapshotStatusDto),
        }),
      reject: (id: string) =>
        request<Snapshot>(`/snapshots/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'rejected' } satisfies UpdateSnapshotStatusDto),
        }),
      updateSettings: (id: string, settings: SnapshotSettings) =>
        request<Snapshot>(`/snapshots/${id}/settings`, {
          method: 'PUT',
          body: JSON.stringify(settings),
        }),
      comments: (id: string) => request<SnapshotComment[]>(`/snapshots/${id}/comments`),
      comment: (id: string, body: string) =>
        request<SnapshotComment>(`/snapshots/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      deleteComment: (id: string, commentId: string) =>
        request<void>(`/snapshots/${id}/comments/${commentId}`, { method: 'DELETE' }),
    },
  };
}
