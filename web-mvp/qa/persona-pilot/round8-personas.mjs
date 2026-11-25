// Fictional profiles and authored tool candidates, not real people or model replies.
// Expectations are written before execution. Two fixture-contract corrections
// are documented in round8FixtureCorrections; all product failures stay intact.
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
const agent=entry=>({...entry,candidateKind:entry.kind,
  question:/[가-힣]/.test(entry.message)?'이 내용을 더 확인할까요?':'Would you like to clarify this?',
  expect:{accepted:entry.expect.accepted??true,...entry.expect}})
const bounds=(min,max=min)=>({min,max})
const budget=(id,text,minutes,count=null,session=null)=>({id,text,expected:{status:'bounded',weeklyMinutes:minutes===null?null:bounds(minutes),weeklySessions:count===null?null:bounds(count),perSessionMinutes:session===null?null:bounds(session)}})
const unresolved=(id,text)=>({id,text,expected:{status:'unresolved',weeklyMinutes:null,weeklySessions:null,perSessionMinutes:null}})
const draft=(id,text,frequency,minutes,expectIssue,actions)=>({id,capacityCorrection:text,frequency,minutes,expectIssue,seedAfterTurn:4,...(actions?{actions}:{})})
function single(locale,area,current,result) {
  const korean=locale==='ko-KR',duration=korean?'8주':'8 weeks',time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(korean?`${area} 목표를 ${duration} 동안 진행할게.`:`My ${area} goal will run for ${duration}.`,{period:period(duration),areas:[{name:area,evidence:area}]},{areas:[area],'period.weeks':8,missing:'baseline'}),
    turn(korean?`현재는 ${current}이야.`:`My current starting point is ${current}.`,{baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(korean?`${result}으로 목표를 정할게.`:`My goal is ${result}.`,{objectives:[objective(area,result)]},{'objectives.0.result':result,missing:'capacity'}),
    turn(time,{capacity:capacity(time)},{missing:null,'capacity.summary':time}),
  ]
}
function dual(locale,specs) {
  const korean=locale==='ko-KR',duration=korean?'8주':'8 weeks',names=specs.map(s=>s[0])
  const equal=korean?'두 목표는 같은 우선순위야.':'Both goals have equal priority.',time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(korean?`${names.join('와 ')} 목표를 ${duration} 동안 진행할게.`:`My goals are ${names.join(' and ')} for ${duration}.`,{period:period(duration),areas:names.map(name=>({name,evidence:name}))},{areas:names,missing:'baseline'}),
    turn(specs.map(([name,current])=>`${name}: ${current}`).join('; '),{baselines:specs.map(([name,current])=>baseline(name,current))},{missing:'result'}),
    turn((korean?'목표는 ':'My goals are ')+specs.map(([name,,result])=>`${name}: ${result}`).join('; '),{objectives:specs.map(([name,,result])=>objective(name,result))},{missing:'priority'}),
    turn(equal+' '+time,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:equal},capacity:capacity(time)},{missing:null,'priority.mode':'equal'}),
  ]
}
const k68=invalid('future-start-not-current','다음 달부터 주당 2시간 가능해. 지금은 야간 근무가 계속돼.',{capacity:capacity('주당 2시간')},{'capacity.summary':'주당 1시간 가능해.'})
const k69=invalid('spouse-time-not-self','배우자는 주당 3시간 가능해. 나는 주당 30분 가능해.',{capacity:capacity('주당 3시간')},{'capacity.summary':'주당 1시간 가능해.'})
const k71=invalid('target-not-baseline','올해 목표는 프로젝트 4개야. 현재 끝낸 건 프로젝트 1개야.',{baselines:[baseline('코딩','프로젝트 4개')]},{'baselines.0.current':'프로젝트 1개'})
const k73=invalid('atomic-valid-period-invalid-time','기간을 12주로 늘릴게. 친구는 주당 2시간 가능해.',{period:period('12주'),capacity:capacity('주당 2시간')},{'period.weeks':8,'capacity.summary':'주당 1시간 가능해.'})
const e65=invalid('future-start-not-current','Starting next month, I can spend 2 hours per week. My evening job continues until then.',{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const e66=invalid('target-not-baseline','My target is 4 projects. Currently I have completed 1 project.',{baselines:[baseline('coding','4 projects')]},{'baselines.0.current':'1 project'})
const e68=invalid('employer-budget-not-personal','My employer has 5 hours per week for company training. I can spend 30 minutes per week on my personal goal.',{capacity:capacity('5 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const kDual=[['독서','책 1권','책 3권'],['글쓰기','글 1편','글 4편']]
const eDual=[['writing','1 article','4 articles'],['coding','1 project','3 projects']]

export const round8Personas=[
  {id:'KR-66',age:21,synthetic:true,context:kr,profile:'21세 대학생 / 수업 사이 짧은 복습',situation:'주간 총량이 같아도 회당 5분 제한을 넘지 않아야 한다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('short-session-capture','주 3회, 회당 5분 가능해.',{capacity:capacity('주 3회, 회당 5분 가능해.')},{next:null}),control('short-session-only','회당 5분',{capacity:capacity('회당 5분')},{'capacity.summary':'회당 5분',next:null})],
    capacityProbes:[budget('three-small-sessions','주 3회, 회당 5분 가능해.',15,3,5),budget('session-only','회당 5분',null,null,5)],
    draftProbes:[draft('within-week-over-session','주 3회, 회당 5분 가능해.',1,10,'goal_capacity_conflict'),draft('within-both','주 3회, 회당 5분 가능해.',3,5,null)]},
  {id:'KR-67',age:25,synthetic:true,context:kr,profile:'25세 취업 준비생 / 매일 가능한 공부 시간',situation:'평일 하루 20분을 한 번 60분으로 몰아서 할 수는 없다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[probe('daily-budget','평일 하루 20분 가능해.',{capacity:capacity('평일 하루 20분 가능해.')},{next:null})],
    capacityProbes:[budget('weekday-sum','평일 하루 20분 가능해.',100)],
    draftProbes:[draft('day-cap-not-week-total','평일 하루 20분 가능해.',1,60,'goal_capacity_conflict'),draft('small-daily-plan','평일 하루 20분 가능해.',5,20,null)]},
  {id:'KR-68',age:28,synthetic:true,context:kr,profile:'28세 교대근무자 / 다음 달 주간 근무 전환',situation:'다음 달부터 가능한 시간을 지금 가용 시간으로 저장하지 않는다.',steps:single('ko-KR','공부','주당 1회','주당 2회'),
    probes:[k68,control('current-small-budget','지금은 주당 30분 가능해.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(k68)]},
  {id:'KR-69',age:30,synthetic:true,context:kr,profile:'30세 돌봄 병행 직장인 / 배우자와 본인 시간 구분',situation:'배우자의 여유와 본인의 여유를 각각 다른 주체로 유지한다.',steps:single('ko-KR','독서','책 1권','책 3권'),
    probes:[k69,control('own-budget-same-message','배우자는 주당 3시간 가능해. 나는 주당 30분 가능해.',{capacity:capacity('주당 30분')},{'capacity.summary':'주당 30분'})],agentProbes:[agent(k69)]},
  {id:'KR-70',age:33,synthetic:true,context:kr,profile:'33세 편집자 / 독서와 글쓰기 우선순위 고민',situation:'가정한 우선순위와 실제 선택을 구분한다.',steps:dual('ko-KR',kDual),
    probes:[invalid('hypothetical-priority','글쓰기를 우선한다고 가정해보자. 아직 결정한 것은 없어.',{priority:{mode:'ranked',primary_area:'글쓰기',flexible_areas:['독서'],evidence:'글쓰기를 우선한다고 가정해보자.'}},{'priority.mode':'equal','priority.primaryArea':''}),
      control('actual-priority','독서를 우선하고 글쓰기는 줄여도 돼.',{priority:{mode:'ranked',primary_area:'독서',flexible_areas:['글쓰기'],evidence:'독서를 우선하고 글쓰기는 줄여도 돼.'}},{'priority.mode':'ranked','priority.primaryArea':'독서'})]},
  {id:'KR-71',age:36,synthetic:true,context:kr,profile:'36세 이직 준비 개발자 / 포트폴리오 목표와 실적',situation:'목표 프로젝트 개수를 현재 완성 개수로 등록하지 않는다.',steps:single('ko-KR','코딩','프로젝트 1개','프로젝트 3개'),
    probes:[k71,control('actual-completed-progress','현재 끝낸 건 프로젝트 2개야.',{baselines:[baseline('코딩','프로젝트 2개')]},{'baselines.0.current':'프로젝트 2개'})],agentProbes:[agent(k71)]},
  {id:'KR-72',age:39,synthetic:true,context:kr,profile:'39세 자영업자 / 바쁜 주만 독서 휴식',situation:'이번 주 휴식은 목표 영구 삭제가 아니다.',
    steps:[...dual('ko-KR',kDual),turn('독서는 이번 주만 쉬고 다음 주 다시 이어갈게.',{},{areas:['독서','글쓰기'],objectiveAreas:['독서','글쓰기']})],
    probes:[invalid('pause-is-not-remove','독서는 이번 주만 쉬고 다음 주 다시 이어갈게.',{area_changes:[{area:'독서',action:'remove',evidence:'독서는 이번 주만 쉬고 다음 주 다시 이어갈게.'}]},{areas:['독서','글쓰기']},5),
      control('explicit-removal','독서는 빼줘.',{area_changes:[{area:'독서',action:'remove',evidence:'독서는 빼줘.'}]},{areas:['글쓰기']},5)]},
  {id:'KR-73',age:41,synthetic:true,context:kr,profile:'41세 회사원 / 여러 조건을 한 번에 수정',situation:'유효한 기간 변경과 잘못 추출한 시간 변경이 함께 와도 상태가 반만 저장되지 않는다.',steps:single('ko-KR','글쓰기','글 1편','글 4편'),
    probes:[k73,control('valid-batch-change','기간을 12주로 늘릴게. 나는 주당 30분 가능해.',{period:period('12주'),capacity:capacity('주당 30분')},{'period.weeks':12,'capacity.summary':'주당 30분'})],
    // The handler filters the invalid candidate before the atomic update.
    agentProbes:[{...agent(k73),expect:{accepted:true,'period.weeks':12,'capacity.summary':'주당 1시간 가능해.'}}]},
  {id:'KR-74',age:45,synthetic:true,context:kr,profile:'45세 서점 직원 / 주말 개인 독서',situation:'일상적인 한 시간 반 표현을 1시간으로 잘라 읽지 않는다.',steps:single('ko-KR','독서','책 1권','책 3권'),
    probes:[probe('hour-and-half','주당 1시간 반 가능해.',{capacity:capacity('주당 1시간 반 가능해.')},{'capacity.summary':'주당 1시간 반 가능해.'}),control('ninety-minutes','주당 90분 가능해.',{capacity:capacity('주당 90분 가능해.')},{next:null})],
    capacityProbes:[budget('hour-and-half','주당 1시간 반 가능해.',90),budget('same-in-minutes','주당 90분 가능해.',90)],
    draftProbes:[draft('within-ninety','주당 1시간 반 가능해.',3,25,null)]},
  {id:'KR-75',age:49,synthetic:true,context:kr,profile:'49세 재취업 준비자 / 실제 달력 마감',situation:'다음 달 말 마감은 현재 날짜에 맞춰 계산하고 다른 달로 바꾸지 않는다.',steps:single('ko-KR','공부','완료 1개','완료 3개'),
    probes:[probe('next-month-deadline','마감을 다음 달 말까지로 바꿔줘.',{period:{kind:'deadline',normalized:'2026-10-31',evidence:'다음 달 말까지'}},{'period.deadline':'2026-10-31'}),
      invalid('invented-end-of-year','마감을 다음 달 말까지로 바꿔줘.',{period:{kind:'deadline',normalized:'2026-12-31',evidence:'다음 달 말까지'}},{'period.weeks':8,'period.deadline':null})]},
  {id:'US-61',age:20,synthetic:true,context:us(0),profile:'20세 미국 대학생 / 읽기 속도 미측정',situation:'아직 측정하지 않은 속도를 0 실력으로 바꾸지 않고 첫 주 측정으로 둔다.',steps:single('en-US','reading','1 book','3 books'),
    probes:[probe('unmeasured-speed','I have never measured my reading speed.',{baselines:[{area:'reading',current:'Unmeasured reading speed',evidence:'I have never measured my reading speed.',status:'unmeasured'}]},{'baselines.0.status':'unmeasured',feasibility:'needs_measurement'}),
      control('measured-progress','I have finished 2 books.',{baselines:[baseline('reading','2 books')]},{'baselines.0.current':'2 books'})]},
  {id:'US-62',age:23,synthetic:true,context:us(1),profile:'23세 주니어 디자이너 / 짧은 작업 창',situation:'회당 10분만 말했을 때 주간 시간은 만들어내지 않는다.',steps:single('en-US','design','1 project','3 projects'),
    probes:[probe('session-only','I can spend 10 minutes per session.',{capacity:capacity('10 minutes per session')},{'capacity.summary':'10 minutes per session',next:null}),
      control('needs-scope','I can spend 10 minutes.',{capacity:capacity('10 minutes')},{next:'capacity'})],
    capacityProbes:[budget('session-only','10 minutes per session',null,null,10),unresolved('missing-scope','10 minutes')],
    draftProbes:[draft('over-session','I can spend 10 minutes per session.',1,15,'goal_capacity_conflict')]},
  {id:'US-63',age:27,synthetic:true,context:us(2),profile:'27세 상담직 직장인 / 주간·회당 이중 제한',situation:'주 총 90분과 회당 최대 20분을 함께 보존해야 한다.',steps:single('en-US','writing','1 article','4 articles'),
    probes:[probe('two-compatible-limits','I can spend 90 minutes total per week, no more than 20 minutes per session.',{capacity:capacity('90 minutes total per week, no more than 20 minutes per session')},{next:null}),
      control('equivalent-small-sessions','I can spend 3 sessions of 20 minutes per week.',{capacity:capacity('3 sessions of 20 minutes per week')},{next:null})],
    capacityProbes:[budget('weekly-and-session','90 minutes total per week, no more than 20 minutes per session',90,null,20)],
    draftProbes:[draft('session-over-but-week-under','I can spend 90 minutes total per week, no more than 20 minutes per session.',1,25,'goal_capacity_conflict')]},
  {id:'US-64',age:30,synthetic:true,context:us(3),profile:'30세 아이를 키우는 직장인 / 평일·주말 다른 시간',situation:'주간 합계 안이어도 어느 날의 하루 최대 시간보다 긴 행동은 배치하지 않는다.',steps:single('en-US','reading','1 book','3 books'),
    probes:[probe('split-day-budget','I can spend 10 minutes per day on weekdays, 20 minutes per day on weekends.',{capacity:capacity('10 minutes per day on weekdays, 20 minutes per day on weekends')},{next:null})],
    capacityProbes:[budget('split-day-total','10 minutes per day on weekdays, 20 minutes per day on weekends',90)],
    draftProbes:[draft('longer-than-any-day','I can spend 10 minutes per day on weekdays, 20 minutes per day on weekends.',1,50,'goal_capacity_conflict'),draft('small-start','I can spend 10 minutes per day on weekdays, 20 minutes per day on weekends.',3,10,null)]},
  {id:'US-65',age:32,synthetic:true,context:us(0),profile:'32세 야간 아르바이트 병행자 / 다음 달 학습 시작',situation:'미래 시작일이 붙은 여유 시간을 현재 여건과 혼동하지 않는다.',steps:single('en-US','learning','1 project','3 projects'),
    probes:[e65,control('available-now','I can spend 30 minutes per week right now.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(e65)]},
  {id:'US-66',age:35,synthetic:true,context:us(1),profile:'35세 경력 전환 개발자 / 목표·현재 산출물 분리',situation:'목표 문장에 있는 프로젝트 수를 현재 실적에 넣지 않는다.',steps:single('en-US','coding','1 project','3 projects'),
    probes:[e66,control('current-progress','Currently I have completed 2 projects.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],agentProbes:[agent(e66)]},
  {id:'US-67',age:38,synthetic:true,context:us(2),profile:'38세 제품 관리자 / 글쓰기와 코딩 병행',situation:'각 목표에 동일한 총 가용 시간을 중복 배정하지 않는다.',steps:dual('en-US',eDual),
    probes:[probe('shared-budget','I can spend 45 minutes per week across both goals.',{capacity:capacity('45 minutes per week')},{'capacity.summary':'45 minutes per week'})],
    draftProbes:[draft('sum-across-actions','I can spend 45 minutes per week.',1,30,'goal_capacity_conflict',[{area:'writing',frequency:1,minutes:30},{area:'coding',frequency:1,minutes:30}]),
      draft('shared-within-budget','I can spend 45 minutes per week.',1,20,null,[{area:'writing',frequency:1,minutes:20},{area:'coding',frequency:1,minutes:20}])]},
  {id:'US-68',age:40,synthetic:true,context:us(3),profile:'40세 현장 감독 / 회사 교육과 개인 계획',situation:'회사 교육 예산을 본인의 개인 목표 시간으로 수집하지 않는다.',steps:single('en-US','learning','1 project','3 projects'),
    probes:[e68,control('personal-time','My employer has 5 hours per week for company training. I can spend 30 minutes per week on my personal goal.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],agentProbes:[agent(e68)]},
  {id:'US-69',age:44,synthetic:true,context:us(0),profile:'44세 프리랜서 / 멈췄던 코딩 목표 재개',situation:'삭제·복원한 목표는 오래된 결과가 아니라 새 기준으로 다시 설계한다.',
    steps:[...dual('en-US',eDual),turn('Remove coding.',{area_changes:[{area:'coding',action:'remove',evidence:'Remove coding.'}]},{areas:['writing']}),
      turn('Restore coding.',{area_changes:[{area:'coding',action:'restore',evidence:'Restore coding.'}]},{areas:['writing','coding'],baselineAreas:['writing'],objectiveAreas:['writing'],missing:'baseline'})],
    // Stale restored-area facts are safely ignored, not necessarily thrown.
    probes:[probe('stale-target-replay','Let us continue discussing coding.',{objectives:[objective('coding','3 projects')]},{accepted:true,objectiveAreas:['writing'],missing:'baseline'},'invalid-model-candidate',6),
      control('fresh-progress','My current coding progress is 2 projects.',{baselines:[baseline('coding','2 projects')]},{baselineAreas:['writing','coding'],missing:'result'},6)]},
  {id:'US-70',age:48,synthetic:true,context:us(1),profile:'48세 사무직 / 점심시간 독서',situation:'quarter-hour라는 흔한 시간을 분으로 표현한 것과 동일하게 계산한다.',steps:single('en-US','reading','1 book','3 books'),
    probes:[probe('quarter-hour','I can spend a quarter of an hour per session.',{capacity:capacity('a quarter of an hour per session')},{next:null}),
      control('fifteen-minutes','I can spend 15 minutes per session.',{capacity:capacity('15 minutes per session')},{next:null})],
    capacityProbes:[budget('quarter-hour','a quarter of an hour per session',null,null,15),budget('fifteen-minutes','15 minutes per session',null,null,15)],
    draftProbes:[draft('within-quarter-hour','I can spend a quarter of an hour per session.',1,10,null)]},
]

export const round8FixtureCorrections=[
  {caseId:'KR-73/atomic-valid-period-invalid-time/agent-path',reason:'도구 처리기는 부적절한 시간 후보만 먼저 거른 뒤 사용자에게 허가된 기간 변경을 저장한다. 직접 updateGoalBrief의 원자적 실패와 구분하여, 에이전트 경로에서는 기간 12주·기존 시간 보존을 기대한다. 2개 단언 정정이며 제품 보호를 낮추지 않았다.',preliminaryReport:'logs/persona-pilot-round8/2026-09-16T05-44-04-592Z/results.json'},
  {caseId:'US-69/stale-target-replay',reason:'복원한 분야의 과거 근거는 예외 대신 continue로 무시하는 기존 계약이다. 처리 성공 여부만 정정하고, 옛 목표 미복원·현재 수준 재확인 기대값은 그대로 유지했다. 1개 단언 정정.',preliminaryReport:'logs/persona-pilot-round8/2026-09-16T05-44-04-592Z/results.json'},
]
