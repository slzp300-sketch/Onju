// Fictional scenarios; all tool candidates and expectations are authored before
// execution. No real participants, sampled demographics, or model replies.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const zones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles']
const us=i=>({locale:'en-US',countryCode:'US',timeZone:zones[i%4],currencyCode:'USD',weekStartsOn:0})
const baseline=(area,current,evidence=current)=>({area,current,evidence,status:'known'})
const objective=(area,result,evidence=result)=>({area,result,evidence,result_kind:'metric'})
const capacity=(summary,evidence=summary)=>({summary,evidence,status:'known'})
const period=evidence=>({kind:'duration',normalized:evidence,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,message,candidate,expect,kind='intended-extraction',seedAfterTurn=4)=>({id,message,candidate,expect,kind,seedAfterTurn})
const invalid=(id,message,candidate,expect,seedAfterTurn=4)=>probe(id,message,candidate,{accepted:false,...expect},'invalid-model-candidate',seedAfterTurn)
const control=(id,message,candidate,expect,seedAfterTurn=4)=>probe(id,message,candidate,expect,'paired-control',seedAfterTurn)
const agent=entry=>({...entry,candidateKind:entry.kind,question:/[가-힣]/.test(entry.message)?'현재 가능한 조건을 더 확인할까요?':'Would you like to clarify the current conditions?',expect:{accepted:entry.expect.accepted??true,...entry.expect}})
const bounds=value=>value===null?null:{min:value,max:value}
const budget=(id,text,minutes,count=null,session=null)=>({id,text,expected:{status:'bounded',weeklyMinutes:bounds(minutes),weeklySessions:bounds(count),perSessionMinutes:bounds(session)}})
const draft=(id,text,frequency,minutes,expectIssue,extras={})=>({id,capacityCorrection:text,frequency,minutes,expectIssue,seedAfterTurn:4,...extras})
// Two starting orders keep the diagnostic from presupposing a fixed interview.
// These shared seeds are not counted as independently generated conversations.
function journey(locale,area,current,result,resultFirst=false) {
  const ko=locale==='ko-KR',duration=ko?'8주':'8 weeks',time=ko?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const areaData={name:area,evidence:area}
  const initial=resultFirst?[
    turn(ko?`${area} 목표를 ${result}으로 정할게.`:`For ${area}, my target is ${result}.`,{areas:[areaData],objectives:[objective(area,result)]},{areas:[area],missing:'period'}),
    turn(ko?`기간은 ${duration}로 정할게.`:`I will work on it for ${duration}.`,{period:period(duration)},{'period.weeks':8,missing:'baseline'}),
    turn(ko?`현재는 ${current}이야.`:`Currently I have completed ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'capacity'}),
  ]:[
    turn(ko?`${area} 목표를 ${duration} 동안 진행할게.`:`My ${area} goal will run for ${duration}.`,{period:period(duration),areas:[areaData]},{areas:[area],'period.weeks':8,missing:'baseline'}),
    turn(ko?`현재는 ${current}이야.`:`Currently I have completed ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(ko?`${result}으로 목표를 정할게.`:`My goal is ${result}.`,{objectives:[objective(area,result)]},{'objectives.0.result':result,missing:'capacity'}),
  ]
  return [...initial,turn(time,{capacity:capacity(time)},{missing:null,'capacity.summary':time})]
}

function twoGoals(ko) {
  const a=ko?'디자인':'design',b=ko?'코딩':'coding',duration=ko?'8주':'8 weeks'
  const one=ko?'프로젝트 1개':'1 project',two=ko?'프로젝트 2개':'2 projects',four=ko?'프로젝트 4개':'4 projects'
  const time=ko?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const equal=ko?'두 목표는 같은 우선순위야.':'Both goals have equal priority.'
  return [
    turn(a+' '+b+' '+duration,{period:period(duration),areas:[{name:a,evidence:a},{name:b,evidence:b}]},{areas:[a,b],missing:'baseline'}),
    turn(a+': '+one+'. '+b+': '+two+'.',{baselines:[baseline(a,one),baseline(b,two)]},{missing:'result'}),
    turn(a+': '+four+'. '+b+': '+four+'.',{objectives:[objective(a,four),objective(b,four)]},{missing:'priority'}),
    turn(equal+' '+time,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:equal},capacity:capacity(time)},{missing:null,'priority.mode':'equal'}),
  ]
}
const unknownKR='공부할 시간은 아직 모르겠어. 목표 기간은 2주야.'
const unknownUS='I do not know my available time yet. The project number is 2.'
const unknownBadKR=invalid('number-from-unrelated-period',unknownKR,{capacity:capacity('주당 2시간',unknownKR)},{'capacity.summary':'주당 1시간 가능해.'})
const unknownBadUS=invalid('number-from-unrelated-label',unknownUS,{capacity:capacity('2 hours per week',unknownUS)},{'capacity.summary':'I can spend 1 hour per week.'})
const partialKR='목표인 프로젝트 5개 중 2개를 완료했어, 나머지 3개는 아직 진행 중이야.'
const partialUS='I have 2 completed projects and 3 unfinished projects toward my goal of 5 projects.'
const pendingKR=invalid('pending-is-not-completed',partialKR,{baselines:[baseline('포트폴리오','3개',partialKR)]},{'baselines.0.current':'프로젝트 1개'})
const pendingUS=invalid('unfinished-is-not-completed',partialUS,{baselines:[baseline('coding','3 projects',partialUS)]},{'baselines.0.current':'1 project'})
const sharedKR='부부 합쳐서 주당 4시간 가능해. 내 몫은 주당 30분이야.'
const sharedUS='Between the two of us, we have 4 hours per week. I personally have 30 minutes per week.'
const sharedBadKR=invalid('couple-budget-not-personal',sharedKR,{capacity:capacity('주당 4시간')},{'capacity.summary':'주당 1시간 가능해.'})
const sharedBadUS=invalid('joint-budget-not-personal',sharedUS,{capacity:capacity('4 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const predictedKR='주당 2시간 가능할 거라고 예상해. 아직 확보된 시간은 아니야.'
const predictedUS='I expect to have 2 hours per week, but that time is not available yet.'
const predictedBadKR=invalid('expected-time-not-available',predictedKR,{capacity:capacity('주당 2시간')},{'capacity.summary':'주당 1시간 가능해.'})
const predictedBadUS=invalid('expected-time-not-available',predictedUS,{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const areaKR='코딩은 프로젝트 3개를 완료했어. 디자인은 그대로야.'
const areaUS='For coding, I have completed 3 projects. My design progress stays the same.'
const wrongAreaKR=invalid('same-unit-wrong-goal',areaKR,{baselines:[baseline('디자인','프로젝트 3개',areaKR)]},{'baselines.0.current':'프로젝트 1개','baselines.1.current':'프로젝트 2개'})
const wrongAreaUS=invalid('same-unit-wrong-goal',areaUS,{baselines:[baseline('design','3 projects',areaUS)]},{'baselines.0.current':'1 project','baselines.1.current':'2 projects'})
const dailyKR='평일 하루 두 번, 회당 10분 가능해.'
const dailyUS='I can spend two 10-minute sessions each weekday.'
const splitKR='평일 하루 한 번; 주말 하루 두 번'
const splitUS='one session each weekday; two sessions each weekend day'

export const round10Personas=[
  {id:'KR-86',age:23,synthetic:true,context:kr,profile:'23세 취업 준비생 / 공부 시간 미측정',situation:'기간의 숫자가 아직 모르는 가용 시간으로 둔갑하지 않아야 한다.',
    steps:journey('ko-KR','학습','자료 1개','자료 4개',true),
    probes:[unknownBadKR,control('known-time-not-confused','주당 30분 가능해. 목표 기간은 2주야.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],
    agentProbes:[{...agent(unknownBadKR),expect:{...unknownBadKR.expect,accepted:true},expectNoChange:true}]},
  {id:'KR-87',age:27,synthetic:true,context:kr,profile:'27세 주니어 디자이너 / 완료·진행 중 포트폴리오',situation:'완료 2개와 진행 중 3개를 같은 발언에서 구분한다.',
    steps:journey('ko-KR','포트폴리오','프로젝트 1개','프로젝트 5개'),probes:[pendingKR,
      control('completed-portion',partialKR,{baselines:[baseline('포트폴리오','2개',partialKR)]},{'baselines.0.current':'2개'})],agentProbes:[agent(pendingKR)]},
  {id:'KR-88',age:31,synthetic:true,context:kr,profile:'31세 맞벌이 부모 / 부부 공동 시간과 개인 시간',situation:'부부가 합산한 시간을 개인의 실행 한도로 잡지 않는다.',
    steps:journey('ko-KR','독서','책 1권','책 4권',true),probes:[sharedBadKR,
      control('personal-share',sharedKR,{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(sharedBadKR)]},
  {id:'KR-89',age:34,synthetic:true,context:kr,profile:'34세 이직 준비 직장인 / 확보 전 예상 여유',situation:'예상 여유를 이미 확보된 시간으로 저장하지 않는다.',
    steps:journey('ko-KR','학습','자료 1개','자료 4개'),probes:[predictedBadKR,
      control('secured-time','지금 확보된 시간은 주당 30분이야.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(predictedBadKR)]},
  {id:'KR-90',age:38,synthetic:true,context:kr,profile:'38세 돌봄 병행 근로자 / 요일별 다른 실행 횟수',situation:'평일 하루 1회, 주말 하루 2회라는 한도를 각각 유지한다.',
    steps:journey('ko-KR','독서','책 1권','책 4권',true),
    probes:[probe('split-daily-counts',splitKR,{capacity:capacity(splitKR)},{next:null})],
    capacityProbes:[budget('split-count-budget',splitKR,null,9)],
    draftProbes:[draft('valid-spread',splitKR,1,5,null,{actions:[{area:'독서',frequency:1,minutes:5,preferredDays:[0]},{area:'독서',frequency:1,minutes:5,preferredDays:[5]},{area:'독서',frequency:1,minutes:5,preferredDays:[5]}]}),
      draft('weekday-count-overflow',splitKR,1,5,'goal_capacity_conflict',{actions:[{area:'독서',frequency:1,minutes:5,preferredDays:[0]},{area:'독서',frequency:1,minutes:5,preferredDays:[0]}]})]},
  {id:'KR-91',age:42,synthetic:true,context:kr,profile:'42세 야간 수업 수강생 / 수요일만 실행 불가',situation:'매일 가능한 시간에 한 요일만 0분이라는 예외가 있다.',
    steps:journey('ko-KR','학습','자료 1개','자료 4개'),
    probes:[probe('zero-day-exception','매일 20분, 단 수요일은 0분',{capacity:capacity('매일 20분, 단 수요일은 0분')},{next:null}),
      control('excluded-day-equivalent','수요일 제외 매일 20분',{capacity:capacity('수요일 제외 매일 20분')},{next:null})],
    capacityProbes:[budget('zero-day-exception','매일 20분, 단 수요일은 0분',120),budget('excluded-day-equivalent','수요일 제외 매일 20분',120)],
    draftProbes:[draft('allowed-monday','매일 20분, 단 수요일은 0분',1,20,null,{preferredDays:[0]}),draft('blocked-wednesday','매일 20분, 단 수요일은 0분',1,10,'goal_capacity_conflict',{preferredDays:[2]})]},
  {id:'KR-92',age:46,synthetic:true,context:kr,profile:'46세 자영업자 / 말로 표현한 짧은 독서 시간',situation:'서른 분을 숫자 30분과 같은 예산으로 이해해야 한다.',
    steps:journey('ko-KR','독서','책 1권','책 4권',true),
    probes:[probe('written-thirty','일주일에 서른 분 가능해.',{capacity:capacity('일주일에 서른 분')},{next:null}),
      control('numeric-thirty','주당 30분 가능해.',{capacity:capacity('주당 30분')},{next:null})],
    capacityProbes:[budget('written-thirty','일주일에 서른 분',30),budget('numeric-thirty','주당 30분',30)],
    draftProbes:[draft('within-thirty','일주일에 서른 분 가능해.',1,20,null)]},
  {id:'KR-93',age:25,synthetic:true,context:kr,profile:'25세 UX 개발자 / 디자인·코딩 두 목표',situation:'단위가 같아도 코딩 성과를 디자인 성과로 저장하면 안 된다.',
    steps:twoGoals(true),probes:[wrongAreaKR,
      control('correct-goal',areaKR,{baselines:[baseline('코딩','프로젝트 3개',areaKR)]},{'baselines.0.current':'프로젝트 1개','baselines.1.current':'프로젝트 3개'})],agentProbes:[agent(wrongAreaKR)]},
  {id:'KR-94',age:30,synthetic:true,context:kr,profile:'30세 교대근무 사무직 / 요약 후 실행 제약 보존',situation:'하루 2회·회당 10분을 주 100분으로 요약해도 원래 제한을 잃으면 안 된다.',
    steps:[...journey('ko-KR','글쓰기','글 1편','글 4편'),turn(dailyKR,{capacity:capacity('주당 100분',dailyKR)},{'capacity.summary':'주당 100분',next:null})],
    draftProbes:[draft('summarized-cap-retains-session-limit',null,1,30,'goal_capacity_conflict',{seedAfterTurn:5,preferredDays:[0]}),
      draft('summarized-cap-retains-daily-count',null,1,5,'goal_capacity_conflict',{seedAfterTurn:5,actions:[0,1,2].map(()=>({area:'글쓰기',frequency:1,minutes:5,preferredDays:[0]}))}),
      draft('full-evidence-valid',dailyKR,2,10,null,{seedAfterTurn:5,preferredDays:[0,1]})]},
  {id:'KR-95',age:37,synthetic:true,context:kr,profile:'37세 팀장 / 업무 급증 후 계획 조정',situation:'최근 수정한 기간·시간을 유지하고 옛 근거 재사용을 거절한다.',
    steps:[...journey('ko-KR','독서','책 1권','책 4권',true),turn('기간을 12주로 늘릴게. 주당 45분 가능해.',{period:period('12주'),capacity:capacity('주당 45분')},{'period.weeks':12,'capacity.summary':'주당 45분'})],
    probes:[invalid('old-time-not-replayed','지금 정한 내용으로 이어가자.',{capacity:capacity('주당 1시간 가능해.')},{'capacity.summary':'주당 45분','period.weeks':12},5),
      control('fresh-small-revision','현재는 주당 30분 가능해.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분','period.weeks':12},5)]},

  {id:'US-81',age:22,synthetic:true,context:us(0),profile:'22세 미국 졸업 예정자 / 프로젝트 번호와 시간',situation:'관련 없는 숫자 2를 모르는 시간의 근거로 쓰지 않는다.',
    steps:journey('en-US','learning','1 project','4 projects',true),probes:[unknownBadUS,
      control('known-time','I can spend 30 minutes per week. The project number is 2.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(unknownBadUS)]},
  {id:'US-82',age:28,synthetic:true,context:us(1),profile:'28세 미국 프리랜서 / 파트너와의 공동 예산',situation:'둘의 합산 시간과 개인의 몫을 분리한다.',
    steps:journey('en-US','side business','1 project','4 projects'),probes:[sharedBadUS,
      control('personal-share',sharedUS,{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(sharedBadUS)]},
  {id:'US-83',age:32,synthetic:true,context:us(2),profile:'32세 미국 부모 / 확보 전 기대 시간',situation:'Expected availability는 현재 확보된 시간과 구분한다.',
    steps:journey('en-US','reading','1 book','4 books',true),probes:[predictedBadUS,
      control('secured-time','I currently have 30 minutes per week available.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(predictedBadUS)]},
  {id:'US-84',age:36,synthetic:true,context:us(3),profile:'36세 미국 소매점 근로자 / 평일·주말 횟수 차이',situation:'시간을 몰라도 사용자가 말한 일간 횟수는 유지해야 한다.',
    steps:journey('en-US','writing','1 article','4 articles'),
    probes:[probe('split-daily-counts',splitUS,{capacity:capacity(splitUS)},{next:null})],
    capacityProbes:[budget('split-count-budget',splitUS,null,9)],
    draftProbes:[draft('valid-spread',splitUS,1,5,null,{actions:[{area:'writing',frequency:1,minutes:5,preferredDays:[0]},{area:'writing',frequency:1,minutes:5,preferredDays:[5]},{area:'writing',frequency:1,minutes:5,preferredDays:[5]}]}),
      draft('weekday-count-overflow',splitUS,1,5,'goal_capacity_conflict',{actions:[{area:'writing',frequency:1,minutes:5,preferredDays:[0]},{area:'writing',frequency:1,minutes:5,preferredDays:[0]}]})]},
  {id:'US-85',age:40,synthetic:true,context:us(0),profile:'40세 미국 직장인 / 매주 수요일 돌봄',situation:'반복 요일의 복수형 Wednesdays를 예외 요일로 이해한다.',
    steps:journey('en-US','learning','1 project','4 projects',true),
    probes:[probe('plural-excluded-day','I can spend 20 minutes daily except Wednesdays.',{capacity:capacity('20 minutes daily except Wednesdays')},{next:null}),
      control('singular-excluded-day','I can spend 20 minutes daily except Wednesday.',{capacity:capacity('20 minutes daily except Wednesday')},{next:null})],
    capacityProbes:[budget('plural-excluded-day','20 minutes daily except Wednesdays',120),budget('singular-excluded-day','20 minutes daily except Wednesday',120)],
    draftProbes:[draft('allowed-monday','I can spend 20 minutes daily except Wednesdays.',1,20,null,{preferredDays:[0]}),draft('blocked-wednesday','I can spend 20 minutes daily except Wednesdays.',1,10,'goal_capacity_conflict',{preferredDays:[2]})]},
  {id:'US-86',age:44,synthetic:true,context:us(1),profile:'44세 미국 투잡 근로자 / 말로 적은 25분',situation:'twenty-five minutes와 25 minutes가 같은 시간을 나타낸다.',
    steps:journey('en-US','reading','1 book','4 books'),
    probes:[probe('written-twenty-five','I can spend twenty-five minutes per week.',{capacity:capacity('twenty-five minutes per week')},{next:null}),
      control('numeric-twenty-five','I can spend 25 minutes per week.',{capacity:capacity('25 minutes per week')},{next:null})],
    capacityProbes:[budget('written-twenty-five','twenty-five minutes per week',25),budget('numeric-twenty-five','25 minutes per week',25)],
    draftProbes:[draft('within-twenty-five','I can spend twenty-five minutes per week.',1,20,null)]},
  {id:'US-87',age:24,synthetic:true,context:us(2),profile:'24세 미국 주니어 디자이너 / 코딩 병행',situation:'동일한 projects 단위라도 목표별 실적을 섞지 않는다.',
    steps:twoGoals(false),probes:[wrongAreaUS,
      control('correct-goal',areaUS,{baselines:[baseline('coding','3 projects',areaUS)]},{'baselines.0.current':'1 project','baselines.1.current':'3 projects'})],agentProbes:[agent(wrongAreaUS)]},
  {id:'US-88',age:35,synthetic:true,context:us(3),profile:'35세 미국 재택근무 부모 / 요약된 시간 한도',situation:'주간 총량으로 요약하더라도 원문의 회당·하루 횟수 제약을 지킨다.',
    steps:[...journey('en-US','writing','1 article','4 articles',true),turn(dailyUS,{capacity:capacity('100 minutes per week',dailyUS)},{'capacity.summary':'100 minutes per week',next:null})],
    draftProbes:[draft('summarized-cap-retains-session-limit',null,1,30,'goal_capacity_conflict',{seedAfterTurn:5,preferredDays:[0]}),
      draft('summarized-cap-retains-daily-count',null,1,5,'goal_capacity_conflict',{seedAfterTurn:5,actions:[0,1,2].map(()=>({area:'writing',frequency:1,minutes:5,preferredDays:[0]}))}),
      draft('full-evidence-valid',dailyUS,2,10,null,{seedAfterTurn:5,preferredDays:[0,1]})]},
  {id:'US-89',age:48,synthetic:true,context:us(0),profile:'48세 미국 경력 전환자 / 미완료 프로젝트',situation:'completed 2와 unfinished 3을 같은 문장에서 구분한다.',
    steps:journey('en-US','coding','1 project','5 projects'),probes:[pendingUS,
      control('completed-portion',partialUS,{baselines:[baseline('coding','2 projects',partialUS)]},{'baselines.0.current':'2 projects'})],agentProbes:[agent(pendingUS),
        agent(control('completed-portion',partialUS,{baselines:[baseline('coding','2 projects',partialUS)]},{'baselines.0.current':'2 projects'}))]},
  {id:'US-90',age:29,synthetic:true,context:us(1),profile:'29세 미국 대학원생 / 단위 환산·주간 기준 유지',situation:'시간의 정상 환산을 허용하되 주간과 일간 측정을 바꿔 저장하지 않는다.',
    steps:journey('en-US','learning','1 project','4 projects',true),
    probes:[control('valid-hour-conversion','I can spend two hours per week.',{capacity:capacity('120 minutes per week','two hours per week')},{'capacity.summary':'120 minutes per week'}),
      invalid('day-vs-week-rate','I currently study 20 minutes per week.',{baselines:[baseline('learning','20 minutes per day','20 minutes per week')]},{'baselines.0.current':'1 project'}),
      control('weekly-rate-preserved','I currently study 20 minutes per week.',{baselines:[baseline('learning','20 minutes per week')]},{'baselines.0.current':'20 minutes per week'})]},
]
export const round10FixtureCorrections=[{
  caseId:'KR-86/number-from-unrelated-period/agent-path',
  reason:'잘못된 후보가 실제 처리기에서 걸러지고 전체 brief가 그대로인 안전한 무변경 경로였다. 도구 ok=false만 기대하던 작성 오류 1개를 정정하고, 전체 상태 불변 단언을 추가했다. 직접 저장 함수의 거절 기대와 다른 제품 실패 기대값은 유지했다.',
  preliminaryReport:'logs/persona-pilot-round10/2026-09-16T07-00-15-203Z/results.json',
}]
