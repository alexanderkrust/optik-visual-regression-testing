// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { X509Certificate } from 'crypto';
import { SAML, ValidateInResponseTo, type CacheItem, type CacheProvider, type Profile } from '@node-saml/node-saml';
import type { PrismaService } from '../../database/prisma.service';

/** How long a sign-in at the provider may take. */
export const SAML_REQUEST_TTL_MS = 10 * 60 * 1000;

export interface SamlProvider {
  issuer: string;
  samlEntryPoint: string | null;
  samlCertificate: string | null;
}

export interface SpUrls {
  /** optik's entity ID */
  entityId: string;
  /** Assertion consumer service (HTTP-POST binding) */
  acsUrl: string;
}

/**
 * Remembers the authentication requests optik sent, in the database — so a
 * response must answer one of them (InResponseTo), only once, and any
 * instance behind a load balancer can check it.
 */
export class SamlRequestStore implements CacheProvider {
  /** The request ID saved last, i.e. of the request just generated */
  saved: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    await this.prisma.samlRequest.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.samlRequest.create({ data: { id: key, expiresAt: new Date(Date.now() + SAML_REQUEST_TTL_MS) } });
    this.saved = key;
    return { value, createdAt: Date.now() };
  }

  /** The request's creation time, as node-saml expects it */
  async getAsync(key: string): Promise<string | null> {
    const row = await this.prisma.samlRequest.findUnique({ where: { id: key } });
    if (!row || row.expiresAt < new Date()) return null;
    return new Date(row.expiresAt.getTime() - SAML_REQUEST_TTL_MS).toISOString();
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (key) await this.prisma.samlRequest.deleteMany({ where: { id: key } });
    return key;
  }
}

/**
 * A SAML service provider for one identity provider. Responses must carry a
 * signed assertion from the configured certificate, for optik's entity ID,
 * answering a request optik sent.
 */
export function samlClient(provider: SamlProvider, urls: SpUrls, store: CacheProvider): SAML {
  return new SAML({
    entryPoint: provider.samlEntryPoint ?? undefined,
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    audience: urls.entityId,
    idpCert: provider.samlCertificate ?? '',
    idpIssuer: provider.issuer,
    wantAssertionsSigned: true,
    // Entra ID and most providers sign the assertion, not always the response
    wantAuthnResponseSigned: false,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
    acceptedClockSkewMs: 60_000,
    cacheProvider: store,
    // Let the provider choose the NameID format and how the user authenticates
    identifierFormat: null,
    disableRequestedAuthnContext: true,
    signatureAlgorithm: 'sha256',
  });
}

/** The service provider metadata to import at the identity provider. */
export function spMetadata(urls: SpUrls): string {
  const client = new SAML({
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    idpCert: 'unused',
    wantAssertionsSigned: true,
  });
  return client.generateServiceProviderMetadata(null, null);
}

/** The values optik reads from a validated SAML profile, as OIDC-like claims. */
export function profileClaims(
  profile: Profile,
  { emailAttribute, groupsClaim }: { emailAttribute: string; groupsClaim: string },
): Record<string, unknown> {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const email = [profile[emailAttribute], profile.email, profile.mail, profile.nameID]
    .map(first)
    .find((v): v is string => typeof v === 'string' && v.includes('@'));
  return { sub: profile.nameID, email, [groupsClaim]: profile[groupsClaim] };
}

/** The certificate's subject and expiry, or why it can't be read. */
export function describeCertificate(pem: string): { ok: boolean; message: string } {
  try {
    const cert = new X509Certificate(pem);
    const expires = new Date(cert.validTo);
    if (expires < new Date()) return { ok: false, message: `The certificate expired on ${expires.toISOString().slice(0, 10)}` };
    return { ok: true, message: `Certificate for ${cert.subject.replace(/\n/g, ', ')}, valid until ${expires.toISOString().slice(0, 10)}` };
  } catch {
    return { ok: false, message: 'The certificate is not a valid PEM certificate' };
  }
}
