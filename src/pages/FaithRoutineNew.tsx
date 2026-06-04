import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Timer } from 'lucide-react';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import DurationPickerSheet from '../components/ui/DurationPickerSheet';
import { AlarmTimeSheet, AlarmTypeSheet } from '../components/ui/HabitAlarmSheet';
import { fmtDuration } from '../utils/duration';
import { to12h } from '../utils/alarmTime';
import { useRoutineStore } from '../store/routineStore';
import { useNotificationStore } from '../store/notificationStore';
import type { TimeSlot } from '../types';
import { WEEKDAY_LABELS } from '../types';
import { faithRoutineTemplates } from '../mocks/data/faithTemplates';

const tap   = { whileTap: { scale: 0.96 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };
const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const TIME_SLOTS: { value: TimeSlot; label: string; emoji: string }[] = [
  { value: 'morning', label: '아침', emoji: '🌅' },
  { value: 'afternoon', label: '점심', emoji: '☀️' },
  { value: 'evening', label: '저녁', emoji: '🌙' },
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
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { faithRoutines, addRoutine, updateRoutine } = useRoutineStore();
  const { setPermission } = useNotificationStore();

  const existing = id ? faithRoutines.find(r => r.id === id) : null;
  const isEdit = !!existing;

  const [mode, setMode] = useState<Mode>(isEdit ? 'custom' : 'choose');

  // 기본 필드
  const [title, setTitle]   = useState(existing?.title ?? '');
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
  const [when, setWhen] = useState(existing?.when ?? '');

  // 2분 트리거
  const [twoMinEnabled, setTwoMinEnabled] = useState(!!(existing?.twoMinuteHabit));
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existing?.twoMinuteHabit ?? '');

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

  const handleToggleNotif = () => {
    if (!notifEnabled) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().then(p => { setPermission(p); if (p === 'granted') setNotifEnabled(true); });
        return;
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        alert('알림 권한이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.');
        return;
      }
    }
    setNotifEnabled(v => !v);
  };

  const handleBack = () => {
    if (isEdit) { navigate(-1); return; }
    if (mode === 'choose') { navigate(-1); return; }
    if (mode === 'template-config') { setMode('template'); return; }
    setMode('choose');
  };

  const handleSave = () => {
    if (!title.trim()) return;
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
    };

    if (isEdit && existing) {
      updateRoutine(existing.id, fields);
    } else {
      addRoutine({
        id: `fr-${Date.now()}`, userId: 'user-1',
        type: 'faith', isActive: true,
        order: faithRoutines.length, createdAt: new Date().toISOString(),
        ...fields,
      });
    }
    navigate(-1);
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
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft flex-shrink-0">
        <motion.button {...tapSm} onClick={handleBack} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">{pageTitle}</h1>
        <div className="w-8" />
      </div>

      {/* ── 선택 화면 ── */}
      {mode === 'choose' && !isEdit && (
        <div className="flex-1 px-4 py-8 flex flex-col gap-4">
          <p className="text-caption1 text-label-alt text-center mb-2">추가 방법을 선택해 주세요</p>
          <motion.button {...tap} onClick={() => setMode('template')}
            className="bg-surface border border-line rounded-xl px-5 py-5 text-left shadow-emphasize hover:bg-fill transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">📿</span>
              <p className="text-body1 font-bold text-label-strong">템플릿 선택</p>
            </div>
            <p className="text-body2 text-label-alt">추천 신앙 루틴 중에서 골라보세요</p>
          </motion.button>
          <motion.button {...tap} onClick={() => setMode('custom')}
            className="bg-surface border border-line rounded-xl px-5 py-5 text-left shadow-emphasize hover:bg-fill transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">✏️</span>
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
                className={`bg-surface border rounded-xl px-4 py-4 text-left shadow-emphasize transition-all ${already ? 'border-line opacity-40 cursor-not-allowed' : 'border-line hover:border-primary hover:bg-primary-soft/40'}`}>
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
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="신앙 루틴 이름" autoFocus
                    className="flex-1 h-12 bg-surface border border-line rounded-lg px-4 text-body2 font-medium focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] shadow-emphasize transition-all" />
                </div>
              </div>

              {/* 알림 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🔔</span>
                      <span className="text-body2 font-semibold text-label-strong">알림</span>
                    </div>
                    <button onClick={handleToggleNotif}
                      className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${notifEnabled ? 'bg-positive' : 'bg-fill-strong'}`}>
                      <motion.div animate={{ x: notifEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm pointer-events-none" />
                    </button>
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

              {/* 반복 주기 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xl">📅</span>
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

              {/* 언제 할래요? 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">✅</span>
                  <span className="text-body2 font-semibold text-label-strong">언제 할래요?</span>
                </div>
                <input type="text" value={when} onChange={e => setWhen(e.target.value)}
                  placeholder="예) 아침 기상 직후, 출근 전"
                  className="w-full bg-fill border border-line rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all" />
              </div>

              {/* 시간대 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden px-4 py-4">
                <p className="text-caption1 font-bold text-label-alt mb-3">시간대 (선택)</p>
                <div className="flex gap-2">
                  {TIME_SLOTS.map(ts => (
                    <motion.button key={ts.value} {...tap}
                      onClick={() => setTimeSlot(timeSlot === ts.value ? null : ts.value)}
                      className={`flex-1 py-2.5 rounded-lg text-body2 font-medium border transition-all ${timeSlot === ts.value ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt'}`}>
                      {ts.emoji} {ts.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 2분 트리거 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">⚡</span>
                      <div>
                        <p className="text-body2 font-semibold text-label-strong">2분 트리거</p>
                        <p className="text-caption1 text-label-alt">루틴 시작을 쉽게 만드는 작은 행동</p>
                      </div>
                    </div>
                    <button onClick={() => setTwoMinEnabled(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${twoMinEnabled ? 'bg-emerald-500' : 'bg-fill-strong'}`}>
                      <motion.div animate={{ x: twoMinEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm pointer-events-none" />
                    </button>
                  </div>
                  <AnimatePresence>
                    {twoMinEnabled && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden mt-3">
                        <input type="text" value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                          placeholder="예: 성경책 펼치기, 묵상 앱 열기"
                          className="w-full bg-fill border border-emerald-200 rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-emerald-400 focus:bg-surface transition-all" />
                        <p className="text-caption2 text-emerald-600 mt-1.5">💡 트리거 완료 후 자동으로 루틴으로 연결돼요</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 타이머 카드 */}
              <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Timer size={20} className="text-primary" />
                      <div>
                        <p className="text-body2 font-semibold text-label-strong">타이머</p>
                        <p className="text-caption1 text-label-alt">이 루틴 실행 시 카운트다운</p>
                      </div>
                    </div>
                    <button onClick={() => setTimerEnabled(v => !v)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${timerEnabled ? 'bg-primary' : 'bg-fill-strong'}`}>
                      <motion.div animate={{ x: timerEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow pointer-events-none" />
                    </button>
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

            </div>
          </div>

          {/* 하단 저장 버튼 */}
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <motion.button whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
              onClick={handleSave} disabled={!title.trim()}
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
    </div>
  );
}
