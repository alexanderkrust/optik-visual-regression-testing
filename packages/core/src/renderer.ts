/**
 * Playwright `connectOptions` for the optik-renderer container (pinned
 * browsers and fonts) when OPTIK_RENDERER is set, else undefined — tests then
 * use the locally installed browsers.
 *
 * `exposeNetwork` lets the container's browsers reach this machine's
 * localhost, e.g. the dev server under test.
 */
export function rendererConnectOptions(
  env: NodeJS.ProcessEnv = process.env,
): { wsEndpoint: string; exposeNetwork: string } | undefined {
  const wsEndpoint = env.OPTIK_RENDERER?.trim();
  return wsEndpoint ? { wsEndpoint, exposeNetwork: '<loopback>' } : undefined;
}
