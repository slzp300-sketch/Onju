# 네이티브 OAuth (카카오 / 구글) 설정 가이드

웹 OAuth는 네이티브 WebView 안에서 막힙니다(구글은 WebView 차단, 카카오는 redirect URI 불일치).
그래서 네이티브에서는 **시스템 브라우저(Custom Tab) + `onju://` 딥링크 콜백** 방식으로 처리합니다.

## 이미 스캐폴드된 것 (코드)
- 플러그인: `@capacitor/browser`, `@capacitor/app`
- 딥링크: `android/app/src/main/AndroidManifest.xml` 에 `android:scheme="onju"` intent-filter
- 로직: `src/lib/nativeAuth.ts` (`nativeOAuthLogin('google'|'kakao')`)
- 분기: `src/pages/Login.tsx` 에서 `isNativePlatform()` 일 때 네이티브 플로우 사용
- 리다이렉트 URI: **`onju://oauth`** (코드/매니페스트 일치)

## 동작시키려면 (사용자 작업)

### 환경변수 (`.env`)
```
VITE_KAKAO_REST_KEY=<카카오 REST API 키>
VITE_GOOGLE_NATIVE_CLIENT_ID=<구글 OAuth 클라이언트 ID>
```
> 네이티브 빌드는 `npm run build:native` 가 env를 읽습니다. 키 추가 후 `npm run sync:android`.

### 카카오 (스캐폴드 그대로 동작)
1. [Kakao Developers](https://developers.kakao.com) → 내 애플리케이션 → 앱 선택
2. **앱 설정 → 플랫폼 → Android 등록**: 패키지명 `com.onju.app`, 키 해시 등록
   - 키 해시: 디버그/릴리스 keystore의 SHA-1 → base64 (콘솔 안내 참고)
3. **카카오 로그인 → 활성화 ON**, **Redirect URI 에 `onju://oauth` 추가**
4. **REST API 키**를 `VITE_KAKAO_REST_KEY` 로 주입
5. 백엔드 `/api/kakao-token` 이 전달받은 `redirectUri`(`onju://oauth`)로 토큰 교환하면 됨
   - 기존 웹 콜백(`/auth/kakao/callback`)과 별개로 네이티브 redirectUri를 함께 허용

### 구글 (추가 조정 필요)
구글은 설치형 앱에서 **임의 커스텀 스킴(`onju://`)을 redirect로 허용하지 않습니다.**
두 가지 중 택1:

- **(권장) 네이티브 플러그인** `@codetrix-studio/capacitor-google-auth`
  - Google Cloud Console에서 **Android 클라이언트**(패키지 `com.onju.app` + 서명 SHA-1)와
    **Web 클라이언트**(서버 검증용) 생성 → 플러그인 설정에 Web client ID 주입
  - `nativeAuth.ts` 의 구글 분기를 이 플러그인 호출로 교체
- **(대안) 브라우저 + PKCE** : redirect를 `com.googleusercontent.apps.<CLIENT_ID>:/oauth2redirect`
  형태(역DNS 스킴)로 바꾸고 매니페스트 scheme도 동일하게 추가, `/api/google-token` 백엔드로 교환

> 즉 **카카오는 키만 넣으면 바로**, **구글은 위 조정 후** 동작합니다.

### 백엔드
- `/api/kakao-token`: 이미 존재 — 네이티브 `redirectUri` 허용만 확인
- `/api/google-token`: (구글 브라우저+PKCE 방식 선택 시) 신규 필요. 플러그인 방식이면 불필요

## 테스트
```
# 키/콘솔 등록 후
npm run sync:android
npm run open:android   # Android Studio에서 Run, 또는 gradlew assembleDebug + adb install
```
앱에서 "구글/카카오로 계속하기" → 시스템 브라우저 → 동의 → `onju://oauth?code=...` 로 앱 복귀 → 로그인 완료.
