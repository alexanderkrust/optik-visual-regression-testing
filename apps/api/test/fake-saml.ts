import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SignedXml } from 'xml-crypto';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

export const SAML_IDP = {
  entityId: 'https://idp.example.com/saml',
  entryPoint: 'https://idp.example.com/sso',
  certificate: fixture('saml-idp.crt'),
  key: fixture('saml-idp.key'),
};
export const OTHER_KEY = { certificate: fixture('saml-other.crt'), key: fixture('saml-other.key') };

export interface ResponseOptions {
  /** The RelayState / request ID the response answers */
  inResponseTo: string;
  acsUrl: string;
  audience: string;
  nameId: string;
  attributes?: Record<string, string[]>;
  issuer?: string;
  key?: string;
  /** Minutes from now until the assertion expires (negative = already expired) */
  validFor?: number;
  signed?: boolean;
}

const iso = (offsetMinutes = 0) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** A SAML response like an identity provider posts it, base64-encoded. */
export function samlResponse(o: ResponseOptions): string {
  const issuer = esc(o.issuer ?? SAML_IDP.entityId);
  const until = iso(o.validFor ?? 5);
  const attributes = Object.entries(o.attributes ?? {})
    .map(
      ([name, values]) =>
        `<saml:Attribute Name="${esc(name)}">${values.map((v) => `<saml:AttributeValue>${esc(v)}</saml:AttributeValue>`).join('')}</saml:Attribute>`,
    )
    .join('');
  const id = (p: string) => `_${p}${randomBytes(8).toString('hex')}`;
  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ` +
    `ID="${id('r')}" Version="2.0" IssueInstant="${iso()}" Destination="${esc(o.acsUrl)}" InResponseTo="${esc(o.inResponseTo)}">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:Assertion ID="${id('a')}" Version="2.0" IssueInstant="${iso()}">` +
    `<saml:Issuer>${issuer}</saml:Issuer>` +
    `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${esc(o.nameId)}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">` +
    `<saml:SubjectConfirmationData InResponseTo="${esc(o.inResponseTo)}" NotOnOrAfter="${until}" Recipient="${esc(o.acsUrl)}"/>` +
    `</saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${iso(-1)}" NotOnOrAfter="${until}">` +
    `<saml:AudienceRestriction><saml:Audience>${esc(o.audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${iso()}" SessionIndex="${id('s')}"><saml:AuthnContext>` +
    `<saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
    `<saml:AttributeStatement>${attributes}</saml:AttributeStatement>` +
    `</saml:Assertion></samlp:Response>`;

  if (o.signed === false) return Buffer.from(xml).toString('base64');
  const assertion = "//*[local-name(.)='Assertion']";
  const sig = new SignedXml({
    privateKey: o.key ?? SAML_IDP.key,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    xpath: assertion,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  sig.computeSignature(xml, { location: { reference: `${assertion}/*[local-name(.)='Issuer']`, action: 'after' } });
  return Buffer.from(sig.getSignedXml()).toString('base64');
}
