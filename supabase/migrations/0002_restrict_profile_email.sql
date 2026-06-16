-- 0002: profiles.email 노출 차단
-- 적용: Supabase 대시보드 SQL Editor에서 실행 (또는 supabase db push)
--
-- 배경: 0001의 profiles_select 정책이 using(true)라, 인증된 사용자 누구나
--       타인의 email까지 조회 가능했다 (프라이버시 노출).
--       그룹 화면에서 필요한 건 name / profile_image 뿐이다.
-- 조치: 컬럼 단위 SELECT 권한으로 email만 비공개화한다.
--       행 정책(using true)은 그대로 둬서 이름/이미지 임베드 조인
--       (group_weekly_shares -> profiles(name))은 계속 동작한다.
--
-- ⚠️ 적용 순서: 앱 코드(authStore가 profiles를 select('*') 하지 않도록 한 변경)를
--    먼저 배포한 뒤 이 마이그레이션을 실행한다. 기존 배포본은 select('*')라
--    email 컬럼 권한이 막히면 프로필 조회가 깨진다.

revoke select on public.profiles from anon, authenticated;

grant select (id, name, profile_image, weekly_goal_slots, goal_slots, onboarding_done, created_at)
  on public.profiles to authenticated;
