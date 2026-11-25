// Fictional profiles and manually authored extraction candidates. Not real users,
// not model-generated answers, and not a representative user-failure-rate sample.
// Expectations are authored before the first run; keep historical suites frozen.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const us=zone=>({locale:'en-US',countryCode:'US',timeZone:zone,currencyCode:'USD',weekStartsOn:0})
const baseline=(area,current,evidence=current,status='known')=>({area,current,evidence,status})
const objective=(area,result,evidence=result)=>({area,result,evidence,result_kind:'metric'})
const capacity=(summary,evidence=summary,status='known')=>({summary,evidence,status})
const period=evidence=>({kind:'duration',normalized:evidence,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,message,candidate,expect,kind='intended-extraction',seedAfterTurn=4)=>({id,message,candidate,expect,kind,seedAfterTurn})
const invalid=(id,message,candidate,expect)=>probe(id,message,candidate,{accepted:false,...expect},'invalid-model-candidate')
const control=(id,message,candidate,expect)=>probe(id,message,candidate,expect,'paired-control')
const agent=(entry,expect,question)=>({...entry,candidate:{...entry.candidate,...(typeof entry.candidate.period==='string'?{period:period(entry.candidate.period)}:{})},candidateKind:entry.kind,expect,question})
const bounds=(min,max=min)=>({min,max})
const budget=(id,text,min,max=min,count=null,perSession=null)=>({id,text,expected:{status:'bounded',weeklyMinutes:bounds(min,max),weeklySessions:count===null?null:bounds(count),perSessionMinutes:perSession===null?null:bounds(...perSession)}})
const draft=(id,text,frequency,minutes,expectIssue)=>({id,capacityCorrection:text,frequency,minutes,expectIssue,seedAfterTurn:4})
function single(locale,area,current,result) {
  const korean=locale==='ko-KR', duration=korean?'8주':'8 weeks', time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(korean?`${area} 목표를 ${duration} 동안 진행할게.`:`My ${area} goal will run for ${duration}.`,
      {period:korean?duration:period(duration),areas:[{name:area,evidence:area}]},{areas:[area],'period.weeks':8,missing:'baseline'}),
    turn(korean?`현재 기준은 ${current}이야.`:`My current starting point is ${current}.`,
      {baselines:[baseline(area,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(korean?`목표는 ${result}으로 정할게.`:`I want to achieve ${result}.`,
      {objectives:[objective(area,result)]},{'objectives.0.result':result,missing:'capacity'}),
    turn(time,{capacity:capacity(time)},{missing:null,'capacity.summary':time}),
  ]
}
function dual(locale,names) {
  const korean=locale==='ko-KR', duration=korean?'8주':'8 weeks', time=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  const equal=korean?'두 목표는 같은 우선순위야.':'Both goals have equal priority.'
  const current=korean?'1개':'1 project',result=korean?'3개':'3 projects'
  return [
    turn(korean?`${names.join('와 ')} 목표를 ${duration} 동안 할게.`:`My goals are ${names.join(' and ')} for ${duration}.`,
      {period:korean?duration:period(duration),areas:names.map(name=>({name,evidence:name}))},{areas:names,missing:'baseline'}),
    turn(names.map(name=>`${name}: ${current}`).join('; '),{baselines:names.map(name=>baseline(name,current))},{missing:'result'}),
    turn((korean?'목표는 ':'My goals are ')+names.map(name=>`${name}: ${result}`).join('; '),{objectives:names.map(name=>objective(name,result))},{missing:'priority'}),
    turn(equal+' '+time,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:equal},capacity:capacity(time)},{missing:null}),
  ]
}
const kr36=invalid('indirect-rejection','책 6권까지 읽겠다는 뜻은 아니었어. 기존 목표를 유지해줘.',{objectives:[objective('독서','책 6권')]},{'objectives.0.result':'책 3권'})
const kr37=invalid('instructor-progress','강사는 글 8편을 완성했어. 나는 글 1편이야.',{baselines:[baseline('글쓰기','글 8편')]},{'baselines.0.current':'글 1편'})
const kr38=invalid('postposed-condition','기간을 12주로 늘릴게, 야근이 끝나면. 그전에는 바꾸지 마.',{period:'12주'},{'period.weeks':8})
const kr40=probe('own-fact-in-shared-clause','남편은 책 5권이고 나는 책 2권이야.',{baselines:[baseline('독서','책 2권')]},{'baselines.0.current':'책 2권'})
const us31=invalid('not-committing',"I am not committing to 6 books. Keep my existing goal.",{objectives:[objective('reading','6 books')]},{'objectives.0.result':'3 books'})
const us32=invalid('mentor-not-self','My mentor finished 6 projects. I have finished 1 project.',{baselines:[baseline('coding','6 projects')]},{'baselines.0.current':'1 project'})
const us33=invalid('not-larger-budget','I only have 30 minutes per week, not 2 hours per week.',{capacity:capacity('2 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const us34=invalid('postposed-after','Change the period to 12 weeks only after my shifts settle down. Keep 8 weeks for now.',{period:period('12 weeks')},{'period.weeks':8})
const us35=invalid('do-not-set-it-yet',"5 books sounds good, but don't set it yet. I need to think about it.",{objectives:[objective('reading','5 books')]},{'objectives.0.result':'3 books'})
const us43=probe('explicit-english-feasibility-choice','I understand the extra effort and choose to keep this target for the first week.',
  {feasibility_acceptance:{evidence:'I understand the extra effort and choose to keep this target for the first week.'}},{'feasibilityAcceptance.evidence':'I understand the extra effort and choose to keep this target for the first week.',next:null})
const us45=invalid('fictional-achievement','Pretend I already finished 6 projects for this example. My real progress has not changed.',{baselines:[baseline('coding','6 projects')]},{'baselines.0.current':'1 project'})

export const round6Personas=[
  {id:'KR-36',age:20,synthetic:true,context:kr,profile:'20세 대학생 / 학업과 독서 목표 조율',situation:'무리한 수치는 확정한 뜻이 아니었다고 설명한다.',
    steps:single('ko-KR','독서','책 0권','책 3권'),probes:[kr36,control('direct-correction','목표는 책 2권으로 바꿀게.',{objectives:[objective('독서','책 2권')]},{'objectives.0.result':'책 2권'})],
    agentProbes:[agent(kr36,{'objectives.0.result':'책 3권'},'지금 독서에서 가장 부담되는 점은 무엇인가요?')]},
  {id:'KR-37',age:23,synthetic:true,context:kr,profile:'23세 취업 준비생 / 글쓰기 수업',situation:'강사의 성과를 자신의 출발점과 비교한다.',
    steps:single('ko-KR','글쓰기','글 1편','글 4편'),probes:[kr37,control('own-current-progress','나는 글 2편을 완성했어.',{baselines:[baseline('글쓰기','글 2편')]},{'baselines.0.current':'글 2편'})],
    agentProbes:[agent(kr37,{'baselines.0.current':'글 1편'},'본인 글은 어떤 부분을 다듬고 싶으세요?')]},
  {id:'KR-38',age:25,synthetic:true,context:kr,profile:'25세 개발자 / 야근 중 사이드 프로젝트',situation:'기간 변경의 조건을 문장 뒤에 붙인다.',
    steps:single('ko-KR','코딩','프로젝트 0개','프로젝트 2개'),probes:[kr38,control('change-now','기간을 지금 12주로 늘릴게.',{period:'12주'},{'period.weeks':12})],
    agentProbes:[agent(kr38,{'period.weeks':8},'야근 중에도 유지하고 싶은 최소 행동은 무엇인가요?')]},
  {id:'KR-39',age:27,synthetic:true,context:kr,profile:'27세 프리랜서 / 포트폴리오 범위 고민',situation:'희망하는 수량과 확정한 수량을 구분한다.',
    steps:single('ko-KR','디자인','시안 1개','시안 3개'),probes:[
      invalid('not-final-yet','시안 5개로 하고 싶어. 아직 확정한 건 아니야.',{objectives:[objective('디자인','시안 5개')]},{'objectives.0.result':'시안 3개'}),
      control('decided-result-not-time','시안 5개로 확정할게. 하지만 시간은 아직 결정하지 않았어.',{objectives:[objective('디자인','시안 5개')]},{'objectives.0.result':'시안 5개'})]},
  {id:'KR-40',age:29,synthetic:true,context:kr,profile:'29세 맞벌이 직장인 / 부부 독서 진도',situation:'같은 절 안에 남편과 본인 수치를 함께 말한다.',
    steps:single('ko-KR','독서','책 1권','책 4권'),probes:[kr40,control('separate-clauses','남편은 책 5권이야. 나는 책 2권이야.',{baselines:[baseline('독서','책 2권')]},{'baselines.0.current':'책 2권'})],
    agentProbes:[agent(kr40,{'baselines.0.current':'책 2권'},'읽은 책에서 어떤 내용을 남기고 싶으세요?')]},
  {id:'KR-41',age:31,synthetic:true,context:kr,profile:'31세 사무직 / 평일 짧은 글쓰기',situation:'주말을 제외한 매일의 실적을 말한다.',
    steps:single('ko-KR','글쓰기','주당 1편','글 8편'),probes:[
      probe('daily-except-weekends','현재는 매일 1편, 주말은 제외하고 쓰고 있어.',{baselines:[baseline('글쓰기','매일 1편, 주말은 제외')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':40}),
      control('explicit-weekday-rate','현재 평일 매일 1편을 쓰고 있어.',{baselines:[baseline('글쓰기','평일 매일 1편')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':40})],
    quantityProbes:[{id:'excluded-days-quantity',text:'매일 1편, 주말은 제외',expected:{value:1,unit:'편',perWeek:5}}]},
  {id:'KR-42',age:33,synthetic:true,context:kr,profile:'33세 영업직 / 출근일에만 자격증 공부',situation:'평일 하루 시간 예산을 주간 총량으로 환산한다.',
    steps:single('ko-KR','공부','주당 1회','주당 2회'),probes:[
      probe('weekday-budget','평일 하루 20분 가능해.',{capacity:capacity('평일 하루 20분 가능해.')},{'capacity.summary':'평일 하루 20분 가능해.'}),
      control('weekly-budget','주당 100분 가능해.',{capacity:capacity('주당 100분 가능해.')},{'capacity.summary':'주당 100분 가능해.'})],
    capacityProbes:[budget('weekday-total','평일 하루 20분 가능해.',100)],draftProbes:[draft('over-weekday-budget','평일 하루 20분 가능해.',3,40,'goal_capacity_conflict'),draft('within-weekday-budget','평일 하루 20분 가능해.',5,20,null)]},
  {id:'KR-43',age:35,synthetic:true,context:kr,profile:'35세 돌봄 병행 직장인 / 주간 공부 시간',situation:'1시간 30분처럼 혼합 단위의 하나의 예산을 제시한다.',
    steps:single('ko-KR','공부','주당 1회','주당 2회'),probes:[
      probe('mixed-unit-budget','주당 1시간 30분 가능해.',{capacity:capacity('주당 1시간 30분 가능해.')},{'capacity.summary':'주당 1시간 30분 가능해.'}),
      control('minutes-equivalent','주당 90분 가능해.',{capacity:capacity('주당 90분 가능해.')},{'capacity.summary':'주당 90분 가능해.'})],
    capacityProbes:[budget('mixed-units','주당 1시간 30분 가능해.',90)],draftProbes:[draft('mixed-unit-over','주당 1시간 30분 가능해.',3,40,'goal_capacity_conflict'),draft('canonical-over','주당 90분 가능해.',3,40,'goal_capacity_conflict')]},
  {id:'KR-44',age:37,synthetic:true,context:kr,profile:'37세 교대근무자 / 사진 연습 시간 변동',situation:'최소와 최대를 서로 다른 시간 단위로 이야기한다.',
    steps:single('ko-KR','사진','주당 1회','주당 2회'),probes:[
      probe('mixed-unit-range','주당 30분~1시간 가능해.',{capacity:capacity('주당 30분~1시간 가능해.')},{'capacity.summary':'주당 30분~1시간 가능해.'}),
      control('same-unit-range','주당 30~60분 가능해.',{capacity:capacity('주당 30~60분 가능해.')},{'capacity.summary':'주당 30~60분 가능해.'})],
    capacityProbes:[budget('mixed-range','주당 30분~1시간 가능해.',30,60)],draftProbes:[draft('range-over','주당 30분~1시간 가능해.',2,40,'goal_capacity_conflict'),draft('range-control','주당 30~60분 가능해.',2,40,'goal_capacity_conflict')]},
  {id:'KR-45',age:39,synthetic:true,context:kr,profile:'39세 매장 운영자 / 제한된 공부 횟수',situation:'주간 횟수와 총 시간을 구분해 말한다.',
    steps:single('ko-KR','공부','주당 1회','주당 2회'),probes:[
      probe('total-not-per-session','주당 2회, 총 40분 가능해.',{capacity:capacity('주당 2회, 총 40분 가능해.')},{'capacity.summary':'주당 2회, 총 40분 가능해.'}),
      control('per-session-control','주 2회 각 20분 가능해.',{capacity:capacity('주 2회 각 20분 가능해.')},{'capacity.summary':'주 2회 각 20분 가능해.'})],
    capacityProbes:[budget('total-time','주당 2회, 총 40분 가능해.',40,40,2)],draftProbes:[draft('total-over','주당 2회, 총 40분 가능해.',2,30,'goal_capacity_conflict')]},
  {id:'KR-46',age:41,synthetic:true,context:kr,profile:'41세 사무직 / 산책 습관을 처음 시작',situation:'현재 실천은 없지만 실행할 여유는 있는 상태다.',
    steps:single('ko-KR','산책','주당 0회','주당 2회'),probes:[
      probe('novice-not-unavailable','아직 산책을 시작하지 않았어.',{}, {feasibility:'needs_rate',next:null}),
      probe('no-capacity-now','주당 0분 가능해.',{capacity:capacity('주당 0분 가능해.')},{feasibility:'strained',next:'feasibility'})]},
  {id:'KR-47',age:43,synthetic:true,context:kr,profile:'43세 이직 준비자 / 글쓰기와 코딩 정리',situation:'한 목표는 유지하고 다른 목표만 제외한다.',
    steps:dual('ko-KR',['코딩','글쓰기']),probes:[
      probe('remove-only-writing','코딩은 유지해줘. 글쓰기는 제외해줘.',{area_changes:[{area:'글쓰기',action:'remove',evidence:'글쓰기는 제외해줘.'}]},{areas:['코딩'],objectiveAreas:['코딩'],baselineAreas:['코딩'],priority:null}),
      invalid('dont-remove-coding','코딩은 제외하지 마. 글쓰기만 제외해줘.',{area_changes:[{area:'코딩',action:'remove',evidence:'코딩은 제외하지 마.'}]},{areas:['코딩','글쓰기']})]},
  {id:'KR-48',age:45,synthetic:true,context:kr,profile:'45세 학원 강사 / 연말까지 수업 자료 정리',situation:'명시적인 새 마감일과 정정된 기간을 검증한다.',
    steps:single('ko-KR','수업 자료','자료 1개','자료 4개'),probes:[
      probe('deadline-change','마감은 2026년 11월 30일까지로 바꿀게.',{period:{kind:'deadline',evidence:'2026년 11월 30일까지',normalized:'2026-11-30'}},{'period.deadline':'2026-11-30','period.weeks':11}),
      invalid('invalid-calendar-date','마감은 2026년 11월 31일까지로 바꿀게.',{period:{kind:'deadline',evidence:'2026년 11월 31일까지',normalized:'2026-12-01'}},{'period.weeks':8,'period.deadline':null})]},
  {id:'KR-49',age:47,synthetic:true,context:kr,profile:'47세 팀장 / 지친 날에는 계획보다 대화',situation:'잡담으로 주제를 바꾸어도 저장된 목표는 그대로 남아야 한다.',
    steps:single('ko-KR','독서','책 1권','책 3권'),probes:[
      probe('topic-shift-no-mutation','목표 말고 그냥 오늘 있었던 얘기부터 할게.',{}, {'objectives.0.result':'책 3권','period.weeks':8}),
      probe('resume-without-recapture','아까 정한 독서 계획으로 다시 돌아가자.',{}, {'objectives.0.result':'책 3권',missing:null})]},
  {id:'KR-50',age:49,synthetic:true,context:kr,profile:'49세 재취업 준비자 / 학습 수준 재측정',situation:'현재 수준의 불확실성과 시간 예산을 분리한다.',
    steps:single('ko-KR','공부','주당 1회','주당 2회'),probes:[
      probe('level-unmeasured','현재 수준은 아직 측정하지 않았어.',{baselines:[baseline('공부','현재 수준 미측정','현재 수준은 아직 측정하지 않았어.','unmeasured')]},{'baselines.0.status':'unmeasured','capacity.summary':'주당 1시간 가능해.',feasibility:'needs_measurement'}),
      invalid('level-not-capacity','현재 수준은 아직 측정하지 않았어.',{capacity:capacity('가용 시간 미측정','현재 수준은 아직 측정하지 않았어.','unmeasured')},{'capacity.summary':'주당 1시간 가능해.'})]},
  {id:'US-31',age:21,synthetic:true,context:us('America/New_York'),profile:'21세 미국 대학생 / 독서 범위 선택',situation:'commit의 부정으로 수량 확정을 거절한다.',
    steps:single('en-US','reading','0 books','3 books'),probes:[us31,control('committed-result','I am committing to 6 books.',{objectives:[objective('reading','6 books')]},{'objectives.0.result':'6 books'})],
    agentProbes:[agent(us31,{'objectives.0.result':'3 books'},'What feels manageable for your reading right now?')]},
  {id:'US-32',age:24,synthetic:true,context:us('America/Chicago'),profile:'24세 미국 주니어 개발자 / 멘토와 실적 비교',situation:'멘토의 완성량을 자신의 결과로 기록하면 안 된다.',
    steps:single('en-US','coding','1 project','3 projects'),probes:[us32,control('own-progress','I have finished 2 projects.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],
    agentProbes:[agent(us32,{'baselines.0.current':'1 project'},'Which part of your own project needs the most help?')]},
  {id:'US-33',age:26,synthetic:true,context:us('America/Denver'),profile:'26세 미국 간호사 / 부족한 주간 여유',situation:'only 작은 예산, not 큰 예산을 한 문장에 말한다.',
    steps:single('en-US','studying','1 session per week','2 sessions per week'),probes:[us33,
      control('limited-budget-is-authoritative','I only have 30 minutes per week, not 2 hours per week.',{capacity:capacity('30 minutes per week')},{'capacity.summary':'30 minutes per week'})],
    agentProbes:[agent(us33,{'capacity.summary':'I can spend 1 hour per week.'},'What would make a short study session useful to you?')]},
  {id:'US-34',age:28,synthetic:true,context:us('America/Los_Angeles'),profile:'28세 미국 음식점 직원 / 근무 안정 이후 변경',situation:'only after가 변경 요청 뒤에 붙는다.',
    steps:single('en-US','coding','1 project','3 projects'),probes:[us34,control('immediate-extension','Change the period to 12 weeks now.',{period:period('12 weeks')},{'period.weeks':12})],
    agentProbes:[agent(us34,{'period.weeks':8},'Which part of the current plan is hardest around your shifts?')]},
  {id:'US-35',age:30,synthetic:true,context:us('America/New_York'),profile:'30세 미국 교사 / 희망과 결정 사이',situation:'좋아 보인다는 평가 뒤 아직 확정하지 말라고 한다.',
    steps:single('en-US','reading','1 book','3 books'),probes:[us35,control('set-it-now','Set my goal to 5 books now.',{objectives:[objective('reading','5 books')]},{'objectives.0.result':'5 books'})],
    agentProbes:[agent(us35,{'objectives.0.result':'3 books'},'What would help you decide on a comfortable reading goal?')]},
  {id:'US-36',age:32,synthetic:true,context:us('America/Chicago'),profile:'32세 미국 마케터 / 스마트폰 문장 입력',situation:'곡선 따옴표와 긍정·부정을 구분한다.',
    steps:single('en-US','writing','1 article','4 articles'),probes:[
      invalid('curly-apostrophe-rejection','I don’t want 8 articles. Keep the current goal.',{objectives:[objective('writing','8 articles')]},{'objectives.0.result':'4 articles'}),
      control('explicit-wish','I would like to finish 6 articles.',{objectives:[objective('writing','6 articles')]},{'objectives.0.result':'6 articles'})]},
  {id:'US-37',age:34,synthetic:true,context:us('America/Denver'),profile:'34세 미국 사무직 / 주말을 비운 글쓰기',situation:'요일 제외형 일간 실적을 주간으로 환산한다.',
    steps:single('en-US','writing','1 article per week','8 articles'),probes:[
      probe('daily-except-two-days','I write 1 article per day except Saturday and Sunday.',{baselines:[baseline('writing','1 article per day except Saturday and Sunday')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':40}),
      control('weekday-equivalent','I write 1 article each weekday.',{baselines:[baseline('writing','1 article each weekday')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':40})],
    quantityProbes:[{id:'day-exclusion-rate',text:'1 article per day except Saturday and Sunday',expected:{value:1,unit:'편',perWeek:5}}]},
  {id:'US-38',age:36,synthetic:true,context:us('America/Los_Angeles'),profile:'36세 미국 물류직 / 짧은 자격증 공부',situation:'회차 앞 형용사형 20-minute 표기를 사용한다.',
    steps:single('en-US','studying','1 session per week','2 sessions per week'),probes:[
      probe('hyphenated-session-duration','I can spend three 20-minute sessions per week.',{capacity:capacity('three 20-minute sessions per week')},{'capacity.summary':'three 20-minute sessions per week'}),
      control('sessions-of-equivalent','I can spend three sessions of 20 minutes per week.',{capacity:capacity('three sessions of 20 minutes per week')},{'capacity.summary':'three sessions of 20 minutes per week'})],
    capacityProbes:[budget('hyphenated-budget','three 20-minute sessions per week',60,60,3,[20])],draftProbes:[draft('hyphenated-over','I can spend three 20-minute sessions per week.',3,30,'goal_capacity_conflict'),draft('canonical-over','I can spend three sessions of 20 minutes per week.',3,30,'goal_capacity_conflict')]},
  {id:'US-39',age:38,synthetic:true,context:us('America/New_York'),profile:'38세 미국 육아 병행 직장인 / 회당 시간 범위',situation:'회당 시간 범위와 주당 횟수의 곱을 계산한다.',
    steps:single('en-US','studying','1 session per week','2 sessions per week'),probes:[
      probe('per-session-range','I can spend two sessions of 10-20 minutes each per week.',{capacity:capacity('two sessions of 10-20 minutes each per week')},{'capacity.summary':'two sessions of 10-20 minutes each per week'}),
      control('weekly-range','I can spend 20-40 minutes per week.',{capacity:capacity('20-40 minutes per week')},{'capacity.summary':'20-40 minutes per week'})],
    capacityProbes:[budget('paired-range','two sessions of 10-20 minutes each per week',20,40,2,[10,20])],draftProbes:[draft('pair-over','I can spend two sessions of 10-20 minutes each per week.',2,30,'goal_capacity_conflict')]},
  {id:'US-40',age:40,synthetic:true,context:us('America/Chicago'),profile:'40세 미국 소상공인 / 하루 반 시간 연습',situation:'half an hour라는 일상 표현을 분으로 계산한다.',
    steps:single('en-US','studying','1 session per week','2 sessions per week'),probes:[
      probe('half-an-hour','I can spend half an hour per day.',{capacity:capacity('half an hour per day')},{'capacity.summary':'half an hour per day'}),
      control('thirty-minutes','I can spend 30 minutes per day.',{capacity:capacity('30 minutes per day')},{'capacity.summary':'30 minutes per day'})],
    capacityProbes:[budget('half-hour-daily','half an hour per day',210)],draftProbes:[draft('half-hour-over','I can spend half an hour per day.',7,40,'goal_capacity_conflict'),draft('minutes-over','I can spend 30 minutes per day.',7,40,'goal_capacity_conflict')]},
  {id:'US-41',age:42,synthetic:true,context:us('America/Denver'),profile:'42세 미국 엔지니어 / 목표 중단 후 복원',situation:'목표 복원은 예전 세부 정보를 자동 승인하는 뜻이 아니다.',
    steps:[...dual('en-US',['coding','writing']),
      turn('Remove writing.',{area_changes:[{area:'writing',action:'remove',evidence:'Remove writing.'}]},{areas:['coding'],objectiveAreas:['coding']}),
      turn('Restore writing.',{area_changes:[{area:'writing',action:'restore',evidence:'Restore writing.'}]},{areas:['coding','writing'],objectiveAreas:['coding'],baselineAreas:['coding'],missing:'baseline'})],
    probes:[probe('restoration-not-old-result','Let us continue with writing.',{objectives:[objective('writing','3 projects')]},{objectiveAreas:['coding'],missing:'baseline'},'invalid-model-candidate',6),
      probe('fresh-restored-baseline','For writing, I have completed 2 projects.',{baselines:[baseline('writing','2 projects')]},{baselineAreas:['coding','writing'],objectiveAreas:['coding'],missing:'result'},'paired-control',6)]},
  {id:'US-42',age:44,synthetic:true,context:us('America/Los_Angeles'),profile:'44세 미국 프리랜서 / 쉬운 목표로 명시적 정정',situation:'이미 충분히 수행 중인 목표로 낮추어도 상태가 일관되어야 한다.',
    steps:single('en-US','writing','2 articles per week','8 articles'),probes:[
      probe('smaller-target','Change my target to 4 articles.',{objectives:[objective('writing','4 articles')]},{'objectives.0.result':'4 articles',feasibility:'ready','gaps.0.requiredPerWeek':0.5}),
      control('separate-progress-update','I currently write 1 article per week.',{baselines:[baseline('writing','1 article per week')]},{'baselines.0.current':'1 article per week',feasibility:'ready'})]},
  {id:'US-43',age:46,synthetic:true,context:us('America/New_York'),profile:'46세 미국 프로젝트 관리자 / 높은 목표 첫 주 도전',situation:'강도가 높다는 설명을 듣고 첫 주에 시도하기로 영어로 선택한다.',
    steps:single('en-US','writing','1 article per week','32 articles'),probes:[us43,
      invalid('question-not-consent','Should I keep this target?',{feasibility_acceptance:{evidence:'Should I keep this target?'}},{feasibilityAcceptance:null,next:'feasibility'})],
    agentProbes:[agent(us43,{'feasibilityAcceptance.evidence':'I understand the extra effort and choose to keep this target for the first week.',next:null},'What would be a useful first-week checkpoint?')]},
  {id:'US-44',age:48,synthetic:true,context:us('America/Chicago'),profile:'48세 미국 직장인 / 실행 가능 시간 부족',situation:'이번에 가용 시간이 없음을 숫자 0으로 명확하게 알려준다.',
    steps:single('en-US','walking','0 sessions per week','2 sessions per week'),probes:[
      probe('zero-availability','I can spend 0 minutes per week.',{capacity:capacity('0 minutes per week')},{'capacity.summary':'0 minutes per week',feasibility:'strained',next:'feasibility'}),
      control('new-positive-availability','I can spend 20 minutes per week.',{capacity:capacity('20 minutes per week')},{'capacity.summary':'20 minutes per week',feasibility:'needs_rate',next:null})]},
  {id:'US-45',age:49,synthetic:true,context:us('America/Los_Angeles'),profile:'49세 미국 전직 준비자 / 예시와 실제 실적 구분',situation:'설명용 가정이 실제 완성량으로 저장되어서는 안 된다.',
    steps:single('en-US','coding','1 project','3 projects'),probes:[us45,control('real-achievement','I actually finished 2 projects.',{baselines:[baseline('coding','2 projects')]},{'baselines.0.current':'2 projects'})],
    agentProbes:[agent(us45,{'baselines.0.current':'1 project'},'Which real project would you like to work on next?')]},
]
