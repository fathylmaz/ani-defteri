export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (
    options.method &&
    !["GET", "HEAD"].includes(options.method.toUpperCase())
  ) {
    let csrf = document.cookie
      .split("; ")
      .find((x) => x.startsWith("csrftoken="))
      ?.slice(10);
    if (!csrf) {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
      });
      const data = await res.json();
      csrf = data.csrfToken;
    }
    if (csrf) headers.set("X-CSRFToken", decodeURIComponent(csrf));
  }
  return fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
}
