import type { Project, Run, Snapshot, UpdateSnapshotStatusDto, ApiToken, CreateApiTokenDto, CreatedApiTokenDto } from '@optik/shared';

/** The API is served under /api on the same origin as the web UI. */
const BROWSER_BASE_URL = '/api';

function makeRequest(baseUrl: string, accessToken?: string) {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeaders: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders, ...init?.headers },
      ...init,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };
}

/**
 * API client. In the browser it uses relative /api URLs; server-side code must
 * pass an absolute base URL — use `serverApi()` from `$lib/server/api`.
 */
export function createApi(accessToken?: string, baseUrl = BROWSER_BASE_URL) {
  const request = makeRequest(baseUrl, accessToken);
  return {
    projects: {
      list: () => request<Project[]>('/projects'),
      create: (body: { name: string; slug: string }) =>
        request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
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
    },
  };
}
