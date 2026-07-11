/** Matches plan §1's exact public URL pattern: `https://{host}/s/{slug}/mcp`. */
export function buildPublicServerUrl(publicBaseUrl: string, slug: string): string {
  return new URL(`/s/${slug}/mcp`, publicBaseUrl).toString();
}
