import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../data/repos', () => ({ upsertHabit: vi.fn(), upsertRoutine: vi.fn(), upsertPersonalRoutine: vi.fn() }));
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { prepareReviewSubmission } from '../lib/reviewSubmission';
import { isItemDue, itemOnDate } from './scheduleHistory';
import { isReviewDraft, migrateReviewChanges, reviewChangesError, type ReviewDraft } from './reviewDraft';
import { currentWeek, currentYear, getReviewPrompt } from './date';
import { reviewToRow, reviewFromRow, habitFromRow, routineFromRow } from '../data/mappers';
import type { Habit, HabitChange, WeeklyReview } from '../types';
const habit: Habit = { id: 'old', userId: '', title: '걷기', emoji: '🌱', frequency: 'daily', when: '', createdAt: '2026-10-01' };
const draft: ReviewDraft = { submissionIds: { review: '11111111-1111-4111-8111-111111111111' }, step: 2, mood: null, comment: '', intention: '', habitChanges: [], routineChanges: [], shareToGroups: [] };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T20:00:00'));
  useHabitStore.setState({ habits: [habit, { ...habit, id: 'archive' }], habitLogs: [{ habitId: 'archive', date: '2026-10-31', completed: true }], personalRoutines: [{ id: 'group', userId: '', title: '퇴근', emoji: '🌱', when: '', habitIds: ['old','archive'], timerEnabled: false, createdAt: '2026-10-01' }] });
  useRoutineStore.setState({ personalRoutines: [], faithRoutines: [{ id: 'faith', userId: '', title: '기도', type: 'faith', frequency: 'daily', isActive: true, order: 0, createdAt: '2026-10-01' }], logs: [] });
});
afterEach(() => vi.useRealTimers());

test.each(['2026-11-01T20:00:00', '2026-11-02T08:00:00'])('일요일·월요일 모두 완료 날짜 %s에 추가·수정·보관을 적용하고 과거는 유지한다', now => {
  vi.setSystemTime(new Date(now));
  const at = new Date().toISOString(), day = now.slice(0,10);
  const changes: HabitChange[] = [
    { habitId: 'new', action: 'add', personalRoutineId: 'group', newHabit: { title: ' 독서 ', emoji: '📚', frequency: 'daily', when: '퇴근 후' } },
    { habitId: 'old', action: 'edit', changes: { title: '5분 걷기', frequency: 'weekdays' } },
    { habitId: 'archive', action: 'delete' },
  ];
  const before=useHabitStore.getState();
  const plan=prepareReviewSubmission({owner:'A',week:44,year:2026,weekStart:'2026-10-26',weekEnd:'2026-11-01',
    draft:{...draft,habitChanges:changes,routineChanges:[{routineId:'faith',action:'edit',changes:{title:'감사 기도',frequency:'weekdays'}}]},
    snapshot:{personalRate:0,faithRate:0,combinedRate:0,goalAchievedCount:0,goalTotalCount:0},
    habits:before.habits,routines:useRoutineStore.getState().faithRoutines,bundles:before.personalRoutines,weekly:[],groups:[]});
  const added=habitFromRow(plan.steps.find(s=>s.payload.item_id==='new')!.payload.item_values);
  const old=habitFromRow(plan.steps.find(s=>s.payload.item_id==='old')!.payload.item_values);
  const archive=habitFromRow(plan.steps.find(s=>s.payload.item_id==='archive')!.payload.item_values);
  const faith=routineFromRow(plan.steps.find(s=>s.payload.item_id==='faith')!.payload.item_values);
  expect(added.createdAt).toBe(at);expect(added.title).toBe('독서');expect(isItemDue(added,day)).toBe(true);
  expect(archive.archivedAt).toBe(day);expect(itemOnDate(old,'2026-10-31').title).toBe('걷기');
  expect(itemOnDate(faith,'2026-10-31').title).toBe('기도');
  expect(plan.steps.find(s=>s.kind==='bundle')?.payload.habit_ids).toEqual(['new']);
  expect(useHabitStore.getState()).toBe(before);

});

test('기존 개인 루틴 추가 초안은 같은 ID·사용자 입력으로 새 습관 초안에 복원된다', () => {
  const old: ReviewDraft = { ...draft, routineChanges: [{ routineId: 'legacy', action: 'add', newRoutine: { title: '주말 산책', frequency: [0,6], type: 'personal', order: 999, isActive: true, when: '아침', twoMinuteHabit: '신발 신기' } }] };
  expect(isReviewDraft(old)).toBe(true);
  const migrated = migrateReviewChanges(old);
  expect(migrated.routineChanges).toEqual([]);
  expect(migrated.habitChanges[0]).toMatchObject({ habitId: 'legacy', action: 'add', newHabit: { title: '주말 산책', frequency: 'custom', customDays: [0,6], when: '아침', twoMinuteHabit: '신발 신기' } });
  expect(isReviewDraft({ ...old, ...migrated })).toBe(true);
  expect(migrateReviewChanges({ ...old, ...migrated })).toEqual(migrated);
});

test('입력 중인 초안은 복원하되 빈 이름·요일 없는 실행 계획은 제출하지 못한다', () => {
  const change: HabitChange = { habitId: 'new', action: 'add', newHabit: { title: '', frequency: 'custom', customDays: [], emoji: '🌱', when: '' } };
  expect(isReviewDraft({ ...draft, habitChanges: [change] })).toBe(true);
  expect(reviewChangesError([change], [])).toContain('이름');
  change.newHabit!.title = '독서'; expect(reviewChangesError([change], [])).toContain('요일');
  change.newHabit!.customDays = [1]; expect(reviewChangesError([change], [])).toBeNull();
  expect(reviewChangesError([], [{ routineId: 'faith', action: 'edit', changes: { frequency: [] } }])).toContain('요일');
});

test('리뷰 변경 이름·개인 습관·실제 적용 시각은 서버 왕복에 보존되고 과거 리뷰도 읽힌다', () => {
  const review = { id: 'review', routineChanges: [{ routineId: 'faith', title: '기도', action: 'delete' }], habitChanges: [{ habitId: 'old', title: '걷기', action: 'delete' }], changesAppliedAt: '2026-11-01T11:00:00.000Z' } as WeeklyReview;
  const restored = reviewFromRow(reviewToRow(review));
  expect(restored.habitChanges).toEqual(review.habitChanges); expect(restored.routineChanges).toEqual(review.routineChanges); expect(restored.changesAppliedAt).toBe(review.changesAppliedAt);
  expect(reviewFromRow({}).habitChanges).toEqual([]); expect(reviewFromRow({}).changesAppliedAt).toBeUndefined();
});

test('연말·연초의 리뷰 연도는 ISO 주차와 같고 월요일 유예도 지난 주를 찾는다', () => {
  vi.setSystemTime(new Date('2027-01-01T12:00:00'));
  expect(currentYear()).toBe(2026); expect(currentWeek()).toBe(53);
  const prompt = getReviewPrompt([], new Date('2027-01-04T08:00:00'));
  expect(prompt).toMatchObject({ year: 2026, weekNumber: 53, weekStart: '2026-12-28', weekEnd: '2027-01-03', overdue: true });
});


test('주간 리뷰는 시작 때의 기준 버전을 보존하고 구버전 초안은 최신 버전을 임의로 채우지 않는다',()=>{
  const base={...habit,revision:'old-base'};
  const routine=useRoutineStore.getState().faithRoutines[0];
  const plan=prepareReviewSubmission({owner:'A',week:44,year:2026,weekStart:'2026-10-26',weekEnd:'2026-11-01',
    draft:{...draft,habitChanges:[{habitId:base.id,action:'edit',baseHabit:base,changes:{title:'리뷰 입력'}}],routineChanges:[{routineId:routine.id,action:'edit',changes:{title:'오래된 리뷰'}}]},
    snapshot:{personalRate:0,faithRate:0,combinedRate:0,goalAchievedCount:0,goalTotalCount:0},
    habits:[{...base,revision:'new-base'}],routines:[{...routine,revision:'new-base'}],bundles:[],weekly:[],groups:[]});
  expect(plan.steps.find(s=>s.payload.item_id===base.id)?.payload.expected_revision).toBe('old-base');
  expect(plan.steps.find(s=>s.payload.item_id===routine.id)?.payload.expected_revision).toBeNull();
});
