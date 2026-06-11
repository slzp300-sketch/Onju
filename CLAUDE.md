# 온주(Onju) — Project Context

React + TypeScript mobile web app for 직장생활 관리. PWA.

## Stack
- **UI:** React 18, Tailwind CSS, framer-motion, lucide-react
- **State:** Zustand (optimistic local + write-through), TanStack Query (groups/reviews)
- **Backend:** Supabase (Postgres + Auth + RLS) — schema in `supabase/migrations/`
- **Routing:** react-router-dom
- **Build:** Vite + vite-plugin-pwa (SW는 웹에서만 등록), Capacitor 8 (Android)

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
- 스토어 변이는 로컬 set() 직후 supabase write-through; 실패는 콘솔 로깅
- 인증: Supabase Auth (이메일/구글/카카오) — `docs/NATIVE_OAUTH.md` 참고
- 새 엔티티 ID는 반드시 `utils/id.ts`의 `newId()` (uuid PK)

## Key conventions
- Korean UI strings are expected — keep them as-is.
- Mobile-first layout. Test at 390px width (iPhone 14 baseline).
- Bottom nav has 3 tabs: 홈, 소모임, 신앙루틴.
- Animations via framer-motion. Keep transitions under 300ms for premium feel.

## Dev
```
npm run dev    # start dev server
npm run build  # production build
```

---
**Guides:** `~/.claude/guides/coding.md` · `~/.claude/guides/ui.md` · `~/.claude/guides/testing.md`
