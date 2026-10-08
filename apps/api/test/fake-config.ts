import type { ConfigService } from '@nestjs/config';

/**
 * A ConfigService that only knows the given values. Nest's ConfigService
 * prefers process.env, which the test script fills from the root .env.
 */
export function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`${key} is not set`);
      return values[key];
    },
  } as unknown as ConfigService;
}
