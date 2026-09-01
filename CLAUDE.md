# 온주(Onju) — Project Context

React + TypeScript mobile web app for 직장생활 관리. PWA.

## Stack
- **UI:** React 19, Tailwind CSS 4, framer-motion, lucide-react
- **State:** Zustand (optimistic local + write-through), TanStack Query (groups/reviews)
- **Backend:** Supabase (Postgres + Auth + RLS) — schema in `supabase/migrations/`
- **Routing:** react-router-dom 7
- **Build:** Vite + vite-plugin-pwa (SW는 웹에서만 등록), Capacitor 8 (Android, 자체 홈 위젯 포함)

## Structure
```
src/
  pages/       # route-level page components
  components/  # shared UI components
  store/       # zustand stores (액션이 낙관적 set 후 data/ 리포로 write-through)
  api/         # TanStack Query용 supabase 함수 (groups, reviews)
  data/        # supabase 리포지토리 + row↔type mappers
  lib/         # supabase 클라이언트, 인증 액션, sync/hydrate
  hooks/       # custom hooks
  types/       # TypeScript types
  utils/       # pure utility functions
```

## Data flow
- 로그인 시 `lib/sync/hydrate.ts`가 서버 → 전체 스토어 hydrate (서버 우선)
- 스토어 변이는 로컬 set() 직후 `lib/sync/outbox.ts` 아웃박스 큐로 write-through
  (오프라인·실패 시 localStorage에 보존, 지수 백오프 재시도; 폐기·hydrate 실패는 토스트 노출)
- 설정류 스토어(settings/theme/tree/streak/notification)는 구독+디바운스로 `user_settings` jsonb에 통째 upsert
- 인증: Supabase Auth (이메일/구글/카카오) — `docs/NATIVE_OAUTH.md` 참고
- 새 엔티티 ID는 반드시 `utils/id.ts`의 `newId()` (uuid PK)
- 로컬 상태의 `userId`는 빈 문자열 — 서버가 `auth.uid()` default로 채움

## Key conventions
- Korean UI strings are expected — keep them as-is.
- Mobile-first layout. Test at 390px width (iPhone 14 baseline).
- Bottom nav has 4 tabs: 홈, 통계, 소모임, 마이페이지. (신앙루틴은 홈 내부 탭)
- Animations via framer-motion. Keep transitions under 300ms for premium feel.
- 도달 불가 라우트/컴포넌트를 남기지 말 것 — `npm run gc`(eslint+knip)로 검사.
  현재 knip이 보고하는 미사용 파일들(신앙 Track A/B, HeatMap, MonthlyCalendar,
  MemberProgressCard, routineRecommendation)은 스펙 기능 후보로 의도적 보존.

## Dev
```
npm run dev          # start dev server
npm run build        # production build (tsc + vite)
npm test             # vitest 유닛 테스트
npm run gc           # eslint + knip 죽은 코드 검사
npm run sync:android # 네이티브 빌드 + cap sync
```

---
**Guides:** `~/.claude/guides/coding.md` · `~/.claude/guides/ui.md` · `~/.claude/guides/testing.md`
