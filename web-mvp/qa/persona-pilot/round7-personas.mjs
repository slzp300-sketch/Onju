// Fictional 20–40s personas. These are manually authored candidates and
// expectations, not real users, model answers or estimates of failure prevalence.
// Freeze before the first diagnostic run; preserve earlier cohorts unchanged.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const zones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles']
const us=i=>({locale:'en-US',countryCode:'US',timeZone:zones[i%4],currencyCode:'USD',weekStartsOn:0})
const baseline=(area,current,evidence=current)=>({area,current,evidence,status:'known'})
const objective=(area,result,evidence=result)=>({area,result,evidence,result_kind:'metric'})
const capacity=(summary,evidence=summary)=>({summary,evidence,status:'known'})
const period=evidence=>({kind:'duration',normalized:evidence,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,message,candidate,expect,kind='intended-extraction',seedAfterTurn=4)=>({id,message,candidate,expect,kind,seedAfterTurn})
const invalid=(id,message,candidate,expect)=>probe(id,message,candidate,{accepted:false,...expect},'invalid-model-candidate')
const control=(id,message,candidate,expect)=>probe(id,message,candidate,expect,'paired-control')
const agent=entry=>({...entry,candidate:{...entry.candidate,...(typeof entry.candidate.period==='string'?{period:period(entry.candidate.period)}:{})},candidateKind:entry.kind,
  expect:Object.fromEntries(Object.entries(entry.expect).filter(([key])=>key!=='accepted')),
  question:/[가-힣]/.test(entry.message)?'지금 가장 먼저 정리하고 싶은 부분은 무엇인가요?':'What would you like to clarify first?'})
const bounds=(min,max=min)=>({min,max})
const budget=(id,text,minutes,count=null,perSession=null)=>({id,text,expected:{status:'bounded',weeklyMinutes:bounds(minutes),weeklySessions:count===null?null:bounds(count),perSessionMinutes:perSession===null?null:bounds(perSession)}})
const unresolved=(id,text)=>({id,text,expected:{status:'unresolved',weeklyMinutes:null,weeklySessions:null,perSessionMinutes:null}})
const draft=(id,text,frequency,minutes,expectIssue)=>({id,capacityCorrection:text,frequency,minutes,expectIssue,seedAfterTurn:4})
function single(locale,area,current,result) {
  const korean=locale==='ko-KR', duration=korean?'8주':'8 weeks',time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(korean?`${area} 목표는 ${duration} 동안 진행할게.`:`My ${area} goal will run for ${duration}.`,{period:korean?duration:period(duration),areas:[{name:area,evidence:area}]},{areas:[area],'period.weeks':8,missing:'baseline'}),
    turn(korean?`현재 기준은 ${current}이야.`:`My current starting point is ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(korean?`목표는 ${result}으로 정할게.`:`My goal is ${result}.`,{objectives:[objective(area,result)]},{'objectives.0.result':result,missing:'capacity'}),
    turn(time,{capacity:capacity(time)},{missing:null,'capacity.summary':time}),
  ]
}
function dual(locale,names) {
  const korean=locale==='ko-KR', duration=korean?'8주':'8 weeks',time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const equal=korean?'두 목표는 같은 우선순위야.':'Both goals have equal priority.'
  const current=korean?'1개':'1 project',result=korean?'3개':'3 projects'
  return [
    turn(korean?`${names.join('와 ')} 목표는 ${duration} 동안 할게.`:`My goals are ${names.join(' and ')} for ${duration}.`,{period:korean?duration:period(duration),areas:names.map(name=>({name,evidence:name}))},{areas:names,missing:'baseline'}),
    turn(names.map(name=>`${name}: ${current}`).join('; '),{baselines:names.map(name=>baseline(name,current))},{missing:'result'}),
    turn((korean?'목표는 ':'My goals are ')+names.map(name=>`${name}: ${result}`).join('; '),{objectives:names.map(name=>objective(name,result))},{missing:'priority'}),
    turn(equal+' '+time,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:equal},capacity:capacity(time)},{missing:null}),
  ]
}
const k51=invalid('withdraw-period-request','기간을 12주로 늘릴게. 아니, 방금 말 취소할게. 8주 그대로 해줘.',{period:'12주'},{'period.weeks':8})
const k52=invalid('not-wanting-result','책 6권까지는 하고 싶지 않아. 지금 목표를 유지해줘.',{objectives:[objective('독서','책 6권')]},{'objectives.0.result':'책 3권'})
const k53=invalid('team-output-not-individual','우리 팀은 프로젝트 8개를 완성했어. 내 작업은 프로젝트 1개야.',{baselines:[baseline('코딩','프로젝트 8개')]},{'baselines.0.current':'프로젝트 1개'})
const k56=invalid('future-leave-budget','주당 2시간은 휴가를 받으면 가능해. 아직 휴가가 승인되지 않았어.',{capacity:capacity('주당 2시간')},{'capacity.summary':'주당 1시간 가능해.'})
const k57=invalid('priority-still-thinking','독서를 우선할지 고민 중이야. 아직 선택은 안 했어.',{priority:{mode:'ranked',primary_area:'독서',flexible_areas:['공부'],evidence:'독서를 우선할지 고민 중이야.'}},{'priority.mode':'equal','priority.primaryArea':''})
const k65=invalid('future-output-not-current','다음 달 말에는 프로젝트 4개가 완성될 예정이야. 아직은 프로젝트 1개야.',{baselines:[baseline('코딩','프로젝트 4개')]},{'baselines.0.current':'프로젝트 1개'})
const e46=invalid('withdraw-period-request','Change the period to 12 weeks. Actually, disregard that request. Keep 8 weeks.',{period:period('12 weeks')},{'period.weeks':8})
const e47=invalid('doubt-not-decision','I doubt I can finish 6 books. Please keep my current goal.',{objectives:[objective('reading','6 books')]},{'objectives.0.result':'3 books'})
const e48=invalid('group-output-not-individual','The workshop participants completed 6 projects. My own progress is 1 project.',{baselines:[baseline('coding','6 projects')]},{'baselines.0.current':'1 project'})
const e49=invalid('future-perfect-not-progress','I will have finished 4 projects by next month. Right now I have finished 1 project.',{baselines:[baseline('coding','4 projects')]},{'baselines.0.current':'1 project'})
const e50=invalid('unable-to-spare','I am unable to spare 2 hours per week. Keep my existing time budget.',{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const e51=invalid('future-childcare-budget','I can spend 2 hours per week once childcare starts. It has not started yet.',{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const consentWithdrawal='I choose to keep this target. No, withdraw that consent. I need to think again.'
const e52=invalid('withdraw-consent',consentWithdrawal,{feasibility_acceptance:{evidence:'I choose to keep this target.'}},{feasibilityAcceptance:null,next:'feasibility'})

export const round7Personas=[
  {id:'KR-51',age:20,synthetic:true,context:kr,profile:'20세 대학생 / 시험 기간과 독서',situation:'기간을 늘리겠다고 말했다가 같은 발언에서 철회한다.',steps:single('ko-KR','독서','책 1권','책 3권'),
    probes:[k51,control('current-period-change','기간을 지금 12주로 늘릴게.',{period:'12주'},{'period.weeks':12})],agentProbes:[agent(k51)]},
  {id:'KR-52',age:22,synthetic:true,context:kr,profile:'22세 취업 준비생 / 독서량 부담',situation:'하고 싶지 않다는 의사를 숫자 확정과 구분한다.',steps:single('ko-KR','독서','책 1권','책 3권'),
    probes:[k52,control('willing-result','책 6권으로 목표를 정할게.',{objectives:[objective('독서','책 6권')]},{'objectives.0.result':'책 6권'})],agentProbes:[agent(k52)]},
  {id:'KR-53',age:24,synthetic:true,context:kr,profile:'24세 주니어 개발자 / 팀과 개인 포트폴리오',situation:'팀 전체의 산출물과 본인의 산출물은 다르다.',steps:single('ko-KR','코딩','프로젝트 1개','프로젝트 3개'),
    probes:[k53,control('individual-progress','내 작업은 현재 프로젝트 2개야.',{baselines:[baseline('코딩','프로젝트 2개')]},{'baselines.0.current':'프로젝트 2개'})],agentProbes:[agent(k53)]},
  {id:'KR-54',age:26,synthetic:true,context:kr,profile:'26세 디자이너 / 완성·미완성 구분',situation:'완료한 것은 아니라는 말을 실제 성과로 등록하지 않아야 한다.',steps:single('ko-KR','디자인','시안 1개','시안 3개'),
    probes:[invalid('not-completed-yet','시안 4개를 완료한 건 아니야. 지금은 시안 1개만 끝났어.',{baselines:[baseline('디자인','시안 4개')]},{'baselines.0.current':'시안 1개'}),control('completed-two','시안 2개를 완료했어.',{baselines:[baseline('디자인','시안 2개')]},{'baselines.0.current':'시안 2개'})]},
  {id:'KR-55',age:28,synthetic:true,context:kr,profile:'28세 영업직 / 공부 시간 하한만 알고 있음',situation:'최소 시간은 최대 실행 한도가 아니다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('minimum-budget','주당 최소 2시간 가능해.',{capacity:capacity('주당 최소 2시간 가능해.')},{'capacity.summary':'주당 최소 2시간 가능해.',next:'capacity'}),control('exact-budget','주당 2시간 가능해.',{capacity:capacity('주당 2시간 가능해.')},{next:null})],
    capacityProbes:[unresolved('lower-bound-only','주당 최소 2시간 가능해.')],draftProbes:[draft('no-upper-bound','주당 최소 2시간 가능해.',3,30,'goal_capacity_unresolved')]},
  {id:'KR-56',age:30,synthetic:true,context:kr,profile:'30세 간호사 / 휴가 승인 전 학습',situation:'조건이 충족된 뒤의 시간을 지금 쓸 수 있는 시간으로 저장하지 않는다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[k56,control('leave-approved','휴가가 승인됐어. 지금 주당 2시간 가능해.',{capacity:capacity('주당 2시간')},{'capacity.summary':'주당 2시간'})],agentProbes:[agent(k56)]},
  {id:'KR-57',age:32,synthetic:true,context:kr,profile:'32세 이직 준비 직장인 / 공부와 독서 우선순위',situation:'어느 목표가 먼저인지 고민하는 발언은 순위 확정이 아니다.',steps:dual('ko-KR',['독서','공부']),
    probes:[k57,control('ranked-choice','독서를 우선하고 공부는 줄여도 돼.',{priority:{mode:'ranked',primary_area:'독서',flexible_areas:['공부'],evidence:'독서를 우선하고 공부는 줄여도 돼.'}},{'priority.mode':'ranked','priority.primaryArea':'독서'})],agentProbes:[agent(k57)]},
  {id:'KR-58',age:34,synthetic:true,context:kr,profile:'34세 프리랜서 / 목표 삭제 번복',situation:'삭제 요청 뒤 같은 발언에서 유지하겠다고 정정한다.',steps:dual('ko-KR',['독서','공부']),
    probes:[invalid('withdraw-area-removal','독서는 빼줘. 아니 취소, 독서도 유지할게.',{area_changes:[{area:'독서',action:'remove',evidence:'독서는 빼줘.'}]},{areas:['독서','공부']}),control('explicit-removal','독서는 빼줘.',{area_changes:[{area:'독서',action:'remove',evidence:'독서는 빼줘.'}]},{areas:['공부'],objectiveAreas:['공부']})]},
  {id:'KR-59',age:36,synthetic:true,context:kr,profile:'36세 매장 운영자 / 중단한 공부 재개',situation:'복원 이후 새 기준을 받아야 하고 예전 목표를 자동 재확정하지 않는다.',
    steps:[...dual('ko-KR',['독서','공부']),turn('공부는 빼줘.',{area_changes:[{area:'공부',action:'remove',evidence:'공부는 빼줘.'}]},{areas:['독서']}),turn('공부를 다시 추가할게.',{area_changes:[{area:'공부',action:'restore',evidence:'공부를 다시 추가할게.'}]},{areas:['독서','공부'],objectiveAreas:['독서'],missing:'baseline'})],
    probes:[probe('no-old-details','공부 이야기를 이어가자.',{objectives:[objective('공부','3개')]},{objectiveAreas:['독서'],missing:'baseline'},'invalid-model-candidate',6),probe('fresh-starting-point','현재 공부는 2개 완료했어.',{baselines:[baseline('공부','2개')]},{baselineAreas:['독서','공부'],missing:'result'},'paired-control',6)]},
  {id:'KR-60',age:38,synthetic:true,context:kr,profile:'38세 돌봄 병행 직장인 / 이틀 간격 연습',situation:'이틀마다 실행하는 시간을 주간 평균으로 비교한다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('two-day-budget','이틀마다 20분 가능해.',{capacity:capacity('이틀마다 20분 가능해.')},{'capacity.summary':'이틀마다 20분 가능해.'}),control('numeric-two-days','2일마다 20분 가능해.',{capacity:capacity('2일마다 20분 가능해.')},{'capacity.summary':'2일마다 20분 가능해.'})],
    capacityProbes:[budget('two-day-words','이틀마다 20분 가능해.',70),budget('two-day-numeric','2일마다 20분 가능해.',70)],draftProbes:[draft('over-two-day-average','이틀마다 20분 가능해.',4,20,'goal_capacity_conflict')]},
  {id:'KR-61',age:40,synthetic:true,context:kr,profile:'40세 엔지니어 / 한 번에 20분 공부',situation:'한 번에라는 회당 지시어를 추가 횟수로 계산하지 않는다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('one-at-a-time','주 3회, 한 번에 20분 가능해.',{capacity:capacity('주 3회, 한 번에 20분 가능해.')},{'capacity.summary':'주 3회, 한 번에 20분 가능해.'}),control('per-session-equivalent','주 3회, 회당 20분 가능해.',{capacity:capacity('주 3회, 회당 20분 가능해.')},{next:null})],
    capacityProbes:[budget('per-session-not-fourth-count','주 3회, 한 번에 20분 가능해.',60,3,20)],draftProbes:[draft('over-three-sessions','주 3회, 한 번에 20분 가능해.',3,25,'goal_capacity_conflict')]},
  {id:'KR-62',age:42,synthetic:true,context:kr,profile:'42세 사무직 / 출근일 글쓰기',situation:'월요일부터 금요일까지를 양 끝 두 날로만 해석하면 안 된다.',steps:single('ko-KR','글쓰기','주당 1편','글 8편'),
    probes:[probe('weekday-range','현재 월요일부터 금요일까지 매일 1편을 써.',{baselines:[baseline('글쓰기','월요일부터 금요일까지 매일 1편')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':40}),control('weekday-group','현재 평일 매일 1편을 써.',{baselines:[baseline('글쓰기','평일 매일 1편')]},{'gaps.0.currentPerWeek':5})],
    quantityProbes:[{id:'inclusive-weekday-range',text:'월요일부터 금요일까지 매일 1편',expected:{value:1,unit:'편',perWeek:5}}]},
  {id:'KR-63',age:44,synthetic:true,context:kr,profile:'44세 육아 병행 직장인 / 평일·주말 다른 여유',situation:'요일 묶음별 다른 시간의 합계를 보존한다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('separate-day-budgets','평일 하루 10분, 주말 하루 20분 가능해.',{capacity:capacity('평일 하루 10분, 주말 하루 20분 가능해.')},{'capacity.summary':'평일 하루 10분, 주말 하루 20분 가능해.'}),control('weekly-total','주당 총 90분 가능해.',{capacity:capacity('주당 총 90분 가능해.')},{next:null})],
    capacityProbes:[budget('weekday-plus-weekend','평일 하루 10분, 주말 하루 20분 가능해.',90)],draftProbes:[draft('over-combined-days','평일 하루 10분, 주말 하루 20분 가능해.',5,20,'goal_capacity_conflict')]},
  {id:'KR-64',age:46,synthetic:true,context:kr,profile:'46세 재취업 준비자 / 독서 진도 정정',situation:'같은 문장 안의 아니라고 한 숫자와 최종 숫자를 구분한다.',steps:single('ko-KR','독서','책 0권','책 4권'),
    probes:[invalid('rejected-progress','현재 책 2권이 아니라 책 1권 읽었어.',{baselines:[baseline('독서','책 2권')]},{'baselines.0.current':'책 0권'}),control('corrected-progress','현재 책 2권이 아니라 책 1권 읽었어.',{baselines:[baseline('독서','책 1권')]},{'baselines.0.current':'책 1권'})]},
  {id:'KR-65',age:49,synthetic:true,context:kr,profile:'49세 프로젝트 관리자 / 예상 산출물 보고',situation:'미래 완성 예정량을 현재 누적 성과로 쓰지 않는다.',steps:single('ko-KR','코딩','프로젝트 1개','프로젝트 5개'),
    probes:[k65,control('current-delivery','현재 프로젝트 2개가 완성됐어.',{baselines:[baseline('코딩','프로젝트 2개')]},{'baselines.0.current':'프로젝트 2개'})],agentProbes:[agent(k65)]},
  {id:'US-46',age:21,synthetic:true,context:us(0),profile:'21세 미국 대학생 / 시험 후 일정 변경 번복',situation:'같은 발언에서 철회한 기간 변경을 저장하지 않는다.',steps:single('en-US','reading','1 book','3 books'),
    probes:[e46,control('change-now','Change the period to 12 weeks now.',{period:period('12 weeks')},{'period.weeks':12})],agentProbes:[agent(e46)]},
  {id:'US-47',age:23,synthetic:true,context:us(1),profile:'23세 미국 구직자 / 목표 달성 가능성 의심',situation:'doubt 표현 속 숫자는 새로운 목표 선택이 아니다.',steps:single('en-US','reading','1 book','3 books'),
    probes:[e47,control('decided-six','Set my goal to 6 books.',{objectives:[objective('reading','6 books')]},{'objectives.0.result':'6 books'})],agentProbes:[agent(e47)]},
  {id:'US-48',age:25,synthetic:true,context:us(2),profile:'25세 미국 부트캠프 수강생 / 그룹과 개인 성과',situation:'참가자 전체 작업과 개인 작업을 구분한다.',steps:single('en-US','coding','1 project','3 projects'),
    probes:[e48,control('own-output','My own progress is 2 projects.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],agentProbes:[agent(e48)]},
  {id:'US-49',age:27,synthetic:true,context:us(3),profile:'27세 미국 계약직 개발자 / 미래 완료 예상',situation:'미래완료 시제를 이미 완료한 실적으로 오인하지 않는다.',steps:single('en-US','coding','1 project','5 projects'),
    probes:[e49,control('completed-now','I have finished 2 projects now.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],agentProbes:[agent(e49)]},
  {id:'US-50',age:29,synthetic:true,context:us(0),profile:'29세 미국 간호사 / 주간 공부 시간 부족',situation:'unable to spare를 확보한 시간으로 기록하면 안 된다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[e50,control('able-to-spare','I am able to spare 2 hours per week.',{capacity:capacity('2 hours per week')},{'capacity.summary':'2 hours per week'})],agentProbes:[agent(e50)]},
  {id:'US-51',age:31,synthetic:true,context:us(1),profile:'31세 미국 육아 병행 직장인 / 돌봄 서비스 시작 전',situation:'미래 가용 시간의 once 조건을 보존한다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[e51,control('care-started','Childcare has started. I can spend 2 hours per week now.',{capacity:capacity('2 hours per week')},{'capacity.summary':'2 hours per week'})],agentProbes:[agent(e51)]},
  {id:'US-52',age:33,synthetic:true,context:us(2),profile:'33세 미국 마케터 / 높은 목표 동의 철회',situation:'동의 직후 철회한 경우 첫 주 고강도 선택을 유지하지 않는다.',steps:single('en-US','writing','1 article per week','32 articles'),
    probes:[e52,control('clear-consent','I choose to keep this target for the first week.',{feasibility_acceptance:{evidence:'I choose to keep this target for the first week.'}},{'feasibilityAcceptance.evidence':'I choose to keep this target for the first week.',next:null})],agentProbes:[agent(e52)]},
  {id:'US-53',age:35,synthetic:true,context:us(3),profile:'35세 미국 교사 / 과거와 현재 독서 수준 정정',situation:'과거 사실에 덮이지 않고 명시적인 현재 사실을 기록한다.',steps:single('en-US','reading','0 books','4 books'),
    probes:[invalid('past-output-only','I used to read 4 books. Now I have read 1 book.',{baselines:[baseline('reading','4 books')]},{'baselines.0.current':'0 books'}),control('present-output','I used to read 4 books. Now I have read 1 book.',{baselines:[baseline('reading','1 book')]},{'baselines.0.current':'1 book'})]},
  {id:'US-54',age:37,synthetic:true,context:us(0),profile:'37세 미국 프리랜서 / 한 문장에 기간과 가정 입력',situation:'하나의 업데이트에 잘못된 근거가 섞여도 부분 저장하지 않는다.',steps:single('en-US','coding','1 project','3 projects'),
    probes:[invalid('atomic-invalid-batch','Change the period to 12 weeks. Maybe I could finish 6 projects.',{period:period('12 weeks'),objectives:[objective('coding','6 projects')]},{'period.weeks':8,'objectives.0.result':'3 projects'}),control('atomic-valid-batch','Change the period to 12 weeks. Set my goal to 4 projects.',{period:period('12 weeks'),objectives:[objective('coding','4 projects')]},{'period.weeks':12,'objectives.0.result':'4 projects'})]},
  {id:'US-55',age:39,synthetic:true,context:us(1),profile:'39세 미국 매장 운영자 / 주간 총량과 회당 구분',situation:'총 60분을 세 세션 각각 60분으로 늘리지 않는다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[probe('total-sixty','I can spend 3 sessions per week, 60 minutes total.',{capacity:capacity('3 sessions per week, 60 minutes total')},{'capacity.summary':'3 sessions per week, 60 minutes total'}),control('paired-twenty','I can spend 3 sessions of 20 minutes per week.',{capacity:capacity('3 sessions of 20 minutes per week')},{next:null})],
    capacityProbes:[budget('total-is-not-per-session','3 sessions per week, 60 minutes total',60,3)],draftProbes:[draft('over-total','I can spend 3 sessions per week, 60 minutes total.',3,25,'goal_capacity_conflict'),draft('within-total','I can spend 3 sessions per week, 60 minutes total.',3,20,null)]},
  {id:'US-56',age:41,synthetic:true,context:us(2),profile:'41세 미국 교대근무자 / 격일 연습',situation:'every other day를 주간 평균으로 계산한다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[probe('alternate-days','I can spend 20 minutes every other day.',{capacity:capacity('20 minutes every other day')},{'capacity.summary':'20 minutes every other day'}),control('numeric-two-days','I can spend 20 minutes every 2 days.',{capacity:capacity('20 minutes every 2 days')},{next:null})],
    capacityProbes:[budget('alternate-days-average','20 minutes every other day',70),budget('numeric-average','20 minutes every 2 days',70)],draftProbes:[draft('over-alternate-average','I can spend 20 minutes every other day.',4,20,'goal_capacity_conflict')]},
  {id:'US-57',age:43,synthetic:true,context:us(3),profile:'43세 미국 물류 관리자 / 회당 20분 표현',situation:'at a time도 회당 시간임을 확인한다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[probe('at-a-time','I can spend three times weekly, 20 minutes at a time.',{capacity:capacity('three times weekly, 20 minutes at a time')},{'capacity.summary':'three times weekly, 20 minutes at a time'}),control('canonical-each','I can spend three sessions of 20 minutes each per week.',{capacity:capacity('three sessions of 20 minutes each per week')},{next:null})],
    capacityProbes:[budget('per-session-idiom','three times weekly, 20 minutes at a time',60,3,20)],draftProbes:[draft('over-per-session-idiom','I can spend three times weekly, 20 minutes at a time.',3,25,'goal_capacity_conflict')]},
  {id:'US-58',age:45,synthetic:true,context:us(0),profile:'45세 미국 엔지니어 / 휴대폰 분수 기호 입력',situation:'1½을 2시간이나 별개 숫자로 오독하지 않는다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[probe('unicode-half','I can spend 1½ hours per week.',{capacity:capacity('1½ hours per week')},{'capacity.summary':'1½ hours per week'}),control('decimal-equivalent','I can spend 1.5 hours per week.',{capacity:capacity('1.5 hours per week')},{next:null})],
    capacityProbes:[budget('mixed-unicode-number','1½ hours per week',90),budget('decimal-number','1.5 hours per week',90)],draftProbes:[draft('over-ninety','I can spend 1½ hours per week.',5,20,'goal_capacity_conflict'),draft('within-ninety','I can spend 1½ hours per week.',3,30,null)]},
  {id:'US-59',age:47,synthetic:true,context:us(1),profile:'47세 미국 재취업 준비자 / 특정 요일 학습',situation:'명시한 세 요일에만 가능한 시간을 주간 예산으로 계산한다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[probe('named-three-days','I can spend 20 minutes every Monday, Wednesday and Friday.',{capacity:capacity('20 minutes every Monday, Wednesday and Friday')},{'capacity.summary':'20 minutes every Monday, Wednesday and Friday'}),control('three-sessions','I can spend three sessions of 20 minutes per week.',{capacity:capacity('three sessions of 20 minutes per week')},{next:null})],
    capacityProbes:[budget('explicit-weekday-list','20 minutes every Monday, Wednesday and Friday',60)],draftProbes:[draft('over-named-days','I can spend 20 minutes every Monday, Wednesday and Friday.',3,25,'goal_capacity_conflict')]},
  {id:'US-60',age:49,synthetic:true,context:us(2),profile:'49세 미국 소상공인 / 아직 고르지 않은 시간 후보',situation:'20분 또는 40분 중 미정인 선택을 합산하거나 확정하지 않는다.',steps:single('en-US','studying','1 session per week','2 sessions per week'),
    probes:[invalid('undecided-budget','I can spend 20 or 40 minutes per week, but I have not decided yet.',{capacity:capacity('40 minutes per week')},{'capacity.summary':'I can spend 1 hour per week.'}),control('explicit-forty','I can spend 40 minutes per week.',{capacity:capacity('40 minutes per week')},{next:null})],
    capacityProbes:[unresolved('alternative-is-not-range','20 or 40 minutes per week')],draftProbes:[draft('ambiguous-alternative','I can spend 20 or 40 minutes per week.',2,15,'goal_capacity_unresolved')]},
]
