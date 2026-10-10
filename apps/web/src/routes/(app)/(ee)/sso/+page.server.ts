// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { error, fail } from '@sveltejs/kit';
import type { PasswordLogin, ProjectRole, SaveIdentityProviderDto, SsoRoleMapping } from '@optik/shared';
import { serverApi } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();
  if (user.role !== 'admin') error(403, 'Only admins can set up single sign-on');
  const api = serverApi(event.locals);
  try {
    const [providers, settings, projects, teams] = await Promise.all([
      api.sso.providers(),
      api.sso.settings(),
      api.projects.list(),
      api.teams.list().catch(() => []),
    ]);
    return { available: true as const, providers, settings, projects, teams };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('403')) {
      return { available: false as const, providers: [], settings: null, projects: [], teams: [] };
    }
    throw e;
  }
};

/** "400 Bad Request: message" from the API → just the message */
const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') || e.message : String(e);

/** The provider form → API DTO. Role mappings come as parallel lists. */
function providerDto(data: FormData): SaveIdentityProviderDto {
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const groups = data.getAll('mappingGroup').map(String);
  const targets = data.getAll('mappingTarget').map(String);
  const roles = data.getAll('mappingRole').map(String);
  const roleMappings: SsoRoleMapping[] = groups
    .map((group, i): SsoRoleMapping => {
      const [kind, ...rest] = (targets[i] ?? '').split(':');
      const name = rest.join(':');
      if (kind === 'project') return { group: group.trim(), project: name, role: roles[i] as ProjectRole };
      if (kind === 'team') return { group: group.trim(), project: null, team: name, role: 'member' };
      return { group: group.trim(), project: null, role: 'admin' };
    })
    .filter((m) => m.group);
  const protocol = text('protocol') === 'saml' ? 'saml' : 'oidc';
  return {
    name: text('name'),
    protocol,
    issuer: text('issuer'),
    ...(protocol === 'oidc'
      ? { clientId: text('clientId') }
      : {
          samlEntryPoint: text('samlEntryPoint'),
          samlCertificate: text('samlCertificate'),
          emailAttribute: text('emailAttribute') || undefined,
        }),
    ...(text('clientSecret') ? { clientSecret: text('clientSecret') } : {}),
    scopes: text('scopes') || undefined,
    groupsClaim: text('groupsClaim') || undefined,
    allowedDomains: text('allowedDomains').split(/[\s,]+/).filter(Boolean),
    createUsers: data.get('createUsers') === 'on',
    enabled: data.get('enabled') === 'on',
    roleMappings,
  };
}

export const actions: Actions = {
  save: async (event) => {
    const data = await event.request.formData();
    const id = String(data.get('id') ?? '');
    const api = serverApi(event.locals);
    try {
      const dto = providerDto(data);
      const saved = id ? await api.sso.update(id, dto) : await api.sso.create(dto);
      return { saved: saved.id };
    } catch (e) {
      return fail(400, { error: message(e), editing: id || 'new' });
    }
  },
  remove: async (event) => {
    const id = String((await event.request.formData()).get('id') ?? '');
    await serverApi(event.locals).sso.remove(id);
    return { removed: true };
  },
  check: async (event) => {
    const id = String((await event.request.formData()).get('id') ?? '');
    return { check: { id, ...(await serverApi(event.locals).sso.check(id)) } };
  },
  settings: async (event) => {
    const passwordLogin = String((await event.request.formData()).get('passwordLogin')) as PasswordLogin;
    try {
      await serverApi(event.locals).sso.updateSettings({ passwordLogin });
      return { settingsSaved: true };
    } catch (e) {
      return fail(400, { settingsError: message(e) });
    }
  },
};
