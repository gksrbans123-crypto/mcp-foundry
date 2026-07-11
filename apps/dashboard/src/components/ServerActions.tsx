"use client";

import { useState, useTransition } from "react";
import type { ServerStatus } from "@mcp-foundry/shared";
import {
  deleteServerAction,
  disableServerAction,
  enableServerAction,
} from "../lib/server-actions";

/**
 * Owner-only management buttons on the server detail page. Enable/disable is an
 * instant status flip; delete uses an inline two-step confirm (no browser
 * `confirm()` dialog, so it stays testable and non-blocking). Errors from the
 * server actions (e.g. ownership check failure) surface inline.
 */
export function ServerActions({ serverId, status }: { serverId: string; status: ServerStatus }) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "deleted") return null;

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
      }
    });
  }

  return (
    <div className="server-actions">
      {status === "active" && (
        <button className="button" disabled={pending} onClick={() => run(() => disableServerAction(serverId))}>
          비활성화
        </button>
      )}
      {status === "disabled" && (
        <button
          className="button button-primary"
          disabled={pending}
          onClick={() => run(() => enableServerAction(serverId))}
        >
          활성화
        </button>
      )}

      {confirmingDelete ? (
        <span className="server-actions-confirm">
          <span>정말 삭제할까요? 되돌릴 수 없습니다.</span>
          <button
            className="button button-danger"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await deleteServerAction(serverId);
                setConfirmingDelete(false);
              })
            }
          >
            삭제 확인
          </button>
          <button className="button" disabled={pending} onClick={() => setConfirmingDelete(false)}>
            취소
          </button>
        </span>
      ) : (
        <button className="button button-danger" disabled={pending} onClick={() => setConfirmingDelete(true)}>
          삭제
        </button>
      )}

      {error && <p className="server-actions-error">{error}</p>}
    </div>
  );
}
