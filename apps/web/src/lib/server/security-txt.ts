/**
 * security.txt (RFC 9116) for this optik instance. The instance belongs to
 * its operator, so the contact is theirs: SECURITY_TXT_CONTACT. Without it
 * there is no security.txt. Vulnerabilities in optik itself are reported to
 * the optik project (see SECURITY.md).
 */
export function securityTxt(env: Record<string, string | undefined>, canonical: string, now = new Date()): string | null {
  const list = (value: string | undefined) =>
    (value ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  const contacts = list(env.SECURITY_TXT_CONTACT).map((c) =>
    // A bare e-mail address becomes a mailto: URI
    /^[^\s:@]+@[^\s@]+$/.test(c) ? `mailto:${c}` : c,
  );
  if (contacts.length === 0) return null;

  // Generated from the current configuration, so it is renewed with every
  // request; RFC 9116 asks for less than a year
  const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const lines = [
    ...contacts.map((c) => `Contact: ${c}`),
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    ...list(env.SECURITY_TXT_ENCRYPTION).map((e) => `Encryption: ${e}`),
    ...list(env.SECURITY_TXT_POLICY).map((p) => `Policy: ${p}`),
    ...list(env.SECURITY_TXT_ACKNOWLEDGMENTS).map((a) => `Acknowledgments: ${a}`),
    `Preferred-Languages: ${list(env.SECURITY_TXT_LANGUAGES).join(', ') || 'en'}`,
    `Canonical: ${canonical}`,
  ];
  return lines.join('\n') + '\n';
}
