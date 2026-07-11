export function rateLimitExceededMarkdown(kind: "mutate" | "query"): string {
  const limit = kind === "mutate" ? "3 requests/minute" : "30 requests/minute";
  return `### Rate limit exceeded\n\nYou've exceeded the ${limit} limit for this operation. Please wait a moment and try again.`;
}

export function notFoundMarkdown(kind: string, id: string): string {
  return `### ${kind} not found\n\nNo ${kind.toLowerCase()} with id \`${id}\` was found for your account.`;
}
