export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
  let cleaned = url;
  if (cleaned.endsWith("/")) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

export function buildAppUrl(path: string): string {
  const base = getAppUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function buildTokenUrl(path: string, token: string, additionalParams?: Record<string, string>): string {
  const url = new URL(buildAppUrl(path));
  url.hash = token;
  if (additionalParams) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(additionalParams)) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
    url.hash = `${token}${parts.length > 0 ? "?" + parts.join("&") : ""}`;
  }
  return url.toString();
}

export function extractTokenFromHash(hash: string): string | null {
  if (!hash || hash.length < 2) return null;
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryIdx = token.indexOf("?");
  return queryIdx >= 0 ? token.slice(0, queryIdx) : token;
}
