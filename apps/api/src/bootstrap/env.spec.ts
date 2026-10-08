import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadFileSecrets } from './env';

describe('loadFileSecrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'optik-secrets-'));
  const secretFile = (content: string) => {
    const path = join(dir, `secret-${Math.random()}`);
    writeFileSync(path, content);
    return path;
  };

  it('reads NAME from the file in NAME_FILE, without trailing newline', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL_FILE: secretFile('postgresql://db\n') };
    loadFileSecrets(env);
    expect(env.DATABASE_URL).toBe('postgresql://db');
  });

  it('does not override a variable that is set directly', () => {
    const env: NodeJS.ProcessEnv = {
      JWT_SECRET: 'direct',
      JWT_SECRET_FILE: secretFile('from-file'),
    };
    loadFileSecrets(env);
    expect(env.JWT_SECRET).toBe('direct');
  });

  it('fails clearly when the file does not exist', () => {
    const env: NodeJS.ProcessEnv = { JWT_SECRET_FILE: join(dir, 'missing') };
    expect(() => loadFileSecrets(env)).toThrow(/ENOENT/);
  });
});
