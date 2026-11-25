import { readDraft } from '../lib/localDrafts';
import { useAuthStore } from '../store/authStore';
import type { DailyRoutine } from '../types';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { routineDraftBase, isFaithDraft, type FaithDraft } from '../utils/formDrafts';
import FormBoundary from '../components/FormBoundary';
import { useFormProtection } from '../hooks/useFormProtection';
import { useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Timer, Church, Pencil, Bell, Calendar, Zap, Lightbulb, Target, Sunrise, Sun, Moon } from '../icons';
import type { LucideIcon } from '../icons';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import DurationPickerSheet from '../components/ui/DurationPickerSheet';
import { AlarmTimeSheet, AlarmTypeSheet } from '../components/ui/HabitAlarmSheet';
import { fmtDuration } from '../utils/duration';
import { to12h } from '../utils/alarmTime';
import { format } from 'date-fns';
import { useRoutineStore } from '../store/routineStore';
import { useNotificationStore } from '../store/notificationStore';
import { useGoalStore } from '../store/goalStore';
import Switch from '../components/ui/Switch';
import type { TimeSlot } from '../types';
import { WEEKDAY_LABELS } from '../types';
import { faithRoutineTemplates } from '../data/faithTemplates';
import { newId, isUuid } from '../utils/id';
import { requestNotifPermission } from '../lib/notifyPermission';
import { toast } from '../store/toastStore';
import { canLinkMonthlyGoal } from '../utils/goalRules';

const tap   = { whileTap: { scale: 0.96 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };
const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const TIME_SLOTS: { value: TimeSlot; label: string; icon: LucideIcon }[] = [
  { value: 'morning', label: '아침', icon: Sunrise },
  { value: 'afternoon', label: '점심', icon: Sun },
  { value: 'evening', label: '저녁', icon: Moon },
];

const TEMPLATE_EMOJI: Record<string, string> = {
  '기도': '🙏', '말씀': '📖', '감사 일기': '📝', '정체성 점검': '✅',
  '중보기도 메모': '📿', '저녁 되돌아보기': '🌙',
};

type Mode = 'choose' | 'template' | 'template-config' | 'custom';
type HabitFreq = 'daily' | 'weekdays' | 'weekends' | 'custom';
const FREQ_OPTIONS: { value: HabitFreq; label: string }[] = [
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일' },
  { value: 'weekends', label: '주말' },
  { value: 'custom', label: '직접 선택' },
];

export default function FaithRoutineNew() {
  const { id } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  const target = params.get('goal');
  const validGoal = useGoalStore(s => s.monthlyGoals.some(g => g.id === target && canLinkMonthlyGoal(g, 'faith', format(new Date(), 'yyyy-MM-dd'))));
  const owner = useAuthStore(s => s.user?.id);
  const exists = useRoutineStore(s => s.faithRoutines.some(item => item.id === id));
  let fallback: DailyRoutine | undefined;
  if (id && owner && !exists) {
    try { const saved = readDraft(owner, `faith-routine:${id}`, isFaithDraft); if (saved) fallback = routineDraftBase(saved.values, id); } catch { /* The draft hook reports storage errors. */ }
  }
  return <FormBoundary id={id ?? target ?? undefined} exists={id ? exists || !!fallback : !target || validGoal}><FaithRoutineNewEditor fallback={fallback} /></FormBoundary>;
}

function FaithRoutineNewEditor({ fallback }: { fallback?: DailyRoutine }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const { faithRoutines, addRoutine, updateRoutine } = useRoutineStore();
  const { setPermission } = useNotificationStore();
  const { monthlyGoals } = useGoalStore();
  const [params] = useSearchParams();
  const sourceGoal = monthlyGoals.find(g => g.id === params.get('goal'));
  const plan = sourceGoal?.goalRoutines?.[0];

  // 목표 상세 "습관으로 만들기" 프리필
  const legacyPrefill = (location.state as { prefill?: {
    title?: string; when?: string; twoMinuteHabit?: string; goalId?: string;
  } } | null)?.prefill;
  const prefill = sourceGoal ? { title: plan?.title, when: [plan?.when, plan?.where].filter(Boolean).join(' · '), twoMinuteHabit: plan?.twoMinuteHabit, goalId: sourceGoal.id } : legacyPrefill;

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const existing = id ? faithRoutines.find(r => r.id === id) ?? fallback : null;
  const linkableFaithGoals = monthlyGoals.filter(
    g => canLinkMonthlyGoal(g, 'faith', todayIso, existing?.goalId)
  );

  const isEdit = !!existing;
  const [baseRoutine, setBaseRoutine] = useState(existing ?? undefined);

  const [mode, setMode] = useState<Mode>(isEdit || prefill ? 'custom' : 'choose');

  // 기본 필드
  const [goalId, setGoalId] = useState<string | undefined>(existing?.goalId ?? prefill?.goalId);
  const [title, setTitle]   = useState(existing?.title ?? prefill?.title ?? '');
  const [emoji, setEmoji]   = useState(existing?.emoji ?? '');
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(existing?.timeSlot ?? null);

  // 반복 주기
  const [freq, setFreq] = useState<HabitFreq>(() => {
    const f = existing?.frequency;
    if (!f || f === 'daily') return 'daily';
    if (f === 'weekdays') return 'weekdays';
    if (f === 'weekends') return 'weekends';
    return 'custom';
  });
  const [customDays, setCustomDays] = useState<number[]>(
    Array.isArray(existing?.frequency) ? existing.frequency as number[] : []
  );

  // 언제
  const [when, setWhen] = useState(existing?.when ?? prefill?.when ?? '');

  // 2분 트리거
  const [twoMinEnabled, setTwoMinEnabled] = useState(!!(existing?.twoMinuteHabit) || !!prefill?.twoMinuteHabit);
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existing?.twoMinuteHabit ?? prefill?.twoMinuteHabit ?? '');

  // 타이머
  const [timerEnabled, setTimerEnabled] = useState(!!(existing?.durationSeconds));
  const [durationSeconds, setDurationSeconds] = useState(existing?.durationSeconds ?? 60);
  const [showDurationSheet, setShowDurationSheet] = useState(false);

  // 알림
  const [notifEnabled, setNotifEnabled] = useState(existing?.notification?.enabled ?? false);
  const [notifType, setNotifType] = useState<'push' | 'sound'>(existing?.notification?.type ?? 'push');
  const [notifTimes, setNotifTimes] = useState<string[]>(existing?.notification?.times ?? ['09:00']);
  const [editingIdx, setEditingIdx] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [entityId, setEntityId] = useState<string>(() => isUuid(plan?.id) && !faithRoutines.some(r => r.id === plan?.id) ? plan.id : newId());
  const values: FaithDraft = { baseRoutine, entityId, title, emoji, goalId, timeSlot, mode, freq, customDays, when, miniRoutine: '', twoMinEnabled, twoMinuteHabit, timerEnabled, durationSecs: durationSeconds, notifEnabled, notifType, notifTimes };
  const draft = useLocalDraft({ document: `faith-routine:${id ?? (sourceGoal ? `new:goal:${sourceGoal.id}` : 'new')}`, values, validate: isFaithDraft, restore: v => {
    setBaseRoutine(v.baseRoutine?.id === id ? v.baseRoutine : existing ? { ...existing, revision: undefined } : undefined);
    setEntityId(v.entityId); setTitle(v.title); setEmoji(v.emoji); setTimeSlot(v.timeSlot); setMode(v.mode);
    setGoalId(v.goalId && linkableFaithGoals.some(g => g.id === v.goalId) ? v.goalId : undefined);
    if (v.goalId && !linkableFaithGoals.some(g => g.id === v.goalId)) toast.error('이전에 연결한 목표가 없어 목표 연결을 해제했어요.');
    setFreq(v.freq); setCustomDays(v.customDays); setWhen(v.when); setTwoMinEnabled(v.twoMinEnabled); setTwoMinuteHabit(v.twoMinuteHabit);
    setTimerEnabled(v.timerEnabled); setDurationSeconds(v.durationSecs); setNotifEnabled(v.notifEnabled); setNotifType(v.notifType); setNotifTimes(v.notifTimes);
  } });
  const protection = useFormProtection(values, draft.leaveMessage);
  const leave = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/'); };

  const handleToggleNotif = () => {
    if (notifEnabled) { setNotifEnabled(false); return; }
    // 켤 때: 권한 요청 (네이티브/웹 공통 추상화)
    void requestNotifPermission().then(perm => {
      setPermission(perm);
      if (perm === 'granted') setNotifEnabled(true);
      else if (perm === 'denied') toast.error('설정에서 알림 권한을 허용해주세요.');
    }).catch(() => toast.error('알림 권한을 확인하지 못했어요. 다시 시도해주세요.'));
  };

  const handleBack = () => {
    if (isEdit) { protection.requestLeave(leave); return; }
    if (mode === 'choose') { protection.requestLeave(leave); return; }
    if (mode === 'template-config') { setMode('template'); return; }
    setMode('choose');
  };

  const handleSave = () => {
    if (draft.awaitingChoice || !title.trim()) return;
    if (goalId && !monthlyGoals.some(g => g.id === goalId && canLinkMonthlyGoal(g, 'faith', format(new Date(), 'yyyy-MM-dd'), existing?.goalId))) {
      toast.error('선택한 목표가 없어졌거나 연결할 수 없어요. 목표를 다시 선택하거나 연동 안 함을 선택해주세요.'); return;
    }
    if (freq === 'custom' && customDays.length === 0) { toast.error('반복할 요일을 하나 이상 선택해주세요.'); return; }
    const frequency = freq === 'custom' ? customDays : freq;
    const notification = notifEnabled
      ? { enabled: true, type: notifType, times: notifTimes }
      : undefined;

    const fields = {
      title: title.trim(), emoji, frequency,
      ...(timeSlot ? { timeSlot } : { timeSlot: undefined }),
      ...(timerEnabled ? { durationSeconds } : { durationSeconds: undefined }),
      when: when.trim() || undefined,
      twoMinuteHabit: twoMinEnabled ? twoMinuteHabit.trim() || undefined : undefined,
      notification,
      goalId: goalId || undefined,
    };

    if (!protection.save(() => {
      if (isEdit && existing) {
        updateRoutine(existing.id, fields, baseRoutine);
      } else {
        addRoutine({
          id: entityId, userId: '',
          type: 'faith', isActive: true,
          order: faithRoutines.length, createdAt: new Date().toISOString(),
          ...fields,
        });
      }
      draft.clear();
    })) return;
    if (sourceGoal) navigate(`/goals/${sourceGoal.id}/connect`, { replace: true }); else leave();
  };

  const selectTemplate = (t: typeof faithRoutineTemplates[0]) => {
    if (faithRoutines.find(r => r.title === t.title)) return;
    setTitle(t.title);
    setEmoji(TEMPLATE_EMOJI[t.title] ?? '🙏');
    setTimeSlot(null);
    setTimerEnabled(false);
    setDurationSeconds(60);
    setMode('template-config');
  };

  const pageTitle = isEdit ? '신앙 루틴 수정'
    : mode === 'template-config' ? '루틴 설정'
    : '신앙 루틴 추가';

  return (
    <div className="form-paper min-h-dvh flex flex-col">
      {protection.guard}
      {(fallback || existing?.archivedAt) && <p role="status" className="p-4 bg-primary-soft text-body2">보관되었거나 목록에서 사라진 항목의 입력이에요. 저장 시 원래 버전과 서버 내용을 비교하며, 수행 기록은 유지해요.</p>}
      {/* 헤더 */}
      <div className="form-paper-header flex items-center px-4 pt-5 pb-3 flex-shrink-0">
        <motion.button {...tapSm} onClick={handleBack} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">{pageTitle}</h1>
        <div className="w-8" />
      </div>

      <div className="px-4 pt-3">{draft.banner}</div>
      <fieldset disabled={draft.awaitingChoice} className="contents">
      {/* ── 선택 화면 ── */}
      {mode === 'choose' && !isEdit && (
        <div className="flex-1 px-4 py-8 flex flex-col gap-4">
          <p className="text-caption1 text-label-alt text-center mb-2">추가 방법을 선택해 주세요</p>
          <motion.button {...tap} onClick={() => setMode('template')}
            className="bg-surface border border-line rounded-xl px-5 py-5 text-left hover:bg-fill transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <Church size={24} strokeWidth={1.9} className="text-label-strong" />
              <p className="text-body1 font-bold text-label-strong">템플릿 선택</p>
            </div>
            <p className="text-body2 text-label-alt">추천 신앙 루틴 중에서 골라보세요</p>
          </motion.button>
          <motion.button {...tap} onClick={() => setMode('custom')}
            className="bg-surface border border-line rounded-xl px-5 py-5 text-left hover:bg-fill transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <Pencil size={24} strokeWidth={1.9} className="text-label-strong" />
              <p className="text-body1 font-bold text-label-strong">직접 입력</p>
            </div>
            <p className="text-body2 text-label-alt">나만의 신앙 루틴을 직접 만들어요</p>
          </motion.button>
        </div>
      )}

      {/* ── 템플릿 목록 ── */}
      {mode === 'template' && (
        <div className="flex-1 px-4 py-5 flex flex-col gap-3 pb-8">
          <p className="text-caption1 text-label-alt">탭해서 세부 설정 후 추가하세요</p>
          {faithRoutineTemplates.map(t => {
            const already = !!faithRoutines.find(r => r.title === t.title);
            return (
              <motion.button key={t.id} {...tap} onClick={() => selectTemplate(t)} disabled={already}
                className={`bg-surface border rounded-xl px-4 py-4 text-left transition-all ${already ? 'border-line opacity-40 cursor-not-allowed' : 'border-line hover:border-primary hover:bg-primary-soft/40'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{TEMPLATE_EMOJI[t.title] ?? '🙏'}</span>
                    <div>
                      <p className="text-body2 font-bold text-label-strong">{t.title}</p>
                      <p className="text-caption1 text-label-alt mt-0.5">{t.description}</p>
                    </div>
                  </div>
                  {already
                    ? <span className="text-caption1 text-positive font-medium flex-shrink-0">추가됨</span>
                    : <Check size={18} className="text-label-assistive flex-shrink-0" />}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── 설정 화면 ── */}
      {(mode === 'template-config' || mode === 'custom' || isEdit) && (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-5 flex flex-col gap-4 pb-28">

              {/* 이름 */}
              <div>
                <p className="text-caption1 font-bold text-label-alt mb-2">루틴 이름</p>
                <div className="flex gap-2">
                  <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
                  <input aria-label="루틴 이름" type="text" value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="신앙 루틴 이름" autoFocus
                    className="form-paper-input flex-1 text-body2 font-medium" />
                </div>
              </div>

              {/* 반복 주기 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar size={20} strokeWidth={1.9} className="text-label-strong" />
                    <span className="text-body2 font-semibold text-label-strong">반복 주기</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {FREQ_OPTIONS.map(f => (
                      <motion.button key={f.value} {...tap} onClick={() => setFreq(f.value)}
                        className={`px-4 py-2 rounded-lg text-body2 font-medium border transition-all ${freq === f.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt bg-fill'}`}>
                        {f.label}
                      </motion.button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {freq === 'custom' && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="flex gap-1.5 mt-3">
                          {WEEKDAY_LABELS.map((label, idx) => (
                            <motion.button key={idx} {...tap}
                              onClick={() => setCustomDays(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx])}
                              className={`flex-1 py-2 rounded-lg text-caption1 font-bold border transition-all ${customDays.includes(idx) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt bg-fill'}`}>
                              {label}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <details className="quiet-details"><summary>추가 설정 · 시간대·목표·알림</summary><div className="space-y-5">
              {/* 알림 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell size={20} strokeWidth={1.9} className="text-label-strong" />
                      <span className="text-body2 font-semibold text-label-strong">알림</span>
                    </div>
                    <Switch checked={notifEnabled} onCheckedChange={() => handleToggleNotif()}
                      label="신앙 루틴 알림" tone="positive" size="md" />
                  </div>
                  <AnimatePresence>
                    {notifEnabled && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex flex-wrap items-center gap-2 flex-1 mr-2">
                            {notifTimes.map((t2, idx) => {
                              const { ampmIdx, hourIdx, minuteIdx } = to12h(t2);
                              return (
                                <motion.button key={idx} {...tapSm}
                                  onClick={() => { setEditingIdx(idx); setShowTimePicker(true); }}
                                  className="px-3 py-1.5 rounded-xl bg-fill border border-line text-body2 font-semibold text-label-strong">
                                  {ampmIdx === 0 ? '오전' : '오후'} {hourIdx + 1}:{String(minuteIdx).padStart(2, '0')}
                                </motion.button>
                              );
                            })}
                            <motion.button {...tapSm}
                              onClick={() => { const i = notifTimes.length; setNotifTimes(p => [...p, '09:00']); setEditingIdx(i); setShowTimePicker(true); }}
                              className="w-8 h-8 rounded-xl border border-dashed border-line flex items-center justify-center text-label-assistive text-lg">+</motion.button>
                          </div>
                          <motion.button {...tapSm} onClick={() => setShowTypePicker(true)}
                            className="flex items-center gap-1 text-body2 text-label-alt shrink-0">
                            <span>{notifType === 'push' ? '푸시' : '알림음'}</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 언제 할래요? 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <Check size={20} strokeWidth={1.9} className="text-label-strong" />
                  <span className="text-body2 font-semibold text-label-strong">언제 할래요?</span>
                </div>
                <input aria-label="언제 할래요?" type="text" value={when} onChange={e => setWhen(e.target.value)}
                  placeholder="예) 아침 기상 직후, 출근 전"
                  className="w-full bg-fill border border-line rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all" />
              </div>

              {/* 시간대 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden px-4 py-4">
                <p className="text-caption1 font-bold text-label-alt mb-3">시간대 (선택)</p>
                <div className="flex gap-2">
                  {TIME_SLOTS.map(ts => (
                    <motion.button key={ts.value} {...tap}
                      onClick={() => setTimeSlot(timeSlot === ts.value ? null : ts.value)}
                      className={`flex-1 py-2.5 rounded-lg text-body2 font-medium border transition-all inline-flex items-center justify-center gap-1.5 ${timeSlot === ts.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt'}`}>
                      <ts.icon size={15} strokeWidth={1.9} /> {ts.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 목표 연동 카드 */}
              {(linkableFaithGoals.length > 0 || goalId) && (
                <div className="bg-surface rounded-xl border border-line overflow-hidden">
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Target size={20} strokeWidth={1.9} className="text-label-strong" />
                      <div>
                        <p className="text-body2 font-semibold text-label-strong">월간 목표 연동</p>
                        <p className="text-caption1 text-label-alt">연결 변경은 저장한 날짜부터 반영돼요. 이전 연결 이력과 수행 기록은 유지돼요.</p>
                        {existing?.goalId === goalId && monthlyGoals.some(g => g.id === goalId && (g.category !== 'faith' || g.endDate < todayIso)) && <p className="text-caption1 text-label-alt mt-1">목표의 분류·기간이 바뀌어도 기존 연결을 유지할 수 있어요. 이 항목은 신앙 루틴으로 남아요.</p>}
                        {goalId && !linkableFaithGoals.some(g => g.id === goalId) && <p className="text-caption1 text-label-alt mt-1">현재 선택: {monthlyGoals.find(g => g.id === goalId)?.title ?? '삭제된 목표'} · 새 목표를 고르거나 연결을 해제할 수 있어요.</p>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <motion.button {...tapSm}
                        onClick={() => setGoalId(undefined)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                          !goalId ? 'border-primary bg-primary-soft' : 'border-line bg-fill'
                        }`}>
                        <span className={`text-caption1 font-semibold ${!goalId ? 'text-primary' : 'text-label-alt'}`}>연동 안 함</span>
                      </motion.button>
                      {linkableFaithGoals.map(g => (
                        <motion.button key={g.id} {...tapSm}
                          onClick={() => setGoalId(g.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                            goalId === g.id ? 'border-primary bg-primary-soft' : 'border-line bg-fill'
                          }`}>
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: g.color ?? 'var(--color-primary)' }} />
                          <p className={`text-caption1 font-semibold truncate flex-1 text-left ${
                            goalId === g.id ? 'text-primary' : 'text-label'
                          }`}>{g.title}</p>
                          {goalId === g.id && (
                            <span className="text-caption2 text-primary font-bold flex-shrink-0 inline-flex items-center gap-0.5"><Check size={13} strokeWidth={1.9} /> 연동됨</span>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2분 트리거 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Zap size={20} strokeWidth={1.9} className="text-label-strong" />
                      <div>
                        <p className="text-body2 font-semibold text-label-strong">2분 트리거</p>
                        <p className="text-caption1 text-label-alt">루틴 시작을 쉽게 만드는 작은 행동</p>
                      </div>
                    </div>
                    <Switch checked={twoMinEnabled} onCheckedChange={setTwoMinEnabled}
                      label="2분 트리거" tone="positive" />
                  </div>
                  <AnimatePresence>
                    {twoMinEnabled && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-3">
                        <input aria-label="2분 트리거 습관" type="text" value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                          placeholder="예: 성경책 펼치기, 묵상 앱 열기"
                          className="form-paper-field w-full px-3 py-2.5" />
                        <p className="text-caption2 text-label-alt mt-1.5 flex items-center gap-1"><Lightbulb size={13} strokeWidth={1.9} /> 트리거 완료 후 루틴으로 이어져요</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 타이머 카드 */}
              <div className="bg-surface rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Timer size={20} className="text-primary" />
                      <div>
                        <p className="text-body2 font-semibold text-label-strong">타이머</p>
                        <p className="text-caption1 text-label-alt">이 루틴 실행 시 카운트다운</p>
                      </div>
                    </div>
                    <Switch checked={timerEnabled} onCheckedChange={setTimerEnabled} label="타이머" />
                  </div>
                  <AnimatePresence>
                    {timerEnabled && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        className="overflow-hidden border-t border-line-soft mt-3">
                        <div className="pt-3">
                          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowDurationSheet(true)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-fill rounded-xl border border-line">
                            <span className="text-body2 text-label-alt">설정 시간</span>
                            <span className="text-body2 font-bold text-primary">{fmtDuration(durationSeconds)}</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              </div></details>
            </div>
          </div>

          {/* 하단 저장 버튼 */}
          <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
            style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
            <motion.button whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
              onClick={handleSave} disabled={draft.awaitingChoice || !title.trim() || (freq === 'custom' && customDays.length === 0)}
              className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors">
              {isEdit ? '수정 완료' : '시작하기'}
            </motion.button>
          </div>

          {/* 타이머 시트 */}
          <DurationPickerSheet isOpen={showDurationSheet} seconds={durationSeconds}
            onConfirm={setDurationSeconds} onClose={() => setShowDurationSheet(false)} />

          {/* 알림 시트 */}
          <AlarmTimeSheet
            isOpen={showTimePicker}
            time={notifTimes[editingIdx] ?? '09:00'}
            onChange={t => setNotifTimes(prev => prev.map((old, i) => i === editingIdx ? t : old))}
            onDelete={() => {
              const next = notifTimes.filter((_, i) => i !== editingIdx);
              setNotifTimes(next.length > 0 ? next : ['09:00']);
              if (next.length === 0) setNotifEnabled(false);
            }}
            onClose={() => setShowTimePicker(false)}
          />
          <AlarmTypeSheet isOpen={showTypePicker} type={notifType}
            onChange={setNotifType} onClose={() => setShowTypePicker(false)} />
        </>
      )}
      </fieldset>
    </div>
  );
}
