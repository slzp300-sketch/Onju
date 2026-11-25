import { afterEach, expect, test, vi } from 'vitest';
import { addDays, format } from 'date-fns';
import { getLinkedItems, rateFromItems, adherenceFromItems } from './goalProgress';
import { calendarDayNumber, goalPeriodError, canLinkMonthlyGoal } from './goalRules';
import { withHistory, isItemDue, ruleAt } from './scheduleHistory';
import { elapsedDays } from './date';
import type { Habit, DailyRoutine, MonthlyGoal } from '../types';
const goal: MonthlyGoal = {id:'g',userId:'',title:'목표',month:10,year:2026,startDate:'2026-10-01',endDate:'2026-10-31',status:'active',createdAt:'2026-10-01'};
const habit: Habit = {id:'h',userId:'',title:'산책',emoji:'',frequency:'daily',when:'',goalId:'g',createdAt:'2026-10-01'};
afterEach(() => vi.useRealTimers());

test('기간 축소·확대는 포함 기록과 예정일만 바꾸고 분류 변경은 기존 실천의 진척을 유지한다', () => {
  const linked = withHistory<Habit>({...habit,goalId:undefined},{goalId:'g'},'2026-10-10');
  const logs = ['2026-10-09','2026-10-10','2026-10-25','2026-10-26','2026-10-28'].map(date=>({habitId:'h',date,completed:true}));
  const before = JSON.stringify({linked,logs});
  const read=(g:MonthlyGoal)=>getLinkedItems(g,[linked],logs,[],[],'2026-10-27')[0];
  expect(read(goal)).toMatchObject({doneCount:3,scheduledTotal:22,scheduledElapsed:18});
  expect(read({...goal,startDate:'2026-10-25',endDate:'2026-10-26'})).toMatchObject({doneCount:2,scheduledTotal:2,rate:100});
  expect(read({...goal,startDate:'2026-09-01',category:'faith'})).toEqual(read(goal));
  expect(JSON.stringify({linked,logs})).toBe(before);
});

test('반복·보관·복원·목표 이동 이력을 거친 계산은 날짜별 독립 계산과 일치한다', () => {
  const frequencies: Habit['frequency'][] = ['daily','weekdays','weekends','custom'];
  const dates=Array.from({length:50},(_,i)=>format(addDays(new Date('2026-09-20T12:00:00'),i),'yyyy-MM-dd'));
  for(const frequency of frequencies) {
    let item:Habit={...habit,frequency,customDays:[0,2,5]};
    item=withHistory(item,{frequency:'weekends'},'2026-10-09');
    item=withHistory(item,{archivedAt:'2026-10-15'},'2026-10-15');
    item=withHistory(item,{archivedAt:undefined,frequency:'custom',customDays:[1,3,5]},'2026-10-20');
    item=withHistory(item,{goalId:'other'},'2026-10-28');
    for(const [startDate,endDate] of [['2026-09-20','2026-11-08'],['2026-10-10','2026-10-18'],['2026-10-25','2026-11-08']]) {
      const scheduled=dates.filter(date=>date>=startDate && date<=endDate && isItemDue(item,date) && ruleAt(item,date)?.goalId==='g');
      const elapsed=scheduled.filter(date=>date<='2026-10-26');
      const logs=dates.filter((_,i)=>i%2===0).map(date=>({habitId:'h',date,completed:true}));
      const done=logs.filter(l=>elapsed.includes(l.date)).length;
      const result=getLinkedItems({...goal,startDate,endDate},[item],logs,[],[],'2026-10-26');
      if(scheduled.length) expect(result[0]).toMatchObject({doneCount:done,scheduledTotal:scheduled.length,scheduledElapsed:elapsed.length});
      else expect(result).toEqual([]);
    }
  }
});

test('신앙 요일 배열·대체·쉼은 반영하고 중복 날짜·미래 기록은 비율을 부풀리지 않는다', () => {
  const routine:DailyRoutine={id:'r',userId:'',title:'기도',type:'faith',frequency:[1,2],isActive:true,order:0,createdAt:'2026-10-01',goalId:'g'};
  const logs=[{habitId:'h',date:'2026-10-26',completed:false,substitute:true},{habitId:'h',date:'2026-10-26',completed:true},{habitId:'h',date:'2026-10-27',completed:false,skipped:true},{habitId:'h',date:'2026-10-28',completed:true}];
  const routineLogs=[{id:'l',userId:'',routineId:'r',date:'2026-10-26',completed:false,skipped:true}];
  const items=getLinkedItems({...goal,startDate:'2026-10-26',endDate:'2026-10-28'},[habit],logs,[routine],routineLogs,'2026-10-27');
  expect(items.map(i=>[i.doneCount,i.scheduledTotal,i.scheduledElapsed])).toEqual([[2,3,2],[1,2,2]]);
  expect(rateFromItems(items)).toBe(59);expect(adherenceFromItems(items)).toBe(75);
});

test('기간 안 예정이 없어도 현재 연결을 표시하고 평균에서 제외한다', () => {
  const archived=withHistory(habit,{archivedAt:'2026-10-20'},'2026-10-20');
  const future={...goal,startDate:'2026-11-01',endDate:'2026-11-30'};
  const items=getLinkedItems(future,[archived],[],[],[],'2026-10-27');
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({currentlyLinked:true,scheduledTotal:0,doneCount:0});
  expect(rateFromItems(items)).toBe(0);expect(adherenceFromItems(items)).toBe(0);
  expect(getLinkedItems(future,[habit],[],[],[],'2026-10-27')[0]).toMatchObject({scheduledTotal:30,scheduledElapsed:0});
});

test('실제 달력·윤년·역전 기간을 검증하고 긴 유효 기간도 날짜 배열 없이 계산한다', () => {
  expect(goalPeriodError('2024-02-29','2024-02-29')).toBeUndefined();
  for(const date of ['2026-02-29','2026-04-31','0000-01-01','10000-01-01','invalid']) expect(goalPeriodError(date,'2026-12-31')).toBeTruthy();
  expect(goalPeriodError('2026-11-01','2026-10-31')).toBeTruthy();
  expect(getLinkedItems({...goal,startDate:'2026-02-30'},[habit],[],[],[],'2026-10-27')).toEqual([]);
  expect(getLinkedItems({...goal,endDate:'9999-12-31'},[habit],[],[],[],'2026-10-27')[0].scheduledTotal).toBe(calendarDayNumber('9999-12-31')-calendarDayNumber('2026-10-01')+1);
});

test('분류·기간 변경 뒤 기존 연결은 유지할 수 있으나 새로운 부적합 연결은 막는다', () => {
  const pastFaith={...goal,category:'faith' as const,endDate:'2026-10-20'};
  expect(canLinkMonthlyGoal(pastFaith,'personal','2026-10-27','g')).toBe(true);
  expect(canLinkMonthlyGoal(pastFaith,'personal','2026-10-27')).toBe(false);
  expect(canLinkMonthlyGoal(pastFaith,'faith','2026-10-27')).toBe(false);
  expect(canLinkMonthlyGoal({...goal,startDate:'2026-11-01',endDate:'2026-11-30'},'personal','2026-10-27')).toBe(true);
});

test('시작 전 경과일은 0이고 시작 당일 오후에도 첫날로 계산한다', () => {
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T23:59:00'));
  expect(elapsedDays('2026-10-28','2026-10-30')).toEqual({elapsed:0,total:3});
  expect(elapsedDays('2026-10-27','2026-10-30')).toEqual({elapsed:1,total:4});
  expect(elapsedDays('2026-10-01','2026-10-20')).toEqual({elapsed:20,total:20});
});
