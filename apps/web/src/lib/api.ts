import type { Project, Run, Snapshot, UpdateSnapshotStatusDto, ApiToken, CreateApiTokenDto, CreatedApiTokenDto } from '@optik/shared';

/** API URL as seen by the browser — use for anything rendered into HTML (e.g. image src). */
function getPublicBaseUrl() {
  return import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return getPublicBaseUrl();
  // Server-side: use internal URL if set (e.g. Docker service name)
  return process.env.PRIVATE_API_URL ?? process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
}

function makeRequest(accessToken?: string) {
  return async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const baseUrl = getBaseUrl();
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

export function createApi(accessToken?: string) {
  const request = makeRequest(accessToken);
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
      // Rendered during SSR too, so these must never use the server-internal URL
      imageUrl: (id: string) => `${getPublicBaseUrl()}/snapshots/${id}/image`,
      diffUrl: (id: string) => `${getPublicBaseUrl()}/snapshots/${id}/diff`,
    },
  };
}

// Backward-compatible default export (unauthenticated)
export const api = createApi();
