import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const envDir = resolve(__dirname, '../..');

// In development the API runs separately; the browser calls /api on the Vite
// server, which forwards it (production serves both from one process).
const env = { ...loadEnv('development', envDir, ''), ...process.env };
const apiTarget = env.API_INTERNAL_URL
	? new URL(env.API_INTERNAL_URL).origin
	: `http://localhost:${env.PORT ?? 3000}`;

export default defineConfig({
	envDir,
	plugins: [tailwindcss(), sveltekit()],
	server: {
		proxy: {
			'/api': {
				target: apiTarget,
				changeOrigin: true,
				// The API builds links (e.g. single sign-on redirect URIs) from the browser's address
				configure: (proxy) =>
					proxy.on('proxyReq', (req, incoming) => {
						if (incoming.headers.host) req.setHeader('X-Forwarded-Host', incoming.headers.host);
						req.setHeader('X-Forwarded-Proto', 'http');
					})
			}
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
