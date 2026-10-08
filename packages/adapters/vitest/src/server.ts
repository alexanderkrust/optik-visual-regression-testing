/** Base URL of the optik server (web UI and API share one origin). */
export function serverUrl(): string {
  const url =
    process.env._OPTIK_SERVER_URL ??
    process.env.OPTIK_SERVER_URL ??
    "http://localhost:3000"
  return url.replace(/\/+$/, "")
}

/** URL of an API endpoint, e.g. apiUrl("/runs"). */
export function apiUrl(path: string): string {
  return `${serverUrl()}/api${path}`
}
