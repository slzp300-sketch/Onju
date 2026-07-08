import type { DailyRoutine, Habit } from '../types';

/**
 * 알림 스케줄 spec — 네이티브(OS 예약)와 웹(Supabase reminder_schedule → Edge Function 발송)이
 * 공유하는 중간 표현. 발화 시각(hour/minute)과 요일(weekdays)만 담는 순수 데이터.
 */
export interface ReminderSpec {
  key: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  /** Capacitor/공용 weekday: 1=일 ~ 7=토. 미지정이면 매일. */
  weekdays?: number[];
}

/** 앱 빈도값 → weekday 배열 (undefined = 매일) */
export function freqToWeekdays(
  frequency: 'daily' | 'weekdays' | 'weekends' | 'custom' | number[],
  customDays?: number[],
): number[] | undefined {
  if (frequency === 'daily') return undefined;
  if (frequency === 'weekdays') return [2, 3, 4, 5, 6]; // 월~금
  if (frequency === 'weekends') return [1, 7]; // 일, 토
  if (Array.isArray(frequency)) return frequency.map(d => d + 1); // 0=일 → 1=일
  if (customDays && customDays.length) return customDays.map(d => d + 1);
  return undefined;
}

function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m };
}

export interface ReminderInputs {
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  reviewEnabled: boolean;
  personalCount: number;
  faithRoutines: DailyRoutine[];
  habits: Habit[];
}

/** 설정·루틴·습관 → 예약할 알림 spec 목록 (네이티브/웹 공통) */
export function buildReminderSpecs(input: ReminderInputs): ReminderSpec[] {
  const specs: ReminderSpec[] = [];
  const totalRoutines = input.personalCount + input.faithRoutines.length;

  if (input.morningEnabled && totalRoutines > 0) {
    const { h, m } = parseTime(input.morningTime);
    specs.push({ key: 'morning', title: '좋은 아침이에요! ☀️', body: '오늘의 루틴을 시작해볼까요?', hour: h, minute: m });
  }
  if (input.eveningEnabled) {
    const { h, m } = parseTime(input.eveningTime);
    specs.push({ key: 'evening', title: '오늘 루틴 확인해요 🌙', body: '아직 남은 루틴이 있는지 확인해보세요.', hour: h, minute: m });
  }
  if (input.reviewEnabled) {
    // 일요일 저녁 고정 (예약이라 발화 시각 필요)
    specs.push({ key: 'review', title: '이번 주 어떠셨나요? 📋', body: '주간 리뷰를 작성하고 다음 주를 계획해 보세요.', hour: 20, minute: 0, weekdays: [1] });
  }
  input.faithRoutines.forEach(routine => {
    const n = routine.notification;
    if (!n?.enabled) return;
    const weekdays = freqToWeekdays(routine.frequency);
    n.times.forEach((timeStr, idx) => {
      const { h, m } = parseTime(timeStr);
      specs.push({ key: `faith-${routine.id}-${idx}`, title: `${routine.emoji ?? '🙏'} ${routine.title}`, body: '신앙 루틴을 실천할 시간이에요!', hour: h, minute: m, weekdays });
    });
  });
  input.habits.forEach(habit => {
    const n = habit.notification;
    if (!n?.enabled) return;
    const weekdays = freqToWeekdays(habit.frequency, habit.customDays);
    n.times.forEach((timeStr, idx) => {
      const { h, m } = parseTime(timeStr);
      specs.push({ key: `habit-${habit.id}-${idx}`, title: `${habit.emoji} ${habit.title}`, body: '습관을 실천할 시간이에요!', hour: h, minute: m, weekdays });
    });
  });

  return specs;
}
