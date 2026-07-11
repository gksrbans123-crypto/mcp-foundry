# MCP Foundry(엠씨피 파운드리)

카카오 PlayMCP 공모전(MCP Player 10) 출품작. **"MCP 서버를 만들어주는 MCP 서버"** — 사용자가 자연어로 원하는 MCP 서버를 설명하면, 백그라운드 파이프라인이 PlayMCP 개발 가이드를 준수하는 Remote MCP 서버를 자동 생성·검증·배포하고, 웹 대시보드에서 상태(활성/진행/실패/삭제)를 관리할 수 있게 해준다.

- 서비스명: `SERVICE_NAME` (placeholder: "MCP Foundry(엠씨피 파운드리)", `packages/shared`의 단일 상수로만 참조 — kakao 미포함)
- 핵심 차별점: **Compliance-by-construction** — 사람이 규칙을 지키려 노력하는 게 아니라, 생성기 자체가 PlayMCP 심사 반려 사유를 구조적으로 회피하도록 강제한다.

전체 설계 배경과 결정 근거는 [`.omc/plans/mcp-creator-plan.md`](.omc/plans/mcp-creator-plan.md)(합의된 구현 계획, ADR 5건 포함)를 참고. AuthN 방식(OAuth vs 커스텀 헤더) 선정 근거는 [`docs/g-a-oauth-decision.md`](docs/g-a-oauth-decision.md), 수용 기준 8개 판정은 [`docs/acceptance-report.md`](docs/acceptance-report.md) 참고.

## 아키텍처

```
(MCP client)──Streamable HTTP──▶ Creator MCP Server (TS SDK, stateless, :3001)
     │ enqueue                              │ read(<100ms)
     ▼                                      ▼
  Job Queue(interface)◀──▶ Postgres(users/jobs/servers/status_events)
   └ impl: PgQueue(SELECT FOR UPDATE SKIP LOCKED)
     │ consume + parsed_spec 단계별 영속화(재개 가능)
     ▼
  Background Worker(async, 재시작 시 마지막 단계부터 resume):
    1) Generator: (NL[+OpenAPI]) → 선언형 스펙  [템플릿(weather/search/currency) 우선→HTTP-wrapper 폴백]
    2) Validator: zod+화이트리스트 + naming/kakao guard + Inspector 자동점검
    3) Latency probe(합성): 업스트림 timeout 2500ms + readOnly 캐싱 검증
    4) Deployer: {SPEC_STORE_DIR}/{slug}.json 파일 핸드오프 → 공개 URL 발급
     ▼ deploy (파일시스템 핸드오프)
  Runtime Host = 인터프리터 (단일 멀티테넌트 TCB, path 라우팅, :3002)
    http://{host}/s/{slug}/mcp   ← SSRF 방어·자원상한·circuit breaker 적용
     ▲
  Web Dashboard(Next.js, :3000) — /servers?token=... 활성/진행/실패/삭제 필터 + 잡 타임라인
AuthN(interface): impl A=SignedOwnerToken(커스텀 헤더 X-Owner-Token, 채택) / impl B=OAuth(스텁)
```

## 기술 스택

| 컴포넌트 | 선택 |
|---|---|
| Creator MCP Server | TS + `@modelcontextprotocol/sdk`(1.29.0 exact pin), Streamable HTTP stateless |
| Web Dashboard | Next.js (App Router) |
| Job Queue | Postgres 자체 큐 (`SELECT FOR UPDATE SKIP LOCKED`) |
| State Store | Postgres |
| Code Gen | Anthropic Claude API (`packages/generator`, 인터페이스 뒤 — 무키 템플릿 매칭 시 호출 안 됨) |
| Validator | 자체 정적검사 7종 + MCP Inspector CLI 자동화(headless) |
| Runtime | 선언형 스펙 인터프리터 (멀티테넌트 path 라우팅, SSRF/자원상한/circuit breaker) |
| 레포 구조 | pnpm workspace + Turborepo 모노레포 |

## 모노레포 구조

```
apps/
  creator-mcp/    # Creator MCP 서버 (툴 7개 + AuthN + rate limit)
  worker/         # 백그라운드 파이프라인 (스테이지 머신 + probe + deployer)
  runtime-host/   # 멀티테넌트 인터프리터 런타임 (TCB 하드닝)
  dashboard/      # My MCP Servers 웹 대시보드
packages/
  shared/         # 공유 타입·상태·zod·SERVICE_NAME 상수
  db/             # 마이그레이션 + 리포지토리 + PgQueue
  spec/           # 선언형 스펙 스키마 + 인터프리터 + fixture
  validator/      # 정적검사 게이트 + Inspector 러너 통합
  generator/      # NL→선언형 스펙 (템플릿 우선 + HTTP-wrapper 폴백)
scripts/
  e2e-smoke.ts    # 전 컴포넌트 통합 검증 스크립트 (Task #12)
docs/             # 본 문서 외 G-A 결정 문서, Inspector 스파이크 문서, 수용기준 판정
.omc/plans/       # 합의된 구현 계획서(ADR 포함)
```

## 로컬 실행 방법

### 1. 의존성 설치

```bash
pnpm install
```

### 2. Postgres 기동

```bash
docker compose up -d postgres
```

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env`에서 최소한 다음 값을 채운다:
- `OWNER_TOKEN_SECRET` — 아무 임의의 긴 문자열(HMAC 서명용).
- `EGRESS_ALLOWLIST` — 예: `api.open-meteo.com` (weather 템플릿 업스트림. `search`/`currency` 템플릿을 쓰려면 해당 업스트림 호스트도 콤마로 추가).
- `ANTHROPIC_API_KEY` — 템플릿에 매칭되지 않는 자유 형식 NL(HTTP-wrapper 폴백 경로)을 쓸 계획이 없다면 더미 값으로도 부팅 가능(템플릿 매칭 시 LLM 호출 자체가 없음).
- `PUBLIC_BASE_URL`은 **runtime-host**(기본 `http://localhost:3002`)를 가리켜야 한다 — 생성된 서버의 공개 URL(`/s/{slug}/mcp`)을 만드는 데 쓰인다. Creator MCP 자신의 대시보드/상태 링크는 별도로 `DASHBOARD_PUBLIC_URL`(기본값 `http://localhost:${DASHBOARD_PORT}`)을 따른다.

### 4. DB 마이그레이션

```bash
pnpm --filter @mcp-foundry/db db:migrate
```

### 5. 빌드 / 타입체크 / 테스트

```bash
pnpm build
pnpm typecheck
pnpm test
```

### 6. 개발 서버 기동 (4개 프로세스, 각각 별도 터미널)

```bash
pnpm --filter @mcp-foundry/creator-mcp dev    # 포트 CREATOR_PORT(기본 3001) — Creator MCP 서버
pnpm --filter @mcp-foundry/worker dev         # 백그라운드 파이프라인 (HTTP 포트 없음)
pnpm --filter @mcp-foundry/runtime-host build && pnpm --filter @mcp-foundry/runtime-host start
                                               # 포트 RUNTIME_PORT(기본 3002) — 생성된 서버 런타임
pnpm --filter @mcp-foundry/dashboard dev      # 포트 DASHBOARD_PORT(기본 3000) — 웹 대시보드
```

> `runtime-host`는 별도 `dev`(watch) 스크립트가 없어 `build`→`start`로 기동한다.

### 7. E2E 스모크 (전 구간 자동 검증)

로컬에 Postgres가 떠 있는 상태에서 다음 한 줄로 전체 플로우(create → active → 생성 서버 실호출 → Inspector 통과)를 자동 검증할 수 있다. 4~6단계를 수동으로 거칠 필요 없이 `docker compose up`부터 빌드·기동·검증까지 스크립트가 전부 수행한다:

```bash
pnpm e2e-smoke
```

콘솔에 단계별 PASS/FAIL 체크리스트가 출력되며, 종료 시 세 프로세스(creator-mcp/worker/runtime-host)를 자동으로 정리한다. 판정 결과와 계획서 §11 수용 기준 8개 대조표는 [`docs/acceptance-report.md`](docs/acceptance-report.md) 참고.

> **참고**: 반복 실행 시 이전 실행이 만든 테스트용 job/server 행이 DB에 누적된다(큐가 FIFO라 오래된 job이 새 job보다 먼저 처리됨). 여러 번 연속 실행해 처리 속도가 느려졌다면 아래로 초기화 후 다시 실행하는 것을 권장한다(로컬 개발용 데이터이므로 안전):
>
> ```bash
> docker exec $(docker compose ps -q postgres) psql -U mcp_foundry -d mcp_foundry \
>   -c "truncate table status_events, jobs, servers, users cascade;"
> ```

## 데모 시나리오

1. MCP 클라이언트(Claude Desktop, Inspector 등)를 Creator MCP(`http://localhost:3001/mcp`, Streamable HTTP)에 연결한다. 첫 호출에는 `X-Owner-Token` 헤더가 없어도 되며, 응답에 새로 발급된 토큰이 안내된다 — 이후 모든 호출에 해당 토큰을 헤더로 실어 보내야 내 job/서버에 계속 접근할 수 있다.
2. `create_mcp_server`를 자연어로 호출한다. 예: `spec_text: "날씨 알려주는 MCP 서버 만들어줘"`. 응답으로 `job_id`, `status_url`, `dashboard_url`을 즉시 받는다(수 밀리초~수십 밀리초, 생성/배포와 완전히 분리).
3. `get_job_status(job_id)`로 진행 상황(`queued→...→active`)을 폴링한다. 정상적으로는 수 초~수십 초 내에 `active`에 도달하며, 이때 응답에 `server_id`가 함께 표시된다.
4. `get_server_details(server_id)`로 공개 URL(`http://localhost:3002/s/{slug}/mcp`)과 툴 목록, 지연 측정(probe) 결과를 확인한다.
5. 해당 공개 URL을 별도의 MCP 클라이언트로 열어 `tools/list`/`tools/call`을 직접 실행 — 예를 들어 weather 템플릿이면 `get_current_weather(latitude, longitude)`가 실제 Open-Meteo API를 호출해 마크다운으로 결과를 반환한다.
6. 웹 대시보드(`http://localhost:3000/servers?token=...` — 응답에 포함된 `dashboard_url`을 그대로 열면 된다)에서 같은 서버를 상태별 필터·잡 타임라인과 함께 확인한다.
7. `delete_server(server_id)`로 삭제(재호출해도 안전하게 no-op) — 또는 `refine_mcp_server(server_id, spec_text)`로 자연어 수정 요청.

## PlayMCP 가이드 준수 체크리스트

- [x] Streamable HTTP, stateless(`sessionIdGenerator: undefined`) — Creator MCP·생성 서버 런타임 모두.
- [x] 툴 3~10개 권장 범위(Creator MCP는 7개), >20 하드 차단, <3 자동 보강 시도(`packages/generator`의 `augmentToolCount`).
- [x] 모든 툴 annotations 5종(title/readOnlyHint/destructiveHint/idempotentHint/openWorldHint) 명시.
- [x] 툴명 `[A-Za-z0-9_-]` 1~128자, 유일, case-sensitive.
- [x] description은 영문 작성 + `SERVICE_NAME`(영·국문 병기) 포함 + 1024자 이내.
- [x] 응답은 정제된 마크다운 — raw JSON 덤프 없음.
- [x] "kakao" 문자열이 서버명/툴명/slug/description 어디에도 부분문자열로도 없음(대소문자 무관), 정적검사로 배포 전 차단.
- [x] MCP 스펙 버전 핀(2025-03-26~2025-11-25 범위), SDK 버전(1.29.0) exact pin.
- [x] 인증 실패/부재 시 401 응답(`docs/g-a-oauth-decision.md` §3-1) — 커스텀 헤더(`X-Owner-Token`) 방식 채택, PlayMCP가 OAuth와 대등하게 공식 허용.
- [x] SSRF 방어(사설 IP/링크로컬/메타데이터 IP 차단 + DNS rebinding 방어), 요청당 자원 상한, per-tenant circuit breaker.
- [ ] 응답 크기 24KB 초과 시 에러 처리 전용 규칙 — 미구현(알려진 갭, `docs/acceptance-report.md` §6 참고).
- [ ] 자동화된 퍼징 하네스 — 미구현(계획서 §15가 post-MVP 지속 활동으로 명시, `docs/acceptance-report.md` §8 참고).

## 참고 문서

- [`.omc/plans/mcp-creator-plan.md`](.omc/plans/mcp-creator-plan.md) — 합의된 전체 구현 계획(원칙, 아키텍처, R1~R7 구속력 있는 구현 조건, ADR 5건, 페이즈별 완료 기준)
- [`docs/g-a-oauth-decision.md`](docs/g-a-oauth-decision.md) — AuthN(OAuth vs 커스텀 헤더) 결정 근거 및 인용
- [`docs/inspector-spike.md`](docs/inspector-spike.md) — MCP Inspector CLI headless 실행성 스파이크 결정 문서
- [`docs/acceptance-report.md`](docs/acceptance-report.md) — 계획서 §11 수용 기준 8개 판정 + E2E 스모크 실행 결과
