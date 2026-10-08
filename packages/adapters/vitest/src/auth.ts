export async function authFetch(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      `Optik auth failed (401): ${(body as { message?: string }).message ?? "Invalid token"}\n` +
        `Check your token in the Optik dashboard under project settings.`,
    )
  }
  return res
}
