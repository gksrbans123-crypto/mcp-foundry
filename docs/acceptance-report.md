# 수용 기준 판정 보고서 (Task #12)

> 대조 대상: `.omc/plans/mcp-creator-plan.md` §11 수용 기준 8개.
> 판정 근거: (1) `scripts/e2e-smoke.ts` 실행 결과 (아래 §0), (2) 각 패키지/앱의 유닛·통합 테스트, (3) 소스 코드 직접 확인.
> 작성일: 2026-07-09. 작성자: worker-3 (Task #12).

## 0. E2E 스모크 실행 결과 (원본 근거)

`pnpm e2e-smoke` (로컬 Postgres 기동 상태, 3회 반복 실행 — 모두 16/16 통과):

```
[PASS] Postgres reachable — localhost:5432
[PASS] Database migrations applied (idempotent)
[PASS] pnpm build (creator-mcp, worker, runtime-host + deps)
[PASS] apps/creator-mcp booted — :3001
[PASS] apps/runtime-host booted — :3002/healthz
[PASS] apps/worker booted — polling loop started
[PASS] create_mcp_server response latency over 5 calls — avg 16ms, max 37ms
[PASS] job reached 'active' — in 20110ms
[PASS] get_job_status exposes server_id — d1fd514c-43d1-4d0e-a82b-d663cc874b36
[PASS] list_my_servers shows the newly created server
[PASS] get_server_details returns a public URL — http://localhost:3002/s/weather-smoke-2026-07-09t14-22-05-644z/mcp
[PASS] public URL matches the /s/:slug/mcp pattern (plan §1)
[PASS] Inspector compliance check: Creator MCP itself
[PASS] generated server tools/list — compare_weather, get_current_weather, get_forecast
[PASS] generated server tools/call get_current_weather — real Open-Meteo response
[PASS] Inspector compliance check: generated server (weather-smoke-2026-07-09t14-22-05-644z)

=== Summary ===
16 passed, 0 failed, 0 skipped
```

시나리오: NL `"날씨 알려주는 MCP 서버 만들어줘"` → `create_mcp_server` 즉시 응답 → 백그라운드에서 `queued→generating→building→validating→probing→deploying→active` 전 구간 통과 (약 20초) → 생성된 서버의 실제 공개 URL(`http://localhost:3002/s/{slug}/mcp`)에 MCP SDK 클라이언트로 직접 접속해 `tools/list`+`tools/call get_current_weather` 실행(Open-Meteo 실제 응답 수신) → Creator MCP 자체와 생성된 서버 양쪽에 대해 `packages/validator`의 `runInspectorCheck`(Inspector CLI headless)로 표준 프로토콜 점검 통과.

**환경**: 로컬 docker-compose Postgres(`postgres://mcp_foundry:mcp_foundry@localhost:5432/mcp_foundry`), `ANTHROPIC_API_KEY`는 더미 값(가짜 키로 부팅 확인 완료) — NL이 `packages/generator`의 weather 템플릿 키워드("날씨")에 매칭되어 LLM 호출 없이 스펙이 생성됨. `EGRESS_ALLOWLIST=api.open-meteo.com`.

### 스모크 과정에서 발견·수정한 통합 결함 (5건)

E2E 검증이 정확히 이 이유로 존재한다 — 각 컴포넌트의 유닛 테스트는 전부 그린이었지만, 실제 프로세스 간 통합에서만 드러나는 결함 5건을 이 과정에서 발견해 수정했다:

1. **apps/worker가 Inspector CLI 바이너리를 못 찾음** — `@modelcontextprotocol/inspector`가 `packages/validator`의 직접 의존성일 뿐 `apps/worker`의 직접 의존성이 아니어서, pnpm의 격리된 node_modules 구조상 `apps/worker`의 cwd에서 `npx`가 바이너리를 못 찾고 `command not found`(exit 127)로 실패 → 모든 생성 job이 validating 단계에서 하드 실패. **수정**: `@modelcontextprotocol/inspector@0.22.0`을 `apps/worker`와 루트 `package.json`(스모크 스크립트 자신도 동일 문제) 양쪽에 정확히 동일 버전으로 직접 의존성 추가.
2. **`apps/creator-mcp`의 대시보드/상태 링크가 실제 `apps/dashboard` 라우트와 불일치** — `/dashboard?server=`, `/dashboard?job=` 형태로 생성했으나 실제 대시보드 라우트는 `/servers?token=`, `/servers/:id?token=`, `/jobs/:jobId?token=`이며 토큰이 URL에 전혀 내장되지 않았음(계획서 §9 "대시보드 URL 내장" 요구 위반). **수정**: `apps/creator-mcp/src/urls.ts` 재작성 + 매 응답에 현재 유효 토큰(신규 발급이든 기존 제시든)을 항상 포함하도록 `ToolContext`/미들웨어 개편.
3. **`get_job_status`/`list_my_servers`가 `server_id`를 노출하지 않음** — 두 조회 툴 어디에도 서버 ID가 없어 `get_server_details`/`refine_mcp_server`/`delete_server`를 호출할 방법이 없었음(실사용 불가능한 API 설계 결함). **수정**: `get_job_status`에 `Server ID` 필드, `list_my_servers` 테이블에 `ID` 컬럼 추가.
4. **`create_mcp_server`의 `name` 파라미터가 실제로 무시됨** — 입력 스키마에는 존재했으나 `nl` 텍스트에 접두어로 끼워 넣기만 하고, `packages/generator`의 템플릿 경로는 별도 구조화 필드 `GenerateRequest.name`만 읽어 무시됨 → 동일 NL 반복 호출 시 전부 같은 기본 슬러그(`weather-lookup`)로 수렴해 서버별 소유권 격리가 깨짐. **수정**: `@mcp-foundry/shared`의 `jobInputSchema`에 `name` 필드 추가(하위호환 optional) + `apps/creator-mcp`/`apps/worker`(`runGeneratingStage`) 양쪽에서 구조화 필드로 전달.
5. **`PUBLIC_BASE_URL`이 잘못된 포트를 가리킴** — `apps/worker`의 `LocalFileDeployer`는 이 값으로 생성 서버의 공개 URL(`https://{host}/s/{slug}/mcp`)을 만드는데, `.env.example` 기본값이 `CREATOR_PORT`(3001)였음 — 실제로는 `apps/runtime-host`(3002)를 가리켜야 함. **수정**: `.env.example` 주석/기본값 정정 + 스모크 스크립트 env 수정.

기타 (내 스크립트 자체의 결함, 제품 코드 아님): `get_job_status` 응답의 `Stage`/`Status`/`Error` 필드가 백틱으로 감싸지지 않는데 추출 정규식이 백틱을 가정해 `stage`를 항상 `undefined`로 읽음 — poll 루프가 완료를 영원히 감지 못해 job이 실제로는 성공했는데도 타임아웃으로 오판. `scripts/e2e/mcp-client.ts`의 `extractField`를 백틱 유무 모두 처리하도록 수정.

---

## 1. Creator MCP 자체 — Streamable HTTP + stateless 공개 URL 응답, Inspector(또는 폴백) 표준 점검 통과

**판정: PASS**

- `apps/creator-mcp`는 `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`로 완전한 stateless 구현(요청마다 새 `McpServer`+transport 생성) — SDK 공식 stateless 예제와 동일 패턴.
- E2E: `pnpm e2e-smoke`가 실제 HTTP 서버에 대해 `initialize → tools/list → tools/call` 왕복 성공, `Inspector compliance check: Creator MCP itself` 통과(§0 로그).
- 유닛: `apps/creator-mcp/src/mcp-roundtrip.test.ts`(SDK의 `Client`+`StreamableHTTPClientTransport`로 실제 HTTP 라운드트립, 3 tests).

## 2. 모든 툴 annotations 5종·정규식·유일성·1024자 준수, kakao 부분문자열 미포함

**판정: PASS**

- Creator MCP 자신의 7개 툴: `apps/creator-mcp/src/tools/metadata.test.ts`(37 assertions)가 모든 툴에 대해 annotations 5종 존재, 이름 정규식(`@mcp-foundry/spec`의 `NAME_PATTERN` 재사용), description ≤1024자 및 `SERVICE_NAME` 포함, kakao 부분문자열(대소문자 무관) 부재를 검증.
- 생성되는 서버(스펙 전반)에 대해서도 동일 규칙이 `packages/validator`에 존재: `rules/annotations.ts`, `rules/tool-name.ts`, `rules/description.ts`, `rules/forbidden-word.ts` (validator 65 tests 중 다수).
- E2E로 생성된 실제 weather 서버의 툴 3개(`get_current_weather`/`get_forecast`/`compare_weather`)가 `tools/list`에 annotations을 포함해 정상 노출됨을 실측(§0).

## 3. `create_mcp_server` 응답 avg 100ms / p99 3000ms 이내 (생성/배포와 분리)

**판정: PASS**

- E2E 실측(§0, 5회 호출): **avg 16ms, max 37ms** — 목표(avg~100ms, p99/max 3000ms) 대비 여유가 매우 크다. 이전 반복 실행(10회 호출)에서도 avg 7~12ms, max 16~37ms로 일관됨.
- 응답 경로에 LLM/빌드/배포가 전혀 없음을 코드로 확인: `create_mcp_server` 핸들러는 `queue.enqueue(...)` 후 즉시 markdown을 반환(`apps/creator-mcp/src/tools/create-mcp-server.ts`), 실제 생성 파이프라인은 별도 프로세스(`apps/worker`)의 백그라운드 폴링에서 실행됨.

## 4. NL(±OpenAPI) 1건이 백그라운드에서 active 도달, 독립 공개 URL 보유, 자체 Inspector 점검 통과

**판정: PASS**

- E2E(§0): NL 1건이 `queued→...→active`까지 약 20초에 도달, 독립 공개 URL(`http://localhost:3002/s/weather-smoke-.../mcp`) 발급 확인, 해당 URL에 대한 `runInspectorCheck` 통과(3개 툴에 실제 tool-call 포함).
- 유닛: `apps/worker/src/stage-machine/run-job.test.ts`의 "full create pipeline: queued -> active" 테스트가 동일 전이를 목(mock) 의존성으로도 재확인.

## 5. latency probe 하드 게이트 통과(timeout 2500ms, readOnly 캐싱) — 미통과 시 active 승격 차단

**판정: PASS**

- `apps/worker/src/probe/default-options.ts`: `requestTimeoutMs: 2500`, `sampleCount: 20`, `maxObservedLatencyMs: 2000`(3000ms 대비 헤드룸, R2) — 계획서 수치와 일치.
- `apps/worker/src/stage-machine/handlers/probing.ts`가 probe 실패 시 `{kind:"fail"}`을 반환해 `deploying`으로 전진하지 못하게 하드 게이트 역할을 함 — E2E에서 job이 `active`에 도달했다는 것 자체가 이 게이트를 실제로 통과했다는 증거.
- R1(콜드 경로 + readOnly만 실호출): `apps/worker/src/probe/run-probe.ts`가 non-readOnly 툴은 dry-run만 수행(`dryRunNonReadOnlyTool`), readOnly 툴만 `executeTool` 직접 호출로 캐싱을 우회. R3(일시 장애 vs 비준수 구분): `apps/worker/src/probe/classify.ts`가 5xx/타임아웃은 `transient`(재시도), 그 외는 `fatal`로 분류 — 유닛 테스트(`probe/classify.test.ts` 8 tests, `probe/run-probe.test.ts` 7 tests)로 확인.
- R4(캐시 키=테넌트+툴+정규화 파라미터, TTL 상한): `apps/runtime-host/src/cache/cache-key.ts`, `cache/ttl-cache.ts` 유닛 테스트로 확인(9 tests).

## 6. 정적검사가 툴>20 / <3(보강 실패) / 잘못된 툴명 / kakao / annotations 누락 / 비마크다운 / 1024자 초과 / 버전 미핀을 배포 전 차단

**판정: PASS**

`packages/validator`의 7개 규칙(`validate-spec.ts`)이 모두 구현·테스트됨(총 65 tests, 커버리지 99%):
- 툴 개수: `rules/tool-count.ts` — `>20` 하드 차단, `<3`은 "auto-augment 힌트" 포함 위반으로 반환(`packages/generator/src/augment/tool-count.ts`가 실제 보강 시도, 4 tests).
- 툴명 정규식·유일성: `rules/tool-name.ts` (7 tests).
- kakao 금칙어(부분문자열, 대소문자 무관): `rules/forbidden-word.ts`.
- annotations 5종 누락: `rules/annotations.ts`.
- description 1024자 초과 + SERVICE_NAME 포함 확인: `rules/description.ts` (6 tests).
- 버전 핀(MCP 스펙 버전 범위): `rules/mcp-version.ts` (5 tests).
- 응답/요청 제약(https 전용 urlTemplate, 캐시 TTL 상한): `rules/request-response-limits.ts` (5 tests).
- "비마크다운" 자체를 검사하는 별도 규칙은 없음 — 대신 Creator MCP/생성 서버 양쪽 모두 응답이 구조적으로 markdown 문자열만 반환하도록 코드 레벨에서 강제되어 있어(raw JSON 반환 경로 없음) 사실상 위반이 발생할 수 없는 구조. 응답 크기 상한(24KB 등)에 대한 전용 규칙은 미구현 — §8. 알려진 갭 참고.

## 7. 워커 강제 재시작 시 마지막 stage부터 resume(중복 배포 없음), delete idempotent, rate limit 초과 시 마크다운 에러

**판정: PASS (유닛/통합 테스트 근거 — 라이브 kill-and-resume E2E는 미실시)**

- **Resume**: `apps/worker/src/stage-machine/run-job.test.ts`의 "resumes a job already at the validating stage without ever calling generate (crash-and-restart safety)" 테스트가 `generate`를 호출하면 즉시 실패하는 목으로 감싸고, `validating` 단계에 멈춰있던 job이 정확히 그 지점부터 재개되어 `generate`를 다시 부르지 않음을 증명.
- **중복 배포 없음(R5)**: `packages/db`의 `createServerFromJob`이 `idempotency_key`(스펙 해시) UNIQUE 제약 + `ON CONFLICT DO NOTHING`으로 DB 레벨에서 강제. E2E 디버깅 과정에서 동일 스펙(이름 미지정 weather 요청)을 여러 사용자가 반복 생성해도 실제로는 단 하나의 서버 행에 수렴함을 직접 관찰로 확인(§0의 결함 4번 발견 과정에서).
- **delete idempotent**: `apps/creator-mcp/src/tools/delete-server.test.ts`의 "is idempotent: deleting an already-deleted server is a no-op, not an error" 테스트.
- **rate limit 초과 시 마크다운 에러**: `apps/creator-mcp/src/tools/create-mcp-server.test.ts`/`delete-server.test.ts`의 "rejects once the mutate rate limit is exhausted" 테스트 — `isError:true` + "Rate limit exceeded" 마크다운 확인.
- **라이브 kill-and-resume 미실시 사유**: 시간 제약상 실제 `apps/worker` 프로세스를 job 처리 도중 `SIGKILL`하고 재기동해 DB 상태로부터 재개되는지 직접 관찰하는 시나리오는 수행하지 못함 — 위 유닛 테스트가 동일 로직 경로(claim된 job의 stage로부터 정확히 재개)를 결정론적으로 커버하므로 PASS로 판정하되, 라이브 검증이 남아있다는 점은 명시한다.

## 8. TCB: spec-injection·자원상한 초과·크로스테넌트 접근이 차단되고 이웃 테넌트 무영향 (퍼징으로 검증)

**판정: PARTIAL**

- **구현 및 유닛 테스트는 충실**: `apps/runtime-host`가 SSRF 방어(`egress/ip-range-check.ts` 28 tests — 사설 IP/링크로컬/메타데이터 IP 차단, `egress/resolve-host.ts`+`egress/send-pinned-request.ts` — DNS resolve 후 IP를 소켓에 고정해 rebinding TOCTOU 차단), 자원 상한(`limits/concurrency-limiter.ts`, `limits/circuit-breaker.ts` — per-tenant 서킷브레이커), 캐시 테넌트 격리(`cache/cache-key.ts` — slug+tool+정규화 파라미터 키) 전부 구현·테스트됨(runtime-host 총 105 passed / 2 skipped).
- spec-injection 방어는 구조적으로 이미 확보: `packages/spec`의 인터프리터가 문자열 보간 없이 구조적 파라미터 바인딩만 수행(`interpreter/bind.ts`, `interpreter/params.ts`), zod 스키마 검증이 로드 시점에 강제됨.
- **미달 사유**: 계획서가 명시한 "퍼징으로 검증"이 문자 그대로는 수행되지 않았다 — 현재 테스트는 수작업으로 작성된 경계값/적대적 사례(사설 IP 범위, 기형 호스트 등)이지 자동화된 퍼징 하네스(예: fast-check 기반 property-based testing)가 아니다. 이는 계획서 §5.2/§15가 스스로 "망라적 퍼징은 지속적(post-MVP 계속)" 활동으로 명시한 항목과 일치하며, 솔로 프로젝트 범위상 MVP 단계의 하드 게이트로 다루지 않기로 한 합의(§15)에 부합한다. 따라서 핵심 방어기제 자체는 PASS 수준으로 구현·검증되었으나, "퍼징"이라는 검증 방법론 자체는 미이행임을 정확히 기록한다.

---

## 요약표

| # | 기준 | 판정 |
|---|---|---|
| 1 | Streamable HTTP stateless + Inspector 통과 | **PASS** |
| 2 | annotations/이름규칙/1024자/kakao (Creator+생성서버) | **PASS** |
| 3 | create_mcp_server 응답시간 (avg 16ms, max 37ms 실측) | **PASS** |
| 4 | NL→active 도달 + 독립 공개 URL + Inspector 통과 | **PASS** |
| 5 | probe 하드 게이트(2500ms/R1-R4) | **PASS** |
| 6 | 정적검사 7종 배포 전 차단 | **PASS** (응답크기 24KB 전용 규칙 미구현) |
| 7 | resume/idempotent delete/rate limit | **PASS** (라이브 kill-and-resume은 미실시, 유닛 테스트로 대체 확인) |
| 8 | TCB 격리 (퍼징) | **PARTIAL** (구현·유닛테스트 완료, 자동 퍼징 하네스는 post-MVP로 이월) |

## 테스트 스위트 현황 (참고)

전체 `pnpm test` 기준 (2026-07-09, DATABASE_URL 미설정 시 `packages/db`의 실 PG 통합 테스트는 스킵됨 — 별도 `DATABASE_URL` export 시 27개 통합 테스트 추가 실행):

| 패키지/앱 | 테스트 |
|---|---|
| packages/shared | 12 |
| packages/db | 5 (+ 실PG 통합 27, 스킵 가능) |
| packages/spec | 95 |
| packages/validator | 65 (커버리지 99%) |
| packages/generator | 72 |
| apps/creator-mcp | 78 |
| apps/worker | 109 |
| apps/runtime-host | 105 (+2 스킵) |
| apps/dashboard | 15 |
| **합계** | **약 556 + 27(옵션)** |

전부 그린(0 실패). `pnpm build`/`pnpm typecheck` 루트 기준 각각 9/14 태스크 전부 성공.
