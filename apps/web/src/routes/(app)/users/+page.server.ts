import { error, fail } from '@sveltejs/kit';
import type { ProjectRole, UserRole } from '@optik/shared';
import { serverApi } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();
  if (user.role !== 'admin') error(403, 'Only admins can manage users');
  const api = serverApi(event.locals);
  const [users, invitations, projects] = await Promise.all([
    api.users.list(),
    api.invitations.list(),
    api.projects.list(),
  ]);
  return { users, invitations, projects };
};

/** "400 Bad Request: message" from the API → just the message */
const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') || e.message : String(e);

export const actions: Actions = {
  invite: async (event) => {
    const data = await event.request.formData();
    const email = String(data.get('email') ?? '').trim();
    const projectSlug = String(data.get('projectSlug') ?? '');
    try {
      const invitation = await serverApi(event.locals).invitations.create({
        email,
        baseUrl: event.url.origin,
        role: data.get('role') as UserRole,
        ...(projectSlug
          ? { projectSlug, projectRole: data.get('projectRole') as ProjectRole }
          : {}),
      });
      // The link is shown once — only its hash is stored
      return {
        inviteLink: event.url.origin + invitation.invitePath,
        invitedEmail: invitation.email,
        emailSent: invitation.emailSent,
      };
    } catch (e) {
      return fail(400, { inviteError: message(e), email });
    }
  },

  setRole: async (event) => {
    const data = await event.request.formData();
    try {
      await serverApi(event.locals).users.setRole(String(data.get('id')), data.get('role') as UserRole);
    } catch (e) {
      return fail(400, { userError: message(e) });
    }
  },

  setActive: async (event) => {
    const data = await event.request.formData();
    try {
      await serverApi(event.locals).users.setActive(String(data.get('id')), data.get('active') === 'true');
    } catch (e) {
      return fail(400, { userError: message(e) });
    }
  },

  removeUser: async (event) => {
    const data = await event.request.formData();
    try {
      await serverApi(event.locals).users.remove(String(data.get('id')));
    } catch (e) {
      return fail(400, { userError: message(e) });
    }
  },

  revokeInvitation: async (event) => {
    const data = await event.request.formData();
    await serverApi(event.locals).invitations.revoke(String(data.get('id')));
  },
};
