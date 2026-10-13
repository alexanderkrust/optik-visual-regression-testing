import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { securityTxt } from '$lib/server/security-txt';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const origin = (env.PUBLIC_URL || url.origin).replace(/\/+$/, '');
  const body = securityTxt(env, `${origin}/.well-known/security.txt`);
  if (!body) error(404, 'Not found');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
