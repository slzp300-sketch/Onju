import type { MonthlyGoal } from '../../types';
import { useHabitStore } from '../../store/habitStore';
import { useRoutineStore } from '../../store/routineStore';
import { adherenceFromItems, getLinkedItems, rateFromItems } from '../../utils/goalProgress';
import { today } from '../../utils/date';

export default function GoalEditImpact({ before, after }: { before: MonthlyGoal; after: MonthlyGoal }) {
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs } = useRoutineStore();
  const linked = [...habits, ...faithRoutines].filter(item => item.goalId === before.id);
  const personal = linked.filter(item => !('isActive' in item)).length;
  const faith = linked.length - personal;
  const oldItems = getLinkedItems(before, habits, habitLogs, faithRoutines, logs, today());
  const newItems = getLinkedItems(after, habits, habitLogs, faithRoutines, logs, today());
  const total = (items: typeof oldItems, field: 'doneCount' | 'scheduledTotal') => items.reduce((sum, i) => sum + i[field], 0);
  const periodChanged = before.startDate !== after.startDate || before.endDate !== after.endDate;
  const categoryName = (goal: MonthlyGoal) => goal.category === 'faith' ? '신앙' : '개인';
  return <section aria-label="목표 변경 영향" className="rounded-xl border border-line bg-primary-soft p-4 text-body2">
    <h2 className="font-bold text-label-strong">저장하면 이렇게 바뀌어요</h2>
    <p className="mt-2">분류: {categoryName(before)} → {categoryName(after)}</p>
    <p className="mt-2 break-words">기간: {before.startDate} ~ {before.endDate}<br />→ {after.startDate} ~ {after.endDate}</p>
    <p className="mt-3 font-semibold">현재 연결 {linked.length}개 유지</p>
    <p className="mt-1 flex flex-wrap gap-x-3 text-caption1 text-label-alt"><span>개인 습관 {personal}개</span><span>신앙 루틴 {faith}개</span></p>
    <p className="mt-1 text-caption1 text-label-alt">보관 상태, 반복 일정, 홈의 개인·신앙 탭 위치와 수행 기록은 그대로예요. 새로 연결할 항목만 {categoryName(after)} 분류를 따라요.</p>
    {periodChanged && <>
      <dl className="mt-4 grid grid-cols-2 gap-x-2 gap-y-2 text-caption1">
        <dt>오늘까지 수행률</dt><dd className="text-right font-bold">{adherenceFromItems(oldItems)}% → {adherenceFromItems(newItems)}%</dd>
        <dt>기간 전체 진척</dt><dd className="text-right font-bold">{rateFromItems(oldItems)}% → {rateFromItems(newItems)}%</dd>
        <dt>반영되는 기록</dt><dd className="text-right font-bold">{total(oldItems, 'doneCount')}회 → {total(newItems, 'doneCount')}회</dd>
        <dt>실천 예정 횟수</dt><dd className="text-right font-bold">{total(oldItems, 'scheduledTotal')}회 → {total(newItems, 'scheduledTotal')}회</dd>
      </dl>
      <p className="mt-2 text-caption2 text-label-alt">수행률·진척은 실천별 비율의 평균이에요. 기록 수는 완료·대체·쉼을 포함하며 항목마다 하루 한 번 세어요.</p>
      <p className="mt-3 text-caption1 text-label-alt">이 목표의 진척을 새 기간으로 다시 계산해요. 기간 밖의 기록도 홈·통계에 남고, 연결하기 전·해제한 뒤·보관 중 날짜는 새로 포함하지 않아요.</p>
      {after.startDate > today() && <p className="mt-2 font-semibold">시작 전 목표가 돼요. 현재 수행률·진척은 0%이며 습관은 홈에서 계속 실행할 수 있어요.</p>}
      {after.endDate < today() && <p className="mt-2 font-semibold">지난 목표로 이동해요. 연결된 습관은 자동으로 보관되지 않아요.</p>}
    </>}
  </section>;
}
