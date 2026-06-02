import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

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
      </div>
    ),
  },
  {
    title: '루틴으로\n하루를 설계해요',
    description: '개인 루틴과 신앙 루틴을 분리해서\n아침·점심·저녁 시간대별로 관리하고\n매일 체크하며 습관을 만들어요.',
    visual: (
      <div className="w-full bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt">
          <span className="text-sm">🌅</span>
          <span className="flex-1 text-caption1 font-bold text-label-strong">아침 루틴</span>
          <span className="text-caption2 font-bold px-2 py-0.5 rounded bg-primary-soft text-primary">1/2</span>
        </div>
        {[
          { num: 1, label: '모닝 스트레칭', done: true },
          { num: 2, label: '아침 기도', done: false },
        ].map(item => (
          <div key={item.num} className="flex items-center gap-3 px-4 py-3 border-t border-line-soft">
            <span className="text-caption2 font-bold text-label-assistive w-4">{item.num}</span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-primary bg-primary' : 'border-line'}`}>
              {item.done && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={`text-body2 font-medium flex-1 ${item.done ? 'line-through text-label-assistive' : 'text-label-strong'}`}>{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: '투두로\n오늘을 정리해요',
    description: '그날그날 해야 할 일을 투두로 기록해요.\n완료하면 체크! 하루를 마무리할 때\n성취감을 느낄 수 있어요.',
    visual: (
      <div className="w-full bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
        {[
          { num: 1, label: '팀 보고서 초안 작성', done: true },
          { num: 2, label: '점심 전 메일 답장', done: true },
          { num: 3, label: '저녁 식사 후 산책', done: false },
        ].map(item => (
          <div key={item.num} className={`flex items-center gap-3 px-4 py-3 ${item.num > 1 ? 'border-t border-line-soft' : ''}`}>
            <span className={`text-caption2 font-bold w-4 ${item.done ? 'text-label-assistive' : 'text-label-alt'}`}>{item.num}</span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-primary bg-primary' : 'border-line'}`}>
              {item.done && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={`text-body2 font-medium flex-1 ${item.done ? 'line-through text-label-assistive' : 'text-label-strong'}`}>{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: '목표와 함께\n성장해요',
    description: '이번 달 목표와 이번 주 목표를 세우고\n루틴과 연결해요. 매주 돌아보며\n꾸준히 성장할 수 있어요.',
    visual: (
      <div className="w-full flex flex-col gap-2">
        <div className="bg-surface rounded-xl border border-line px-4 py-3.5 shadow-emphasize">
          <p className="text-caption2 font-bold text-label-assistive mb-1">이번달 목표</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <p className="text-body2 font-semibold text-label-strong">직장에서 선한 영향력 실천하기</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { title: '주 3회 운동', rate: 67 },
            { title: '말씀 묵상', rate: 100 },
          ].map(g => (
            <div key={g.title} className="flex-1 bg-surface rounded-xl border border-line px-3 py-2.5 shadow-emphasize flex items-center gap-2">
              <div className="relative w-8 h-8 flex-shrink-0">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="var(--color-fill-strong)" strokeWidth="3" />
                  <circle cx="16" cy="16" r="12" fill="none" stroke="var(--color-primary)" strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 12}`}
                    strokeDashoffset={`${2 * Math.PI * 12 * (1 - g.rate / 100)}`}
                    strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-primary">{g.rate}</span>
              </div>
              <p className="text-caption1 font-medium text-label-alt">{g.title}</p>
            </div>
          ))}
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
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
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
            className="absolute inset-0 flex flex-col px-6 pt-6 pb-4"
          >
            <div className="w-full rounded-2xl bg-primary-soft p-6 mb-7 flex items-center justify-center min-h-[200px]">
              {slide.visual}
            </div>

            <div className="flex-1">
              <h2 className="text-title3 font-bold text-label-strong mb-3 leading-tight whitespace-pre-line font-brand">
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
      <div className="px-6 pb-10 pt-3 flex flex-col gap-3">
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
