# MCP Foundry(엠씨피 파운드리)

> **초안 문서 — Task #12(E2E 스모크)에서 루트 `README.md`로 완성될 예정.** 골격만 채워둔 상태이며, `apps/*`가 순차적으로 구현되면서 "로컬 실행 방법" 섹션이 갱신되어야 한다.

카카오 PlayMCP 공모전(MCP Player 10) 출품작. **"MCP 서버를 만들어주는 MCP 서버"** — 사용자가 자연어로 원하는 MCP 서버를 설명하면, 백그라운드 파이프라인이 PlayMCP 개발 가이드를 준수하는 Remote MCP 서버를 자동 생성·검증·배포하고, 웹 대시보드에서 상태(활성/진행/실패/삭제)를 관리할 수 있게 해준다.

- 서비스명: `SERVICE_NAME` (placeholder: "MCP Foundry(엠씨피 파운드리)", `packages/shared`의 단일 상수로만 참조 — kakao 미포함)
- 핵심 차별점: **Compliance-by-construction** — 사람이 규칙을 지키려 노력하는 게 아니라, 생성기 자체가 PlayMCP 심사 반려 사유를 구조적으로 회피하도록 강제한다.

전체 설계 배경과 결정 근거는 `.omc/plans/mcp-creator-plan.md`(합의된 구현 계획, ADR 5건 포함)를 참고. AuthN 방식(OAuth vs 커스텀 헤더) 선정 근거는 [`docs/g-a-oauth-decision.md`](./g-a-oauth-decision.md) 참고.

## 아키텍처

```
(MCP client)──Streamable HTTP──▶ Creator MCP Server (TS SDK, stateless)
     │ enqueue                              │ read(<100ms)
     ▼                                      ▼
  Job Queue(interface)◀──▶ Postgres(users/jobs/servers/status_events)
   └ impl: PgQueue(SELECT FOR UPDATE SKIP LOCKED)
     │ consume + parsed_spec 단계별 영속화(재개 가능)
     ▼
  Background Worker(async, 재시작 시 마지막 단계부터 resume):
    1) Generator: (NL[+OpenAPI]) → 선언형 스펙  [템플릿 우선→HTTP-wrapper 폴백]
    2) Validator: zod+화이트리스트 + naming/kakao guard + Inspector 자동점검
    3) Latency probe(합성): 업스트림 timeout 2500ms + readOnly 캐싱 검증
    4) Deployer(interface): 인터프리터 등록 → 공개 URL 발급
     ▼ deploy
  Generated-Server Runtime = 인터프리터 (단일 멀티테넌트 TCB, path 라우팅)
    https://{host}/s/{slug}/mcp   ← 하드닝 대상
     ▲
  Web Dashboard(Next.js) — 활성/진행/실패/삭제 필터
AuthN(interface): impl A=SignedOwnerToken(커스텀 헤더, 채택) / impl B=OAuth(스텁, G-A 문서 참고)
```

## 기술 스택

| 컴포넌트 | 선택 |
|---|---|
| Creator MCP Server | TS + `@modelcontextprotocol/sdk`, Streamable HTTP stateless |
| Web Dashboard | Next.js (App Router) |
| Job Queue | Postgres 자체 큐 (`SELECT FOR UPDATE SKIP LOCKED`) |
| State Store | Postgres |
| Code Gen | Anthropic Claude API (`packages/generator`, 인터페이스 뒤) |
| Validator | 자체 정적검사 + MCP Inspector 자동화 (폴백 트리) |
| Runtime | 선언형 스펙 인터프리터 (멀티테넌트 path 라우팅) |
| 레포 구조 | pnpm workspace + Turborepo 모노레포 |

## 모노레포 구조

```
apps/
  creator-mcp/    # Creator MCP 서버 (툴 7개 + AuthN + rate limit)          [예정 — Task #5]
  worker/         # 백그라운드 파이프라인 (스테이지 머신 + probe + deployer)  [예정 — Task #9]
  runtime-host/   # 멀티테넌트 인터프리터 런타임 (TCB 하드닝)                [예정 — Task #4]
  dashboard/      # My MCP Servers 웹 대시보드                              [예정 — Task #10]
packages/
  shared/         # 공유 타입·상태·zod·SERVICE_NAME 상수                    [구현됨]
  db/             # 마이그레이션 + 리포지토리 + PgQueue                      [구현 중]
  spec/           # 선언형 스펙 스키마 + 인터프리터 + fixture               [구현 중]
  validator/      # 정적검사 게이트 + Inspector 러너 통합                   [예정]
  generator/      # NL→선언형 스펙 (템플릿 우선 + HTTP-wrapper 폴백)       [예정]
docs/             # 본 문서, G-A 결정 문서 등
.omc/plans/       # 합의된 구현 계획서(ADR 포함)
```

## 로컬 실행 방법 (골격 — 이후 Task에서 각 단계 검증·보완)

1. 의존성 설치
   ```bash
   pnpm install
   ```
2. Postgres 기동
   ```bash
   docker compose up -d postgres
   ```
3. 환경변수 설정 (`.env.example` 참고)
   ```bash
   cp .env.example .env
   # ANTHROPIC_API_KEY, OWNER_TOKEN_SECRET, EGRESS_ALLOWLIST 등 값 채우기
   ```
4. DB 마이그레이션
   ```bash
   pnpm --filter @mcp-foundry/db db:migrate
   ```
5. 빌드 / 타입체크 / 테스트
   ```bash
   pnpm build
   pnpm typecheck
   pnpm test
   ```
6. 개발 서버 기동 — **`apps/*`가 아직 스캐폴딩되지 않아 TODO.** Task #5/#9/#4/#10 완료 후 다음 형태로 채울 예정:
   ```bash
   pnpm --filter @mcp-foundry/creator-mcp dev   # TODO: 포트 CREATOR_PORT(기본 3001)
   pnpm --filter @mcp-foundry/worker dev        # TODO: 백그라운드 파이프라인
   pnpm --filter @mcp-foundry/runtime-host dev  # TODO: 포트 RUNTIME_PORT(기본 3002)
   pnpm --filter @mcp-foundry/dashboard dev     # TODO: 포트 DASHBOARD_PORT(기본 3000)
   ```
7. E2E 스모크 — Task #12에서 "NL(±OpenAPI) → queued→active(probe 통과) → 생성 서버 공개 URL 실호출 → 대시보드 확인" 전 구간을 검증하고 이 섹션을 최종본으로 교체할 것.

## 참고 문서

- [`.omc/plans/mcp-creator-plan.md`](../.omc/plans/mcp-creator-plan.md) — 합의된 전체 구현 계획(원칙, 아키텍처, R1~R7 구속력 있는 구현 조건, ADR 5건, 페이즈별 완료 기준)
- [`docs/g-a-oauth-decision.md`](./g-a-oauth-decision.md) — AuthN(OAuth vs 커스텀 헤더) 결정 근거 및 인용
