// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: { id: string; email: string } | null;
			accessToken: string | null;
			/** Client address and browser, passed on to the API for its audit log */
			forwarded: Record<string, string>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
