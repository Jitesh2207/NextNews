export function getNewsImageSrc(url?: string | null): string {
  if (!url) return "/news1.jpg";

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "/news1.jpg";
    }

    return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return "/news1.jpg";
  }
}

export function getSourceLogoSrc(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const hostname = parsed.hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}
