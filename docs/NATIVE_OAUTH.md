# 소셜 로그인 (Supabase Auth) 설정 가이드

인증은 전부 **Supabase Auth**를 통한다. 카카오/구글 키는 코드가 아니라
Supabase 대시보드(Authentication → Providers)에 들어간다.

## 플랫폼 × 제공자 매핑

| 제공자 | 웹 | 네이티브(Android) |
|---|---|---|
| 이메일/비번 | `signUp` / `signInWithPassword` | 동일 |
| 구글 | `signInWithOAuth({provider:'google'})` 리다이렉트 | capgo `SocialLogin` → idToken → `signInWithIdToken` |
| 카카오 | `signInWithOAuth({provider:'kakao'})` 리다이렉트 | `skipBrowserRedirect` + Custom Tab + `onju://oauth` 딥링크 → `exchangeCodeForSession` |
| 비밀번호 재설정 | 현재 웹 origin의 `/reset-password` | `onju://reset-password` 딥링크 → PKCE 코드 교환 → 복구 계정 확인 |

- 진입점: `src/lib/authActions.ts` (`loginWithGoogle` / `loginWithKakao`)
- 네이티브 전용 로직: `src/lib/nativeAuth.ts`
- 웹 콜백 라우트: `/auth/callback` (`src/pages/AuthCallback.tsx`)
- 딥링크: `android/app/src/main/AndroidManifest.xml`의 `android:scheme="onju"` intent-filter

## Supabase 대시보드 설정

### Google 제공자
1. 기존 **Web 클라이언트** ID/Secret 입력
2. **Authorized Client IDs**에 같은 Web 클라이언트 ID 추가
   (네이티브 `signInWithIdToken`의 aud 검증에 필요)
3. Google Cloud Console의 Web 클라이언트 → Authorized redirect URIs에
   `https://<project-ref>.supabase.co/auth/v1/callback` 추가
4. 네이티브용 **Android 클라이언트**(패키지 `com.onju.app` + SHA-1)는
   Google Cloud Console에 별도로 존재해야 함 (디버그/릴리스 각각)

### Kakao 제공자
1. Client ID = REST API 키, Client Secret 입력 (기존 Vercel env에 있던 값)
2. [Kakao Developers](https://developers.kakao.com) → 카카오 로그인 →
   Redirect URI를 `https://<project-ref>.supabase.co/auth/v1/callback` 로 설정
3. 동의항목에서 **카카오계정(이메일)** 활성화 (비즈앱 필요)

### URL Configuration (Authentication → URL Configuration)
- Site URL: `https://onju-seven.vercel.app`
- Redirect URLs:
  - `http://localhost:5173/auth/callback`
  - `https://onju-seven.vercel.app/auth/callback`
  - `onju://oauth`
  - `onju://reset-password`
  - `http://localhost:5173/reset-password`
  - `http://127.0.0.1:5173/reset-password`
  - `https://onju-seven.vercel.app/reset-password`

위 비밀번호 재설정 주소는 2026-10-27 코드 보완에 맞춘 **필요 설정 목록**이다. 이번 작업에서 Supabase 콘솔 값을 변경하거나 등록 여부를 확인하지 않았다. 실제 로그인·메일 검증 전에 허용 목록을 대조한다.

### 비밀번호 재설정과 앱 복귀

- 웹·네이티브 모두 PKCE를 사용한다. 메일 요청에 사용한 브라우저/앱에 코드 검증 값이 있으므로 같은 환경에서 링크를 열어야 한다. 다른 기기나 새 시크릿 창의 링크 실패를 정상 복구 완료로 처리하지 않는다.
- 네이티브에서는 `DeepLinkHandler`가 `appUrlOpen`과 `getLaunchUrl`을 처리한다. 앱이 꺼진 상태의 OAuth·복구 링크, 실행 중인 복구 링크와 위젯 링크를 처리한다. 실행 중 카카오 OAuth는 기존 `nativeAuth.ts` 대기 호출이 담당한다.
- 비밀번호 폼은 일반 로그인 여부가 아닌 `PASSWORD_RECOVERY`로 확인한 계정에 열린다. 프로필 조회 장애가 복구 폼을 막지 않으며, 계정 변경·로그아웃·변경 완료 시 복구 상태를 해제한다.
- 비밀번호 변경은 시작 계정의 세션으로 독립 Auth 클라이언트를 사용한다. 처리 중 다른 계정으로 전환하더라도 새 계정의 비밀번호를 변경하지 않는다.
- 로그인·메일·비밀번호 재설정의 반복 클릭을 막는다. Supabase의 메일 API 성공만으로 이메일 계정 존재나 실제 메일 도착을 단정하지 않는다.

기준: [Supabase 비밀번호 복구 API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [비밀번호 인증](https://supabase.com/docs/guides/auth/passwords), [네이티브 딥링크](https://supabase.com/docs/guides/auth/native-mobile-deep-linking). 실제 SMTP와 앱 복귀는 기기에서 별도 확인해야 한다.

### 이메일 가입
- 당분간 **Confirm email OFF** (가입 즉시 사용). 출시 후 활성화 검토.

## 환경변수 (`.env` + Vercel)
```
VITE_SUPABASE_URL=<https://...supabase.co>
VITE_SUPABASE_ANON_KEY=<anon key — RLS가 보안 경계이므로 공개 가능>
VITE_GOOGLE_CLIENT_ID=<구글 Web 클라이언트 ID>
```

## 테스트
```
npm run sync:android
npm run open:android   # 또는 gradlew assembleDebug + adb install
```
구글: 계정 선택 UI → 즉시 로그인. 카카오: Custom Tab → 동의 → 앱 복귀 → 로그인.
