import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    // MEDIUM-3 (security review): owner tokens travel in the URL query
    // string (see TokenSessionBridge.tsx) — without this, clicking any
    // outbound link from the dashboard would leak the full URL, token
    // included, to that site via the Referer header.
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  typescript: {
    // The monorepo pins "typescript": "^7.0.2" (the native/Go rewrite),
    // whose `require("typescript")` entrypoint resolves to a version-only
    // module rather than the classic Program/LanguageService API. Next's
    // build-time type-checking step expects the classic API and crashes on
    // TS7 ("The 'id' argument must be of type string. Received undefined")
    // regardless of bundler (webpack or Turbopack). Real type errors are
    // still caught by the separate `pnpm typecheck` script (plain `tsc
    // --noEmit`, which works fine against TS7's CLI binary) — this only
    // disables the redundant, currently-broken duplicate check inside
    // `next build` itself.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
