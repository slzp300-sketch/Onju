import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

const SLIDES = [
  {
    emoji: '👋',
    accentColor: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
    dotColor: 'bg-indigo-500',
    title: '온주에 오신 걸\n환영해요',
    description: '크리스천 직장인을 위한\n루틴 & 투두 관리 앱이에요.\n신앙과 일상을 함께 가꿔봐요.',
    visual: (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="w-20 h-20 rounded-3xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-200">
          <span className="text-4xl">직</span>
        </div>
        <p className="text-xs font-semibold text-indigo-400 tracking-widest">ONJU</p>
      </div>
    ),
  },
  {
    emoji: '🔁',
    accentColor: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
    dotColor: 'bg-indigo-500',
    title: '루틴으로\n하루를 설계해요',
    description: '개인 루틴과 신앙 루틴을 분리해서\n아침·점심·저녁 시간대별로 관리하고\n매일 체크하며 습관을 만들어요.',
    visual: (
      <div className="w-full bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
          <span className="text-sm">🌅</span>
          <span className="flex-1 text-xs font-bold text-gray-700">아침 루틴</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">1/2</span>
        </div>
        {[
          { num: 1, icon: '📌', label: '모닝 스트레칭', done: true },
          { num: 2, icon: '✝️', label: '아침 기도', done: false },
        ].map(item => (
          <div key={item.num} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50">
            <span className="text-xs font-bold text-gray-400 w-4">{item.num}</span>
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm ${item.done ? 'bg-indigo-100' : 'bg-gray-100'}`}>
              {item.done ? '✅' : item.icon}
            </div>
            <span className={`text-sm font-medium flex-1 ${item.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    emoji: '✅',
    accentColor: 'text-violet-500',
    bgColor: 'bg-violet-50',
    dotColor: 'bg-violet-500',
    title: '투두로\n오늘을 정리해요',
    description: '그날그날 해야 할 일을 투두로 기록해요.\n완료하면 체크! 하루를 마무리할 때\n성취감을 느낄 수 있어요.',
    visual: (
      <div className="w-full bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {[
          { num: 1, label: '팀 보고서 초안 작성', done: true },
          { num: 2, label: '점심 전 메일 답장', done: true },
          { num: 3, label: '저녁 식사 후 산책', done: false },
        ].map(item => (
          <div key={item.num} className={`flex items-center gap-3 px-4 py-3 ${item.num > 1 ? 'border-t border-gray-50' : ''}`}>
            <span className={`text-xs font-bold w-4 ${item.done ? 'text-gray-300' : 'text-gray-400'}`}>{item.num}</span>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-indigo-400 bg-indigo-400' : 'border-gray-300'}`}>
              {item.done && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-medium flex-1 ${item.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    emoji: '🎯',
    accentColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
    dotColor: 'bg-emerald-500',
    title: '목표와 함께\n성장해요',
    description: '이번 달 목표와 이번 주 목표를 세우고\n루틴과 연결해요. 매주 돌아보며\n꾸준히 성장할 수 있어요.',
    visual: (
      <div className="w-full flex flex-col gap-2">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 mb-1">이번달 목표</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <p className="text-sm font-semibold text-gray-800">직장에서 선한 영향력 실천하기</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { title: '주 3회 운동', rate: 67 },
            { title: '말씀 묵상', rate: 100 },
          ].map(g => (
            <div key={g.title} className="flex-1 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 shadow-sm flex items-center gap-2">
              <div className="relative w-8 h-8 flex-shrink-0">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="12" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                  <circle cx="16" cy="16" r="12" fill="none" stroke="#6366f1" strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 12}`}
                    strokeDashoffset={`${2 * Math.PI * 12 * (1 - g.rate / 100)}`}
                    strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-indigo-600">{g.rate}</span>
              </div>
              <p className="text-xs font-medium text-gray-700">{g.title}</p>
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
    <div className="min-h-dvh bg-white flex flex-col select-none">

      {/* 상단 - 건너뛰기 */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="w-8" />
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === step ? 20 : 6, opacity: i === step ? 1 : 0.3 }}
              transition={{ duration: 0.25 }}
              className={`h-1.5 rounded-full ${slide.dotColor}`}
            />
          ))}
        </div>
        <button onClick={finish} className="text-sm text-gray-400 font-medium py-1">
          건너뛰기
        </button>
      </div>

      {/* 슬라이드 콘텐츠 */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="absolute inset-0 flex flex-col px-6 pt-6 pb-4"
          >
            {/* 비주얼 영역 */}
            <div className={`w-full rounded-3xl ${slide.bgColor} p-6 mb-7 flex items-center justify-center min-h-[200px]`}>
              {slide.visual}
            </div>

            {/* 텍스트 */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-3 leading-tight whitespace-pre-line">
                {slide.title}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">
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
            whileTap={{ scale: 0.97 }}
            onClick={finish}
            className="w-full py-4 rounded-2xl bg-indigo-500 text-white font-bold text-base shadow-lg shadow-indigo-200"
          >
            시작하기 🚀
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={goNext}
            className="w-full py-4 rounded-2xl bg-gray-900 text-white font-bold text-base"
          >
            다음
          </motion.button>
        )}
        {step > 0 && (
          <button onClick={goBack} className="text-sm text-gray-400 text-center py-1">
            이전으로
          </button>
        )}
      </div>
    </div>
  );
}
