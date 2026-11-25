# 🌳 온주 (Onju)

온주는 생활과 목표의 계획·실행·점검을 돕는 서비스입니다. 이 저장소에는 **기존 루틴 관리 모바일 앱**과 **AI 코칭 웹 MVP**가 함께 있습니다.

| 구분 | 기존 모바일 앱 | AI 코칭 웹 MVP |
| --- | --- | --- |
| 목적 | 루틴·습관·목표를 기록하고 성장과 공동체 경험으로 꾸준한 실행 지원 | 대화로 목표와 여건을 이해하고 실행 계획을 설계·승인·점검·조정 |
| 주요 소스 | `src/`, `android/` | `web-mvp/`, 배포용 작업본 `logs/sites/onju-web-mvp/` |
| 사용자 진입 | 로그인 → 온보딩 → 홈·통계·소모임·마이페이지 | 소개 → 목표·고민 대화 → 계획 확인·승인 → 실행·점검 |
| 상태와 권한 | Supabase Auth 계정, Zustand 캐시와 쓰기 큐, TanStack Query | 소유 토큰으로 분리된 대화 세션, 서버 검증을 거치는 계획·기록 |

두 앱의 데이터와 화면은 하나의 통합 앱으로 연결된 상태가 아닙니다. AI 코칭을 모바일에 통합하는 것은 후속 작업입니다.

## 기존 모바일 앱

개인 루틴 / 신앙 루틴 / 투두를 매일 체크하고, 월간 목표와 습관을 연동해 달성률을 추적하고,
주간 리뷰로 한 주를 돌아보고, 소모임에서 서로의 진행을 나누며 응원하는 앱입니다.

## 주요 기능

- **홈** — 나무 성장 히어로 + 주간 스트립 + 개인루틴·신앙루틴·투두 체크
- **목표 관리** — 월간 목표에 습관·루틴 연동, 달성률 80% 이상 시 슬롯 해금
- **주간 리뷰** — 한 주 회고 → 루틴/습관 개편 적용 → 소모임 나눔
- **통계** — 목표·습관·일기·리뷰 통계
- **소모임** — 그룹 참여, 멤버 진행률, 주간 나눔, 응원
- **보상** — 스트릭, 숲 테마 해금, 완벽한 하루 스탬프
- **알림** — 안드로이드 로컬 알림 + 웹 푸시
- **안드로이드 홈 위젯** — 나무·달성률·루틴 체크·타이머 바로가기

## 스택

- React 19 + TypeScript + Vite (PWA) · Tailwind CSS 4 · framer-motion
- Zustand(낙관적 업데이트 + 아웃박스 write-through) · TanStack Query
- Supabase (Postgres + Auth + RLS) — 스키마: `supabase/migrations/`
- Capacitor 8 (Android) — 자체 구현 홈 위젯 포함

## 개발

```bash
npm install
npm run dev            # 개발 서버
npm run build          # 프로덕션 빌드 (tsc + vite)
npm test               # vitest 유닛 테스트
npm run gc             # eslint + knip (죽은 코드 검사)
npm run sync:android   # 네이티브 빌드 + cap sync
npm run open:android   # Android Studio 열기

npm run dev --prefix web-mvp       # 로컬 AI 코칭 웹 MVP
npm run build --prefix web-mvp     # 로컬 웹 MVP 타입 검사와 빌드
npm run verify:offline --prefix web-mvp # 두 웹 작업본·서버 로직·UI·정적 검사 전체 검증
npm run eval:claude --prefix web-mvp    # Claude 비교 준비 상태 확인 (모델 호출 없음)
```

환경 변수(`.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(웹 푸시 사용 시 `VITE_VAPID_PUBLIC_KEY` — `docs/WEB_PUSH.md` 참고)

웹 MVP는 기본적으로 부모 디렉터리의 공개 Supabase 환경 설정을 읽습니다. `verify:offline`은 네트워크 차단과 빈 API 설정을 적용하고, 실제 모델 호출 없이 검증합니다. 이 명령은 검사용 빌드 결과를 만들므로 운영 배포에는 올바른 공개 설정으로 다시 빌드해야 합니다. 모델 API 비밀키는 서버 환경에만 둡니다.

모바일 앱은 같은 계정의 오프라인 쓰기 큐를 먼저 전송한 뒤 서버 데이터를 복원합니다. 저장 대기 작업이나 조회 중 편집이 있으면 로컬 상태를 보존하고 재연결 때 복원을 재시도합니다. 로그아웃·계정 전환은 표시용 데이터와 조회 캐시를 지우고 미전송 작업은 계정별로 보관합니다. 저장 대기 작업은 해당 계정에서만 다시 전송하며, 재시도 횟수나 500개 초과를 이유로 자동 폐기하지 않습니다. 기기 저장 실패는 별도로 안내합니다.

같은 계정의 유효한 세션이 복원되면 오프라인에서도 확인된 프로필 캐시를 사용할 수 있습니다. 비밀번호 재설정은 복구 세션을 확인한 뒤 진행하며, 네이티브 복귀 주소와 실제 검증 범위는 [인증·오프라인 보완 기록](docs/MOBILE_AUTH_AND_OFFLINE_2026-10-27.md)을 참고합니다.

## AI 코칭 웹 MVP

- 목표·현재 상태·기간·실행 여건을 대화로 확인하고 계획 초안을 제시합니다.
- 승인한 계획을 저장하고 일일 실행 기록과 점검을 바탕으로 조정합니다.
- 기억과 확정 사실을 구분하며 승인 전 제안을 확정 데이터로 저장하지 않습니다.
- 언어·시간대 설정, 데이터 내보내기·삭제, 세션 소유권 검사와 비용 통제를 제공합니다.
- 배포용 작업본에는 실행·목표 관리 화면 등 별도 확장 기능이 있습니다. 두 작업본의 모든 파일이 같다는 뜻은 아닙니다.

웹 코칭의 기본 제공자는 Claude입니다. 서버에 `ANTHROPIC_API_KEY`, `ONJU_AGENT_PROVIDER=anthropic`, `ONJU_CLAUDE_MODEL=claude-sonnet-4-6`를 설정합니다. 키 누락이나 장애 시 OpenAI로 자동 전환하지 않습니다. OpenAI 복귀는 명시적인 서버 설정이 필요합니다. API 키는 클라이언트에 전달하지 않으며, 로컬 `.env.local`은 운영 시크릿을 자동으로 바꾸지 않습니다. [운영 전환 기록](docs/CLAUDE_PRODUCTION_ROLLOUT_2026-10-23.md)에 범위와 검증을 정리했습니다.

실제 비교는 [Claude 연결과 비교 기록](docs/CLAUDE_CONNECTION_AND_COMPARISON_2026-10-23.md)의 실행·비용 기준을 따릅니다. 이번 비교 도구는 두 제공자 합산 10달러 한도와 기존 실패 예약액을 영속적으로 관리하며, 기본 명령은 유료 호출을 하지 않습니다.

실제 배포는 소스 지문과 배포 기록을 함께 확인해야 합니다. **2026-10-23** 웹 에이전트의 Claude 백엔드 전환과 무과금 세션 검사를 완료했습니다. 2026-10-26에는 [계산·지연 보완](docs/CLAUDE_OFFLINE_FIXES_2026-10-26.md)을 무료 회귀 검사 후 운영에 반영했습니다. 소스 위치와 검증 범위는 [개발 소스와 검증 기준](docs/DEVELOPMENT_SOURCE_MAP.md)에 정리했습니다.

## 문서

- `CLAUDE.md` — 코드베이스 컨벤션·구조 (AI 협업용)
- `docs/ROADMAP.md` — 출시 로드맵
- `docs/NATIVE_OAUTH.md` — 구글/카카오 네이티브 로그인 설정
- `docs/WEB_PUSH.md` — 웹 푸시(VAPID·Edge Function) 셋업
- `docs/DEVELOPMENT_SOURCE_MAP.md` — 앱별 소스·공유 파일·배포 및 검사 기준
- `docs/agent/ONJU_AGENT_OPERATING_SPEC.md` — AI 생활·목표 관리 운영 명세
- `docs/WEB_MVP_WORKLOG_2026-09-18_DEPLOYMENT.md` — 최근 저장소 내 배포 근거
- `docs/ONJU_IMPROVEMENT_WORKLOG_2026-10-01.md` — 전체 점검 후 원인·수정·검증 기록
- `docs/CLAUDE_CONNECTION_AND_COMPARISON_2026-10-23.md` — Claude 연결·10달러 비교·발생 문제와 해결 기록
- `docs/CLAUDE_COACHING_IMPROVEMENT_2026-10-23.md` — 실제 Claude 코칭·속도·도구 오류 개선, 예산 종료와 당시 운영 반영 보류 이유
- `docs/CLAUDE_OFFLINE_FIXES_2026-10-26.md` — 추가 API 비용 없는 계산·지연 개선과 운영 반영 완료
