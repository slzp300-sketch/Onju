# 🌳 온주 (Onju)

직장생활 관리 모바일 웹앱 — 루틴·습관·목표를 심고 가꾸면 나의 나무가 자랍니다.

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
```

환경 변수(`.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(웹 푸시 사용 시 `VITE_VAPID_PUBLIC_KEY` — `docs/WEB_PUSH.md` 참고)

## 문서

- `CLAUDE.md` — 코드베이스 컨벤션·구조 (AI 협업용)
- `docs/ROADMAP.md` — 출시 로드맵
- `docs/NATIVE_OAUTH.md` — 구글/카카오 네이티브 로그인 설정
- `docs/WEB_PUSH.md` — 웹 푸시(VAPID·Edge Function) 셋업
