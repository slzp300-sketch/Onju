import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Star, Smile, Frown } from '../icons';
import type { LucideIcon } from '../icons';
import { fetchReviewByWeek } from '../api/reviews';
import Card from '../components/ui/Card';
import { format } from 'date-fns';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useAuthStore } from '../store/authStore';

const MOOD_MAP: Record<string, { label: string; Icon: LucideIcon }> = {
  hard: { label: '힘들었어요', Icon: Frown },
  normal: { label: '보통이었어요', Icon: Smile },
  easy: { label: '여유로웠어요', Icon: Smile },
};

export default function ReviewResultPage() {
  const { week } = useParams<{ week: string }>();
  const navigate = useNavigate();
  const userId = useAuthStore(state => state.user?.id);
  const habits = useHabitStore(s => s.habits);
  const faithRoutines = useRoutineStore(s => s.faithRoutines);

  // week 파라미터 형식: "YYYY-WW"
  const [year, weekNumber] = (week ?? '').split('-').map(Number);

  const { data: review, isLoading } = useQuery({
    queryKey: ['review', userId, weekNumber, year],
    queryFn: ({ signal }) => userId ? fetchReviewByWeek(weekNumber, year, userId, signal) : Promise.resolve(null),
    enabled: !!userId && !!weekNumber && !!year,
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
  const adjustments = [
    ...(review.habitChanges ?? []).map(c => ({ action: c.action, label: c.newHabit?.title || c.changes?.title || c.title || habits.find(h => h.id === c.habitId)?.title || '개인 습관' })),
    ...review.routineChanges.map(c => ({ action: c.action, label: c.newRoutine?.title || c.changes?.title || c.title || faithRoutines.find(r => r.id === c.routineId)?.title || '루틴' })),
  ].filter(c => c.action !== 'keep');

  return (
    <div className="review-paper flex min-h-full flex-col gap-4 pb-8">
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
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
        <Card className="review-paper-card !p-4 text-center">
          <p className="text-caption1 text-primary font-medium mb-1">개인 루틴</p>
          <p className="text-title2 font-bold text-primary">{review.personalRate}%</p>
        </Card>
        <Card className="review-paper-card !p-4 text-center">
          <p className="text-caption1 text-emerald-400 font-medium mb-1">신앙 루틴</p>
          <p className="text-title2 font-bold text-emerald-600">{review.faithRate}%</p>
        </Card>
      </div>

      {/* 목표 달성 */}
      <Card className="review-paper-card mx-4">
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
      {!review.applicationResults && adjustments.length > 0 && (
        <Card className="mx-4">
          <p className="text-caption2 font-semibold text-label-alt mb-2">루틴·습관 조정 내역</p>
          {review.changesAppliedAt && <p className="text-caption1 text-primary mb-3">{format(new Date(review.changesAppliedAt), 'yyyy년 M월 d일 HH:mm')}부터 적용</p>}
          <div className="flex flex-col gap-2">
            {adjustments
              .map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-body2">
                  <span className={`text-caption1 font-medium px-2 py-0.5 rounded-full ${
                    c.action === 'delete' ? 'bg-negative/10 text-negative' :
                    c.action === 'edit' ? 'bg-primary-soft text-primary' :
                    'bg-positive/10 text-positive'
                  }`}>
                    {c.action === 'delete' ? '보관' : c.action === 'edit' ? '수정' : '추가'}
                  </span>
                  <span className="text-label truncate">
                    {c.label}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
      {review.applicationResults && <Card className="mx-4">
        <p className="text-caption2 font-semibold text-label-alt mb-3">항목별 저장 결과</p>
        <ul className="space-y-3">{review.applicationResults.map((result,i)=><li key={i} className="text-body2 break-words">
          <p>{result.label}</p><p className="text-caption1 text-label-alt">{result.status==='done'?'저장 완료':'최신 상태 유지 · 조정 제외'}{result.date && ` · ${result.date}부터 적용`}</p>
        </li>)}</ul>
      </Card>}
    </div>
  );
}
