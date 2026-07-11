import type { StatusEvent } from "@mcp-foundry/shared";
import { jobStageLabel } from "../lib/status-labels";
import { formatTimestamp } from "../lib/view-models";

export function JobTimeline({ events }: { events: StatusEvent[] }) {
  if (events.length === 0) {
    return <p className="page-subtitle">아직 기록된 단계가 없습니다.</p>;
  }
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span className={`timeline-dot${event.status === "failed" ? " timeline-dot-failed" : ""}`} />
          <div className="timeline-step">{jobStageLabel(event.step)}</div>
          <div className="timeline-at">{formatTimestamp(event.at)} (UTC)</div>
          {event.message && <div className="timeline-message">{event.message}</div>}
        </li>
      ))}
    </ol>
  );
}
