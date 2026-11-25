import type { Habit, DailyRoutine, WeeklyGoal, PersonalRoutine, WeeklyReview } from '../types';
import type { ReviewDraft, ReviewSnapshot } from '../utils/reviewDraft';
import { habitToRow, routineToRow, reviewToRow } from '../data/mappers';
import { newId, isUuid } from '../utils/id';
import { today } from '../utils/date';
import { localTimeZone } from '../utils/timeZone';
import { withHistory } from '../utils/scheduleHistory';

type Row = Record<string, unknown>;
export interface ReviewStep {
  id: string;
  kind: 'practice' | 'bundle' | 'weekly-goal' | 'share' | 'review';
  label: string;
  payload: Row;
  status: 'pending' | 'done' | 'conflict' | 'skipped';
  current?: Row | null;
  error?: string;
  prepared?: boolean;
}
export interface ReviewSubmission {
  version: 1; id: string; owner: string; nonce: string;
  week: number; year: number; weekStart: string; weekEnd: string;
  startedAt: string; date: string; timeZone: string; draftDocument: string;
  snapshot: ReviewSnapshot; steps: ReviewStep[]; baseReady: boolean;
}
const prefix = 'onju-review-submission:v1:';
const key = (owner: string) => `${prefix}${encodeURIComponent(owner)}`;
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
export function readReviewSubmission(owner: string): ReviewSubmission | null {
  const raw = localStorage.getItem(key(owner));
  if (!raw) return null;
  const value = JSON.parse(raw) as ReviewSubmission;
  if (value.version !== 1 || value.owner !== owner || !isUuid(value.id) || !isUuid(value.nonce) ||
    !Number.isInteger(value.week) || !Number.isInteger(value.year) || !Number.isFinite(Date.parse(value.startedAt)) ||
    ![value.weekStart,value.weekEnd,value.date].every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    typeof value.draftDocument !== 'string' || typeof value.timeZone !== 'string' || typeof value.baseReady !== 'boolean' ||
    !record(value.snapshot) || !Array.isArray(value.steps) || !value.steps.length ||
    !value.steps.every(s => isUuid(s.id) && ['practice','bundle','weekly-goal','share','review'].includes(s.kind) && typeof s.label === 'string' && record(s.payload) && ['pending','done','conflict','skipped'].includes(s.status))) {
    throw new Error('리뷰 저장 상태를 읽지 못했어요. 기기 데이터를 지우지 말고 다시 열어주세요.');
  }
  return value;
}
function changed() { window.dispatchEvent(new Event('onju-review-submission-changed')); }
export function saveReviewSubmission(next: ReviewSubmission, previous: ReviewSubmission | null): ReviewSubmission {
  const current = readReviewSubmission(next.owner);
  if ((current?.nonce ?? null) !== (previous?.nonce ?? null) || (current && current.id !== next.id)) throw new Error('다른 화면에서 저장 상태가 바뀌었어요. 다시 불러와주세요.');
  const saved = { ...next, nonce: newId() };
  localStorage.setItem(key(next.owner), JSON.stringify(saved)); // Must succeed before any request.
  changed(); return saved;
}
export function clearReviewSubmission(previous: ReviewSubmission) {
  if (readReviewSubmission(previous.owner)?.nonce !== previous.nonce) throw new Error('저장 상태가 바뀌었어요. 다시 확인해주세요.');
  localStorage.removeItem(key(previous.owner)); changed();
}
export function removeOwnerReviewSubmission(owner: string) { localStorage.removeItem(key(owner)); changed(); }
export function subscribeReviewSubmission(change: () => void) {
  window.addEventListener('onju-review-submission-changed',change); window.addEventListener('storage',change);
  return () => { window.removeEventListener('onju-review-submission-changed',change); window.removeEventListener('storage',change); };
}
const running = new Set<string>();
export async function withReviewLock<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const execute=async()=>{
    if(running.has(owner)) throw new Error('다른 화면에서 리뷰를 저장하고 있어요. 잠시 뒤 다시 확인해주세요.');
    running.add(owner); try { return await action(); } finally { running.delete(owner); }
  };
  if(navigator.locks) return navigator.locks.request(`onju-review:${owner}`,{ifAvailable:true},lock=>{
    if(!lock) throw new Error('다른 화면에서 리뷰를 저장하고 있어요. 잠시 뒤 다시 확인해주세요.');
    return execute();
  });
  return execute();
}

/** A conflict is a confirmed non-write. Never skip a request with an unknown outcome. */
export function resolveReviewStep(journal:ReviewSubmission, id:string, action:'skip'|'replace'|'retry'='skip') {
  const step=journal.steps.find(s=>s.id===id);
  if(!step || step.status!=='conflict') throw new Error('현재 저장 상태를 다시 확인해주세요.');
  if(action==='replace' && step.kind!=='review') throw new Error('회고 본문만 비교 후 저장할 수 있어요.');
  return saveReviewSubmission({...journal,steps:journal.steps.map(s=>s.id!==id?s:action==='retry'
    ? {...s,status:'pending',error:undefined}
    : action==='replace'
    ? {...s,id:newId(),status:'pending',error:undefined,payload:{...s.payload,expected:s.current??null}}
    : {...s,status:'skipped',error:undefined})},journal);
}

export function prepareReviewSubmission(input: {
  owner: string; week: number; year: number; weekStart: string; weekEnd: string;
  draft: ReviewDraft; snapshot: ReviewSnapshot; habits: Habit[]; routines: DailyRoutine[];
  bundles: PersonalRoutine[]; weekly: { goal: WeeklyGoal; rate: number }[];
  groups: { id: string; name: string }[];
}): ReviewSubmission {
  const { draft, owner, week, year } = input;
  const startedAt = new Date().toISOString(), date = today(), timeZone = localTimeZone();
  const steps: ReviewStep[] = [];
  const addPractice = (item: Habit | DailyRoutine, creating: boolean, patch: Row) => {
    const id = newId(), kind = 'isActive' in item ? 'routine' : 'habit';
    const next = creating ? item : withHistory(item,patch,date);
    steps.push({ id, kind:'practice', label:`${kind==='habit'?'습관':'루틴'} · ${next.title}`, status:'pending',
      payload:{ item_kind:kind,item_id:item.id,expected_revision:creating?null:item.revision??null,creating,
        item_values:kind==='habit'?habitToRow(next as Habit):routineToRow(next as DailyRoutine),effective_date:date,p_timezone:timeZone } });
  };
  // Old drafts with changesAppliedAt already handed practices to the outbox. Do not recreate them.
  if (!draft.changesAppliedAt) {
    for (const c of draft.routineChanges) {
      if (c.action==='keep') continue;
      const current=input.routines.find(r=>r.id===c.routineId);
      const base=c.baseRoutine??(current?{...current,revision:undefined}:undefined);
      if (c.action==='add' && c.newRoutine) addPractice({...c.newRoutine,id:c.routineId,userId:'',createdAt:startedAt},true,{});
      else if (base) addPractice(base,false,c.action==='delete'?{archivedAt:date,isActive:false}:c.changes??{});
      else throw new Error('원래 루틴을 찾지 못했어요. 해당 조정을 다시 확인해주세요.');
    }
    for (const c of draft.habitChanges) {
      if (c.action==='keep') continue;
      const current=input.habits.find(h=>h.id===c.habitId);
      const base=c.baseHabit??(current?{...current,revision:undefined}:undefined);
      if (c.action==='add' && c.newHabit) addPractice({...c.newHabit,title:c.newHabit.title.trim(),id:c.habitId,userId:'',createdAt:startedAt},true,{});
      else if (base) addPractice(base,false,c.action==='delete'?{archivedAt:date}:c.changes??{});
      else throw new Error('원래 습관을 찾지 못했어요. 해당 조정을 다시 확인해주세요.');
    }
    for (const bundle of input.bundles) {
      const ids=draft.habitChanges.filter(c=>c.action==='add' && c.personalRoutineId===bundle.id).map(c=>c.habitId);
      if (ids.length) steps.push({id:newId(),kind:'bundle',label:`루틴 묶음 · ${bundle.title}`,status:'pending',payload:{id:bundle.id,habit_ids:ids}});
    }
  }
  for (const {goal,rate} of input.weekly) steps.push({id:newId(),kind:'weekly-goal',label:`목표 결산 · ${goal.title}`,status:'pending',payload:{
    id:goal.id,completion_rate:rate,status:rate>=100?'completed':'active',
    expected:{start_date:goal.startDate,end_date:goal.endDate,target_count:goal.targetCount,linked_kind:goal.linkedKind??null,linked_id:goal.linkedId??null,
      completion_rate:goal.completionRate,status:goal.status},
  }});
  for (const groupId of draft.shareToGroups) steps.push({id:newId(),kind:'share',label:`모임 공유 · ${input.groups.find(g=>g.id===groupId)?.name??'선택한 모임'}`,status:'pending',payload:{
    id:draft.submissionIds[groupId]??newId(),group_id:groupId,week_number:week,year,
    personal_rate:input.snapshot.personalRate,faith_rate:input.snapshot.faithRate,comment:draft.comment,intention:draft.intention,
  }});
  const review: WeeklyReview = {id:draft.submissionIds.review,userId:'',weekNumber:week,year,
    ...input.snapshot,mood:draft.mood,comment:draft.comment,intention:draft.intention,goalRatings:{},
    shareToGroups:draft.shareToGroups,routineChanges:draft.routineChanges,habitChanges:draft.habitChanges,
    changesAppliedAt:draft.changesAppliedAt??startedAt,completedAt:startedAt,createdAt:startedAt,
    applicationResults:draft.changesAppliedAt?[...draft.habitChanges,...draft.routineChanges].filter(c=>c.action!=='keep').map(c=>({
      label:`이전 제출에서 반영 · ${c.title??('habitId' in c?c.newHabit?.title:c.newRoutine?.title)??'실천 조정'}`,status:'done' as const,
    })):undefined};
  steps.push({id:newId(),kind:'review',label:'회고 본문과 결산 저장',status:'pending',payload:{values:reviewToRow(review),expected:null}});
  return {version:1,id:newId(),nonce:newId(),owner,week,year,weekStart:input.weekStart,weekEnd:input.weekEnd,
    startedAt,date,timeZone,draftDocument:`weekly-review:${year}:${week}:${input.weekStart}`,snapshot:input.snapshot,steps,baseReady:false};
}

export interface ReviewStepResult { status: 'saved' | 'conflict' | 'deleted'; current: Row | null; replayed?: boolean }
export async function runReviewSubmission(initial: ReviewSubmission, deps: {
  current: () => boolean; readBase: () => Promise<Row | null>;
  send: (step: ReviewStep) => Promise<ReviewStepResult>;
  onChange: (journal: ReviewSubmission) => void;
  onSaved?: (step: ReviewStep, result: ReviewStepResult) => void;
}) {
  let journal=initial;
  const check=()=>{ if(!deps.current()) throw new Error('계정 또는 화면이 바뀌었어요. 원래 계정에서 이어서 확인해주세요.'); };
  const checkpoint=(next:ReviewSubmission)=>{check(); journal=saveReviewSubmission(next,journal);deps.onChange(journal);};
  check();
  if (!journal.baseReady) {
    const expected=await deps.readBase(); check();
    checkpoint({...journal,baseReady:true,steps:journal.steps.map(s=>s.kind==='review'?{...s,payload:{...s.payload,expected}}:s)});
  }
  // Each checkpoint follows a server receipt. A lost checkpoint safely repeats the identical request ID.
  for (const original of journal.steps) {
    let step=original;
    if (step.status==='done'||step.status==='skipped') continue;
    if (step.status==='conflict') break;
    check();
    if (readReviewSubmission(journal.owner)?.nonce!==journal.nonce) throw new Error('저장 상태가 바뀌었어요. 다시 불러와주세요.');
    // Dependent payloads are frozen exactly once, before their first attempt.
    if(!step.prepared && (step.kind==='bundle'||step.kind==='review')) {
      if(step.kind==='bundle') {
        const savedIds=journal.steps.filter(s=>s.kind==='practice' && s.status==='done').map(s=>s.payload.item_id);
        const ids=(step.payload.habit_ids as string[]).filter(id=>savedIds.includes(id));
        step={...step,prepared:true,payload:{...step.payload,habit_ids:ids},status:ids.length?'pending':'skipped'};
      } else {
        const results=journal.steps.filter(s=>s.kind!=='review').map(s=>({label:s.label,status:s.status,
          ...(s.kind==='practice' && s.status==='done'?{date:s.payload.effective_date}:{})}));
        const shares=journal.steps.filter(s=>s.kind==='share'&&s.status==='done').map(s=>s.payload.group_id);
        const values=step.payload.values as Row;
        step={...step,prepared:true,payload:{...step.payload,values:{...values,application_results:[...(values.application_results as unknown[]??[]),...results],share_to_groups:shares}}};
      }
      const prepared=step;
      checkpoint({...journal,steps:journal.steps.map(s=>s.id===prepared.id?prepared:s)});
      if(step.status==='skipped') continue;
    }
    let result:ReviewStepResult;
    try { result=await deps.send(step); }
    catch(error) {
      check();
      checkpoint({...journal,steps:journal.steps.map(s=>s.id===step.id?{...s,error:error instanceof Error?error.message:'연결 후 다시 시도해주세요.'}:s)});
      return journal;
    }
    check();
    if (!result || !['saved','conflict','deleted'].includes(result.status) || !('current' in result)) throw new Error('저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해주세요.');
    checkpoint({...journal,steps:journal.steps.map(s=>s.id===step.id?{...s,status:result.status==='saved'?'done':'conflict',current:result.current,error:undefined}:s)});
    if (result.status!=='saved') break;
    deps.onSaved?.(step,result);
  }
  return journal;
}
