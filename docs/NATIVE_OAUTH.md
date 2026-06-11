# 소셜 로그인 (Supabase Auth) 설정 가이드

인증은 전부 **Supabase Auth**를 통한다. 카카오/구글 키는 코드가 아니라
Supabase 대시보드(Authentication → Providers)에 들어간다.

## 플랫폼 × 제공자 매핑

| 제공자 | 웹 | 네이티브(Android) |
|---|---|---|
| 이메일/비번 | `signUp` / `signInWithPassword` | 동일 |
| 구글 | `signInWithOAuth({provider:'google'})` 리다이렉트 | capgo `SocialLogin` → idToken → `signInWithIdToken` |
| 카카오 | `signInWithOAuth({provider:'kakao'})` 리다이렉트 | `skipBrowserRedirect` + Custom Tab + `onju://oauth` 딥링크 → `exchangeCodeForSession` |

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
