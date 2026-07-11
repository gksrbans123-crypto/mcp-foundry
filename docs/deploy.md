# 배포 가이드 — Vercel(대시보드) + Supabase(DB) + 컨테이너(MCP 엔진)

3-레이어 구성:

```
Supabase(Postgres)  ← 대시보드와 백엔드가 각각 직접 연결(서로 호출 없음)
  ├─ Vercel: dashboard(Next.js) — 빌드 과정을 파이프라인으로 표시
  └─ Railway/Fly/Render: 올인원 컨테이너(creator+runtime+worker) — 생성/서빙, 진행상황을 Supabase에 기록
```

- PlayMCP에 등록: `https://<backend-host>/mcp`
- 생성된 서버: `https://<backend-host>/s/{slug}/mcp`
- 관리 대시보드: `https://<vercel-app>.vercel.app`

---

## 연결 문자열 (Supabase)

신규 Supabase 프로젝트는 **direct 연결(`db.<ref>.supabase.co`)이 IPv6 전용**이라 대부분의 환경/서버리스에서 못 붙습니다. **항상 pooler(Supavisor)** 를 쓰세요. 대시보드 → **Connect** 버튼에서 복사:

| 용도 | 종류 | 포트 | 형식 |
|---|---|---|---|
| 마이그레이션 · 백엔드 컨테이너(상시) | **Session pooler** | 5432 | `postgresql://postgres.<ref>:<PW>@aws-0-<region>.pooler.supabase.com:5432/postgres` |
| **Vercel(서버리스)** | **Transaction pooler** | 6543 | `postgresql://postgres.<ref>:<PW>@aws-0-<region>.pooler.supabase.com:6543/postgres` |

> SSL은 코드에서 자동 처리됩니다(`resolveDbSsl` — 클라우드 호스트면 TLS on, `rejectUnauthorized:false`). 문자열 뒤에 `?sslmode=disable`를 붙이면 강제로 끕니다(로컬 전용).

---

## 1) 마이그레이션 (한 번)

Session pooler 문자열로:

```bash
DATABASE_URL="postgresql://postgres.<ref>:<PW>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  pnpm --filter @mcp-foundry/db db:migrate
# → 0001_init.sql, 0002_add_disabled_server_status.sql 적용
```

## 2) 백엔드 (Railway 예시)

- **Dockerfile**: 루트 `Dockerfile`(올인원)
- **Volume**: `/data/specs` 마운트 (생성 서버 스펙 영속화 — 필수)
- **환경변수**:
  ```
  DATABASE_URL=<Session pooler 5432>
  OWNER_TOKEN_SECRET=<openssl rand -base64 32>
  PUBLIC_BASE_URL=https://<backend-host>          # 배포 후 채움
  DASHBOARD_PUBLIC_URL=https://<vercel-app>.vercel.app
  ANTHROPIC_API_KEY=sk-ant-...
  # EGRESS_ALLOWLIST 는 생략 가능(기본 = 전체 허용). 생성된 서버가 어떤 공개
  # 호스트든 호출할 수 있게 하려면 설정하지 않는다. 특정 호스트로 제한하려면
  # 쉼표 목록으로 지정: EGRESS_ALLOWLIST=api.open-meteo.com,en.wikipedia.org
  # (내부 IP/메타데이터 주소는 이 값과 무관하게 SSRF 가드가 항상 차단)
  ```
  (`PORT`는 플랫폼이 자동 주입 → `deploy/all-in-one/start.mjs`가 읽음)

## 3) Vercel (대시보드)

- **Root Directory**: `apps/dashboard` (여기 `vercel.json`이 빌드/설치 명령을 고정)
- **Framework**: Next.js (자동)
- **Node.js**: 22
- **환경변수**: `DATABASE_URL` = **Transaction pooler(6543)**

`apps/dashboard/vercel.json`:
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=@mcp-foundry/dashboard"
}
```

## 4) 상호 연결 + 확인

1. Vercel URL 확보 → 백엔드 `DASHBOARD_PUBLIC_URL`에 반영 후 재배포
2. 백엔드 URL 확보 → 백엔드 `PUBLIC_BASE_URL`에 반영 후 재배포
3. 확인
   - `https://<vercel-app>/servers?token=<owner-token>` 대시보드
   - MCP 클라이언트 → `https://<backend-host>/mcp` → create_mcp_server
   - PlayMCP 콘솔에 `https://<backend-host>/mcp` 등록

---

## 체크리스트 / 주의

- [ ] Supabase 비밀번호는 배포 후 로테이트(공유 이력 있으면)
- [ ] Vercel=Transaction pooler(6543), 마이그레이션/백엔드=Session pooler(5432)
- [ ] `/data/specs` 볼륨 없으면 재배포 때 생성 서버 사라짐
- [ ] `OWNER_TOKEN_SECRET`은 강한 랜덤값, 로컬 값 재사용 금지
- [ ] `.env`는 커밋 금지(`.gitignore` 처리됨)
