import Link from "next/link";
import { SERVICE_NAME } from "@mcp-foundry/shared";

export default function HomePage() {
  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">{SERVICE_NAME} 대시보드</h1>
        <p className="page-subtitle">나의 MCP 서버를 등록하고 관리하세요.</p>
      </div>
      <div className="empty-state">
        <p>
          이 대시보드는 owner token으로 서버 목록을 확인합니다. MCP 클라이언트에서{" "}
          <code>create_mcp_server</code> 툴 응답에 포함된 대시보드 링크를 그대로 열거나, 아래 형태로
          직접 접속하세요.
        </p>
        <p className="card-slug">/servers?token=YOUR_OWNER_TOKEN</p>
        <p className="empty-state-actions">
          <Link className="button button-primary" href="/servers?token=demo&demo=1">
            데모 보기
          </Link>
        </p>
      </div>
    </main>
  );
}
