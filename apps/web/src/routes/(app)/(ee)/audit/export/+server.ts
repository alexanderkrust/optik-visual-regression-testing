// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { error } from '@sveltejs/kit';
import { apiBase } from '$lib/server/api';
import type { RequestHandler } from './$types';

/** Streams the API's export through, signed in as the current user. */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.accessToken) error(401, 'Not signed in');
  const res = await fetch(`${apiBase()}/audit-events/export${url.search}`, {
    headers: { Authorization: `Bearer ${locals.accessToken}`, ...locals.forwarded },
  });
  if (!res.ok) error(res.status, 'The export failed');
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'text/plain',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment',
    },
  });
};
