import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export type SessionData = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
};

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function sealSession(data: SessionData, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv(12):tag(16):ciphertext — all base64url joined by '.'
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function unsealSession(sealed: string, secret: string): SessionData | null {
  try {
    const parts = sealed.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, encB64] = parts;
    const key = deriveKey(secret);
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(encB64, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as SessionData;
  } catch {
    return null;
  }
}
