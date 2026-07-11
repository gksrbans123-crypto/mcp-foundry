import type { Metadata } from "next";
import { SERVICE_NAME } from "@mcp-foundry/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SERVICE_NAME} 대시보드`,
  description: "나의 MCP 서버를 등록하고 관리하세요.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
