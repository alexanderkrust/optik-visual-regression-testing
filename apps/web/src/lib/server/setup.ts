import { apiBase } from './api';

// Once the first user exists, setup can never be required again — skip the API call
let setupDone = false;

/** Whether no user exists yet, so the first-run setup page must be shown. */
export async function setupRequired(): Promise<boolean> {
  if (setupDone) return false;
  try {
    const res = await fetch(`${apiBase()}/auth/setup`);
    if (!res.ok) return false;
    const { required } = (await res.json()) as { required: boolean };
    if (!required) setupDone = true;
    return required;
  } catch {
    return false;
  }
}
