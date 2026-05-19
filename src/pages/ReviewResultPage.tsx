import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Star } from 'lucide-react';
import { fetchReviewByWeek } from '../api/reviews';
import Card from '../components/ui/Card';

const MOOD_MAP = {
  hard: { label: '힘들었어요', emoji: '😓' },
  normal: { label: '보통이었어요', emoji: '😊' },
  easy: { label: '여유로웠어요', emoji: '😌' },
};

export default function ReviewResultPage() {
  const { week } = useParams<{ week: string }>();
  const navigate = useNavigate();

  // week 파라미터 형식: "YYYY-WW"
  const [year, weekNumber] = (week ?? '').split('-').map(Number);

  const { data: review, isLoading } = useQuery({
    queryKey: ['review', weekNumber, year],
    queryFn: () => fetchReviewByWeek(weekNumber, year),
    enabled: !!weekNumber && !!year,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-12">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6">
        <p className="text-gray-400 text-sm">해당 주차의 리뷰를 찾을 수 없어요.</p>
        <button onClick={() => navigate(-1)} className="text-indigo-500 text-sm font-medium">
          돌아가기
        </button>
      </div>
    );
  }

  const mood = review.mood ? MOOD_MAP[review.mood] : null;

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 p-1">
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">
            {year}년 {weekNumber}주차 리뷰
          </h1>
          {review.completedAt && (
            <p className="text-xs text-gray-400">
              {new Date(review.completedAt).toLocaleDateString('ko-KR')} 완료
            </p>
          )}
        </div>
      </div>

      {/* 달성률 요약 */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <Card className="!p-4 text-center">
          <p className="text-xs text-indigo-400 font-medium mb-1">개인 루틴</p>
          <p className="text-3xl font-bold text-indigo-600">{review.personalRate}%</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-emerald-400 font-medium mb-1">신앙 루틴</p>
          <p className="text-3xl font-bold text-emerald-600">{review.faithRate}%</p>
        </Card>
      </div>

      {/* 목표 달성 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">주간 목표</p>
        <p className="text-sm text-gray-700">
          {review.goalTotalCount}개 중{' '}
          <span className="font-bold text-indigo-600">{review.goalAchievedCount}개</span> 달성
        </p>
      </Card>

      {/* 기분 */}
      {mood && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">이번 주 느낌</p>
          <p className="text-lg">{mood.emoji} <span className="text-sm text-gray-700">{mood.label}</span></p>
        </Card>
      )}

      {/* 목표 별점 */}
      {Object.keys(review.goalRatings).length > 0 && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">목표 별점</p>
          <div className="flex flex-col gap-2">
            {Object.entries(review.goalRatings).map(([goalId, rating]) => (
              <div key={goalId} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 flex-1 truncate">{goalId}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 fill-gray-200'}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 한 줄 소감 */}
      {review.comment && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">이번 주 소감</p>
          <p className="text-sm text-gray-700 leading-relaxed">"{review.comment}"</p>
        </Card>
      )}

      {/* 다음 주 의도 */}
      {review.intention && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">다음 주 집중</p>
          <p className="text-sm font-medium text-indigo-700">→ {review.intention}</p>
        </Card>
      )}

      {/* 루틴 변경 내역 */}
      {review.routineChanges.filter(c => c.action !== 'keep').length > 0 && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">루틴 조정 내역</p>
          <div className="flex flex-col gap-2">
            {review.routineChanges
              .filter(c => c.action !== 'keep')
              .map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    c.action === 'delete' ? 'bg-red-100 text-red-500' :
                    c.action === 'edit' ? 'bg-indigo-100 text-indigo-600' :
                    'bg-emerald-100 text-emerald-600'
                  }`}>
                    {c.action === 'delete' ? '삭제' : c.action === 'edit' ? '수정' : '추가'}
                  </span>
                  <span className="text-gray-600 truncate">
                    {c.action === 'add' ? c.newRoutine?.title : c.routineId}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
