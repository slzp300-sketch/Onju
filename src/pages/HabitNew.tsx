import { readDraft } from '../lib/localDrafts';
import { useAuthStore } from '../store/authStore';
import type { Habit } from '../types';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { habitDraftBase, isHabitDraft, type HabitDraft } from '../utils/formDrafts';
import FormBoundary from '../components/FormBoundary';
import { useFormProtection } from '../hooks/useFormProtection';
import { useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Target, Bell, Calendar, Check, Zap, Lightbulb, Flame } from '../icons';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import { format } from 'date-fns';
import { AlarmTimeSheet, AlarmTypeSheet } from '../components/ui/HabitAlarmSheet';
import { to12h } from '../utils/alarmTime';
import DurationPickerSheet from '../components/ui/DurationPickerSheet';
import { fmtDuration } from '../utils/duration';
import { Timer } from '../icons';
import { useNotificationStore } from '../store/notificationStore';
import Switch from '../components/ui/Switch';

const tap = { whileTap: { scale: 0.98 }, transition: { duration: 0.12 } };
const tapSm = { whileTap: { scale: 0.92 }, transition: { duration: 0.1 } };
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import type { HabitFrequency } from '../types';
import { WEEKDAY_LABELS } from '../types';
import { newId, isUuid } from '../utils/id';
import { requestNotifPermission } from '../lib/notifyPermission';
import { toast } from '../store/toastStore';
import { canLinkMonthlyGoal } from '../utils/goalRules';

const FREQ_OPTIONS: { value: HabitFrequency; label: string; desc: string }[] = [
  { value: 'daily', label: '매일', desc: '매일 반복' },
  { value: 'weekdays', label: '평일', desc: '월~금 반복' },
  { value: 'weekends', label: '주말', desc: '토~일 반복' },
  { value: 'custom', label: '직접 선택', desc: '요일 선택' },
];

export default function HabitNew() {
  const { id } = useParams<{ id?: string }>();
  const [params] = useSearchParams();
  const target = params.get('goal');
  const validGoal = useGoalStore(s => s.monthlyGoals.some(g => g.id === target && canLinkMonthlyGoal(g, 'personal', format(new Date(), 'yyyy-MM-dd'))));
  const owner = useAuthStore(s => s.user?.id);
  const exists = useHabitStore(s => s.habits.some(item => item.id === id));
  let fallback: Habit | undefined;
  if (id && owner && !exists) {
    try { const saved = readDraft(owner, `habit:${id}`, isHabitDraft); if (saved) fallback = habitDraftBase(saved.values, id); } catch { /* The draft hook reports storage errors. */ }
  }
  return <FormBoundary id={id ?? target ?? undefined} exists={id ? exists || !!fallback : !target || validGoal}><HabitNewEditor fallback={fallback} /></FormBoundary>;
}

function HabitNewEditor({ fallback }: { fallback?: Habit }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { habits, addHabit, updateHabit } = useHabitStore();
  const { monthlyGoals } = useGoalStore();
  const location = useLocation();
  const [params] = useSearchParams();
  const sourceGoal = monthlyGoals.find(g => g.id === params.get('goal'));
  const plan = sourceGoal?.goalRoutines?.[0];
  const existing = id ? habits.find(h => h.id === id) ?? fallback : null;
  const isEdit = !!existing;
  const [baseHabit, setBaseHabit] = useState(existing ?? undefined);

  // 목표 상세 "습관으로 만들기"에서 넘어온 프리필
  const legacyPrefill = (location.state as { prefill?: {
    title?: string; when?: string; miniRoutine?: string; twoMinuteHabit?: string; goalId?: string;
  } } | null)?.prefill;
  const prefill = sourceGoal ? { title: plan?.title, when: [plan?.when, plan?.where].filter(Boolean).join(' · '), miniRoutine: plan?.miniRoutine, twoMinuteHabit: plan?.twoMinuteHabit, goalId: sourceGoal.id } : legacyPrefill;

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  // 연동 가능한 개인 목표 (활성)
  const linkableGoals = monthlyGoals.filter(
    g => canLinkMonthlyGoal(g, 'personal', todayIso, existing?.goalId)
  );

  const { setPermission } = useNotificationStore();

  const [title, setTitle] = useState(existing?.title ?? prefill?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [freq, setFreq] = useState<HabitFrequency>(existing?.frequency ?? 'daily');
  const [customDays, setCustomDays] = useState<number[]>(existing?.customDays ?? []);
  const [when, setWhen] = useState(existing?.when ?? prefill?.when ?? '');
  const [goalId, setGoalId] = useState<string | undefined>(existing?.goalId ?? prefill?.goalId);
  const [miniRoutine, setMiniRoutine] = useState(existing?.miniRoutine ?? prefill?.miniRoutine ?? '');
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existing?.twoMinuteHabit ?? prefill?.twoMinuteHabit ?? '');
  const [twoMinEnabled, setTwoMinEnabled] = useState(!!(existing?.twoMinuteHabit) || !!prefill?.twoMinuteHabit);

  // 타이머
  const [timerEnabled, setTimerEnabled] = useState(!!(existing?.durationSeconds));
  const [durationSecs, setDurationSecs] = useState(existing?.durationSeconds ?? 300);
  const [showDurationSheet, setShowDurationSheet] = useState(false);

  // 알림
  const [notifEnabled, setNotifEnabled] = useState(existing?.notification?.enabled ?? false);
  const [notifType, setNotifType] = useState<'push' | 'sound'>(existing?.notification?.type ?? 'push');
  const [notifTimes, setNotifTimes] = useState<string[]>(existing?.notification?.times ?? ['09:00']);
  const [editingIdx, setEditingIdx] = useState<number>(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const [entityId, setEntityId] = useState<string>(() => isUuid(plan?.id) && !habits.some(h => h.id === plan?.id) ? plan.id : newId());
  const draftValues: HabitDraft = { baseHabit, entityId, title, emoji, freq, customDays, when, goalId, miniRoutine, twoMinuteHabit, twoMinEnabled, timerEnabled, durationSecs, notifEnabled, notifType, notifTimes };
  const draft = useLocalDraft({ document: `habit:${id ?? (sourceGoal ? `new:goal:${sourceGoal.id}` : 'new')}`, values: draftValues, validate: isHabitDraft, restore: v => {
    setBaseHabit(v.baseHabit?.id === id ? v.baseHabit : existing ? { ...existing, revision: undefined } : undefined);
    setEntityId(v.entityId); setTitle(v.title); setEmoji(v.emoji); setFreq(v.freq); setCustomDays(v.customDays); setWhen(v.when);
    setGoalId(v.goalId && linkableGoals.some(g => g.id === v.goalId) ? v.goalId : undefined);
    if (v.goalId && !linkableGoals.some(g => g.id === v.goalId)) toast.error('이전에 연결한 목표가 없어 목표 연결을 해제했어요. 내용을 확인해주세요.');
    setMiniRoutine(v.miniRoutine); setTwoMinuteHabit(v.twoMinuteHabit); setTwoMinEnabled(v.twoMinEnabled);
    setTimerEnabled(v.timerEnabled); setDurationSecs(v.durationSecs); setNotifEnabled(v.notifEnabled); setNotifType(v.notifType); setNotifTimes(v.notifTimes);
  } });
  const protection = useFormProtection(draftValues, draft.leaveMessage);
  const leave = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/'); };

  const handleToggleNotif = () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    // 켤 때: 권한 요청 (네이티브/웹 공통 추상화)
    void requestNotifPermission().then(perm => {
      setPermission(perm);
      if (perm === 'granted') setNotifEnabled(true);
      else if (perm === 'denied') toast.error('설정에서 알림 권한을 허용해주세요.');
    }).catch(() => toast.error('알림 권한을 확인하지 못했어요. 다시 시도해주세요.'));
  };

  const freqLabel = FREQ_OPTIONS.find(f => f.value === freq)?.label ?? '매일';
  const whenPlaceholder = '예) 8:00 / 출근길';

  const handleSubmit = () => {
    if (draft.awaitingChoice || !title.trim()) return;
    if (goalId && !monthlyGoals.some(g => g.id === goalId && canLinkMonthlyGoal(g, 'personal', format(new Date(), 'yyyy-MM-dd'), existing?.goalId))) {
      toast.error('선택한 목표가 없어졌거나 연결할 수 없어요. 목표를 다시 선택하거나 연동 안 함을 선택해주세요.'); return;
    }
    if (freq === 'custom' && customDays.length === 0) { toast.error('반복할 요일을 하나 이상 선택해주세요.'); return; }
    const data = {
      title: title.trim(), emoji, frequency: freq,
      ...(freq === 'custom' ? { customDays } : {}),
      when: when.trim(),
      goalId: goalId || undefined,
      durationSeconds: timerEnabled ? durationSecs : undefined,
      miniRoutine: miniRoutine.trim() || undefined,
      twoMinuteHabit: twoMinEnabled ? twoMinuteHabit.trim() || undefined : undefined,
      notification: notifEnabled
        ? { enabled: true, type: notifType, times: notifTimes }
        : undefined,
    };
    if (!protection.save(() => {
      if (isEdit && existing) {
        updateHabit(existing.id, data, baseHabit);
      } else {
        addHabit({ id: entityId, userId: '', createdAt: new Date().toISOString(), ...data });
      }
      draft.clear();
    })) return;
    if (sourceGoal) navigate(`/goals/${sourceGoal.id}/connect`, { replace: true }); else leave();
  };

  return (
    <div className="form-paper min-h-dvh flex flex-col">
      {protection.guard}
      {(fallback || existing?.archivedAt) && <p role="status" className="p-4 bg-primary-soft text-body2">보관되었거나 목록에서 사라진 항목의 입력이에요. 저장 시 원래 버전과 서버 내용을 비교하며, 수행 기록은 유지해요.</p>}
      {/* 헤더 */}
      <div className="form-paper-header flex items-center px-4 pt-5 pb-3">
        <motion.button {...tapSm} onClick={() => protection.requestLeave(leave)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '습관 수정하기' : '습관 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="px-4 pt-3">{draft.banner}</div>
      <fieldset disabled={draft.awaitingChoice} className="contents">
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* 습관 이름 */}
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-2">습관 이름</p>
          <div className="flex gap-2">
            <div className="relative">
              <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            </div>
            <input aria-label="습관 이름"
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="습관 이름을 입력하세요"
              className="form-paper-input flex-1 text-body2 font-medium"
              autoFocus
            />
          </div>
        </div>

        {/* 반복 주기 카드 */}
        <div className="form-paper-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar size={20} strokeWidth={1.9} className="text-label-strong" />
                <span className="text-body2 font-semibold text-label-strong">반복 주기</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-body2 text-label-alt">{freqLabel}</span>
                <ChevronRight size={16} className="text-label-assistive" />
              </div>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {FREQ_OPTIONS.map(f => (
                <motion.button key={f.value} {...tap} aria-pressed={freq === f.value} onClick={() => setFreq(f.value)}
                  className={`form-paper-choice px-4 py-2 rounded-lg text-body2 font-medium border transition-all ${freq === f.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt bg-fill'}`}>
                  {f.label}
                </motion.button>
              ))}
            </div>
            <AnimatePresence>
              {freq === 'custom' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="flex gap-1.5 mt-3">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <motion.button key={idx} {...tap} aria-label={`${label}요일`} aria-pressed={customDays.includes(idx)} onClick={() => setCustomDays(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx])}
                        className={`form-paper-choice flex-1 py-2 rounded-lg text-caption1 font-bold border transition-all ${customDays.includes(idx) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt bg-fill'}`}>
                        {label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <details className="quiet-details"><summary>추가 설정 · 목표·알림·타이머</summary><div className="space-y-5">
        {/* 월간 목표 연동 카드 */}
        {(linkableGoals.length > 0 || goalId) && (
          <div className="form-paper-card overflow-hidden">
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Target size={20} strokeWidth={1.9} className="text-label-strong" />
                <div>
                  <p className="text-body2 font-semibold text-label-strong">월간 목표 연동</p>
                  <p className="text-caption1 text-label-alt">연결 변경은 저장한 날짜부터 반영돼요. 이전 연결 이력과 수행 기록은 유지돼요.</p>
                  {existing?.goalId === goalId && monthlyGoals.some(g => g.id === goalId && (g.category === 'faith' || g.endDate < todayIso)) && <p className="text-caption1 text-label-alt mt-1">목표의 분류·기간이 바뀌어도 기존 연결을 유지할 수 있어요. 이 항목은 개인 습관으로 남아요.</p>}
                  {goalId && !linkableGoals.some(g => g.id === goalId) && <p className="text-caption1 text-label-alt mt-1">현재 선택: {monthlyGoals.find(g => g.id === goalId)?.title ?? '삭제된 목표'} · 새 목표를 고르거나 연결을 해제할 수 있어요.</p>}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {/* 연동 해제 */}
                <motion.button {...tapSm}
                  onClick={() => setGoalId(undefined)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                    !goalId ? 'border-primary bg-primary-soft' : 'border-line bg-fill'
                  }`}>
                  <span className={`text-caption1 font-semibold ${!goalId ? 'text-primary' : 'text-label-alt'}`}>연동 안 함</span>
                </motion.button>
                {/* 목표 선택 */}
                {linkableGoals.map(g => (
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

        {/* 알림 카드 */}
        <div className="form-paper-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell size={20} strokeWidth={1.9} className="text-label-strong" />
                <span className="text-body2 font-semibold text-label-strong">알림</span>
              </div>
              <Switch checked={notifEnabled} onCheckedChange={() => handleToggleNotif()}
                label="습관 알림" tone="positive" size="md" />
            </div>
            <AnimatePresence>
              {notifEnabled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex flex-wrap items-center gap-2 flex-1 mr-2">
                      {notifTimes.map((t, idx) => {
                        const { ampmIdx, hourIdx, minuteIdx } = to12h(t);
                        const label = `${ampmIdx === 0 ? '오전' : '오후'} ${hourIdx + 1}:${String(minuteIdx).padStart(2, '0')}`;
                        return (
                          <motion.button key={idx} {...tapSm}
                            onClick={() => { setEditingIdx(idx); setShowTimePicker(true); }}
                            className="px-3 py-1.5 rounded-xl bg-fill border border-line text-body2 font-semibold text-label-strong">
                            {label}
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
                      <ChevronRight size={16} className="text-label-assistive" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 언제 할래요? 카드 */}
        <div className="form-paper-card overflow-hidden px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Check size={20} strokeWidth={1.9} className="text-label-strong" />
            <span className="text-body2 font-semibold text-label-strong">언제 할래요?</span>
          </div>
          <input aria-label="언제 할래요?" type="text" value={when} onChange={e => setWhen(e.target.value)}
            placeholder={whenPlaceholder}
            className="form-paper-field w-full px-3 py-2.5" />
          <p className="text-caption1 text-label-assistive mt-1.5">시작 시간이나 행동 트리거를 적어주세요</p>
        </div>

        {/* 타이머 카드 */}
        <div className="form-paper-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Timer size={20} className="text-primary" />
                <div>
                  <p className="text-body2 font-semibold text-label-strong">타이머</p>
                  <p className="text-caption1 text-label-alt">루틴 생성 시 자동으로 적용돼요</p>
                </div>
              </div>
              <Switch checked={timerEnabled} onCheckedChange={setTimerEnabled} label="타이머" />
            </div>
            <AnimatePresence>
              {timerEnabled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-3">
                  <motion.button {...tapSm} onClick={() => setShowDurationSheet(true)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-fill rounded-xl border border-line">
                    <span className="text-body2 text-label-alt">설정 시간</span>
                    <span className="text-body2 font-bold text-primary">{fmtDuration(durationSecs)}</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 2분 트리거 카드 */}
        <div className="form-paper-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap size={20} strokeWidth={1.9} className="text-label-strong" />
                <div>
                  <p className="text-body2 font-semibold text-label-strong">2분 트리거</p>
                  <p className="text-caption1 text-label-alt">습관 시작을 쉽게 만드는 작은 행동</p>
                </div>
              </div>
              <Switch checked={twoMinEnabled} onCheckedChange={setTwoMinEnabled} label="2분 트리거" tone="positive" />
            </div>
            <AnimatePresence>
              {twoMinEnabled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-3">
                  <input aria-label="2분 트리거 습관" type="text" value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                    placeholder="예: 운동복 갈아입기, 러닝화 신기"
                    className="form-paper-field w-full px-3 py-2.5" />
                  <p className="text-caption2 text-label-alt mt-1.5 flex items-center gap-1"><Lightbulb size={13} strokeWidth={1.9} /> 트리거 완료 후 메인 습관으로 이어져요</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 대체 습관 카드 */}
        <div className="form-paper-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <Flame size={20} strokeWidth={1.9} className="text-cautionary" />
              <div>
                <p className="text-body2 font-semibold text-label-strong">대체 습관</p>
                <p className="text-caption1 text-label-alt">하기 힘든 날의 더 쉬운 버전</p>
              </div>
            </div>
            <input aria-label="대체 습관" type="text" value={miniRoutine} onChange={e => setMiniRoutine(e.target.value)}
              placeholder="예: 10분 스트레칭, 5분 걷기"
              className="form-paper-field w-full px-3 py-2.5" />
          </div>
        </div>

        </div></details>
      </div>

      {/* 타이머 시트 */}
      <DurationPickerSheet
        isOpen={showDurationSheet}
        seconds={durationSecs}
        onConfirm={setDurationSecs}
        onClose={() => setShowDurationSheet(false)}
      />

      {/* 알림 시트 */}
      <AlarmTimeSheet
        isOpen={showTimePicker}
        time={notifTimes[editingIdx] ?? '09:00'}
        onChange={(t) =>
          setNotifTimes(prev => prev.map((old, i) => i === editingIdx ? t : old))
        }
        onDelete={() => {
          const next = notifTimes.filter((_, i) => i !== editingIdx);
          setNotifTimes(next.length > 0 ? next : ['09:00']);
          if (next.length === 0) setNotifEnabled(false);
        }}
        onClose={() => setShowTimePicker(false)}
      />
      <AlarmTypeSheet
        isOpen={showTypePicker}
        type={notifType}
        onChange={setNotifType}
        onClose={() => setShowTypePicker(false)}
      />

      </fieldset>
      {/* 하단 버튼 */}
      <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
        style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onClick={handleSubmit}
          disabled={draft.awaitingChoice || !title.trim() || (freq === 'custom' && customDays.length === 0)}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '시작하기'}
        </motion.button>
      </div>
    </div>
  );
}
