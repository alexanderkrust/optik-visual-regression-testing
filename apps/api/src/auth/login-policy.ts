import { Injectable } from '@nestjs/common';
import type { UserRole } from '@optik/shared';

/** Says why a user may not sign in with a password, or null if they may. */
export type PasswordLoginCheck = (user: { id: string; email: string; role: UserRole }) => Promise<string | null>;

/**
 * Rules for password sign-ins that other modules add — e.g. single sign-on
 * (ee/sso) allowing passwords only for admins. Without rules, everyone may.
 */
@Injectable()
export class LoginPolicy {
  private readonly checks: PasswordLoginCheck[] = [];

  register(check: PasswordLoginCheck) {
    this.checks.push(check);
  }

  async passwordLoginDenied(user: { id: string; email: string; role: UserRole }): Promise<string | null> {
    for (const check of this.checks) {
      const reason = await check(user);
      if (reason) return reason;
    }
    return null;
  }
}
