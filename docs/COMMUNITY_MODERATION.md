# 온주 모바일 소모임 신고 처리

2026-10-27 작성. 이 문서는 새 소모임 안전 기능의 운영 절차다. 현재 운영 DB에 마이그레이션을 적용하거나 신고를 처리한 기록은 아니다.

## 적용 전제

- `202610270001_mobile_community_safety.sql`을 대상 DB에서 검증·적용하고 새 앱과 함께 테스트한다.
- 일반 사용자에게 운영 권한을 부여하지 않는다. 신고 조회·처리에는 Supabase 관리자 콘솔의 승인된 운영자 접근을 사용한다. 서비스 키를 앱에 넣지 않는다.
- 운영 담당자가 대기 신고를 정기적으로 확인해야 한다. 현재 이메일·푸시 자동 통보나 별도 관리자 화면은 구현하지 않았다.

## 신고 확인

관리자 SQL Editor에서 다음과 같이 대기 목록을 조회한다.

```sql
select id, target_type, target_id, group_id, target_user_id,
       reason, status, created_at
from public.content_reports
where status in ('pending', 'reviewing')
order by created_at;
```

일반 이용자는 자기 신고만 조회할 수 있고 처리 상태를 변경할 수 없다. 대상 작성자와 소모임은 신고 RPC가 서버에서 확인한다. 같은 사람이 같은 대상을 다시 신고해도 접수 건수는 늘어나지 않는다.

| target_type | 확인할 대상 |
| --- | --- |
| group | `small_groups.id` |
| member | 해당 `group_members.group_id`와 `user_id` |
| weekly_share | `group_weekly_shares.id` |
| routine_share | `shared_routines.id` |
| proof | `routine_proofs.id`와 `photo_path` |

신고 사유 코드는 harassment(괴롭힘·혐오), sexual(음란·폭력·불법), spam(광고·사기), privacy(개인정보 노출), other(기타)다. 신고 대상과 맥락을 확인하고 운영자만 접근할 수 있는 기록에 판단과 조치 근거를 남긴다. 현재 신고 테이블은 원본 글·사진의 스냅샷을 보관하지 않으므로 원본이 삭제되면 확인할 수 없는 경우가 있다.

## 조치와 완료

1. 처리할 신고의 정확한 ID를 확인해 `reviewing`으로 바꾼다.
2. 이용수칙 위반 여부를 확인한다. 위반 시 대상 콘텐츠 삭제 또는 서비스 이용 제한 등 필요한 조치를 한다. 신고만으로 자동 삭제하거나 자동 정지하지 않는다.
3. 인증 사진을 제거할 때는 **Storage API**를 사용한다. 같은 파일을 여러 소모임 인증이 참조할 수 있으므로 다른 참조를 확인한다. `storage.objects` 행을 SQL로 지우면 실제 파일이 남을 수 있다.
4. 실제 조치를 끝냈으면 해당 신고를 `resolved`, 위반이 아니거나 대상 확인이 불가능하면 근거를 남긴 뒤 `dismissed`로 바꾼다. 일반 사용자에게 신고자 정보나 관리자 권한을 공개하지 않는다.

상태 변경은 관리자 콘솔에서 정확한 ID를 넣어 실행한다. 아래는 실행 예시 형식이며 이 문서 작성 중 수행하지 않았다.

```sql
update public.content_reports
set status = 'reviewing'
where id = '<확인한 신고 UUID>'::uuid and status = 'pending';
```

사용자 차단은 운영 조치와 별개다. 차단 당사자 사이의 게시물·인증·멤버 집계는 서버에서 필터링하고, 앱의 차단 목록은 본인만 관리한다. 이미 내려받은 자료나 내 루틴으로 담아간 사본을 원격으로 회수하는 기능은 없다.

## 배포 전 확인

- 두 테스트 계정으로 신고 접수·중복 신고·잘못된 대상 거부·본인 신고 조회를 확인한다.
- 차단 후 상대방의 나눔·공유 루틴·인증 사진·멤버 현황과 공개 모임이 숨겨지는지 확인한다. 로그아웃·재실행·다른 기기에서도 확인한다.
- 마이페이지에서 차단 해제 후 화면이 복원되는지 확인한다.
- 운영자가 대기 신고를 조회하고 조치·상태 갱신할 수 있는지 확인한다.

Google Play의 [UGC 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)은 이용수칙 동의, 신고·차단과 지속적인 콘텐츠 관리를 요구한다. 위 기능을 구현했다는 사실만으로 운영 준비나 스토어 정책 충족을 완료 처리하지 않는다.
