import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Dumbbell, BarChart3, Sunrise, Sun, Moon, Church, Sprout, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { newId } from '../utils/id';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import BrandLogo from '../components/ui/BrandLogo';
import ForestBackdrop from '../components/tree/ForestBackdrop';
import { faithRoutineTemplates } from '../data/faithTemplates';
import type { TimeSlot } from '../types';

/* 신앙 템플릿 이모지 (FaithRoutineNew와 동일 매핑) */
const FAITH_EMOJI: Record<string, string> = {
  '기도': '🙏', '말씀': '📖', '감사 일기': '📝', '정체성 점검': '✅',
  '중보기도 메모': '📿', '저녁 되돌아보기': '🌙',
};

const TIME_SLOTS: { value: TimeSlot; label: string; Icon: typeof Sunrise }[] = [
  { value: 'morning', label: '아침', Icon: Sunrise },
  { value: 'afternoon', label: '점심', Icon: Sun },
  { value: 'evening', label: '저녁', Icon: Moon },
];

const FREQ_OPTIONS: { value: 'daily' | 'weekdays' | 'weekends'; label: string }[] = [
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '평일' },
  { value: 'weekends', label: '주말' },
];

const CONCEPT_FEATURES = [
  { Icon: BookOpen, label: '신앙 루틴', desc: '기도·말씀·묵상을 매일 체크' },
  { Icon: Dumbbell, label: '개인 루틴', desc: '운동·독서 같은 습관 관리' },
  { Icon: BarChart3, label: '목표 · 통계', desc: '달성률과 성장 흐름을 한눈에' },
] as const;

const TOTAL = 5; // welcome · concept · choose · create · done

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '60%' : '-60%', opacity: 0 }),
};

type RoutineType = 'faith' | 'personal';

export default function Onboarding() {
  const navigate = useNavigate();
  const { setOnboardingDone } = useAuthStore();
  const { addHabit } = useHabitStore();
  const { addRoutine, faithRoutines } = useRoutineStore();

  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);

  // 핸즈온 생성 상태
  const [routineType, setRoutineType] = useState<RoutineType>('faith');
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('');
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null);
  const [freq, setFreq] = useState<'daily' | 'weekdays' | 'weekends'>('daily');
  const [created, setCreated] = useState<{ title: string; emoji: string } | null>(null);

  const go = (next: number) => { setDir(next > idx ? 1 : -1); setIdx(next); };
  const complete = () => { setOnboardingDone(); navigate('/'); };

  const chooseType = (type: RoutineType) => {
    setRoutineType(type);
    setTitle(''); setEmoji(''); setTimeSlot(null); setFreq('daily');
    go(3);
  };

  const pickTemplate = (t: typeof faithRoutineTemplates[number]) => {
    setTitle(t.title);
    setEmoji(FAITH_EMOJI[t.title] ?? '🙏');
  };

  const plant = () => {
    const t = title.trim();
    if (!t) return;
    const finalEmoji = emoji || (routineType === 'faith' ? '🙏' : '🌱');
    if (routineType === 'faith') {
      addRoutine({
        id: newId(), userId: '',
        type: 'faith', isActive: true,
        order: faithRoutines.length, createdAt: new Date().toISOString(),
        title: t, emoji: finalEmoji, frequency: 'daily',
        ...(timeSlot ? { timeSlot } : {}),
      });
    } else {
      addHabit({
        id: newId(), userId: '', createdAt: new Date().toISOString(),
        title: t, emoji: finalEmoji, frequency: freq, when: '',
      });
    }
    setCreated({ title: t, emoji: finalEmoji });
    go(4);
  };

  const canPlant = title.trim().length > 0;

  return (
    <div className="relative min-h-dvh bg-surface flex flex-col select-none">
      <ForestBackdrop />

      {/* 상단: 진행 도트 + 건너뛰기 */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        <div className="w-8" />
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === idx ? 20 : 6, opacity: i === idx ? 1 : 0.25 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-1.5 rounded-full bg-primary"
            />
          ))}
        </div>
        {idx < 4 ? (
          <button onClick={complete} className="text-label2 text-label-alt font-medium py-1">
            건너뛰기
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={idx}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col px-5 pt-4 pb-2 overflow-y-auto"
          >
            {/* ── 0. 환영 ── */}
            {idx === 0 && (
              <>
                <div className="flex-shrink-0 w-full rounded-2xl bg-primary-soft p-5 mb-5 flex items-center justify-center min-h-[220px]">
                  <div className="flex flex-col items-center gap-3 w-full">
                    <BrandLogo size={80} />
                    <p className="text-caption2 font-bold text-primary tracking-widest">ONJU</p>
                    <div className="flex gap-4 mt-1">
                      {CONCEPT_FEATURES.map(item => (
                        <div key={item.label} className="flex flex-col items-center gap-1.5">
                          <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-primary shadow-emphasize">
                            <item.Icon size={20} strokeWidth={1.9} />
                          </div>
                          <span className="text-[10px] font-medium text-label-alt">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <h2 className="text-title3 font-bold text-label-strong mb-2 leading-tight whitespace-pre-line font-brand">
                    {'온주에 오신 걸\n환영해요'}
                  </h2>
                  <p className="text-body2 text-label-alt leading-relaxed">
                    크리스천 직장인을 위한 루틴 & 투두 관리 앱이에요.{'\n'}
                    작은 루틴을 심으면 나무처럼 자라나요. 🌳
                  </p>
                </div>
              </>
            )}

            {/* ── 1. 개념 ── */}
            {idx === 1 && (
              <>
                <div className="flex-shrink-0 w-full rounded-2xl bg-primary-soft p-4 mb-5 flex flex-col gap-2.5 min-h-[220px] justify-center">
                  {CONCEPT_FEATURES.map(item => (
                    <div key={item.label} className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3 shadow-emphasize">
                      <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary flex-shrink-0">
                        <item.Icon size={20} strokeWidth={1.9} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-caption1 font-bold text-label-strong">{item.label}</span>
                        <span className="text-caption2 text-label-alt">{item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex-shrink-0">
                  <h2 className="text-title3 font-bold text-label-strong mb-2 leading-tight whitespace-pre-line font-brand">
                    {'이렇게\n사용해요'}
                  </h2>
                  <p className="text-body2 text-label-alt leading-relaxed">
                    신앙과 일상 루틴을 매일 체크하고,{'\n'}
                    목표·통계로 성장 흐름을 확인해요.
                  </p>
                </div>
              </>
            )}

            {/* ── 2. 유형 선택 ── */}
            {idx === 2 && (
              <>
                <div className="flex-shrink-0 mb-5">
                  <h2 className="text-title3 font-bold text-label-strong mb-2 leading-tight whitespace-pre-line font-brand">
                    {'어떤 루틴을\n먼저 심어볼까요?'}
                  </h2>
                  <p className="text-body2 text-label-alt leading-relaxed">
                    지금 바로 첫 루틴을 만들어봐요.{'\n'}
                    나중에 얼마든지 추가·수정할 수 있어요.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => chooseType('faith')}
                    className="w-full flex items-center gap-4 rounded-2xl bg-surface border border-line p-4 text-left shadow-emphasize hover:border-primary transition-colors"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary flex-shrink-0">
                      <Church size={24} strokeWidth={1.9} />
                    </div>
                    <div className="flex-1">
                      <p className="text-body1 font-bold text-label-strong">신앙 루틴</p>
                      <p className="text-caption1 text-label-alt">기도 · 말씀 · 감사일기 등</p>
                    </div>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => chooseType('personal')}
                    className="w-full flex items-center gap-4 rounded-2xl bg-surface border border-line p-4 text-left shadow-emphasize hover:border-primary transition-colors"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary flex-shrink-0">
                      <Dumbbell size={24} strokeWidth={1.9} />
                    </div>
                    <div className="flex-1">
                      <p className="text-body1 font-bold text-label-strong">개인 습관</p>
                      <p className="text-caption1 text-label-alt">운동 · 독서 · 나만의 습관 등</p>
                    </div>
                  </motion.button>
                </div>
              </>
            )}

            {/* ── 3. 생성 폼 ── */}
            {idx === 3 && (
              <>
                <div className="flex-shrink-0 mb-4">
                  <h2 className="text-title3 font-bold text-label-strong mb-1.5 leading-tight font-brand">
                    {routineType === 'faith' ? '첫 신앙 루틴 심기' : '첫 개인 습관 만들기'}
                  </h2>
                  <p className="text-body2 text-label-alt leading-relaxed">
                    {routineType === 'faith'
                      ? '템플릿을 고르거나 직접 입력해보세요.'
                      : '이름과 이모지를 정해보세요.'}
                  </p>
                </div>

                {/* 신앙: 템플릿 칩 */}
                {routineType === 'faith' && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {faithRoutineTemplates.map(t => {
                      const active = title === t.title;
                      return (
                        <motion.button
                          key={t.id}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => pickTemplate(t)}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-caption1 font-semibold border transition-colors ${
                            active
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface text-label border-line'
                          }`}
                        >
                          <span>{FAITH_EMOJI[t.title] ?? '🙏'}</span>
                          {t.title}
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {/* 이모지 + 제목 */}
                <div className="flex items-center gap-3 mb-4">
                  <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={routineType === 'faith' ? '예) 아침 기도' : '예) 아침 운동, 독서 15분'}
                    className="flex-1 h-12 px-4 rounded-xl bg-surface border border-line text-body1 text-label-strong placeholder:text-label-assistive focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                {/* 신앙: 시간대 (선택) */}
                {routineType === 'faith' && (
                  <div>
                    <p className="text-caption2 font-bold text-label-assistive mb-2">언제 할까요? (선택)</p>
                    <div className="flex gap-2">
                      {TIME_SLOTS.map(s => {
                        const active = timeSlot === s.value;
                        return (
                          <motion.button
                            key={s.value}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setTimeSlot(active ? null : s.value)}
                            className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl border text-caption1 font-semibold transition-colors ${
                              active
                                ? 'bg-primary-soft text-primary border-primary'
                                : 'bg-surface text-label-alt border-line'
                            }`}
                          >
                            <s.Icon size={16} strokeWidth={1.9} />
                            {s.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 개인: 빈도 */}
                {routineType === 'personal' && (
                  <div>
                    <p className="text-caption2 font-bold text-label-assistive mb-2">얼마나 자주?</p>
                    <div className="flex gap-2">
                      {FREQ_OPTIONS.map(f => {
                        const active = freq === f.value;
                        return (
                          <motion.button
                            key={f.value}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setFreq(f.value)}
                            className={`flex-1 h-11 rounded-xl border text-caption1 font-semibold transition-colors ${
                              active
                                ? 'bg-primary-soft text-primary border-primary'
                                : 'bg-surface text-label-alt border-line'
                            }`}
                          >
                            {f.label}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── 4. 완료 ── */}
            {idx === 4 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 pb-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 18 }}
                  className="w-24 h-24 rounded-full bg-primary-soft flex items-center justify-center text-primary"
                >
                  <Sprout size={48} strokeWidth={1.8} />
                </motion.div>
                <div>
                  <h2 className="text-title3 font-bold text-label-strong mb-2 leading-tight font-brand">
                    첫 루틴을 심었어요!
                  </h2>
                  <p className="text-body2 text-label-alt leading-relaxed">
                    이제 매일 물을 주며 키워봐요.{'\n'}
                    꾸준함이 쌓이면 나무가 자라나요. 🌳
                  </p>
                </div>
                {created && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-surface border border-line px-4 py-2.5 shadow-emphasize">
                    <span className="text-body1">{created.emoji}</span>
                    <span className="text-body2 font-bold text-label-strong">{created.title}</span>
                    <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check size={12} strokeWidth={3} className="text-white" />
                    </span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 버튼 */}
      <div className="flex-shrink-0 px-5 pb-10 pt-3 flex flex-col gap-3">
        {idx === 0 && (
          <PrimaryButton onClick={() => go(1)}>다음</PrimaryButton>
        )}
        {idx === 1 && (
          <>
            <PrimaryButton onClick={() => go(2)}>다음</PrimaryButton>
            <BackLink onClick={() => go(0)} />
          </>
        )}
        {idx === 2 && (
          <BackLink onClick={() => go(1)} />
        )}
        {idx === 3 && (
          <>
            <motion.button
              whileTap={{ scale: canPlant ? 0.98 : 1 }}
              transition={{ duration: 0.12 }}
              onClick={plant}
              disabled={!canPlant}
              className="w-full h-12 rounded-lg bg-primary text-white font-bold text-body1 shadow-strong transition-colors disabled:opacity-40 disabled:shadow-none"
            >
              🌱 루틴 심기
            </motion.button>
            <BackLink onClick={() => go(2)} />
          </>
        )}
        {idx === 4 && (
          <PrimaryButton onClick={complete}>시작하기</PrimaryButton>
        )}
      </div>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12 }}
      onClick={onClick}
      className="w-full h-12 rounded-lg bg-primary text-white font-bold text-body1 shadow-strong hover:bg-primary-strong transition-colors"
    >
      {children}
    </motion.button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-body2 text-label-assistive text-center py-1">
      이전으로
    </button>
  );
}
