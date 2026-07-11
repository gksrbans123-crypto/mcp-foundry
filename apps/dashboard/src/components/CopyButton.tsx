"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser (permissions/insecure
      // context) — silently no-op rather than surface a confusing error for
      // a non-critical convenience action.
    }
  }

  return (
    <button type="button" className="button" onClick={handleClick}>
      {copied ? "복사됨" : "복사"}
    </button>
  );
}
