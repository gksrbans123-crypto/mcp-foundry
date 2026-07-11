import { cookies } from "next/headers";
import { OWNER_TOKEN_COOKIE } from "./owner-token-cookie";

export { OWNER_TOKEN_COOKIE };

/**
 * Resolves the owner token for a request: the `?token=` query param on the
 * first hop (the link the create tool hands out), otherwise the cookie the
 * bridge saved. Keeping the token out of internal links + reading it from the
 * cookie is what stops the old bridge's URL scrub/re-add loop (flashing cards)
 * and makes reloads / detail navigation work.
 */
export async function resolveOwnerToken(searchToken: string | undefined): Promise<string> {
  if (searchToken) return searchToken;
  const store = await cookies();
  return store.get(OWNER_TOKEN_COOKIE)?.value ?? "";
}
