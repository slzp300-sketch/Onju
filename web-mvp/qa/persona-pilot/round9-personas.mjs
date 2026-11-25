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
function dual() {
  return [
    turn('글쓰기와 코딩을 8주 동안 진행할게.',{period:period('8주'),areas:[{name:'글쓰기',evidence:'글쓰기'},{name:'코딩',evidence:'코딩'}]},{areas:['글쓰기','코딩'],missing:'baseline'}),
    turn('현재 글쓰기는 글 1편, 코딩은 프로젝트 1개야.',{baselines:[baseline('글쓰기','글 1편'),baseline('코딩','프로젝트 1개')]},{missing:'result'}),
    turn('목표는 글 4편, 프로젝트 3개야.',{objectives:[objective('글쓰기','글 4편'),objective('코딩','프로젝트 3개')]},{missing:'priority'}),
    turn('두 목표는 같은 우선순위야. 주당 1시간 가능해.',{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:'두 목표는 같은 우선순위야.'},capacity:capacity('주당 1시간 가능해.')},{missing:null,'priority.mode':'equal'}),
  ]
}

const futureKR=invalid('relative-future-start','2주 후부터 주당 2시간 가능해. 지금은 야간 근무라 기존 여건 그대로야.',{capacity:capacity('주당 2시간')},{'capacity.summary':'주당 1시간 가능해.'})
const familyKR=invalid('household-aggregate-not-personal','우리 가족 전체는 주당 3시간 가능해. 나는 주당 30분 가능해.',{capacity:capacity('주당 3시간')},{'capacity.summary':'주당 1시간 가능해.'})
const partialKR=probe('completed-part-of-target','목표인 프로젝트 4개 중 2개를 완료했어.',{baselines:[baseline('포트폴리오','2개')]},{'baselines.0.current':'2개'})
const futureUS=invalid('relative-future-start','In two weeks, I can spend 2 hours per week. Until then my current schedule stays the same.',{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const householdUS=invalid('household-aggregate-not-personal','My household has 3 hours per week available. I have 30 minutes per week for my own goal.',{capacity:capacity('3 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const partialUS=invalid('target-in-partial-completion-not-baseline','Of my target of 4 projects, I have completed 2 projects.',{baselines:[baseline('coding','4 projects')]},{'baselines.0.current':'1 project'})
const unknownTimeUS=invalid('invented-two-hours','I do not know how much time I can spend yet.',{capacity:capacity('2 hours per week','I do not know how much time I can spend yet.')},{'capacity.summary':'I can spend 1 hour per week.'})

export const round9Personas=[
  {id:'KR-76',age:24,synthetic:true,context:kr,profile:'24세 취업 준비생 / 포트폴리오 진행률',situation:'완료한 작업 일부와 전체 목표를 한 문장으로 말한다.',
    steps:journey('ko-KR','포트폴리오','프로젝트 1개','프로젝트 6개',true),
    probes:[partialKR,invalid('whole-target-not-completed','목표인 프로젝트 4개 중 2개를 완료했어.',{baselines:[baseline('포트폴리오','프로젝트 4개')]},{'baselines.0.current':'프로젝트 1개'}),
      control('separate-completion','현재 프로젝트 2개를 완료했어. 목표는 프로젝트 4개야.',{baselines:[baseline('포트폴리오','프로젝트 2개')]},{'baselines.0.current':'프로젝트 2개'})],agentProbes:[agent(partialKR)]},
  {id:'KR-77',age:28,synthetic:true,context:kr,profile:'28세 교대근무 간호사 / 근무표 변경 대기',situation:'2주 뒤 생길 시간을 이번 주 시간으로 쓰지 않게 한다.',
    steps:journey('ko-KR','독서','책 1권','책 3권'),probes:[futureKR,
      control('current-window','지금은 주당 30분 가능해.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(futureKR)]},
  {id:'KR-78',age:31,synthetic:true,context:kr,profile:'31세 육아 중인 영업직 / 가족과 본인의 시간 구분',situation:'가족 전체가 쓸 수 있는 시간과 자신의 시간이 다르다.',
    steps:journey('ko-KR','영어','자료 1개','자료 4개',true),probes:[familyKR,
      control('own-portion','우리 가족 전체는 주당 3시간 가능해. 나는 주당 30분 가능해.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(familyKR)]},
  {id:'KR-79',age:35,synthetic:true,context:kr,profile:'35세 돌봄 병행 사무직 / 짧은 두 번의 학습',situation:'평일 하루 두 번 10분이라는 제약을 숫자 표기와 동일하게 해석해야 한다.',
    steps:journey('ko-KR','학습','자료 1개','자료 4개'),
    probes:[probe('written-daily-count','평일 하루 두 번, 회당 10분 가능해.',{capacity:capacity('평일 하루 두 번, 회당 10분')},{next:null}),
      control('numeric-daily-count','평일 하루 2회, 회당 10분 가능해.',{capacity:capacity('평일 하루 2회, 회당 10분')},{next:null})],
    capacityProbes:[budget('written-daily-count','평일 하루 두 번, 회당 10분',100,10,10),budget('numeric-daily-count','평일 하루 2회, 회당 10분',100,10,10)],
    draftProbes:[draft('small-valid-session','평일 하루 두 번, 회당 10분 가능해.',2,10,null)]},
  {id:'KR-80',age:39,synthetic:true,context:kr,profile:'39세 프리랜서 / 주간 총량과 한 번의 집중 시간',situation:'주 2회 총 60분이 반드시 회당 30분이라는 뜻은 아니다.',
    steps:journey('ko-KR','글쓰기','글 1편','글 4편',true),
    probes:[probe('explicit-multiple-bounds','주 2회 총 60분, 회당 최대 40분 가능해.',{capacity:capacity('주 2회 총 60분, 회당 최대 40분')},{next:null})],
    capacityProbes:[budget('explicit-multiple-bounds','주 2회 총 60분, 회당 최대 40분',60,2,40)],
    draftProbes:[draft('valid-unequal-blocks','주 2회 총 60분, 회당 최대 40분 가능해.',1,40,null,{actions:[{area:'글쓰기',frequency:1,minutes:40},{area:'글쓰기',frequency:1,minutes:20}]}),
      draft('too-long-session','주 2회 총 60분, 회당 최대 40분 가능해.',1,45,'goal_capacity_conflict')]},
  {id:'KR-81',age:43,synthetic:true,context:kr,profile:'43세 자영업자 / 영업 후 블로그 작성',situation:'시간 뒤 조사 ‘씩’ 때문에 한 시간 반이 한 시간으로 줄지 않아야 한다.',
    steps:journey('ko-KR','블로그','글 1편','글 4편'),
    probes:[probe('half-hour-suffix','주당 한 시간 반씩 가능해.',{capacity:capacity('주당 한 시간 반씩')},{next:null}),
      control('numeric-equivalent','주당 90분 가능해.',{capacity:capacity('주당 90분')},{next:null})],
    capacityProbes:[budget('half-hour-suffix','주당 한 시간 반씩',90),budget('numeric-equivalent','주당 90분',90)],
    draftProbes:[draft('seventy-five-minutes-within-budget','주당 한 시간 반씩 가능해.',3,25,null)]},
  {id:'KR-82',age:47,synthetic:true,context:kr,profile:'47세 경력 전환 준비자 / 목표 우선순위 변경',situation:'가정에 대한 논의를 마치고 실제로 선택한 우선순위만 저장한다.',steps:dual(),
    probes:[control('decided-after-hypothesis','가정해보자는 게 아니야. 글쓰기를 우선할게.',{priority:{mode:'ranked',primary_area:'글쓰기',flexible_areas:['코딩'],evidence:'글쓰기를 우선할게.'}},{'priority.mode':'ranked','priority.primaryArea':'글쓰기'}),
      invalid('still-only-a-question','글쓰기를 우선하면 어떨까?',{priority:{mode:'ranked',primary_area:'글쓰기',flexible_areas:['코딩'],evidence:'글쓰기를 우선하면 어떨까?'}},{'priority.mode':'equal','priority.primaryArea':''})]},
  {id:'KR-83',age:26,synthetic:true,context:kr,profile:'26세 초임 교사 / 시험기간 계획 축소',situation:'기간 연장과 현재 실행 여건 축소를 함께 반영하되 옛 수치를 되살리지 않는다.',
    steps:[...journey('ko-KR','독서','책 1권','책 4권',true),turn('기간을 12주로 늘릴게. 주당 30분 가능해.',{period:period('12주'),capacity:capacity('주당 30분')},{'period.weeks':12,'capacity.summary':'주당 30분'})],
    probes:[invalid('stale-capacity-overwrite','지금 정한 계획으로 이어가자.',{capacity:capacity('주당 1시간 가능해.')},{'capacity.summary':'주당 30분'},5),
      control('fresh-revision','이제 주당 45분 가능해.',{capacity:capacity('주당 45분')},{'capacity.summary':'주당 45분','period.weeks':12},5)]},
  {id:'KR-84',age:33,synthetic:true,context:kr,profile:'33세 개발자 / 평일과 주말 다른 집중 시간',situation:'주말에만 긴 행동이 가능한데 선호 요일이 평일이면 충돌을 알려야 한다.',
    steps:journey('ko-KR','코딩','프로젝트 1개','프로젝트 3개'),
    probes:[probe('different-day-budgets','평일 하루 10분, 주말 하루 30분 가능해.',{capacity:capacity('평일 하루 10분, 주말 하루 30분')},{next:null})],
    capacityProbes:[budget('different-day-budgets','평일 하루 10분, 주말 하루 30분',110)],
    draftProbes:[draft('weekend-preference','평일 하루 10분, 주말 하루 30분 가능해.',2,25,null,{preferredDays:[5,6]}),
      draft('weekday-preference-conflict','평일 하루 10분, 주말 하루 30분 가능해.',1,25,'goal_capacity_conflict',{preferredDays:[0]})]},
  {id:'KR-85',age:40,synthetic:true,context:kr,profile:'40세 팀 리더 / 앞서 잘못 말한 독서량 정정',situation:'부정한 옛 수치와 정정한 새 수치를 구분한다.',
    steps:journey('ko-KR','독서','책 1권','책 5권',true),
    probes:[probe('corrected-progress','완료한 건 책 2권이 아니라 책 3권이야.',{baselines:[baseline('독서','책 3권')]},{'baselines.0.current':'책 3권'}),
      invalid('negated-old-progress','완료한 건 책 2권이 아니라 책 3권이야.',{baselines:[baseline('독서','책 2권')]},{'baselines.0.current':'책 1권'})]},

  {id:'US-71',age:22,synthetic:true,context:us(0),profile:'22세 미국 졸업 예정자 / 일부 완료된 코딩 목표',situation:'전체 목표 중 일부만 완료했는데 전체 수량을 실적으로 저장하면 안 된다.',
    steps:journey('en-US','coding','1 project','6 projects',true),probes:[partialUS,
      control('actual-completed-part','Of my target of 4 projects, I have completed 2 projects.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],agentProbes:[agent(partialUS)]},
  {id:'US-72',age:27,synthetic:true,context:us(1),profile:'27세 미국 돌봄 노동자 / 새 돌봄 서비스 대기',situation:'In two weeks를 현재 주간 여건으로 오인하지 않는다.',
    steps:journey('en-US','learning','1 project','3 projects'),probes:[futureUS,
      control('current-window','I can spend 30 minutes per week right now.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(futureUS)]},
  {id:'US-73',age:32,synthetic:true,context:us(2),profile:'32세 미국 독립 창작자 / 주말 집필 시간',situation:'one and a quarter를 quarter로만 읽어 실행 여유를 축소하지 않는다.',
    steps:journey('en-US','writing','1 article','4 articles',true),
    probes:[probe('mixed-word-fraction','I can spend one and a quarter of an hour per week.',{capacity:capacity('one and a quarter of an hour per week')},{next:null}),
      control('numeric-equivalent','I can spend 75 minutes per week.',{capacity:capacity('75 minutes per week')},{next:null})],
    capacityProbes:[budget('mixed-word-fraction','one and a quarter of an hour per week',75),budget('numeric-equivalent','75 minutes per week',75)],
    draftProbes:[draft('within-seventy-five','I can spend one and a quarter of an hour per week.',3,20,null)]},
  {id:'US-74',age:36,synthetic:true,context:us(3),profile:'36세 미국 소매점 관리자 / 가구 전체와 개인의 여건',situation:'가구 전체의 시간을 개인 부업 예산으로 쓰지 않는다.',
    steps:journey('en-US','side business','1 project','3 projects'),probes:[householdUS,
      control('own-portion','My household has 3 hours per week available. I have 30 minutes per week for my own goal.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(householdUS)]},
  {id:'US-75',age:41,synthetic:true,context:us(0),profile:'41세 미국 맞벌이 부모 / 하루 두 번의 짧은 작업',situation:'총 시간 안이어도 하루 2회 제한을 3개의 짧은 행동으로 우회하지 않는다.',
    steps:journey('en-US','writing','1 article','4 articles',true),
    probes:[probe('daily-session-cap','I can spend two 10-minute sessions each weekday.',{capacity:capacity('two 10-minute sessions each weekday')},{next:null})],
    capacityProbes:[budget('daily-session-cap','two 10-minute sessions each weekday',100,10,10)],
    draftProbes:[draft('three-sessions-on-monday','I can spend two 10-minute sessions each weekday.',1,5,'goal_capacity_conflict',{actions:[0,1,2].map(()=>({area:'writing',frequency:1,minutes:5,preferredDays:[0]}))}),
      draft('two-sessions-on-monday','I can spend two 10-minute sessions each weekday.',1,5,null,{actions:[0,1].map(()=>({area:'writing',frequency:1,minutes:5,preferredDays:[0]}))})]},
  {id:'US-76',age:45,synthetic:true,context:us(1),profile:'45세 미국 프리랜서 / 세 가지 실행 제한',situation:'주간 시간, 주간 횟수, 회당 상한을 각기 말해도 셋 모두 보존한다.',
    steps:journey('en-US','learning','1 project','3 projects'),
    probes:[probe('three-independent-caps','I can spend 90 minutes total per week; 2 sessions per week; 20 minutes per session.',{capacity:capacity('90 minutes total per week; 2 sessions per week; 20 minutes per session')},{next:null}),
      control('equivalent-conservative-plan','I can spend 2 sessions of 20 minutes per week.',{capacity:capacity('2 sessions of 20 minutes per week')},{next:null})],
    capacityProbes:[budget('three-independent-caps','90 minutes total per week; 2 sessions per week; 20 minutes per session',90,2,20)],
    draftProbes:[draft('within-three-caps','I can spend 90 minutes total per week; 2 sessions per week; 20 minutes per session.',2,15,null)]},
  {id:'US-77',age:49,synthetic:true,context:us(2),profile:'49세 미국 재취업 준비자 / 미측정 학습 시간',situation:'얼마나 시간을 쓸 수 있을지 모르는데 숫자를 강제로 만들지 않는다.',
    steps:journey('en-US','learning','1 project','3 projects',true),
    probes:[probe('unmeasured-time','I do not know how much time I can spend yet.',{capacity:{summary:'Availability not measured yet',evidence:'I do not know how much time I can spend yet.',status:'unmeasured'}},{'capacity.status':'unmeasured',next:null,feasibility:'needs_measurement'}),
      unknownTimeUS,
      invalid('invented-measured-baseline','I do not know how many projects I have completed.',{baselines:[baseline('learning','2 projects','I do not know how many projects I have completed.')]},{'baselines.0.current':'1 project'})],
    agentProbes:[agent(unknownTimeUS)]},
  {id:'US-78',age:25,synthetic:true,context:us(3),profile:'25세 미국 주니어 디자이너 / 업무 급증으로 기간 변경',situation:'새 기간과 시간은 반영하되 확정 결과를 임의로 바꾸지 않는다.',
    steps:[...journey('en-US','design','1 project','4 projects'),turn('Extend the period to 12 weeks. I can spend 30 minutes per week.',{period:period('12 weeks'),capacity:capacity('30 minutes per week')},{'period.weeks':12,'capacity.summary':'30 minutes per week','objectives.0.result':'4 projects'})],
    probes:[control('new-period-keeps-result','I can now spend 45 minutes per week.',{capacity:capacity('45 minutes per week')},{'period.weeks':12,'capacity.summary':'45 minutes per week','objectives.0.result':'4 projects'},5)]},
  {id:'US-79',age:30,synthetic:true,context:us(0),profile:'30세 미국 이주 직장인 / 특정 요일 언어 학습',situation:'가능하다고 말하지 않은 화요일에 과제를 배치하지 않는다.',
    steps:journey('en-US','language learning','1 project','3 projects',true),
    probes:[probe('named-day-window','I can spend 20 minutes every Monday and Wednesday.',{capacity:capacity('20 minutes every Monday and Wednesday')},{next:null})],
    capacityProbes:[budget('named-day-window','20 minutes every Monday and Wednesday',40)],
    draftProbes:[draft('named-days-valid','I can spend 20 minutes every Monday and Wednesday.',2,20,null,{preferredDays:[0,2]}),
      draft('unnamed-tuesday','I can spend 20 minutes every Monday and Wednesday.',1,10,'goal_capacity_conflict',{preferredDays:[1]})]},
  {id:'US-80',age:38,synthetic:true,context:us(1),profile:'38세 미국 투잡 직장인 / 이번 주 실행 중단',situation:'지금 여건이 0이라고 명확히 말하면 새 행동을 억지로 배치하지 않는다.',
    steps:journey('en-US','reading','1 book','3 books'),
    probes:[probe('no-current-time','I can spend 0 minutes per week right now.',{capacity:capacity('0 minutes per week')},{'capacity.summary':'0 minutes per week',next:'feasibility',feasibility:'strained'}),
      control('small-window-resumes','I can spend 15 minutes per week now.',{capacity:capacity('15 minutes per week')},{next:null})],
    capacityProbes:[budget('explicit-zero','0 minutes per week',0)],
    draftProbes:[draft('do-not-force-one-minute','I can spend 0 minutes per week right now.',1,1,'goal_feasibility_choice_required')]},
]

export const round9FixtureCorrections=[]
