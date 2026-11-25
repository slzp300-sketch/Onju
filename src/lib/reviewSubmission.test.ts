import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {prepareReviewSubmission,readReviewSubmission,saveReviewSubmission,runReviewSubmission,resolveReviewStep,clearReviewSubmission,removeOwnerReviewSubmission,withReviewLock,type ReviewSubmission,type ReviewStep,type ReviewStepResult} from './reviewSubmission';
import {newId} from '../utils/id';

function plan():ReviewSubmission {
  const h1=newId(),h2=newId(),bundle=newId(),group=newId();
  return prepareReviewSubmission({owner:'A',week:44,year:2026,weekStart:'2026-10-26',weekEnd:'2026-11-01',
    draft:{submissionIds:{review:newId()},step:3,mood:'normal',comment:'회고',intention:'계속',routineChanges:[],shareToGroups:[group],
      habitChanges:[h1,h2].map(habitId=>({habitId,action:'add',personalRoutineId:bundle,newHabit:{title:'독서',emoji:'🌱',frequency:'daily',when:''}}))},
    snapshot:{personalRate:80,faithRate:40,combinedRate:60,goalAchievedCount:0,goalTotalCount:0},habits:[],routines:[],weekly:[],groups:[{id:group,name:'함께'}],
    bundles:[{id:bundle,userId:'',title:'저녁',emoji:'🌱',when:'',habitIds:[],timerEnabled:false,createdAt:'2026-01-01'}]});
}
const saved:ReviewStepResult={status:'saved',current:{}};
function deps(){return {current:vi.fn(()=>true),readBase:vi.fn(async()=>null),send:vi.fn(async(step:ReviewStep)=>{void step;return saved;}),onChange:vi.fn()};}
beforeEach(()=>{localStorage.clear();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-28T10:00:00+09:00'));});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
test('첫 번째 실천 성공 후 두 번째 실패: 새로 열고 다음 날 재시도해도 완료 요청·본문 기준·적용일은 유지한다',async()=>{
  const original=saveReviewSubmission(plan(),null),d=deps();d.send.mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error('offline'));
  const partial=await runReviewSubmission(original,d);
  expect(partial.steps.map(s=>s.status)).toEqual(['done','pending','pending','pending','pending']);
  vi.setSystemTime(new Date('2026-10-29T10:00:00+09:00'));
  const retry=deps(),done=await runReviewSubmission(readReviewSubmission('A')!,retry);
  expect(retry.readBase).not.toHaveBeenCalled();expect(retry.send.mock.calls.map(c=>c[0].id)).not.toContain(original.steps[0].id);
  expect(retry.send.mock.calls[0][0].payload).toEqual(original.steps[1].payload);
  expect(done.steps.every(s=>s.status==='done')).toBe(true);
  const values=done.steps.at(-1)!.payload.values as Record<string,unknown>;
  expect(values.personal_rate).toBe(80);expect(values.application_results).toContainEqual({label:'습관 · 독서',status:'done',date:'2026-10-28'});
});
test('요청 전에 기기 보관 실패하면 서버 호출이 시작되지 않는다',()=>{
  const d=deps();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(()=>saveReviewSubmission(plan(),null)).toThrow('quota');expect(d.send).not.toHaveBeenCalled();
});
test('서버 성공 후 기기 체크포인트 유실은 원래 요청 ID·본문으로 재확인한다',async()=>{
  const original=saveReviewSubmission(plan(),null),d=deps();
  d.send.mockImplementationOnce(async()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});return saved;});
  await expect(runReviewSubmission(original,d)).rejects.toThrow('quota');
  vi.restoreAllMocks();const retry=deps();await runReviewSubmission(readReviewSubmission('A')!,retry);
  expect(retry.send.mock.calls[0][0]).toEqual(d.send.mock.calls[0][0]);
});
test('실패 요청은 임의로 제외할 수 없고 서버가 변경하지 않은 충돌만 제외한다',async()=>{
  const original=saveReviewSubmission(plan(),null);expect(()=>resolveReviewStep(original,original.steps[0].id)).toThrow();
  const d=deps();d.send.mockResolvedValueOnce({status:'conflict',current:{title:'현재'}});
  const partial=await runReviewSubmission(original,d);expect(d.send).toHaveBeenCalledTimes(1);
  const chosen=resolveReviewStep(partial,partial.steps[0].id);
  const done=await runReviewSubmission(chosen,deps());
  expect(done.steps[2].payload.habit_ids).toEqual([original.steps[1].payload.item_id]);
  expect((done.steps.at(-1)!.payload.values as Record<string,unknown>).application_results).toContainEqual({label:'습관 · 독서',status:'skipped'});
});
test('본문 충돌 재확인은 새로운 요청 ID를 쓰고 확인한 서버 본문만 기준으로 삼는다',async()=>{
  let p=plan();p={...p,baseReady:true,steps:[{...p.steps.at(-1)!,prepared:true,status:'conflict',current:{comment:'다른 기기'}}]};
  const original=saveReviewSubmission(p,null),next=resolveReviewStep(original,original.steps[0].id,'replace');
  expect(next.steps[0].id).not.toBe(original.steps[0].id);expect(next.steps[0].payload.expected).toEqual({comment:'다른 기기'});
  expect(next.steps[0].payload.values).toEqual(original.steps[0].payload.values);
});
test('전송 응답 전 계정 전환은 이전 계정 상태 체크포인트와 후속 요청을 멈춘다',async()=>{
  const original=saveReviewSubmission(plan(),null),d=deps();d.send.mockImplementationOnce(async()=>{d.current.mockReturnValue(false);return saved;});
  await expect(runReviewSubmission(original,d)).rejects.toThrow('계정');expect(d.send).toHaveBeenCalledTimes(1);
  expect(readReviewSubmission('A')!.steps[0].status).toBe('pending');expect(readReviewSubmission('B')).toBeNull();
});
test('다른 화면에서 갱신되거나 삭제된 저장 상태를 오래된 응답으로 되살리지 않는다',async()=>{
  const original=saveReviewSubmission(plan(),null),d=deps();d.send.mockImplementationOnce(async()=>{clearReviewSubmission(readReviewSubmission('A')!);return saved;});
  await expect(runReviewSubmission(original,d)).rejects.toThrow('다른 화면');expect(readReviewSubmission('A')).toBeNull();
});
test('전체 성공 후 정리 재시도는 서버에 어떤 항목도 다시 보내지 않는다',async()=>{
  const complete=await runReviewSubmission(saveReviewSubmission(plan(),null),deps()),retry=deps();
  await runReviewSubmission(complete,retry);expect(retry.send).not.toHaveBeenCalled();expect(retry.readBase).not.toHaveBeenCalled();
});
test('기존 반영 표시가 있는 초안은 습관·묶음을 재생성하지 않는다',()=>{
  const p=prepareReviewSubmission({owner:'A',week:44,year:2026,weekStart:'2026-10-26',weekEnd:'2026-11-01',draft:{submissionIds:{review:newId()},changesAppliedAt:'2026-10-27T10:00:00Z',step:3,mood:null,comment:'',intention:'계속',routineChanges:[],shareToGroups:[],habitChanges:[{habitId:newId(),action:'add',newHabit:{title:'독서',emoji:'🌱',frequency:'daily',when:''}}]},snapshot:plan().snapshot,habits:[],routines:[],weekly:[],groups:[],bundles:[]});
  expect(p.steps.map(s=>s.kind)).toEqual(['review']);
  expect((p.steps[0].payload.values as Record<string,unknown>).application_results).toEqual([{label:'이전 제출에서 반영 · 독서',status:'done'}]);
});
test('중복 실행 잠금과 계정별 삭제·손상 데이터 보호',async()=>{
  const original=saveReviewSubmission(plan(),null);saveReviewSubmission({...plan(),owner:'B'},null);
  await withReviewLock('A',async()=>{await expect(withReviewLock('A',async()=>{})).rejects.toThrow('다른 화면');});
  removeOwnerReviewSubmission('A');expect(readReviewSubmission('A')).toBeNull();expect(readReviewSubmission('B')).not.toBeNull();
  localStorage.setItem('onju-review-submission:v1:A','{broken');
  expect(()=>readReviewSubmission('A')).toThrow();expect(()=>saveReviewSubmission(original,null)).toThrow();
});

test('가입 상태를 고친 뒤 재확인해도 원래 요청 ID와 내용만 전송한다',async()=>{
  const original=saveReviewSubmission(plan(),null),d=deps();d.send.mockResolvedValueOnce({status:'conflict',current:null});
  const held=await runReviewSubmission(original,d),next=resolveReviewStep(held,held.steps[0].id,'retry'),retry=deps();
  await runReviewSubmission(next,retry);expect(retry.send.mock.calls[0][0].id).toBe(original.steps[0].id);
  expect(retry.send.mock.calls[0][0].payload).toEqual(original.steps[0].payload);
});
