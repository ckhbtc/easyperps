declare const __APP_VERSION__: string

export const APP_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__
  ? __APP_VERSION__
  : 'dev'

export function shouldReloadForVersion(currentVersion: string, payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const version = (payload as { version?: unknown }).version
  return typeof version === 'string' && version.length > 0 && version !== currentVersion
}

export async function checkForAppUpdate(
  currentVersion = APP_VERSION,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return false
  return shouldReloadForVersion(currentVersion, await res.json().catch(() => null))
}

export function startAppVersionMonitor({
  onStale,
  intervalMs = 60_000,
}: {
  onStale: () => void
  intervalMs?: number
}): () => void {
  if (typeof window === 'undefined') return () => {}

  let stopped = false
  let reloading = false

  const check = async () => {
    if (stopped || reloading) return
    try {
      if (await checkForAppUpdate()) {
        reloading = true
        onStale()
      }
    } catch {
      // Ignore transient network/cache errors. The next focus or interval will retry.
    }
  }

  const interval = window.setInterval(check, intervalMs)
  window.addEventListener('focus', check)
  void check()

  return () => {
    stopped = true
    window.clearInterval(interval)
    window.removeEventListener('focus', check)
  }
}
