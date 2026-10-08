import { env } from '$env/dynamic/private';
import { createApi } from '$lib/api';

/**
 * API base URL for server-side code. In production the API runs in the same
 * process, so it is reached via localhost on the same port. API_INTERNAL_URL
 * overrides it when the API runs elsewhere (e.g. the Docker dev stack).
 */
export function apiBase(): string {
  return env.API_INTERNAL_URL ?? `http://127.0.0.1:${env.PORT ?? 3000}/api`;
}

/** API client for load functions and actions, authenticated as the current user. */
export function serverApi(locals: App.Locals) {
  return createApi(locals.accessToken ?? undefined, apiBase());
}
