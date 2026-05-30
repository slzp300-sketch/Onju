# 온주(Onju) — Project Context

React + TypeScript mobile web app for 직장생활 관리. PWA.

## Stack
- **UI:** React 18, Tailwind CSS, framer-motion, lucide-react
- **State:** Zustand (local store), TanStack Query (server state)
- **Routing:** react-router-dom
- **Build:** Vite + vite-plugin-pwa
- **Mock API:** msw

## Structure
```
src/
  pages/       # route-level page components
  components/  # shared UI components
  store/       # zustand stores
  api/         # API layer / msw handlers
  hooks/       # custom hooks
  types/       # TypeScript types
  utils/       # pure utility functions
```

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
