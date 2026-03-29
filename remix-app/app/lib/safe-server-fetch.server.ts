export async function fetchJsonOrEmpty(url: string, cookieHeader: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        cookie: cookieHeader,
        ...(init?.headers || {}),
      },
    });

    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (error) {
    console.error("[safe-server-fetch] request failed:", url, error);
    return {};
  }
}
