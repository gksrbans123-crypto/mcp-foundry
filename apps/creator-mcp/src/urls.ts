/**
 * Dashboard link builders. Plan §9 requires the SignedOwnerToken flow to
 * embed the dashboard URL (and the URL must actually work): apps/dashboard's
 * real routes are `/servers`, `/servers/:serverId`, and `/jobs/:jobId`, all
 * reading the owner token from a `?token=` query param (see
 * apps/dashboard/src/app/{servers,jobs}/**). These builders must stay in
 * sync with those routes — verified end to end by task #12's e2e smoke.
 */
function withToken(url: URL, token: string): string {
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildServersUrl(dashboardBaseUrl: string, token: string): string {
  return withToken(new URL("/servers", dashboardBaseUrl), token);
}

export function buildServerDetailUrl(dashboardBaseUrl: string, token: string, serverId: string): string {
  return withToken(new URL(`/servers/${serverId}`, dashboardBaseUrl), token);
}

export function buildJobStatusUrl(dashboardBaseUrl: string, token: string, jobId: string): string {
  return withToken(new URL(`/jobs/${jobId}`, dashboardBaseUrl), token);
}
