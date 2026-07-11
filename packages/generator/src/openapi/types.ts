export type OpenApiFetcher = (url: string) => Promise<unknown>;

/** Fetches and JSON-parses an OpenAPI document. Injectable so tests never hit the network. */
export const defaultOpenApiFetcher: OpenApiFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch OpenAPI document from ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
};
