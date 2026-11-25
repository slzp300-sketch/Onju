import { expect, test } from 'vitest';
import { buildReminderSpecs, type ReminderInputs } from './reminderSpecs';
const input: ReminderInputs = { morningEnabled: true, morningTime: '08:00', eveningEnabled: true, eveningTime: '21:00', reviewEnabled: false, personalCount: 0, faithRoutines: [], habits: [{ id: 'h', userId: '', title: '물', emoji: '💧', frequency: 'daily', when: '', createdAt: '', notification: { enabled: true, type: 'push', times: ['09:00'] } }] };
test('현재 습관만 있어도 아침 알림을 예약한다', () => {
  expect(buildReminderSpecs(input).map(s => s.key)).toEqual(['morning', 'evening', 'habit-h-0']);
});
test('비어 있거나 잘못된 시간은 예약하지 않는다', () => {
  expect(buildReminderSpecs({ ...input, morningTime: '', eveningTime: '25:61', habits: [{ ...input.habits[0], notification: { enabled: true, type: 'push', times: ['xx:yy', '', '24:00', '12:30'] } }] })).toEqual([
    expect.objectContaining({ hour: 12, minute: 30 }),
  ]);
});
test('선택 요일이 없으면 매일 알림으로 바뀌지 않고 비활성 신앙 루틴을 제외한다', () => {
  expect(buildReminderSpecs({ ...input, morningEnabled: false, eveningEnabled: false, habits: [{ ...input.habits[0], frequency: 'custom', customDays: [] }], faithRoutines: [{ id: 'r', userId: '', title: '기도', type: 'faith', frequency: 'daily', isActive: false, order: 0, createdAt: '', notification: { enabled: true, type: 'push', times: ['08:00'] } }] })).toEqual([]);
});
test('선택 요일을 중복 없이 OS 요일에 맞춘다', () => {
  const specs = buildReminderSpecs({ ...input, habits: [{ ...input.habits[0], frequency: 'custom', customDays: [1, 1, 5, 9] }] });
  expect(specs.at(-1)?.weekdays).toEqual([2, 6]);
});

test('보관한 습관은 개별 알림을 예약하지 않는다',()=>{
  const specs=buildReminderSpecs({...input,habits:[{...input.habits[0],archivedAt:'2026-10-27'}]});
  expect(specs.some(s=>s.key.startsWith('habit-'))).toBe(false);
});
