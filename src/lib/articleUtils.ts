/**
 * Utility to encode and decode article URLs for use in Next.js dynamic routes.
 */

export function encodeArticleId(url: string): string {
  if (!url) return "";
  // Use btoa for base64, then make it URL safe
  try {
    return Buffer.from(url).toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  } catch (e) {
    console.error("Failed to encode URL", e);
    return "";
  }
}

export function decodeArticleId(id: string): string {
  if (!id) return "";
  try {
    // Restore base64 padding and characters
    let base64 = id.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch (e) {
    console.error("Failed to decode ID", e);
    return "";
  }
}
