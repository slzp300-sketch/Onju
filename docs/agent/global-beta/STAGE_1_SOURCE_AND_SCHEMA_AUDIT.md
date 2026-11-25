# 1단계 결과 — 개발본·배포 기준본·DB 의존성 정리

작성일: 2026-09-15 (KST)  
범위: 로컬 파일·로컬 Git 이력 정적 검사. API·운영 DB·호스팅 조회/변경 없음.

## 결론

**현재 루트 개발본을 그대로 배포하면 안 된다.** 같은 기능의 소스가 루트와 별도 사이트 저장소에 서로 다르게 남아 있다. 없는 기능으로 보였던 세션 보호·삭제·베타 안내 중 일부가 사이트 기준본에는 이미 구현되어 있다. 새로 중복 구현하기 전에 검증된 동작을 보존하며 합쳐야 한다.

1단계의 경로 조사·원본 SQL 확보·후속 수정 범위 정리는 완료했다. 기능 통합, SQL 적용, 실제 SQL 실행 검증 및 운영 상태 확인은 아직 완료하지 않았다.

## 1. 어떤 소스를 보고 있는가

| 구분 | 위치 / 식별 | 의미 |
| --- | --- | --- |
| 루트 개발본 A | `C:/Users/upup0/Onju` / HEAD `42333e0` 및 기존 미커밋 수정 | 한국어·영어 지역화, 새 비용 리포트·무료 검사 등이 있으나 사이트 기능과 차이가 큼 |
| 사이트 기준 커밋 B | `logs/sites/onju-web-mvp` / `90528db8e55f06101a60eb7abefacc42579d13bc` | 이전 배포 확인에서 기준이 된 로컬 커밋. 이번에는 원격 상태를 재확인하지 않음 |
| 사이트 작업본 C | 같은 사이트 저장소의 현재 작업 디렉터리 | B 이후 미커밋 수정 10개와 추가 소스 5개가 존재. 배포 완료로 간주하면 안 됨 |

C의 추가 소스는 평가 함수 4개와 0034 평가 예산 SQL이다. 이를 운영 함수나 배포된 기능으로 섞지 않는다.

같은 상대 경로의 A/B 소스 차이는 이번 정적 검사 범위에서 44개다. 전용 파일 수에는 기존 앱 소스도 포함되므로 파일 개수를 기능 완성률로 해석하지 않는다. 지문·목록은 `stage-1-baseline.json` 및 `logs/global-beta-stage1/audit.json`에 있다.

후속 개발 기준:

1. 루트의 기존 앱 `src/`와 그 DB를 유지한다.
2. B의 웹 기능·접근 보호·세션 삭제·베타 안내·기능별 stable/pilot 라우팅을 보존 대상으로 삼는다.
3. A의 지역화·정확한 비용 집계·오프라인 검증을 보존 대상으로 삼는다.
4. 파일 전체 덮어쓰기가 아니라 기능별로 통합하고 양쪽 회귀 사례를 함께 검사한다.
5. C의 평가 어댑터·프롬프트·비용 변경은 별도 변경 묶음으로 둔다. 이번 무료 보완에서 모델 호출이나 프롬프트 교체를 하지 않는다.

## 2. 화면 → 서버 경로와 보호 상태

표의 ‘있음’은 정적 호출 및 코드 확인 결과이지, 실제 운영의 모든 분기가 안전하다는 보증이 아니다. 게이트웨이 JWT와 익명 세션 소유 확인은 서로 다른 보호다.

| 사용자 동작 | A의 호출 경로 | A 상태 | B에서 보존할 부분 / 다음 점검 |
| --- | --- | --- | --- |
| 생활·일정·목표 대화, 목표 초안 승인 | `/setup` → `ScheduleSetup.send` → `talkToOnju` → `onju-agent-v2` | 세션 ID·턴 ID 전달, 세션 토큰/공통 제한 없음. 주 호출과 용어 검색에 모델 사용. 각 요청 함수 최대 5회 시도 | 토큰·호출 제한·예산 코드 있음. 순차 중복 처리와 동시 실행 중복은 구분해 재검증 |
| 이어하기·자동 저장 | `loadAgentState` / `saveAgentState` → `onju-memory` | 읽기/저장 토큰 없음. 서버가 service role 사용 | 토큰 쌍 관리·공통 세션 검사 존재. 자동 저장과 서버 확정 상태 간 충돌 점검 |
| 기억 삭제·답변 피드백 | `forgetAgentMemory` / `saveAgentFeedback` → `onju-memory` | 개별 기억/피드백 수정, 토큰 없음. 모델 호출 없음 | 세션 보호 및 동의 기반 진단 데이터 경로 보존 |
| 주간 계획 생성 | `generateWeeklyPlan` → `onju-plan-agent` | 토큰·호출 제한·예산 예약/정산 있음. 출력 검증 후 최대 2회 모델 시도 | B의 개선된 입력·계획 구조·요청 처리 보존. A의 지역화·집계와 통합 |
| 계획 수정 후보·승인 | `/plan` → `reviseWeeklyPlan` → `onju-plan-revision-agent`; 승인 저장은 `savePlanRevision` → `onju-memory` | 후보 생성 토큰/공통 비용 제한 없음. 이전 응답 오류 시 재호출 가능. 저장 경로도 별도 보호 필요 | 수정 함수와 저장 경로 모두 보호 코드 있음. 승인 전 후보와 확정 자료 분리 유지 |
| 계획 승인·오늘 실행 | 화면 승인 상태 → `/today` → `syncDailyPlan` → `onju-daily` | `sync_plan`은 DB 동기화 RPC 사용. 보호는 있으나 필요한 SQL 원본 일부 없음 | 기존 승인/동기화 흐름과 기록 유효기간 보존. 조회·동기화의 부수적 쓰기도 검사 |
| 일일 기록·구조 실험·회고 | `dailyAgent` → `onju-daily` | 공통 보호 있음. 일부 회고·조정에 모델 사용 | A에 UI 연결되지 않은 회고/조정 동작이 B에는 있어 서버만 기준으로 삭제하면 안 됨 |
| 전체 세션 삭제·목표 진척·산출물 업그레이드 | A에는 동일 클라이언트 동작 없음 | 새 기능이 없는 것으로 보일 수 있음 | B의 `agentMemory`에 구현됨. 2단계 세션 보호, 5단계 데이터 제어에서 재사용·검증 |
| 베타 참여·계측·동의 | A에는 같은 경로 없음 | A에서 빠진 기능 | B의 `publicBetaSession`, `testTelemetry`, `onju-telemetry` 보존. 원문 진단은 동의·보존·삭제 범위를 함께 확인 |

### 모든 서버 진입점 분류

- A의 웹 진입점 7개: `onju-agent-v2`, `onju-memory`, `onju-plan-agent`, `onju-plan-revision-agent`, `onju-daily`, `onju-agent`, `onju-goal-agent`.
- 마지막 2개는 클라이언트 함수 정의는 남아 있으나 현재 UI에서 해당 호출 함수 사용을 찾지 못했다. `aiSchedule`/`goalAgent` 모듈 자체는 타입·유틸리티 때문에 사용된다. 서버가 배포되어 있으면 UI 미사용과 무관하게 외부 호출 가능하므로 운영 등록 여부 확인 전 무조건 안전/삭제 가능으로 분류하지 않는다.
- A의 나머지 2개: `interpret-schedule`, `send-reminders`. 웹 MVP 호출과 분리한다. 특히 `send-reminders`는 기존 앱의 알림용 서버 경로이므로 제거하거나 웹 세션 인증을 강제하지 않는다.
- B는 stable 5개 + pilot 5개 + telemetry 1개로 11개다. pilot 진입점은 대응 stable 구현을 import한다. 별도 모델 학습이나 완전히 독립된 소스가 아니다.
- `agentTarget.ts`의 stable/pilot 매핑과 URL·세션 저장 기반 선택은 정적으로 따로 확인했다. 정적 스캐너가 동적 함수명을 임의로 확정하지 않도록 표시한다.

### 동작 목록 — 빠뜨리지 않을 세부 분기

- 메모리 A: `load`, `save`, `save_plan_revision`, `forget_agent_memory`, `save_agent_feedback`.
- 메모리 B 추가: `delete_session`, `save_goal_progress`, `save_artifact_upgrade_draft`, `approve_artifact_upgrade`, `cancel_artifact_upgrade`.
- 일일 서버 A/B: `sync_plan`, `load`, `start_checkin`, `answer_checkin`, `complete_item`, `update_preferences`, `update_item_grade`, `update_dependencies`, `start_rule_trial`, `review_rule_trial`, `start_weekly_review`, `answer_weekly_review`, `apply_weekly_review`, `review_daily_adaptation`.
- A의 `dailyAgent.ts`에는 앞의 일일·실험 10개 호출이 정의돼 있고 회고 3개·조정 검토 1개 호출은 없다. `loadDailyDashboard`는 정의와 UI 실제 사용을 구분한다.
- 텔레메트리는 일반 이벤트 기록과 `summary` 분기를 확인한다. 메모리와 달리 읽기처럼 보이는 요청도 정리·만료 처리의 쓰기가 발생할 수 있어 검증 대상에 포함한다.

## 3. DB 누락 및 원본 대조

루트의 리터럴 DB 참조와 마이그레이션 선언 대조 결과:

| A에 정의가 없는 대상 | 확보한 B의 원본 |
| --- | --- |
| `access_token_hash`, `web_mvp_consume_rate_limit` | 0019 안정화, 0020 제한 정리의 후속 재정의 |
| `web_mvp_sync_routine_plan`, `web_mvp_start_rule_trial` | 0019 안정화 |
| `web_mvp_weekly_reviews`, `web_mvp_apply_weekly_review` | 0021 주간 회고 |
| `web_mvp_test_events` | 0022 테스트 계측 및 후속 보존/정확성 변경 |
| `web_mvp_daily_adaptations` | 0024 일일 조정 및 후속 변경 |
| `web_mvp_reserve_ai_budget` | 0028 예산 생성, 0032 정산 모델로 재정의 |
| `web_mvp_settle_ai_budget` | 0032 예산 정산 |

테이블 3개·RPC 6개의 누락 정의와 접근 토큰 필드 원본을 확보했다. B 기준본의 리터럴 DB 참조에서는 같은 누락이 나오지 않았다. 이는 컬럼·권한·함수 시그니처·실행 의미까지 검증했다는 뜻은 아니다.

원본 SQL 0019~0033 총 15개는 `reference-migrations/`에 보존했다. 검증 도구로 커밋 원본 해시 일치 및 누락 의존성의 원본 존재를 확인한다. 운영 DB나 자동 실행 마이그레이션 경로에는 적용하지 않았다.

### 번호 충돌과 적용 기준

- 0019: A=지역 설정 / B=세션·호출 제한 안정화.
- 0020: A=비용·전환 지표 / B=호출 제한 정리.
- 0021: A=단가 보정 / B=주간 회고.
- 그 외 초기 번호 9개도 원문 해시가 다르다. 서식 차이도 포함되므로 모두 기능 충돌이라고 단정하지 않는다. 0007은 실제 비교에서 줄 정리 차이를 확인했다.
- 따라서 번호가 같다는 이유로 적용 완료를 추정하거나 파일을 교체하지 않는다. 후속 통합은 운영 ledger·실제 정의를 읽기 전용으로 대조한 뒤 새로운 전진 마이그레이션을 준비한다.
- 새 로컬 DB 재구성 시에도 기존 앱의 0001~0006과 사이트 선행 스키마 차이를 먼저 대조한다. 이번 환경에는 PostgreSQL/Docker 실행 도구가 확인되지 않아 SQL 실행 검증을 통과한 것으로 기록하지 않는다.

### 원본으로 확인한 후속 검증 항목

- 접근 함수는 토큰 없는 기존 행을 먼저 요청한 토큰이 소유하도록 만들 수 있고, 만료 확인 없이 갱신하는 경로가 있다. B 코드도 그대로 안전하다고 간주하지 않고 2단계에서 처리한다.
- 비용 RPC는 금액만으로 정산하고 예약 ID·원래 예산 날짜가 없다. 중복 정산과 KST 자정 통과 시 잘못 정산될 가능성을 3단계에서 검사한다.
- 비용 집계의 단가 접두어 매칭, 사용량 없는 실패 응답의 0원 정산은 A/B 각각 확인해 정확한 집계 로직을 보존한다.
- RLS가 있어도 service role 함수 내부의 소유 확인을 대신하지 못한다. RPC의 `security invoker/definer`, PUBLIC/anon/authenticated 권한 회수, service_role 실행 권한까지 확인할 대상이다.

## 4. 설정 대조 — 이름만 기록

| 용도 | 변수/설정 | 처리 원칙 |
| --- | --- | --- |
| 웹 연결 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | 공개 클라이언트 설정. 실제 값과 연결 대상은 이번 검사에서 읽지 않음 |
| 서버 DB·모델 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` | 서버 전용. 브라우저 번들에 넣지 않음 |
| 실행 모델 | `ONJU_AGENT_MODEL`, `ONJU_PLAN_MODEL`, `ONJU_DAILY_MODEL` | 환경값 미확인. 기본 코드 값과 운영 값을 혼동하지 않음 |
| B의 추가 모델 설정 | `ONJU_AGENT_FAST_MODEL`, `ONJU_AGENT_FALLBACK_MODEL` | 단순 덮어쓰기 시 모델 경로가 달라질 수 있어 보존·대조 |
| 비용·호출 제한 | `ONJU_PUBLIC_DAILY_BUDGET_USD`, `ONJU_RATE_LIMIT_SALT` | 3단계에서 적용 범위·미설정 동작 검증. 이번에 금액 변경 없음 |
| 기존 앱 전용 | `VITE_GOOGLE_CLIENT_ID`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 웹 MVP에 불필요하다고 앱 설정을 지우지 않음 |
| 함수 게이트웨이 | `supabase/config.toml` | A에는 없고 B/C에는 있음. C의 평가 함수 설정을 운영 기본값으로 혼합하지 않음 |

Vite의 `DEV` 같은 내장 표식은 별도 비밀 설정이 아니다. 동적으로 선택되는 설정·RPC는 전체 자동 발견을 보장하지 않으므로 수동 확인 항목이다.

B의 빌드 스크립트는 여러 위치의 환경파일을 순서대로 읽는다. 이번에는 실행하지 않았다. 6단계에서 명시적인 환경 선택, 누락 시 실패, 비밀값 출력 금지를 확인한다.

## 5. 다음 단계에 반영한 수정 순서

1. **2단계:** A/B의 세션 전송·서버 소유 검사·자동 저장·삭제/확정 경로를 함께 통합한다. 서버 일부만 먼저 바꿔 클라이언트가 막히지 않게 한다. 기존 행의 소유 확인 불가 문제와 만료 처리도 해결한다.
2. **3단계:** 이미 있는 예산 코드를 재사용하되 예약 ID·중복·자정·불명확한 과금·모든 호출 경로 적용을 검증한다.
3. **4단계:** A의 지역화를 B의 전체 기능 화면에도 반영한다. B에 없는 지역화와 A에 없는 베타 기능을 서로 잃지 않는다.
4. **5단계:** B의 세션 삭제·베타 안내를 기반으로 영어 안내·내보내기·삭제 완결성을 보완한다. 없는 기능처럼 새로 중복 작성하지 않는다.
5. **6단계:** 프런트·함수·스키마·설정의 하나의 릴리스 묶음을 만들고 로컬 통합 검사 후 별도 승인된 실검증으로 이동한다.

## 6. 검증 도구와 한계

`web-mvp`에서:

```powershell
npm run test:readiness
node --import ./scripts/offline-network-guard.mjs scripts/audit-global-readiness.mjs --reference=../logs/sites/onju-web-mvp --out=../logs/global-beta-stage1/audit.json
npm run verify:offline
```

- 스캐너는 소스를 실행하지 않고 TypeScript AST로 호출·동작·설정 이름·상대 import를 읽는다. wrapper가 가져오는 서버 코드도 포함한다.
- SQL 선언은 정적으로 확인한다. 주석 속 가짜 선언은 제외하고, 해시 차이와 동일 버전 번호를 별도로 기록한다.
- 별도 저장소의 HEAD를 한 번 고정해 읽고, 작업 중인 파일과 구분한다. `.env` 파일은 읽거나 보고서에 복사하지 않는다.
- 자동 검사는 동적 디스패치, 모든 컬럼/권한, 실제 모델 품질을 증명하지 않는다. 가드 함수 참조를 찾았다고 전 분기 보호 통과로 표시하지 않는다.
- 새 진입점이 생기면 검토된 목록을 갱신하도록 회귀 검사한다. SQL 원본은 해시로 검증한다.
- 전체 무료 검사 결과와 소스 지문은 작업로그에 기록한다. 1차는 요구사항 대조, 2차는 코드·SQL 원본·검증 도구 자체의 회귀 검사다.

이번 단계의 추가 모델 API 호출: **0회 / $0**. 운영 배포·운영 DB 변경·실제 대화 평가: **미실행**.
