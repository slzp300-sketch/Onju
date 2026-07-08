# 웹 Push 알림 셋업 가이드

웹 PWA에서 **앱이 닫혀 있어도** 예약된 시간에 알림을 보내려면 백엔드가 필요하다.
구조: 클라이언트가 알림 스케줄을 `reminder_schedule`에 저장 → `pg_cron`이 매분
Edge Function `send-reminders`를 호출 → 해당 시각 알림을 Web Push로 발송.

> 설정하지 않으면 웹은 자동으로 **setTimeout 폴백**(앱 열려 있는 동안만)으로 동작한다.
> 아래를 완료해야 "앱 닫힘 상태" 발송이 켜진다. (안드로이드 네이티브는 이와 무관하게 이미 동작.)

시각은 전부 **KST(Asia/Seoul)** 기준으로 해석한다.

---

## 1. VAPID 키 생성

```bash
npx web-push generate-vapid-keys
```
`Public Key`와 `Private Key`가 출력된다.

## 2. 클라이언트 환경변수 (공개키)

- 로컬 `.env`:
  ```
  VITE_VAPID_PUBLIC_KEY=<공개키>
  ```
- **Vercel** → Project → Settings → Environment Variables 에도 동일하게 추가 후 **재배포**.
  (Vite는 빌드 타임에 값을 굽기 때문에 재배포 필요.)

## 3. DB 마이그레이션 적용

`supabase/migrations/0003_web_push.sql` 을 Supabase 대시보드 **SQL Editor**에서 실행.
→ `push_subscriptions`, `reminder_schedule` 테이블 + RLS 생성.

## 4. Edge Function 배포

```bash
# Supabase CLI 로그인/링크가 되어 있다고 가정
supabase functions deploy send-reminders --no-verify-jwt

# 시크릿(비밀키) 설정 — 절대 클라이언트에 넣지 말 것
supabase secrets set \
  VAPID_PUBLIC_KEY=<공개키> \
  VAPID_PRIVATE_KEY=<비밀키> \
  VAPID_SUBJECT=mailto:you@example.com
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 는 Edge Function 런타임에 기본 주입된다.

## 5. pg_cron 으로 매분 호출

Supabase 대시보드에서 `pg_cron`, `pg_net` 확장을 켠 뒤 SQL Editor에서:

```sql
select cron.schedule(
  'send-reminders',
  '* * * * *',              -- 매분
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);
```
`<PROJECT_REF>` 를 실제 프로젝트 ref로 교체. 해제는 `select cron.unschedule('send-reminders');`.

## 6. 확인

1. 브라우저(설치형 PWA 권장)에서 로그인 → 알림 설정에서 권한 허용.
   → `push_subscriptions`에 행이 생기고, 알림 토글을 켜면 `reminder_schedule`에 행이 쌓인다.
2. 임의로 `reminder_schedule`의 한 행 `hour/minute`을 1~2분 뒤로 바꿔 저장 → 그 시각에 알림 수신 확인.
3. Edge Function 로그(대시보드 → Functions → send-reminders → Logs)에서 `{sent: n}` 확인.

## 플랫폼 주의

- **iOS**: Safari 탭에서는 웹 Push 불가. **홈 화면에 설치한 PWA(iOS 16.4+)** 에서만 동작.
- **안드로이드/데스크톱 크롬·엣지·파폭**: 정상.
- 무효/만료 구독(404·410)은 Edge Function이 자동으로 `push_subscriptions`에서 제거한다.

## 한계 / 향후

- 시각은 KST 고정. 다른 시간대 사용자를 지원하려면 프로필에 timezone을 저장하고
  `reminder_schedule`/Edge Function에 반영해야 한다.
- "미완료 루틴 N개" 같은 동적 문구는 예약 방식 특성상 정적 문구로 대체된다.
