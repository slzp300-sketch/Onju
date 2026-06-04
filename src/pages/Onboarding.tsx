import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

/* ── 고정 데이터 (render마다 값이 바뀌지 않도록) ── */
const WEEK_DATA = [
  { day: '월', p: 100, f: 100 },
  { day: '화', p: 60,  f: 80  },
  { day: '수', p: 100, f: 100 },
  { day: '목', p: 0,   f: 0,  today: true },
  { day: '금', p: 0,   f: 0   },
  { day: '토', p: 0,   f: 0   },
  { day: '일', p: 0,   f: 0   },
] as const;

// 4 × 7 습관 캘린더 색상: 2=진함, 1=연함, 0=없음
const HEATMAP = [
  2, 2, 1, 2, 2, 2, 1,
  2, 2, 2, 1, 2, 2, 1,
  2, 1, 2, 2, 2, 1, 2,
  2, 2, 2, 2, 0, 0, 0,
] as const;

const SLIDES = [
  {
    title: '온주에 오신 걸\n환영해요',
    description: '크리스천 직장인을 위한\n루틴 & 투두 관리 앱이에요.\n신앙과 일상을 함께 가꿔봐요.',
    visual: (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-strong">
          <span className="text-4xl text-white font-bold font-brand">직</span>
        </div>
        <p className="text-caption2 font-bold text-primary tracking-widest">ONJU</p>
        <div className="flex gap-4 mt-1">
          {[
            { emoji: '🙏', label: '신앙 루틴' },
            { emoji: '💪', label: '개인 루틴' },
            { emoji: '📊', label: '목표 통계' },
          ].map(item => (
            <div key={item.label} className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-xl shadow-emphasize">
                {item.emoji}
              </div>
              <span className="text-[10px] font-medium text-label-alt">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: '루틴으로\n하루를 설계해요',
    description: '습관들을 루틴 그룹으로 묶어\n아침부터 저녁까지 순서대로 관리해요.\n완료·쉬기·대체 기록으로 유연하게.',
    visual: (
      <div className="w-full bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt border-b border-line-soft">
          <span className="text-base">🌅</span>
          <span className="flex-1 text-caption1 font-bold text-label-strong">아침 루틴</span>
          <span className="text-caption2 font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary">1/3</span>
        </div>
        {[
          { emoji: '🧘', title: '모닝 스트레칭', done: true },
          { emoji: '📖', title: '독서 15분', done: false },
          { emoji: '✍️', title: '일기 쓰기', done: false },
        ].map((item, idx) => (
          <div key={idx} className={`flex items-center gap-3 px-4 py-2.5 ${idx > 0 ? 'border-t border-line-soft' : ''}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${item.done ? 'bg-primary-soft' : 'bg-fill'}`}>
              {item.emoji}
            </div>
            <span className={`flex-1 text-caption1 font-medium ${item.done ? 'line-through text-label-assistive' : 'text-label-strong'}`}>
              {item.title}
            </span>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-primary bg-primary' : 'border-line'}`}>
              {item.done && (
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        ))}
        <div className="px-4 py-2 border-t border-line-soft bg-fill/40 flex items-center gap-2">
          <span className="text-[10px] text-label-assistive">기록 방식</span>
          {(['완료', '쉬기', '대체'] as const).map((label, i) => (
            <span key={label} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              i === 0 ? 'bg-primary text-white border-primary' :
              i === 1 ? 'bg-amber-100 text-amber-500 border-amber-200' :
                        'bg-orange-100 text-orange-500 border-orange-200'
            }`}>{label}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: '신앙 루틴으로\n꾸준히 성장해요',
    description: '기도, 말씀 묵상, 큐티 등\n신앙 루틴을 시간대별로 정리해요.\n연속 달성 일수가 🔥 스트릭으로 쌓여요.',
    visual: (
      <div className="w-full flex flex-col gap-2">
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200/60 rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔥</span>
            <span className="text-label1 font-bold text-amber-500">12일</span>
            <span className="text-caption1 text-label-alt">연속 달성 중</span>
          </div>
          <span className="text-caption2 font-semibold text-amber-400">계속 이어가요!</span>
        </div>
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          {[
            { time: '07:00', emoji: '🌅', label: '아침 루틴', items: [{ e: '🙏', t: '아침 기도', done: true }, { e: '📖', t: '말씀 묵상', done: true }], allDone: true },
            { time: '21:00', emoji: '🌙', label: '저녁 루틴', items: [{ e: '✝️', t: '저녁 큐티', done: false }], allDone: false },
          ].map((slot, si) => (
            <div key={si} className={si > 0 ? 'border-t border-line-soft' : ''}>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-alt">
                <span className="text-caption2 text-label-assistive w-10">{slot.time}</span>
                <span className="text-sm">{slot.emoji}</span>
                <span className="flex-1 text-caption2 font-bold text-label">{slot.label}</span>
                <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${slot.allDone ? 'bg-emerald-100 text-emerald-600' : 'bg-fill text-label-alt'}`}>
                  {slot.items.filter(i => i.done).length}/{slot.items.length}
                </span>
              </div>
              {slot.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-3 px-4 py-2.5 border-t border-line-soft">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${item.done ? 'bg-emerald-50' : 'bg-fill'}`}>
                    {item.e}
                  </div>
                  <span className={`flex-1 text-caption1 font-medium ${item.done ? 'line-through text-label-assistive' : 'text-label-strong'}`}>
                    {item.t}
                  </span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-emerald-500 bg-emerald-500' : 'border-line'}`}>
                    {item.done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: '주간 흐름과\n투두를 한눈에',
    description: '이번 주 루틴 달성률을 요일별로 확인하고\n오늘의 투두를 체크해요.\n지난 날 기록도 조회할 수 있어요.',
    visual: (
      <div className="w-full flex flex-col gap-2">
        <div className="bg-surface rounded-xl border border-line shadow-emphasize p-3">
          <p className="text-caption2 font-bold text-label-assistive mb-2">이번 주 달성률</p>
          <div className="flex gap-1">
            {WEEK_DATA.map((d, i) => (
              <div
                key={i}
                className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-1.5 px-0.5 border-2 ${
                  'today' in d && d.today ? 'border-primary bg-primary-soft' : 'border-transparent'
                }`}
              >
                <span className={`text-[9px] font-bold ${('today' in d && d.today) ? 'text-primary' : 'text-label-assistive'}`}>{d.day}</span>
                <span className={`text-[10px] font-bold ${('today' in d && d.today) ? 'text-primary' : d.p > 0 ? 'text-label' : 'text-label-assistive'}`}>{i + 1}</span>
                <div className="w-full h-1.5 bg-fill-strong rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${d.p}%` }} />
                </div>
                <div className="w-full h-1.5 bg-fill-strong rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${d.f}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1.5 px-0.5">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-[9px] text-label-assistive">개인</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[9px] text-label-assistive">신앙</span></div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          <div className="px-4 py-2 bg-surface-alt border-b border-line-soft flex items-center justify-between">
            <span className="text-caption1 font-bold text-label-strong">📝 오늘의 투두</span>
            <span className="text-caption2 font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-full">1/2</span>
          </div>
          {[
            { t: '팀장님께 보고서 제출', done: true },
            { t: '저녁 약속 확인하기', done: false },
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-line-soft' : ''}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-primary bg-primary' : 'border-line'}`}>
                {item.done && <svg width="7" height="5" viewBox="0 0 7 5" fill="none"><path d="M1 2.5L2.5 4L6 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span className={`flex-1 text-caption1 font-medium ${item.done ? 'line-through text-label-assistive' : 'text-label-strong'}`}>{item.t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: '목표와 통계로\n성장을 기록해요',
    description: '이번 달 목표를 세우고 루틴과 연결해요.\n수행률·진척도·습관 캘린더 등\n다양한 통계로 성장 흐름을 확인해요.',
    visual: (
      <div className="w-full flex flex-col gap-2">
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-soft text-primary">💪 개인</span>
              <span className="text-caption2 text-label-assistive ml-auto">14/30일 · D+14</span>
            </div>
            <p className="text-body2 font-bold text-label-strong leading-snug">매일 운동으로 체력 키우기</p>
          </div>
          <div className="px-4 pb-3 flex gap-2">
            <div className="flex-1 rounded-xl bg-fill/60 px-3 py-2">
              <p className="text-caption2 text-label-assistive mb-0.5">수행률</p>
              <p className="text-label1 font-bold" style={{ color: 'var(--color-positive)' }}>78%</p>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--color-positive)' }}>잘 지키고 있어요</p>
            </div>
            <div className="flex-1 rounded-xl bg-fill/60 px-3 py-2">
              <p className="text-caption2 text-label-assistive mb-0.5">진척도</p>
              <p className="text-label1 font-bold text-primary">47%</p>
              <p className="text-[10px] text-label-assistive">기간 전체 기준</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-line shadow-emphasize px-4 py-3">
          <p className="text-caption2 font-bold text-label-assistive mb-2">습관 달성 캘린더</p>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {(['월', '화', '수', '목', '금', '토', '일'] as const).map(d => (
              <span key={d} className="text-center text-[8px] text-label-assistive font-medium">{d}</span>
            ))}
            {HEATMAP.map((level, i) => (
              <div
                key={i}
                className="aspect-square rounded-sm"
                style={{
                  backgroundColor: level === 2
                    ? 'var(--color-primary)'
                    : level === 1
                    ? 'var(--color-primary-soft)'
                    : 'var(--color-fill-strong)',
                  opacity: level === 0 && i >= 21 ? 0.4 : 1,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '60%' : '-60%', opacity: 0 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { setOnboardingDone } = useAuthStore();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  const total = SLIDES.length;
  const slide = SLIDES[step];
  const isLast = step === total - 1;

  const goNext = () => { setDir(1); setStep(s => s + 1); };
  const goBack = () => { setDir(-1); setStep(s => s - 1); };
  const finish = () => { setOnboardingDone(); navigate('/'); };

  return (
    <div className="min-h-dvh bg-surface flex flex-col select-none">

      {/* 상단 */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        <div className="w-8" />
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === step ? 20 : 6, opacity: i === step ? 1 : 0.25 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-1.5 rounded-full bg-primary"
            />
          ))}
        </div>
        <button onClick={finish} className="text-label2 text-label-alt font-medium py-1">
          건너뛰기
        </button>
      </div>

      {/* 슬라이드 */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col px-5 pt-4 pb-2 overflow-y-auto"
          >
            {/* 비주얼 */}
            <div className="flex-shrink-0 w-full rounded-2xl bg-primary-soft p-5 mb-5 flex items-center justify-center min-h-[220px]">
              {slide.visual}
            </div>

            {/* 텍스트 */}
            <div className="flex-shrink-0">
              <h2 className="text-title3 font-bold text-label-strong mb-2 leading-tight whitespace-pre-line font-brand">
                {slide.title}
              </h2>
              <p className="text-body2 text-label-alt leading-relaxed whitespace-pre-line">
                {slide.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 버튼 */}
      <div className="flex-shrink-0 px-5 pb-10 pt-3 flex flex-col gap-3">
        {isLast ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.12 }}
            onClick={finish}
            className="w-full h-12 rounded-lg bg-primary text-white font-bold text-body1 shadow-strong hover:bg-primary-strong transition-colors"
          >
            시작하기
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.12 }}
            onClick={goNext}
            className="w-full h-12 rounded-lg bg-label-strong text-white font-bold text-body1 hover:opacity-90 transition-opacity"
          >
            다음
          </motion.button>
        )}
        {step > 0 && (
          <button onClick={goBack} className="text-body2 text-label-assistive text-center py-1">
            이전으로
          </button>
        )}
      </div>
    </div>
  );
}
