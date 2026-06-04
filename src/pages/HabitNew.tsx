import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import { format } from 'date-fns';
import { AlarmTimeSheet, AlarmTypeSheet } from '../components/ui/HabitAlarmSheet';
import { to12h } from '../utils/alarmTime';
import DurationPickerSheet from '../components/ui/DurationPickerSheet';
import { fmtDuration } from '../utils/duration';
import { Timer } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';

const tap = { whileTap: { scale: 0.98 }, transition: { duration: 0.12 } };
const tapSm = { whileTap: { scale: 0.92 }, transition: { duration: 0.1 } };
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import type { HabitFrequency } from '../types';
import { WEEKDAY_LABELS } from '../types';

const FREQ_OPTIONS: { value: HabitFrequency; label: string; desc: string }[] = [
  { value: 'daily', label: '매일', desc: '매일 반복' },
  { value: 'weekdays', label: '평일', desc: '월~금 반복' },
  { value: 'weekends', label: '주말', desc: '토~일 반복' },
  { value: 'custom', label: '직접 선택', desc: '요일 선택' },
];

export default function HabitNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { habits, addHabit, updateHabit } = useHabitStore();
  const { monthlyGoals } = useGoalStore();
  const existing = id ? habits.find(h => h.id === id) : null;
  const isEdit = !!existing;

  // 활성 월간 목표 중 루틴이 있는 것
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const activeGoalRoutines = monthlyGoals
    .filter(g => g.startDate <= todayIso && g.endDate >= todayIso && g.goalRoutines?.length)
    .flatMap(g => (g.goalRoutines ?? []).map(r => ({ ...r, goalTitle: g.title })));

  const { setPermission } = useNotificationStore();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [freq, setFreq] = useState<HabitFrequency>(existing?.frequency ?? 'daily');
  const [customDays, setCustomDays] = useState<number[]>(existing?.customDays ?? []);
  const [when, setWhen] = useState(existing?.when ?? '');
  const [miniRoutine, setMiniRoutine] = useState(existing?.miniRoutine ?? '');
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existing?.twoMinuteHabit ?? '');

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

  const handleToggleNotif = () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    // 켤 때: 권한 상태 확인
    if (typeof Notification === 'undefined') {
      setNotifEnabled(true);
      return;
    }
    if (Notification.permission === 'granted') {
      setNotifEnabled(true);
      return;
    }
    if (Notification.permission === 'denied') {
      // 차단됨 — 브라우저 설정에서 허용 필요
      alert('알림 권한이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.');
      return;
    }
    // default: 권한 요청 (비동기지만 별도 처리)
    void Notification.requestPermission().then(perm => {
      setPermission(perm);
      if (perm === 'granted') setNotifEnabled(true);
    });
  };

  const freqLabel = FREQ_OPTIONS.find(f => f.value === freq)?.label ?? '매일';
  const whenPlaceholder = '예) 8:00 / 출근길';

  const handleSubmit = () => {
    if (!title.trim()) return;
    const data = {
      title: title.trim(), emoji, frequency: freq,
      ...(freq === 'custom' ? { customDays } : {}),
      when: when.trim(),
      durationSeconds: timerEnabled ? durationSecs : undefined,
      miniRoutine: miniRoutine.trim() || undefined,
      twoMinuteHabit: twoMinuteHabit.trim() || undefined,
      notification: notifEnabled
        ? { enabled: true, type: notifType, times: notifTimes }
        : undefined,
    };
    if (isEdit && existing) {
      updateHabit(existing.id, data);
    } else {
      addHabit({ id: `h-${Date.now()}`, userId: 'user-1', createdAt: new Date().toISOString(), ...data });
    }
    navigate(-1);
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '습관 수정하기' : '습관 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* 월간 목표에서 가져오기 */}
        {!isEdit && activeGoalRoutines.length > 0 && (
          <div>
            <p className="text-caption1 font-bold text-label-alt mb-2">💪 월간 목표 습관에서 가져오기</p>
            <div className="flex flex-col gap-2">
              {activeGoalRoutines.map(r => (
                <motion.button key={r.id} {...tap}
                  onClick={() => {
                    setTitle(r.title);
                    if (r.when) setWhen(r.when);
                    if (r.miniRoutine) setMiniRoutine(r.miniRoutine);
                    if (r.twoMinuteHabit) setTwoMinuteHabit(r.twoMinuteHabit);
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-line bg-surface shadow-emphasize text-left hover:border-primary hover:bg-primary-soft/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-body2 font-semibold text-label-strong truncate">{r.title}</p>
                    <p className="text-caption1 text-label-alt mt-0.5 truncate">
                      {[r.when, r.where].filter(Boolean).join(' · ')}
                    </p>
                    {r.miniRoutine && (
                      <p className="text-caption1 text-amber-500 mt-0.5">🔥 미니: {r.miniRoutine}</p>
                    )}
                  </div>
                  <span className="text-caption2 text-primary bg-primary-soft px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5">
                    가져오기
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 습관 이름 */}
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-2">습관 이름</p>
          <div className="flex gap-2">
            <div className="relative">
              <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            </div>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="습관 이름을 입력하세요"
              className="flex-1 h-12 bg-surface border border-line rounded-lg px-4 text-body2 font-medium focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] shadow-emphasize transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* 설정 */}
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">

          {/* 알림 */}
          <div className="border-b border-line-soft">
            <div className="px-4 py-4">
              {/* 토글 행 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔔</span>
                  <span className="text-body2 font-semibold text-label-strong">알림</span>
                </div>
                <button
                  onClick={handleToggleNotif}
                  className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${notifEnabled ? 'bg-positive' : 'bg-fill-strong'}`}
                >
                  <motion.div
                    animate={{ x: notifEnabled ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm pointer-events-none"
                  />
                </button>
              </div>

              {/* 시간 칩 목록 + 타입 (enabled 시) */}
              <AnimatePresence>
                {notifEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between mt-3">
                      {/* 시간 칩들 + 추가 버튼 */}
                      <div className="flex flex-wrap items-center gap-2 flex-1 mr-2">
                        {notifTimes.map((t, idx) => {
                          const { ampmIdx, hourIdx, minuteIdx } = to12h(t);
                          const label = `${ampmIdx === 0 ? '오전' : '오후'} ${hourIdx + 1}:${String(minuteIdx).padStart(2, '0')}`;
                          return (
                            <motion.button
                              key={idx}
                              {...tapSm}
                              onClick={() => { setEditingIdx(idx); setShowTimePicker(true); }}
                              className="px-3 py-1.5 rounded-xl bg-fill border border-line text-body2 font-semibold text-label-strong"
                            >
                              {label}
                            </motion.button>
                          );
                        })}
                        {/* + 추가 버튼 */}
                        <motion.button
                          {...tapSm}
                          onClick={() => {
                            const newIdx = notifTimes.length;
                            setNotifTimes(prev => [...prev, '09:00']);
                            setEditingIdx(newIdx);
                            setShowTimePicker(true);
                          }}
                          className="w-8 h-8 rounded-xl border border-dashed border-line flex items-center justify-center text-label-assistive text-lg"
                        >
                          +
                        </motion.button>
                      </div>

                      {/* 타입 */}
                      <motion.button
                        {...tapSm}
                        onClick={() => setShowTypePicker(true)}
                        className="flex items-center gap-1 text-body2 text-label-alt shrink-0"
                      >
                        <span>{notifType === 'push' ? '푸시' : '알림음'}</span>
                        <ChevronRight size={16} className="text-label-assistive" />
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 타이머 */}
          <div className="border-b border-line-soft">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Timer size={20} className="text-primary" />
                  <div>
                    <p className="text-body2 font-semibold text-label-strong">타이머</p>
                    <p className="text-caption1 text-label-alt">루틴 생성 시 자동으로 적용돼요</p>
                  </div>
                </div>
                <button
                  onClick={() => setTimerEnabled(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${timerEnabled ? 'bg-primary' : 'bg-fill-strong'}`}
                >
                  <motion.div
                    animate={{ x: timerEnabled ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm pointer-events-none"
                  />
                </button>
              </div>
              <AnimatePresence>
                {timerEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mt-3"
                  >
                    <motion.button
                      {...tapSm}
                      onClick={() => setShowDurationSheet(true)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-fill rounded-xl border border-line"
                    >
                      <span className="text-body2 text-label-alt">설정 시간</span>
                      <span className="text-body2 font-bold text-primary">{fmtDuration(durationSecs)}</span>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 반복 주기 */}
          <div className="border-b border-line-soft">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📅</span>
                  <span className="text-body2 font-semibold text-label-strong">반복 주기</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-body2 text-label-alt">{freqLabel}</span>
                  <ChevronRight size={16} className="text-label-assistive" />
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
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
                        <motion.button key={idx} {...tap} onClick={() => setCustomDays(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx])}
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

          {/* 언제 할래요? */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">✅</span>
              <span className="text-body2 font-semibold text-label-strong">언제 할래요?</span>
              <span className="text-caption1 text-label-assistive ml-auto">{whenPlaceholder}</span>
            </div>
            <input
              type="text" value={when} onChange={e => setWhen(e.target.value)}
              placeholder={whenPlaceholder}
              className="w-full bg-fill border border-line rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all"
            />
            <p className="text-caption1 text-label-assistive mt-1.5">시작 시간이나 행동 트리거를 적어주세요</p>
          </div>

          {/* 대체 습관 */}
          <div className="border-t border-line-soft">
            <div className="px-4 py-4 bg-amber-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">🔥</span>
                <span className="text-body2 font-semibold text-amber-700">대체 습관</span>
                <span className="text-caption2 text-amber-500 ml-auto">하기 힘든 날의 대안</span>
              </div>
              <input
                type="text" value={miniRoutine} onChange={e => setMiniRoutine(e.target.value)}
                placeholder="예: 10분 스트레칭"
                className="w-full bg-white/80 border border-amber-200 rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-amber-400 transition-all placeholder:text-amber-300"
              />
            </div>
          </div>

          {/* 2분 트리거 */}
          <div className="border-t border-line-soft">
            <div className="px-4 py-4 bg-emerald-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">⚡</span>
                <span className="text-body2 font-semibold text-emerald-700">2분 트리거</span>
                <span className="text-caption2 text-emerald-500 ml-auto">시작을 쉽게 만드는 동작</span>
              </div>
              <input
                type="text" value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                placeholder="예: 운동복으로 갈아입기"
                className="w-full bg-white/80 border border-emerald-200 rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-emerald-400 transition-all placeholder:text-emerald-300"
              />
            </div>
          </div>
        </div>

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

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onClick={handleSubmit}
          disabled={!title.trim() || (freq === 'custom' && customDays.length === 0)}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '시작하기'}
        </motion.button>
      </div>
    </div>
  );
}
