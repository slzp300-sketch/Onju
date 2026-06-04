import { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, Heart, Bookmark } from 'lucide-react';
import { useHabitStore } from '../store/habitStore';

// 더미 공유 루틴 데이터
const SHARED_ROUTINES = [
  {
    id: 'sr-1',
    userName: '김믿음',
    userEmoji: '😊',
    routineEmoji: '🌅',
    routineName: '아침 모닝루틴',
    when: '기상 직후 30분',
    habits: ['스트레칭 5분', '성경 묵상', '감사 일기'],
    likes: 24,
  },
  {
    id: 'sr-2',
    userName: '이소망',
    userEmoji: '🙂',
    routineEmoji: '💪',
    routineName: '퇴근 후 리셋',
    when: '퇴근 후',
    habits: ['30분 산책', '기도', '독서 20분'],
    likes: 18,
  },
  {
    id: 'sr-3',
    userName: '박사랑',
    userEmoji: '😄',
    routineEmoji: '🌙',
    routineName: '저녁 마무리 루틴',
    when: '취침 1시간 전',
    habits: ['하루 되돌아보기', '내일 계획 작성', '저녁 기도'],
    likes: 31,
  },
  {
    id: 'sr-4',
    userName: '최인내',
    userEmoji: '😌',
    routineEmoji: '📖',
    routineName: '말씀 묵상 루틴',
    when: '점심 시간',
    habits: ['오늘의 말씀 읽기', '묵상 메모', '적용 다짐'],
    likes: 42,
  },
];

type TabType = 'discover' | 'my';

export default function RoutineShare() {
  const [activeTab, setActiveTab] = useState<TabType>('discover');
  const { personalRoutines } = useHabitStore();

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-heading2 font-bold text-label-strong">루틴 공유</h1>
        <p className="text-caption1 text-label-alt mt-0.5">다른 사람의 루틴을 발견하고 나의 루틴을 공유해요</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-line-soft px-4">
        {([
          { key: 'discover' as TabType, label: '둘러보기' },
          { key: 'my' as TabType, label: '내 루틴 공유' },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`relative pb-2.5 mr-6 text-label1 font-bold transition-colors ${activeTab === tab.key ? 'text-label-strong' : 'text-label-alt'}`}>
            {tab.label}
            {activeTab === tab.key && (
              <motion.div layoutId="shareTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-label-strong rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {activeTab === 'discover' ? (
        <div className="flex flex-col gap-3 px-4 py-4 pb-24">
          {SHARED_ROUTINES.map(r => (
            <SharedRoutineCard key={r.id} data={r} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 pb-24">
          <p className="text-caption1 text-label-alt leading-relaxed">
            내 루틴을 공유하면 다른 사람들에게 영감을 줄 수 있어요.
          </p>
          {personalRoutines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="text-4xl mb-3">🗂️</span>
              <p className="text-label1 font-semibold text-label">아직 만든 루틴이 없어요</p>
              <p className="text-caption1 text-label-alt mt-1">홈에서 루틴을 먼저 만들어 보세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {personalRoutines.map(r => (
                <div key={r.id} className="bg-white border border-line-soft rounded-2xl px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{r.emoji}</span>
                      <div>
                        <p className="text-label1 font-bold text-label-strong">{r.title}</p>
                        {r.when && <p className="text-caption1 text-label-alt">{r.when}</p>}
                      </div>
                    </div>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-caption2 font-semibold rounded-xl hover:bg-primary transition-colors">
                      <Share2 size={12} /> 공유
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-caption1 text-label-alt">{r.habitIds.length}개 습관</span>
                    {r.timerEnabled && <span className="text-caption1 text-primary font-medium">· 타이머</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SharedRoutineCard({ data }: { data: typeof SHARED_ROUTINES[0] }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="bg-white border border-line-soft rounded-2xl overflow-hidden">
      {/* 카드 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line-soft">
        <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-lg flex-shrink-0">
          {data.userEmoji}
        </div>
        <div className="flex-1">
          <p className="text-caption2 font-semibold text-label-strong">{data.userName}</p>
        </div>
        <button onClick={() => setSaved(v => !v)}
          className={`transition-colors ${saved ? 'text-primary' : 'text-label-assistive hover:text-label-alt'}`}>
          <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* 루틴 정보 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{data.routineEmoji}</span>
          <div>
            <p className="text-label1 font-bold text-label-strong">{data.routineName}</p>
            <p className="text-caption1 text-label-alt">{data.when}</p>
          </div>
        </div>

        {/* 습관 목록 */}
        <div className="flex flex-col gap-1 ml-1 mb-3">
          {data.habits.map((h, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-caption2 font-bold text-label-assistive w-3">{idx + 1}</span>
              <span className="text-caption1 text-label">{h}</span>
            </div>
          ))}
        </div>

        {/* 좋아요 */}
        <div className="flex items-center justify-between border-t border-line-soft pt-2.5">
          <button onClick={() => setLiked(v => !v)}
            className={`flex items-center gap-1.5 text-caption2 font-semibold transition-colors ${liked ? 'text-red-400' : 'text-label-alt hover:text-red-300'}`}>
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            {data.likes + (liked ? 1 : 0)}
          </button>
          <button className="text-caption1 text-primary font-semibold hover:text-primary transition-colors">
            나도 따라하기
          </button>
        </div>
      </div>
    </div>
  );
}
