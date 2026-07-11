import Link from "next/link";
import type { Server } from "@mcp-foundry/shared";
import type { StageState } from "../lib/pipeline";
import { toServerCardViewModel } from "../lib/view-models";
import { Pipeline } from "./Pipeline";

export function ServerCard({ server, states }: { server: Server; states: StageState[] }) {
  const view = toServerCardViewModel(server);
  return (
    <Link className="card" href={`/servers/${server.id}`}>
      <div className="card-top">
        <div className="card-id">
          <p className="card-title">{view.name}</p>
          <p className="card-slug">{view.slug}</p>
        </div>
        <span className={`status-pill status-pill-${view.status}`}>{view.statusLabel}</span>
      </div>

      <Pipeline states={states} size="sm" />

      <div className="card-meta">
        <span>툴 {view.toolCount}개</span>
        {view.probeSummary && <span className="card-meta-probe">지연 {view.probeSummary}</span>}
        <span className="card-meta-time">{view.updatedAtLabel} UTC</span>
      </div>
    </Link>
  );
}
