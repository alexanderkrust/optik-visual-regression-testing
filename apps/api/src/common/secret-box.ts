import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const VERSION = 'v1';

/**
 * Encrypts credentials stored in the database (e.g. a project's GitHub
 * token) with AES-256-GCM. The key is derived from JWT_SECRET for this purpose
 * only, so a database dump alone doesn't reveal the credentials.
 */
@Injectable()
export class SecretBox {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = createHash('sha256')
      .update(`optik:stored-secrets:${config.getOrThrow<string>('JWT_SECRET')}`)
      .digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'));
    return [VERSION, ...parts].join('.');
  }

  /** Null if the value can't be decrypted (e.g. JWT_SECRET was changed). */
  decrypt(sealed: string): string | null {
    try {
      const [version, iv, tag, data] = sealed.split('.');
      if (version !== VERSION) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}
