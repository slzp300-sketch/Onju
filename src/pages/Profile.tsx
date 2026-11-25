import { useState } from 'react';
import { User, Bell, ChevronRight, LogOut, CalendarDays, Clock } from '../icons';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import ConfirmModal from '../components/ui/ConfirmModal';
import SegmentedControl from '../components/ui/SegmentedControl';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore, THEME_TIERS } from '../store/themeStore';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { toast } from '../store/toastStore';
import BlockedUsers from '../components/groups/BlockedUsers';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout, deleteAccount } = useAuthStore();
  const { weekStartDay, setWeekStartDay, graceEndHour, setGraceEndHour } = useSettingsStore();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (loggingOut || deleting) return;
    setLoggingOut(true);
    const result = await logout();
    setLoggingOut(false);
    if (!result.success) toast.error(result.error ?? '로그아웃에 실패했어요.');
    else if (!useAuthStore.getState().isAuthenticated) navigate('/login', { replace: true });
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (result.success) {
      setDeleteOpen(false);
      if (!useAuthStore.getState().isAuthenticated) navigate('/login', { replace: true });
    } else {
      toast.error(result.error ?? '계정 삭제에 실패했어요.');
    }
  };

  return (
    <div className="profile-paper flex min-h-full flex-col gap-4 pb-4">
      <header className="px-5 pt-5">

        <h1 className="mt-0.5 text-heading1 font-bold text-label-strong font-brand">마이페이지</h1>
      </header>

      <Card className="profile-hero mx-4">
        <div className="flex items-center gap-3">
          <div className="profile-avatar w-12 h-12 shrink-0 rounded-full border border-primary/15 bg-primary-soft flex items-center justify-center shadow-emphasize">
            <User size={22} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-body1 font-bold text-label-strong break-words">{user!.name}</p>
            <p className="text-caption1 text-label-alt break-all">{user!.email}</p>
          </div>
        </div>
      </Card>

      <section className="mx-4">
        <h2 className="mb-2 px-1 text-label2 font-bold text-label-strong">생활 설정</h2>
      <Card className="profile-settings-card" padding="none">
        {/* 주 시작 요일 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <CalendarDays size={16} className="text-label-alt" />
            <span className="text-body2 font-semibold text-label-strong">주 시작 요일</span>
          </div>
          <SegmentedControl value={String(weekStartDay) as '0' | '1'}
            onChange={value => setWeekStartDay(Number(value) as 0 | 1)} label="주 시작 요일"
            items={[{ label: '월', value: '1' }, { label: '일', value: '0' }]} className="w-28" />
        </div>
        <div className="h-px bg-line-soft mx-4" />
        {/* 전날 체크 마감 시각 */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3 mb-2.5">
            <Clock size={16} className="text-label-alt" />
            <div>
              <span className="text-body2 font-semibold text-label-strong">전날 체크 마감 시각</span>
              <p className="text-caption2 text-label-assistive mt-0.5">이 시각까지 어제 루틴·습관을 마저 체크할 수 있어요</p>
            </div>
          </div>
          <SegmentedControl value={String(graceEndHour) as '0' | '3' | '6'}
            onChange={value => setGraceEndHour(Number(value))} label="전날 체크 마감 시각"
            items={[{ label: '없음', value: '0' }, { label: '새벽 3시', value: '3' }, { label: '새벽 6시', value: '6' }]} />
        </div>
        <div className="h-px bg-line-soft mx-4" />
        <MenuItem icon={<CalendarDays size={16} />} label="보관한 습관·루틴" onClick={() => navigate('/archive')} />
        <MenuItem icon={<Bell size={16} />} label="알림 설정" onClick={() => navigate('/notification-settings')} />
      </Card>
      </section>

      {/* 숲 테마 — 보상 트랙으로 이동 */}
      <ThemeEntryCard />
      <BlockedUsers />

      <section className="mx-4 mb-2">
        <h2 className="mb-2 px-1 text-label2 font-bold text-label-strong">계정</h2>
        <Card className="profile-account-card" padding="none">
          <button onClick={() => void handleLogout()} disabled={loggingOut || deleting}
            className="w-full flex min-h-12 items-center gap-3 px-4 py-3.5 text-left hover:bg-fill transition-colors">
            <LogOut size={16} className="text-label-alt" />
            <span className="text-body2 text-label flex-1">{loggingOut ? '로그아웃 중…' : '로그아웃'}</span>
          </button>
          <div className="h-px bg-line-soft mx-4" />
          <button onClick={() => setDeleteOpen(true)}
            className="w-full min-h-12 px-4 py-3.5 text-left text-caption1 text-negative hover:bg-negative/5 transition-colors">
            계정과 모든 기록 영구 삭제
          </button>
        </Card>
      </section>

      <nav aria-label="이용 안내" className="mx-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-caption1 text-label-alt">
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">이용약관</a>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">개인정보처리방침</a>
        <a href="/delete-account.html" target="_blank" rel="noopener noreferrer" className="py-2 underline">계정 삭제 안내</a>
      </nav>

      <ConfirmModal
        isOpen={deleteOpen}
        title="계정을 삭제할까요?"
        message="인증 사진과 모든 루틴·목표·기록이 영구적으로 삭제되며 복구할 수 없어요. 내가 만든 소모임도 함께 삭제돼요. 처리 중 실패하면 일부 사진이 삭제된 상태일 수 있으니 다시 시도해주세요."
        confirmLabel={deleting ? '삭제 중…' : '영구 삭제'}
        cancelLabel="취소"
        onConfirm={() => void handleDeleteAccount()}
        onCancel={() => { if (!deleting) setDeleteOpen(false); }}
      />
    </div>
  );
}

/** 숲 테마 엔트리 — 현재 테마·해금 현황 요약 후 보상 트랙 페이지로 이동 */
function ThemeEntryCard() {
  const navigate = useNavigate();
  const theme = useThemeStore(s => s.theme);
  const growth = useTreeGrowth();
  const current = THEME_TIERS.find(t => t.id === theme) ?? THEME_TIERS[0];
  const unlockedCount = THEME_TIERS.filter(t => growth.stage >= t.requiredStage).length;
  const nextTier = THEME_TIERS.find(t => t.requiredStage === growth.stage + 1);
  const remaining = growth.nextThreshold !== null ? growth.nextThreshold - growth.points : 0;

  return (
    <Card className="profile-theme-card mx-4" padding="none">
      <button
        onClick={() => navigate('/themes')}
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-fill transition-colors rounded-2xl"
      >
        <div
          className="w-11 h-11 rounded-xl border flex flex-col items-center justify-center gap-1 flex-shrink-0"
          style={{ backgroundColor: current.preview.bg, borderColor: `${current.preview.accent}33` }}
        >
          <div className="w-5 h-1.5 rounded-full" style={{ backgroundColor: current.preview.leaf }} />
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: current.preview.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body2 font-semibold text-label-strong">숲 테마</p>
            <span className="text-caption2 font-bold text-primary bg-primary-soft px-1.5 py-0.5 rounded-md">
              {unlockedCount}/{THEME_TIERS.length} 해금
            </span>
          </div>
          <p className="text-caption1 text-label-assistive mt-0.5 break-words">
            '{current.name}' 적용 중{nextTier ? ` · 다음 보상 '${nextTier.name}'까지 ${remaining}pt` : ' · 모든 테마 해금 완료'}
          </p>
        </div>
        <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
      </button>
    </Card>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-fill transition-colors">
      <span className="text-label-alt">{icon}</span>
      <span className="text-body2 text-label flex-1">{label}</span>
      <ChevronRight size={16} className="text-label-assistive" />
    </button>
  );
}
