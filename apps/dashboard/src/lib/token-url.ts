/**
 * Rebuilds `pathname` with `?token=` removed from `searchParamsString`,
 * preserving every other query param. Used by TokenSessionBridge (MEDIUM-3)
 * to scrub the owner token from the visible URL/history entry once it's
 * been captured into sessionStorage.
 */
export function buildUrlWithoutToken(pathname: string, searchParamsString: string): string {
  const params = new URLSearchParams(searchParamsString);
  params.delete("token");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
