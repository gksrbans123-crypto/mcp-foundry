import { PIPELINE_STAGES, type StageState } from "../lib/pipeline";

/**
 * GitLab-CI-style stage pipeline: connected nodes (생성 → 빌드 → 검증 → 측정 →
 * 배포 → 활성), each coloured by state — done (green ✓), running (blue pulse),
 * failed (red ✕), pending (grey). `size="sm"` is the compact card variant.
 */
export function Pipeline({ states, size = "md" }: { states: StageState[]; size?: "sm" | "md" }) {
  return (
    <div className={`pipeline pipeline-${size}`} role="list" aria-label="배포 파이프라인">
      {PIPELINE_STAGES.map((node, i) => {
        const state = states[i] ?? "pending";
        const lineReached = i > 0 && states[i - 1] === "done";
        return (
          <div
            key={node.stage}
            role="listitem"
            className={`pipeline-node${i > 0 ? (lineReached ? " has-line-done" : " has-line") : ""}`}
            aria-label={`${node.label}: ${STATE_LABEL[state]}`}
          >
            <span className={`pipeline-dot pipeline-dot-${state}`}>
              {state === "done" && <span className="pipeline-glyph">✓</span>}
              {state === "failed" && <span className="pipeline-glyph">✕</span>}
              {state === "running" && <span className="pipeline-spinner" />}
            </span>
            <span className="pipeline-label">{node.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const STATE_LABEL: Record<StageState, string> = {
  done: "완료",
  running: "진행 중",
  failed: "실패",
  pending: "대기",
};
