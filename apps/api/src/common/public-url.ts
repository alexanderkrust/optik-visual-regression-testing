import type { ConfigService } from '@nestjs/config';

/**
 * The URL people open optik under, for links in commit statuses, chat
 * messages and e-mails: PUBLIC_URL if set, otherwise the URL the adapter used
 * for the run. Null if neither is known.
 */
export function publicUrl(config: ConfigService, runServerUrl?: string | null): string | null {
  const url = config.get<string>('PUBLIC_URL') || runServerUrl || '';
  return url ? url.replace(/\/+$/, '') : null;
}
