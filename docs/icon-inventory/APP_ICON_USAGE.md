# 온주 앱 UI 아이콘 사용처 인벤토리

수집일: 2026-09-02

## 범위

- 루틴 선택용 `OnjuIcon` 이모지 300종은 제외
- 앱 화면, 버튼, 상태 표시, 내비게이션에서 사용하는 기능성 아이콘을 대상으로 함
- `src/icons.tsx`를 통해 들어오는 Lucide 아이콘과 온주 커스텀 아이콘을 함께 집계

## 전체 현황

| 구분 | 수량 | 비고 |
|---|---:|---|
| 실제 사용 기능 아이콘 | 70종 | 42개 TS/TSX 파일에서 사용 |
| 하단 내비 전용 아이콘 | 4종 | 홈, 통계, 소모임, 마이페이지 |
| 온주 커스텀 오버라이드 | 8종 | Flame, Target, Church, Dumbbell, BookOpen, BarChart3, Sprout, Camera |
| 미사용 구형 SVG | 42개 | `src/assets/icons/`에 있으나 현재 코드 참조 없음 |

## 1. 전역 내비게이션

| 위치 | 필요한 아이콘 | 역할 |
|---|---|---|
| 하단 탭 | NavTree | 홈 |
| 하단 탭 | NavBars | 통계 |
| 하단 탭 | NavPeople | 소모임 |
| 하단 탭 | NavProfile | 마이페이지 |
| 대부분의 하위 화면 | ChevronLeft | 뒤로가기 |
| 목록·설정 진입 | ChevronRight | 다음 화면 이동 |
| 펼침 영역 | ChevronDown, ChevronUp | 열기·접기 |

## 2. 공통 동작 및 상태

| 기능군 | 필요한 아이콘 | 주요 사용처 |
|---|---|---|
| 생성·편집 | Plus, Pencil, GripVertical, Palette | 목표, 루틴, 소모임 생성·정렬·꾸미기 |
| 완료·확인 | Check, CheckCircle, CheckCircle2, CheckSquare | 루틴 완료, 폼 저장, 성공 상태 |
| 닫기·삭제 | X, XCircle, Trash2 | 시트/모달 닫기, 목표·루틴 삭제 |
| 재생·타이머 | Play, Pause, SkipForward, Timer, Clock, AlarmClock | 집중 모드, 루틴 타이머, 소요 시간 |
| 알림 | Bell, BellRing, BellOff | 알림 설정과 잠금 안내 |
| 보안·잠금 | Lock, Eye, EyeOff, Shield | 잠금 기능, 비밀번호, 스트릭 보호 |
| 메시지 상태 | AlertCircle, Info | 가입 검증, 토스트 알림 |
| 공유·연결 | Share2, Link2, Camera | 루틴 공유, 연결 목표, 인증 사진 |

## 3. 홈·개인 루틴·목표

| 위치 | 필요한 아이콘 |
|---|---|
| 홈 대시보드 | Target, ListTodo, BookOpen, Flame, Dumbbell, Link2, Clock, Lock, Trash2 |
| 개인 루틴 탭 | Timer, CheckSquare, LayoutList, Play, Smile, ClipboardList, Flame, Cloud, Zap, Trash2 |
| 습관 생성 | Target, Bell, Calendar, Check, Zap, Lightbulb, Flame, Timer |
| 개인 루틴 생성 | Timer, GripVertical, Dumbbell, Flame, Clock, ChevronLeft |
| 주간 목표 | Plus, Check, Link2, X |
| 월간 목표 목록 | Plus, Trash2, Pencil, Pin, Clock, MapPin, Flame, Zap, Dumbbell, CheckCircle2 |
| 목표 생성·편집 | Star, Lightbulb, Calendar, Dumbbell, Flame, Zap, Palette, BookOpen, Check |

## 4. 신앙 루틴

| 위치 | 필요한 아이콘 |
|---|---|
| 신앙 탭 | BookOpen, Play, Timer, Church, Sunrise, Sun, Moon, Cloud, Zap, Feather, ChevronRight, Trash2 |
| 신앙 루틴 생성 | Check, Timer, Church, Pencil, Bell, Calendar, Zap, Lightbulb, Target, Sunrise, Sun, Moon |
| 말씀 입력·기도 메모 | ChevronDown, X |
| 신앙 노트 | Feather, Sparkles, ChevronLeft |

## 5. 통계·회고·성장

| 위치 | 필요한 아이콘 |
|---|---|
| 통계 | Target, BookOpen, Dumbbell, Link2, Pin, BarChart3, Flame, FileText, Moon, ChevronRight |
| 주간 회고 | Check, Plus, X, Pencil, Trash2, Target, PartyPopper, Dumbbell, Sprout, BookOpen, Smile, Zap, Flame |
| 회고 결과 | Star, Smile, Frown, ChevronLeft |
| 회고 배너 | CheckCircle2, Sparkles, AlarmClock, Flame, ChevronRight |
| 연속 달성 상세 | Shield, Flame, Check, X, ChevronLeft |
| 테마·보상 | Lock, Check, Eye, X, TreePine, Users, UserCircle, Sparkles |

## 6. 소모임·공유

| 위치 | 필요한 아이콘 |
|---|---|
| 소모임 목록 | Plus, Camera, ChevronRight |
| 소모임 카드 | Users, Calendar |
| 소모임 상세 | Users, Check, LogOut, Play, Flag, BarChart3, Sprout, Flame, Heart, Church |
| 멤버 응원 | Flame, Heart, Church, X |
| 루틴 공유 | Camera, Check, Share2, Heart, Users, X |
| 카테고리 | Church, Sprout, Briefcase, Dumbbell, Sparkles |
| 커버 선택 | Sunrise, Church, Dumbbell, BookOpen, Footprints, Sun, Flame, Sprout, Cross, Target |

## 7. 마이페이지·인증·설정

| 위치 | 필요한 아이콘 |
|---|---|
| 마이페이지 | User, Bell, CalendarDays, Clock, LogOut, ChevronRight |
| 알림 설정 | Bell, BellOff, Sunrise, Moon, ClipboardList, ChevronLeft |
| 회원가입 | Eye, EyeOff, CheckCircle, XCircle, AlertCircle, ChevronDown |
| 온보딩 | BookOpen, Dumbbell, BarChart3, Sunrise, Sun, Moon, Church, Sprout, Check |

## 제작 우선순위 제안

1. **P0 공통 조작 20종**: ChevronLeft/Right/Down/Up, Plus, X, Check, Trash2, Pencil, Play, Pause, Timer, Clock, Bell, Lock, Eye/EyeOff, Calendar, Share2, Camera
2. **P1 브랜드 핵심 18종**: 하단 내비 4종과 Target, Flame, Church, Dumbbell, BookOpen, BarChart3, Sprout, Sparkles, Heart, Star, Sunrise, Sun, Moon, Zap
3. **P2 화면 특화 36종**: 나머지 상태·소모임·보상·통계 아이콘

## 참고

- `src/icons.tsx`가 기능 아이콘의 단일 진입점이므로, 새 손그림 세트도 같은 이름과 props(`size`, `strokeWidth`, `className`)를 유지하면 화면 코드를 대규모로 수정하지 않고 교체할 수 있다.
- `src/assets/icons/`의 SVG 42개는 현재 사용되지 않는다. 새 세트 제작 기준으로 삼기보다, 최종 교체 후 삭제 후보로 별도 검증하는 편이 안전하다.
- 진행률 원형 그래프용 inline SVG와 `BrandLogo` SVG는 기능 아이콘이 아니므로 제작 목록에서 제외했다.
