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
  (오프라인·실패 시 작업별 localStorage 키에 계정 소유자와 함께 보존, 지수 백오프 재시도;
  자동 폐기하지 않으며 저장 지연·기기 보관 실패·hydrate 실패는 안내 노출)
- 소모임 가입·나가기는 예외: 온라인에서 현재 계정 세션으로 RPC 후 본인 멤버십을 조회하고
  확인한 상태만 반영한다. 불확실하면 재조회하며, 구버전의 가입·나가기 큐는 자동 재전송하지 않고
  사용자가 이전 요청 취소·현재 상태 확인을 선택할 때까지 계정별로 보관한다.
- 소모임 생성도 온라인 확인 방식이다. `create_group_with_owner`가 생성과 방장 등록을 한 트랜잭션으로 처리한다.
  생성 초안의 ID·첫 요청 내용을 재사용하며, 구버전의 분리된 생성 큐/서버의 방장 누락 모임은
  사용자가 복구를 선택하고 서버 상태가 확인된 뒤에만 정리한다.
- 방장의 모집 마감·종료는 `change_group_status` RPC로 요청하고 서버 상태를 조회한 뒤 반영한다.
  전송 전 계정별 확인 대기 항목을 보관하며 자동 재전송하지 않는다. 구버전 상태 변경 큐도 보류하고
  사용자가 현재 운영 상태를 확인한 뒤 해당 조회가 포착한 요청만 정리한다. 상세/목록의 복구 안내를 유지할 것.
- 비공개 모임은 방장이 발급한 7일 유효·1인용 초대 코드로 가입한다. `group_invites`는 방장만 조회하며,
  발급/폐기/사전 확인/가입은 전용 RPC로 처리한다. 가입과 코드 소비는 같은 트랜잭션에서 정원·모집·차단을 검사한다.
  방장 요청은 계정·모임별로, 가입 코드/미확인 요청은 계정별 초안으로 보관한다. 자동 재전송하지 않는다.
  초대 코드를 URL·로그·일반 조회 캐시에 넣지 말 것. 기기의 초안 보관은 사용자 안내 범위에서 허용한다.
- 로그아웃·계정 전환은 표시용 스토어와 조회 캐시를 정리하되 미전송 큐는 계정별 보관한다.
  해당 계정으로 다시 로그인할 때만 재전송하며, 탈퇴 완료 시 해당 계정 큐만 삭제한다.
- 설정류 스토어(settings/theme/tree/streak/notification)는 구독+디바운스로 `user_settings` jsonb에 통째 upsert
- 목표 연결 해제·이동은 `withHistory`로 오늘부터 반영하며 과거 날짜의 연결/수행 기록을 남긴다.
  월간 목표 삭제는 `delete_monthly_goal_checked` 단일 큐 요청(확인한 revision·요청 ID·적용일·시간대 포함)으로 처리한다.
  서버 확인 전까지 목표·연결을 유지하고 중복 삭제/목표 편집 저장을 막는다. 충돌과 구버전 삭제 RPC/직접 DELETE 큐는
  자동 전송하지 않고 `/goals/conflicts`에서 최신 목표 유지 또는 최신 버전으로 삭제를 재확인한다.
  재확인 삭제는 오늘부터, 응답 유실 재시도는 원래 날짜·시간대로 처리한다. 성공 영수증은 같은 ID가 다시 생겨도 재삭제하지 않는다.
  습관·루틴·로그·주간 목표를 삭제하지 않으며, 보관 상태와 과거 이력을 유지한 채 현재 연결만 정리한다.
  확인 후 로컬 연결 정리는 `withoutGoalSince`로 이후 일정 이력도 보존한다. 서버 DELETE 트리거는 원자적으로 연결을 정리하며,
  012부터 클라이언트 직접 DELETE/구버전 삭제 RPC 권한을 회수한다. 쓰기 트리거는 없는 목표/다른 계정 목표의 현재 연결을 제거한다.
- 목표 분류 변경은 기존 연결·실천 유형·홈 탭·보관 상태를 유지한다. 새 연결만 목표의 새 분류를 따른다.
  기간 변경은 진척 계산 범위만 바꾸며 습관 일정·수행 로그·연결 이력을 수정하지 않는다.
  `GoalEditImpact`의 변경 전/후 수치를 확인한 뒤 저장하고, 확인 중 데이터가 바뀌면 다시 확인한다.
  날짜 검증·연결 가능 여부는 `goalRules`, 진척은 `goalProgress`를 공통으로 사용한다.
- 월간 목표 생성/수정은 `save_monthly_goal` RPC와 기준 `revision`으로 저장한다. 편집 시작/초안의
  기준 버전을 보존하며 요청 ID를 다음 버전으로 쓴다. 성공 요청 영수증으로 응답 유실 재시도도 중복 반영하지 않는다.
  충돌한 목표와 구버전 blind upsert는 자동 재전송하지 않고 `/goals/conflicts`에서 비교·선택한다.
  같은 목표의 후속 쓰기는 보류하되 다른 기록은 계속 전송하고 hydrate는 보류 입력을 덮어쓰지 않는다.
  복구는 교체 요청을 먼저 영속화하고 비교한 요청만 정리한다. 삭제된 목표는 새 ID로만 복사하며 기존 실천을 재연결하지 않는다.
- 개인 습관(`habits`)·신앙/기존 개인 루틴(`daily_routines`) 생성·수정·보관·복원은
  `save_practice`와 기준 revision으로 처리한다. 큐 영속화 후 로컬 set하며 편집/초안/리뷰의 기준 버전을 유지한다.
  충돌·구버전 직접 쓰기는 `/practices/conflicts`에서 비교하며 같은 종류/ID만 보류한다. 다른 실천·수행 로그는 계속 전송한다.
  복구는 오늘부터, 응답 유실 재시도는 원래 날짜·시간대로 처리한다. 서버의 과거 일정 이력을 기준으로 보존하며
  미래 일정 이력이 있으면 덮지 않고 보류한다. 없는 항목은 새 ID로만 복사하고 기존 로그·목표·묶음을 재연결하지 않는다.
  013부터 직접 insert/update/delete 권한을 회수한다. 개인 루틴 묶음·주간 목표는 아래 별도 저장 규칙을 따른다.
- 개인 루틴 묶음(`personal_routines`)·주간 목표(`weekly_goals`)는 `save_plan`과 기준 revision으로 생성·수정·삭제한다.
  큐 영속화 후 로컬 반영하며 삭제는 서버 확인 전까지 항목을 유지한다. 충돌·구버전 직접 쓰기는 `/plans/conflicts`에서
  비교·선택하고 같은 종류/ID만 보류한다. 응답 유실은 같은 요청 영수증으로 확인하며 이후 수정·삭제·동일 ID 재생성을 덮지 않는다.
  편집 초안은 시작 당시 전체 항목·기준 버전을 보존하고 삭제된 대상/지난 주 초안도 다시 열 수 있다.
  주간 목표 일반 편집은 횟수만 바꾸며 기간·연결·리뷰 결산을 유지한다. 묶음 편집은 보관/누락 습관을 조용히 제외하지 않는다.
  복구는 교체 요청부터 보관하고 비교한 입력만 정리한다. 없는 항목은 새 ID로만 복사하며 표시된 기존 실천 연결을 확인한다.
  습관·루틴·과거 수행 로그·리뷰를 복제/삭제하지 않는다. 리뷰 및 월간 목표 삭제로 인한 변경도 revision을 갱신한다.
  `202610280002`부터 직접 쓰기 권한을 회수하며 SQL은 로컬 검증 완료/운영 미적용이다.
- 주간 리뷰는 계정별 `reviewSubmission` 저장 계획을 첫 전송 전에 보관한다. 실천/묶음 추가/주간 결산/모임별 공유/본문을
  `apply_weekly_review_step`의 항목별 성공 영수증으로 처리한다. 본문은 마지막에 비교 저장한다. 완료 항목은 재전송하지 않고
  응답·체크포인트 유실은 원래 요청 ID/내용/적용일/시간대로 확인한다. 자동 재전송·전체 초안 폐기는 하지 않는다.
  `/review`와 홈 복구 안내에서 남은 저장을 이어간다. 충돌은 현재 상태 재확인 또는 확인 후 해당 조정만 제외하며
  결과를 모르는 요청은 먼저 확인한다. 묶음에는 저장된 새 습관만 추가하고 결산은 기준 필드 확인 후 달성률/상태만 바꾼다.
  계정 전환 시 계획은 보관하고 계정 삭제 완료 시 해당 소유자만 정리한다. 과거 실천·수행 로그는 삭제하지 않는다.
  `202610280001` SQL은 로컬 검증 완료/운영 미적용이다.
- 할 일·일기·말씀/기도 메모는 `save_record`와 기준 버전으로 저장한다. 할 일은 이름/아이콘 편집과 완료 변경을
  구분하며 날짜를 바꾸지 않는다. 일기는 계정·날짜, 메모는 계정·루틴·날짜 기준으로 비교한다. 초안은 원래 기준 항목을
  보존하고 구버전 초안의 버전을 추측하지 않는다. 할 일·일기 삭제는 서버 확인 전까지 유지하고 중복 삭제/편집을 막는다.
  메모는 `memo_revision`을 쓰며 수행 체크와 별도로 저장한다. 수행 체크도 영수증 RPC로 보내며 메모를 전송/덮어쓰지 않는다.
  메모 응답은 최신 수행 상태를 가져오되 아직 전송 중인 체크·후속 메모를 보존한다. 구버전 routine_logs 전체 쓰기는 보류한다.
  충돌은 `/records/conflicts`에서 비교·선택하며 해당 기록만 보류한다. 삭제된 할 일은 새 UUID로 복사하며 미완료로 시작한다.
  없는 일기/메모는 날짜를 표시하고 명시적으로 복원한다. 다른 날짜의 기록·습관·로그를 삭제/복제하지 않는다.
  새 기록 요청은 구버전 탭의 오인 정리를 막기 위해 `onju-record-outbox:item:`에 따로 영속화한다. 계정 전환 시 보존하며
  계정 삭제 때 해당 소유자만 정리한다. 이전 키의 요청은 새 키 저장 성공 후 이동한다. 기존 직접 쓰기 큐는 비교까지 보관한다.
  `202610280003`은 직접 쓰기 권한 회수·CAS·성공 영수증을 포함하며 로컬 검증 완료/운영 미적용이다.
- 인증: Supabase Auth (이메일/구글/카카오) — `docs/NATIVE_OAUTH.md` 참고
- 새 엔티티 ID는 반드시 `utils/id.ts`의 `newId()` (uuid PK)
- 로컬 상태의 `userId`는 빈 문자열 — 서버가 `auth.uid()` default로 채움

## Key conventions
- Korean UI strings are expected — keep them as-is.
- Mobile-first layout. Test at 390px width (iPhone 14 baseline).
- Bottom nav has 4 tabs: 홈, 통계, 소모임, 마이페이지. (신앙루틴은 홈 내부 탭)
- Animations via framer-motion. Keep transitions under 300ms for premium feel.
- 도달 불가 라우트/컴포넌트를 남기지 말 것 — `npm run gc`(eslint+knip)로 검사.
  gc는 exit 0이 정상이며, 뭐라도 보고되면 회귀다. 스펙 기능 후보로 의도적 보존 중인
  파일들(HeatMap, MonthlyCalendar, MemberProgressCard, routineRecommendation)은
  `knip.config.ts`의 ignore 목록에 등재돼 있고, 보존 파일만 쓰는 export는
  `@preserved` JSDoc 태그로 보고에서 제외한다. 도달 코드가 되면 둘 다 해제할 것.

## Dev
```
npm run dev          # start dev server
npm run build        # production build (tsc + vite)
npm test             # vitest 유닛 테스트
npm run gc           # eslint + knip 죽은 코드 검사
npm run sync:android # 네이티브 빌드 + cap sync
```

## 네이티브 껍데기 (Capacitor)
화면·로직은 웹 코드 한 곳(`src/`)에 있고, `android/`는 그것을 감싸는 얇은 껍데기다. 기능은 웹 코드에서 고치고,
플랫폼에서만 다른 것은 `Capacitor.isNativePlatform()`으로 나눈다(`src/lib/nativeAuth.ts`, `nativeNotifications.ts`,
`notificationSync.ts`, `components/DeepLinkHandler.tsx`·`NativeBackHandler.tsx`·`WidgetSync.tsx` 등).

| 플랫폼 | 상태 | 이 플랫폼에만 있는 것 |
|---|---|---|
| 웹(PWA) | 운영 중 — Vercel, main push 즉시 배포 | 서비스 워커(웹에서만 등록), 웹 푸시 |
| Android | `android/` 있음, 스토어 미출시 | 홈 위젯: `android/app/src/main/java/com/onju/app/`의 `OnjuWidgetProvider`·`WidgetStore`(SharedPreferences `onju_widget`)·`WidgetBridgePlugin`(`MainActivity`에서 등록) ↔ 웹 쪽 `src/plugins/widget-bridge`, `src/lib/widget/`(snapshot·reconcile). 로컬 알림(`@capacitor/local-notifications`), 네이티브 소셜 로그인(`@capgo/capacitor-social-login`, `docs/NATIVE_OAUTH.md`) |
| iOS | **없음** (`ios/` 폴더 없음) | — |

- 웹 코드를 바꾼 뒤 Android에 반영: `npm run sync:android`(웹 빌드 + `cap sync android`). Android Studio는 `npm run open:android`.
- `android/`의 Gradle·네이티브 파일은 `cap sync`가 다시 쓰는 것이 있으니, 직접 고친 네이티브 파일(위젯 Java, `AndroidManifest.xml`, `res/xml/`)만 손으로 관리한다.
- iOS를 붙일 때: 이 PC는 Windows라 iOS를 직접 빌드할 수 없다. GitHub Actions의 macOS 러너로 빌드·검사한다(뉴웨이브플로우의 `ios-check.yml`·`ios-testflight.yml` 구성이 참고 예). 저장소가 공개라 Actions는 무료다. 비공개로 바꾸면 macOS 러너 요금이 월 포함 사용액에서 차감되므로, 그때의 요금과 포함 사용액을 확인해 iOS 검사 실행 빈도(수동·출시 때 등)를 정한다.
