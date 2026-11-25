// Fictional people, authored utterances/candidates, NOT interviews or model output.
// Freeze expectations before running; keep paired controls alongside new boundaries.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const us=zone=>({locale:'en-US',countryCode:'US',timeZone:zone,currencyCode:'USD',weekStartsOn:0})
const area=name=>({name,evidence:name})
const baseline=(name,current,evidence=current)=>({area:name,current,status:'known',evidence})
const objective=(name,result,evidence=result)=>({area:name,result,evidence,result_kind:'metric'})
const capacity=summary=>({summary,evidence:summary,status:'known'})
const period=evidence=>({evidence,kind:'duration',normalized:evidence})
const change=(name,action,evidence)=>({area:name,action,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,message,candidate,expect,kind='intended-extraction',seedAfterTurn=4)=>({id,message,candidate,expect,kind,seedAfterTurn})
const invalid=(id,message,candidate,expect,seed=4)=>probe(id,message,candidate,{accepted:false,...expect},'invalid-model-candidate',seed)
const control=(id,message,candidate,expect,seed=4)=>probe(id,message,candidate,expect,'paired-control',seed)
const agent=(entry,question,expect)=>({...entry,candidateKind:entry.kind,question,expect})
function single(locale,name,current,result,weeks=8,time) {
  const korean=locale==='ko-KR', duration=korean?`${weeks}주`:`${weeks} weeks`
  const available=time??(korean?'주당 1시간 가능해.':'I can spend 1 hour per week.')
  return [
    turn(korean?`${name} 목표를 ${duration} 동안 진행할게.`:`My ${name} goal will run for ${duration}.`,
      {period:korean?duration:period(duration),areas:[area(name)]},{areas:[name],'period.weeks':weeks,missing:'baseline'}),
    turn(korean?`현재 기준은 ${current}이야.`:`My current starting point is ${current}.`,
      {baselines:[baseline(name,current)]},{'baselines.0.current':current,missing:'result'}),
    turn(korean?`목표는 ${result}으로 정할게.`:`I want to achieve ${result}.`,
      {objectives:[objective(name,result)]},{'objectives.0.result':result,missing:'capacity'}),
    turn(available,{capacity:capacity(available)},{missing:null,'capacity.summary':available}),
  ]
}
function dual(locale,names,counts,results) {
  const korean=locale==='ko-KR', duration=korean?'8주':'8 weeks'
  const priority=korean?'두 목표는 동일한 우선순위야.':'Both goals have equal priority.'
  const available=korean?'주당 1시간 가능해.':'I can spend 1 hour per week.'
  return [
    turn(korean?`${names.join('와 ')} 목표를 ${duration} 동안 할게.`:`My goals are ${names.join(' and ')} for ${duration}.`,
      {period:korean?duration:period(duration),areas:names.map(area)},{areas:names,missing:'baseline'}),
    turn(names.map((name,i)=>`${name}: ${counts[i]}`).join('; '),{baselines:names.map((name,i)=>baseline(name,counts[i]))},{missing:'result'}),
    turn((korean?'목표는 ':'My goals are ')+names.map((name,i)=>`${name}: ${results[i]}`).join('; '),
      {objectives:names.map((name,i)=>objective(name,results[i]))},{missing:'priority'}),
    turn(priority+' '+available,{priority:{mode:'equal',primary_area:'',flexible_areas:[],evidence:priority},capacity:capacity(available)},{missing:null}),
  ]
}
const kr26=invalid('verb-specific-rejection','책 2권은 읽지 않을래. 지금 목표를 유지해줘.',
  {objectives:[objective('독서','책 2권')]},{'objectives.0.result':'책 3권'})
const kr27=invalid('team-member-not-self','팀원은 시안 6개를 끝냈어. 나는 시안 1개야.',
  {baselines:[baseline('디자인','시안 6개')]},{'baselines.0.current':'시안 1개'})
const kr28=invalid('last-month-is-recollection','지난달에는 영상 0편이었어. 그때는 입사 준비로 바빴지.',
  {baselines:[baseline('영상','영상 0편')]},{'baselines.0.current':'영상 2편'})
const us21=invalid('do-not-have-is-unavailable',"I don't have 3 hours per week. Please keep the current budget.",
  {capacity:capacity('3 hours per week')},{'capacity.summary':'I can spend 1 hour per week.'})
const us22=invalid('child-progress-not-parent',"My daughter has read 5 books. I have read 1 book.",
  {baselines:[baseline('reading','5 books')]},{'baselines.0.current':'1 book'})
const us23=invalid('future-when-not-current-decision','When my shifts settle down, change the period to 12 weeks. Keep the current period until then.',
  {period:period('12 weeks')},{'period.weeks':8})
const us24=invalid('tentative-wish-with-later-retraction',"I would like to finish 5 books, but I haven't decided yet.",
  {objectives:[objective('reading','5 books')]},{'objectives.0.result':'3 books'})
const us27=probe('abbreviated-month-deadline','Move the deadline to Nov. 30, 2026.',
  {period:{evidence:'Nov. 30, 2026',kind:'deadline',normalized:'2026-11-30'}},{'period.deadline':'2026-11-30','period.weeks':11})
const restoredOld=probe('stale-target-after-restoration','Let us continue with the restored reading goal.',
  {objectives:[objective('reading','3 books')]},{areas:['coding','reading'],objectiveAreas:['coding'],missing:'result'},'invalid-model-candidate',6)
const draft=(id,frequency,minutes,expectIssue,capacityCorrection)=>({id,seedAfterTurn:4,frequency,minutes,expectIssue,...(capacityCorrection?{capacityCorrection}:{})})

export const round5Personas=[
  {id:'KR-26',age:22,synthetic:true,context:kr,profile:'22세 공공기관 인턴 / 주말 독서량 정리',
    situation:'말을 바꾼 것이 아니라 다른 분량을 읽지 않겠다고 거절한다.',liveQuestions:['읽지 않겠다는 수치를 새 목표로 넣지 않는가?'],
    steps:single('ko-KR','독서','책 0권','책 3권'),probes:[kr26,
      control('affirmative-reading-control','책 2권으로 바꿀게.',{objectives:[objective('독서','책 2권')]},{'objectives.0.result':'책 2권'})],
    agentProbes:[agent(kr26,'독서할 때 어떤 점이 가장 부담되세요?',{'objectives.0.result':'책 3권'})]},
  {id:'KR-27',age:25,synthetic:true,context:kr,profile:'25세 주니어 디자이너 / 동료와 포트폴리오 비교',
    situation:'팀원의 완성량과 자신의 완성량을 한 메시지에 적는다.',liveQuestions:['팀원이라는 표현도 다른 사람의 실적으로 구분하는가?'],
    steps:single('ko-KR','디자인','시안 1개','시안 4개'),probes:[kr27,
      control('own-design-progress-control','나는 시안 2개를 끝냈어.',{baselines:[baseline('디자인','시안 2개')]},{'baselines.0.current':'시안 2개'})],
    agentProbes:[agent(kr27,'본인 시안은 어떤 부분을 더 다듬고 싶으세요?',{'baselines.0.current':'시안 1개'})]},
  {id:'KR-28',age:28,synthetic:true,context:kr,profile:'28세 이직 준비 마케터 / 이전 달 진도 회고',
    situation:'이번 달 성과는 저장되어 있고 지난달 어려움을 이야기한다.',liveQuestions:['지난달 회고로 현재 실적을 되돌리지 않는가?'],
    steps:single('ko-KR','영상','영상 2편','영상 6편'),probes:[kr28,
      control('current-video-correction-control','정정할게. 현재 영상 1편이야.',{baselines:[baseline('영상','영상 1편')]},{'baselines.0.current':'영상 1편'})],
    agentProbes:[agent(kr28,'이번에는 어떤 영상을 더 만들고 싶으세요?',{'baselines.0.current':'영상 2편'})]},
  {id:'KR-29',age:30,synthetic:true,context:kr,profile:'30세 교대근무 간호사 / 반 시간씩 공부',
    situation:'주 2회, 회당 0.5시간 여유인데 소수 표현을 정확히 제한으로 써야 한다.',liveQuestions:['30분과 0.5시간의 초안 상한이 같은가?'],
    steps:single('ko-KR','공부','주당 1회','주당 2회',8,'주 2회 각 0.5시간 가능해.'),probes:[
      probe('decimal-capacity-retained','주 2회 각 0.5시간 가능해.',{}, {'capacity.summary':'주 2회 각 0.5시간 가능해.'}),
      control('integer-equivalent-capacity','주 2회 각 30분 가능해.',{capacity:capacity('주 2회 각 30분 가능해.')},{'capacity.summary':'주 2회 각 30분 가능해.'})],
    draftProbes:[draft('ninety-minutes-exceeds-sixty',2,45,'goal_capacity_conflict'),draft('forty-minutes-fits',2,20,null),draft('integer-budget-control',2,45,'goal_capacity_conflict','주 2회 각 30분 가능해.')]},
  {id:'KR-30',age:33,synthetic:true,context:kr,profile:'33세 소상공인 / 다음 달 말까지 매장 소개글',
    situation:'정확한 일자를 몰라도 다음 달 마지막 날을 마감으로 정한다.',liveQuestions:['상대 달력 마감과 오래된 날짜를 구분하는가?'],
    steps:single('ko-KR','소개글','글 1편','글 4편'),probes:[
      // Existing policy rounds 45 calendar days / 7 to 6 integer weeks;
      // the exact October 31 deadline remains authoritative, not a 7-week ceil.
      probe('next-month-end','마감은 다음 달 말까지로 바꿀게.',{period:{evidence:'다음 달 말까지',kind:'deadline',normalized:'2026-10-31'}},{'period.deadline':'2026-10-31','period.weeks':6}),
      invalid('past-date-not-future-plan','마감은 2026년 8월 31일까지로 바꿀게.',{period:{evidence:'2026년 8월 31일까지',kind:'deadline',normalized:'2026-08-31'}},{'period.weeks':8,'period.deadline':null})]},
  {id:'KR-31',age:35,synthetic:true,context:kr,profile:'35세 복직 준비 부모 / 작은 코딩 실적과 시간 변경',
    situation:'완성한 프로젝트 수와 새로 확보한 시간을 함께 수정하고 조언도 묻는다.',liveQuestions:['한 문장에서 여러 필드를 갱신하고 별도 질문을 남길 수 있는가?'],
    steps:single('ko-KR','코딩','프로젝트 0개','프로젝트 3개'),probes:[
      probe('two-facts-plus-question','현재 프로젝트 1개를 끝냈고 주당 2시간 가능해. 다음에는 뭘 할까?',
        {baselines:[baseline('코딩','프로젝트 1개','현재 프로젝트 1개를 끝냈고 주당 2시간 가능해.')],capacity:capacity('주당 2시간 가능해.')},{'baselines.0.current':'프로젝트 1개','capacity.summary':'주당 2시간 가능해.'}),
      control('separate-facts-control','현재 프로젝트 1개야. 주당 2시간 가능해.',{baselines:[baseline('코딩','프로젝트 1개')],capacity:capacity('주당 2시간 가능해.')},{'baselines.0.current':'프로젝트 1개','capacity.summary':'주당 2시간 가능해.'})]},
  {id:'KR-32',age:38,synthetic:true,context:kr,profile:'38세 출퇴근 직장인 / 독서와 글쓰기 우선순위',
    situation:'두 분야를 모두 유지하며 시간이 부족할 때만 독서를 줄이기로 한다.',liveQuestions:['목표 제외와 우선순위 변경을 혼동하지 않는가?'],
    steps:dual('ko-KR',['독서','글쓰기'],['책 1권','글 1편'],['책 3권','글 4편']),probes:[
      probe('rank-without-removal','글쓰기를 우선으로 하고 독서는 줄여도 돼.',{priority:{mode:'ranked',primary_area:'글쓰기',flexible_areas:['독서'],evidence:'글쓰기를 우선으로 하고 독서는 줄여도 돼.'}},
        {areas:['독서','글쓰기'],'priority.primaryArea':'글쓰기','priority.flexibleAreas':['독서']}),
      invalid('reduced-not-removed','글쓰기를 우선으로 하고 독서는 줄여도 돼.',{area_changes:[change('독서','remove','글쓰기를 우선으로 하고 독서는 줄여도 돼.')]},{areas:['독서','글쓰기']})]},
  {id:'KR-33',age:41,synthetic:true,context:kr,profile:'41세 사무직 / 평일 점심에 짧은 글쓰기',
    situation:'주말은 쉬고 월요일부터 금요일까지만 매일 쓴다.',liveQuestions:['평일 매일을 주 7일로 부풀리지 않는가?'],
    steps:single('ko-KR','글쓰기','평일 매일 1편','글 20편',4),probes:[
      probe('weekday-rate','평일 매일 1편씩 써.',{}, {'gaps.0.currentPerWeek':5,'gaps.0.projected':20}),
      control('five-per-week-control','현재 속도는 주당 5편이야.',{baselines:[baseline('글쓰기','주당 5편')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':20})],
    quantityProbes:[{id:'weekday-quantity',text:'평일 매일 1편',expected:{value:1,unit:'편',perWeek:5}}]},
  {id:'KR-34',age:45,synthetic:true,context:kr,profile:'45세 자영업 사진가 / 매주 다른 학습 시간',
    situation:'주당 30~60분의 범위를 주었을 때 90분짜리 실행안은 상한을 넘는다.',liveQuestions:['시간 범위가 파싱되지 않는다고 무제한으로 취급하지 않는가?'],
    steps:single('ko-KR','사진','주당 1회','주당 2회',8,'주당 30~60분 가능해.'),probes:[
      probe('range-capacity-preserved','주당 30~60분 가능해.',{}, {'capacity.summary':'주당 30~60분 가능해.'}),
      control('hard-capacity-control','주당 최대 60분 가능해.',{capacity:capacity('주당 최대 60분 가능해.')},{'capacity.summary':'주당 최대 60분 가능해.'})],
    draftProbes:[draft('ninety-minutes-exceeds-range-upper-bound',2,45,'goal_capacity_conflict'),draft('thirty-minutes-fits-range',2,15,null),draft('upper-bound-control',2,45,'goal_capacity_conflict','주당 최대 60분 가능해.')]},
  {id:'KR-35',age:49,synthetic:true,context:kr,profile:'49세 가족 돌봄 직장인 / 취미를 잠시 보류',
    situation:'독서 목표는 지우지 않고 잠시 쉬고 코딩 목표는 유지하려 한다.',liveQuestions:['잠시 쉬겠다는 말을 목표 삭제로 확대하지 않는가?'],
    steps:dual('ko-KR',['독서','코딩'],['책 1권','프로젝트 1개'],['책 3권','프로젝트 2개']),probes:[
      invalid('pause-not-delete','독서는 삭제하지 말고 잠시 보류해줘. 코딩은 유지해줘.',{area_changes:[change('독서','remove','독서는 삭제하지 말고 잠시 보류해줘.')]},{areas:['독서','코딩']}),
      control('explicit-delete-control','독서는 제외해줘. 코딩은 유지해줘.',{area_changes:[change('독서','remove','독서는 제외해줘.')]},{areas:['코딩']})]},
  {id:'US-21',age:23,synthetic:true,context:us('America/New_York'),profile:'23세 미국 신입 행정직 / 학습 시간 과장 거절',
    situation:'can’t spend 대신 don’t have로 시간이 없다고 설명한다.',liveQuestions:['시간이 없다는 다른 표현도 가용 시간으로 잘못 넣지 않는가?'],
    steps:single('en-US','coursework','1 project','3 projects'),probes:[us21,
      control('have-time-control','I have 2 hours per week available.',{capacity:capacity('I have 2 hours per week available.')},{'capacity.summary':'I have 2 hours per week available.'})],
    agentProbes:[agent(us21,'Which part of coursework is most important to you?',{'capacity.summary':'I can spend 1 hour per week.'})]},
  {id:'US-22',age:26,synthetic:true,context:us('America/Chicago'),profile:'26세 미국 서비스직 부모 / 자녀 독서와 본인 독서',
    situation:'아이의 독서량을 이야기해도 본인의 출발점은 다르다.',liveQuestions:['가족 구성원의 주어를 본인과 구별하는가?'],
    steps:single('en-US','reading','1 book','3 books'),probes:[us22,
      control('parent-own-progress','I have read 2 books now.',{baselines:[baseline('reading','2 books')]},{'baselines.0.current':'2 books'})],
    agentProbes:[agent(us22,'What would you like to read yourself?',{'baselines.0.current':'1 book'})]},
  {id:'US-23',age:29,synthetic:true,context:us('America/Los_Angeles'),profile:'29세 미국 물류 교대근무 / 향후 일정 안정 시 변경',
    situation:'근무표가 안정된 뒤 변경할 대안을 말하며 지금은 바꾸지 않겠다고 한다.',liveQuestions:['when 조건의 미래 변경을 지금 적용하지 않는가?'],
    steps:single('en-US','certification','45 points','70 points'),probes:[us23,
      control('change-now-control','Change the period to 12 weeks now.',{period:period('12 weeks')},{'period.weeks':12})],
    agentProbes:[agent(us23,'What fits your current shifts?',{'period.weeks':8})]},
  {id:'US-24',age:31,synthetic:true,context:us('America/Denver'),profile:'31세 미국 대학원생 / 읽고 싶은 분량을 아직 고민',
    situation:'정중한 희망을 말한 뒤 아직 결정하지 않았다고 명확히 덧붙인다.',liveQuestions:['뒤에 이어진 미확정 표현까지 고려하는가?'],
    steps:single('en-US','reading','1 book','3 books'),probes:[us24,
      control('explicitly-decided-wish','I have decided to finish 5 books.',{objectives:[objective('reading','5 books')]},{'objectives.0.result':'5 books'})],
    agentProbes:[agent(us24,'What would help you choose a comfortable amount?',{'objectives.0.result':'3 books'})]},
  {id:'US-25',age:34,synthetic:true,context:us('America/New_York'),profile:'34세 미국 상담직 / 짧은 음악 연습 두 번',
    situation:'영어로 주 2회 회당 20분을 주었을 때 초안은 총 40분을 넘으면 안 된다.',liveQuestions:['영어 복합 시간 예산도 한국어와 같은 수준으로 제한하는가?'],
    steps:single('en-US','music','1 session per week','2 sessions per week',8,'I can spend two sessions of 20 minutes per week.'),probes:[
      probe('english-paired-capacity','I can spend two sessions of 20 minutes per week.',{}, {'capacity.summary':'I can spend two sessions of 20 minutes per week.'}),
      control('english-total-capacity','I can spend 40 minutes per week.',{capacity:capacity('I can spend 40 minutes per week.')},{'capacity.summary':'I can spend 40 minutes per week.'})],
    draftProbes:[draft('ninety-minutes-exceeds-forty',2,45,'goal_capacity_conflict'),draft('thirty-minutes-fits',2,15,null),draft('total-budget-control',2,45,'goal_capacity_conflict','I can spend 40 minutes per week.')]},
  {id:'US-26',age:37,synthetic:true,context:us('America/Chicago'),profile:'37세 미국 연구직 / 집중 학습 시간을 분에서 시간으로 표현',
    situation:'현재 주 30분에서 주 1시간으로 늘리는 목표를 세운다. 주 2시간 여유가 있다.',liveQuestions:['같은 시간량의 단위 차이 때문에 비교를 포기하지 않는가?'],
    steps:single('en-US','study','30 minutes per week','1 hour per week',8,'I can spend 2 hours per week.'),probes:[
      probe('convertible-units','I study 30 minutes per week and want to reach 1 hour per week.',{}, {feasibility:'ready',gapCount:1}),
      control('same-unit-control','My target is 60 minutes per week.',{objectives:[objective('study','60 minutes per week')]},{feasibility:'ready',gapCount:1})]},
  {id:'US-27',age:39,synthetic:true,context:us('America/Los_Angeles'),profile:'39세 미국 프리랜서 편집자 / 달 약어 마감',
    situation:'휴대폰으로 입력한 영문 달 약어와 존재하지 않는 날짜를 비교한다.',liveQuestions:['약어의 마침표를 문장 끝과 혼동하지 않는가?'],
    steps:single('en-US','editing','1 article','4 articles'),probes:[us27,
      invalid('invalid-calendar-control','Move the deadline to February 30, 2027.',{period:{evidence:'February 30, 2027',kind:'deadline',normalized:'2027-03-02'}},{'period.weeks':8,'period.deadline':null})],
    agentProbes:[agent(us27,'Which article should we work on first?',{'period.deadline':'2026-11-30','period.weeks':11})]},
  {id:'US-28',age:42,synthetic:true,context:us('America/Denver'),profile:'42세 미국 교육행정직 / 평일에만 뉴스레터 작업',
    situation:'주말은 쉬면서 weekday마다 짧은 글 한 편을 쓴다.',liveQuestions:['each weekday를 주 5회로 해석하고 누적량과 구분하는가?'],
    steps:single('en-US','newsletter','1 article each weekday','20 articles',4),probes:[
      probe('english-weekday-rate','I write 1 article each weekday.',{}, {'gaps.0.currentPerWeek':5,'gaps.0.projected':20}),
      control('english-weekly-total-control','I write 5 articles per week now.',{baselines:[baseline('newsletter','5 articles per week')]},{'gaps.0.currentPerWeek':5,'gaps.0.projected':20})],
    quantityProbes:[{id:'weekday-quantity',text:'1 article each weekday',expected:{value:1,unit:'편',perWeek:5}}]},
  {id:'US-29',age:46,synthetic:true,context:us('America/New_York'),profile:'46세 미국 자영업자 / 누적 교육자료 읽기',
    situation:'천 단위 쉼표를 포함한 페이지 수를 쓰며 잘못된 작은 숫자로 축소되면 안 된다.',liveQuestions:['처리하지 못하는 큰 수를 아는 척 계산하지 않는가?'],
    steps:single('en-US','reading','1,000 pages','2000 pages',8),probes:[
      probe('unsupported-number-not-false-ready','I have read 1,000 pages.',{}, {feasibility:'needs_rate',feasibilityReady:false}),
      control('plain-thousand-control','I have read 1000 pages now.',{baselines:[baseline('reading','1000 pages')]},{'gaps.0.remaining':1000,'gaps.0.requiredPerWeek':125})],
    quantityProbes:[{id:'comma-number-fails-closed',text:'1,000 pages',expected:null},{id:'plain-thousand',text:'1000 pages',expected:{value:1000,unit:'쪽'}}]},
  {id:'US-30',age:48,synthetic:true,context:us('America/Chicago'),profile:'48세 미국 경력 전환 부모 / 취미 목표 복원 후 새 출발점',
    situation:'코딩과 독서 중 독서를 지웠다가 새 출발점만 알려주며 다시 연다. 예전 목표량은 동의하지 않았다.',liveQuestions:['복원 이후 다음 턴에도 지웠던 상세가 재주입되지 않는가?'],
    steps:[...dual('en-US',['reading','coding'],['1 book','1 project'],['3 books','2 projects']),
      turn('Remove reading.',{area_changes:[change('reading','remove','Remove reading.')]},{areas:['coding'],baselineAreas:['coding'],objectiveAreas:['coding']}),
      turn('Restore reading. My current starting point is 0 books.',{area_changes:[change('reading','restore','Restore reading.')],baselines:[baseline('reading','0 books')]},
        {areas:['coding','reading'],baselineAreas:['coding','reading'],objectiveAreas:['coding'],missing:'result'})],
    probes:[restoredOld,control('fresh-restored-target','I want 2 books for reading now.',{objectives:[objective('reading','2 books')]},{objectiveAreas:['coding','reading'],missing:'priority'},6)],
    agentProbes:[agent(restoredOld,'What result would you like for reading now?',{areas:['coding','reading'],objectiveAreas:['coding'],missing:'result'})]},
]
