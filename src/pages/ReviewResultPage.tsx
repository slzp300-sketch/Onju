import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Star, Smile, Frown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchReviewByWeek } from '../api/reviews';
import Card from '../components/ui/Card';

const MOOD_MAP: Record<string, { label: string; Icon: LucideIcon }> = {
  hard: { label: '힘들었어요', Icon: Frown },
  normal: { label: '보통이었어요', Icon: Smile },
  easy: { label: '여유로웠어요', Icon: Smile },
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
          <div key={i} className="bg-fill rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!review) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6">
        <p className="text-label-alt text-body2">해당 주차의 리뷰를 찾을 수 없어요.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-body2 font-medium">
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
        <button onClick={() => navigate(-1)} className="text-label-alt p-1">
          <ChevronLeft size={22} />
        </button>
        <div>
          <h1 className="text-headline1 font-bold text-label-strong">
            {year}년 {weekNumber}주차 리뷰
          </h1>
          {review.completedAt && (
            <p className="text-caption1 text-label-alt">
              {new Date(review.completedAt).toLocaleDateString('ko-KR')} 완료
            </p>
          )}
        </div>
      </div>

      {/* 달성률 요약 */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <Card className="!p-4 text-center">
          <p className="text-caption1 text-primary font-medium mb-1">개인 루틴</p>
          <p className="text-title2 font-bold text-primary">{review.personalRate}%</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-caption1 text-emerald-400 font-medium mb-1">신앙 루틴</p>
          <p className="text-title2 font-bold text-emerald-600">{review.faithRate}%</p>
        </Card>
      </div>

      {/* 목표 달성 */}
      <Card className="mx-4">
        <p className="text-caption2 font-semibold text-label-alt mb-2">주간 목표</p>
        <p className="text-body2 text-label">
          {review.goalTotalCount}개 중{' '}
          <span className="font-bold text-primary">{review.goalAchievedCount}개</span> 달성
        </p>
      </Card>

      {/* 기분 */}
      {mood && (
        <Card className="mx-4">
          <p className="text-caption2 font-semibold text-label-alt mb-2">이번 주 느낌</p>
          <p className="text-lg flex items-center gap-1.5"><mood.Icon size={18} strokeWidth={1.9} className="text-label" /> <span className="text-body2 text-label">{mood.label}</span></p>
        </Card>
      )}

      {/* 목표 별점 */}
      {Object.keys(review.goalRatings).length > 0 && (
        <Card className="mx-4">
          <p className="text-caption2 font-semibold text-label-alt mb-3">목표 별점</p>
          <div className="flex flex-col gap-2">
            {Object.entries(review.goalRatings).map(([goalId, rating]) => (
              <div key={goalId} className="flex items-center gap-2">
                <span className="text-caption1 text-label-alt flex-1 truncate">{goalId}</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < rating ? 'text-cautionary fill-cautionary' : 'text-line fill-line'}
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
          <p className="text-caption2 font-semibold text-label-alt mb-2">이번 주 소감</p>
          <p className="text-body2 text-label leading-relaxed">"{review.comment}"</p>
        </Card>
      )}

      {/* 다음 주 의도 */}
      {review.intention && (
        <Card className="mx-4">
          <p className="text-caption2 font-semibold text-label-alt mb-2">다음 주 집중</p>
          <p className="text-body2 font-medium text-primary">→ {review.intention}</p>
        </Card>
      )}

      {/* 루틴 변경 내역 */}
      {review.routineChanges.filter(c => c.action !== 'keep').length > 0 && (
        <Card className="mx-4">
          <p className="text-caption2 font-semibold text-label-alt mb-3">루틴 조정 내역</p>
          <div className="flex flex-col gap-2">
            {review.routineChanges
              .filter(c => c.action !== 'keep')
              .map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-body2">
                  <span className={`text-caption1 font-medium px-2 py-0.5 rounded-full ${
                    c.action === 'delete' ? 'bg-negative/10 text-negative' :
                    c.action === 'edit' ? 'bg-primary-soft text-primary' :
                    'bg-positive/10 text-positive'
                  }`}>
                    {c.action === 'delete' ? '삭제' : c.action === 'edit' ? '수정' : '추가'}
                  </span>
                  <span className="text-label truncate">
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
