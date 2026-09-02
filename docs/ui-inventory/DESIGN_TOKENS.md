# 온주 디자인 토큰 v1

구현 위치: `src/styles/tokens.css`, Tailwind 원시 토큰은 `src/index.css`의 `@theme`

## 원칙

- 4px 간격 그리드를 사용한다.
- 터치 영역은 최소 44px를 보장한다.
- 기본 인터랙션은 80~280ms, 완료 축하는 최대 520ms다.
- 손그림 질감은 배경과 브랜드 요소에만 낮은 강도로 사용한다.
- 텍스트·입력·차트에는 질감을 겹치지 않는다.
- 색상만으로 완료·오류·선택 상태를 전달하지 않는다.

## 핵심 팔레트

| 토큰 | 값 | 용도 |
|---|---|---|
| `--onju-forest` | `#2f3e2e` | 제목·강조 잉크 |
| `--onju-sage` | `#6b7f6b` | 손그림 보조 녹색 |
| `--onju-paper` | `#fbf7ec` | 카드·입력 표면 |
| `--onju-butter` | `#f4c98a` | 축하·시간대 강조 |
| `--onju-peach` | `#f7a48f` | 응원·주의 보조색 |
| `--onju-sky` | `#a7c7e7` | 정보·오프라인 보조색 |

테마에 따라 변해야 하는 컴포넌트는 직접 팔레트 대신 `--ui-action`, `--ui-bg-*`, `--ui-text-*`, `--ui-border*` 의미 토큰을 사용한다.

## 크기

- 버튼·입력 large: 48px
- 버튼 medium: 44px
- 버튼 small: 36px, 단독 아이콘 버튼은 hit area를 44px 이상 확보
- 페이지 좌우 여백: 20px
- 섹션 간격: 24px
- 카드 간격: 12px
- 콘텐츠 최대 폭: 512px

## 모션

| 토큰 | 시간 | 예시 |
|---|---:|---|
| `--motion-instant` | 80ms | 아이콘 눌림 |
| `--motion-fast` | 140ms | hover, focus |
| `--motion-base` | 200ms | 탭·토글 |
| `--motion-slow` | 280ms | 시트·카드 펼침 |
| `--motion-celebrate` | 520ms | 완료 도장·해금 |

`prefers-reduced-motion`에서는 주요 모션 토큰이 1ms로 축소된다.

## 적용 순서

1. 공통 `Button`, `Card`, `.input-base`
2. 탭·토글·배지·FAB
3. 바텀시트·모달·토스트
4. 페이지별 직접 선언 스타일을 의미 토큰으로 교체
