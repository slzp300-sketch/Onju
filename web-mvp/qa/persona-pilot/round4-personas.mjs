// Fictional profiles and authored tool candidates, NOT real interviews or LLM replies.
// Expectations are authored before execution. Adversarial probes are not user failure rates.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const us=zone=>({locale:'en-US',countryCode:'US',timeZone:zone,currencyCode:'USD',weekStartsOn:0})
const area=name=>({name,evidence:name})
const baseline=(name,current,status='known',evidence=current)=>({area:name,current,status,evidence})
const objective=(name,result,evidence=result)=>({area:name,result,evidence,result_kind:'deliverable'})
const capacity=(summary,status='known',evidence=summary)=>({summary,status,evidence})
const period=evidence=>({evidence,kind:'duration',normalized:evidence})
const change=(name,action,evidence)=>({area:name,action,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})
const probe=(id,seedAfterTurn,message,candidate,expect,kind='intended-extraction')=>({id,seedAfterTurn,message,candidate,expect,kind})
const invalid=(...args)=>probe(...args,'invalid-model-candidate')
const control=(...args)=>probe(...args,'paired-control')
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

const kr16=invalid('rejected-result-is-not-a-new-goal',4,'책 6권 완독은 안 할래. 원래 목표를 유지해줘.',
  {objectives:[objective('독서','책 6권 완독')]},{accepted:false,'objectives.0.result':'책 3권 완독'})
const kr17=probe('baseline-plus-separate-question',4,'최근 완성한 영상은 2편이야. 다음에는 뭘 할까?',
  {baselines:[baseline('영상 편집','2편','known','최근 완성한 영상은 2편이야. 다음에는 뭘 할까?')]},{'baselines.0.current':'2편'})
const kr18=probe('availability-plus-separate-question',4,'주당 2시간 가능해. 어떤 요일로 나누면 좋을까?',
  {capacity:capacity('주당 2시간 가능해.','known','주당 2시간 가능해. 어떤 요일로 나누면 좋을까?')},{'capacity.summary':'주당 2시간 가능해.'})
const kr19=probe('remove-one-goal-plus-separate-question',4,'일본어는 제외해줘. 독서는 어떤 책이 좋을까?',
  {area_changes:[change('일본어','remove','일본어는 제외해줘.')]},{areas:['독서'],baselineAreas:['독서'],objectiveAreas:['독서']})
const kr20=invalid('historical-reference-alone-is-not-correction',4,'작년에는 책 0권을 읽었어. 그때는 육아 때문에 어려웠지.',
  {baselines:[baseline('독서','책 0권','known','작년에는 책 0권을 읽었어.')]},{accepted:false,'baselines.0.current':'책 1권'})
const kr21=invalid('colleague-progress-is-not-mine',4,'동료는 프로젝트 5개를 완성했대. 나는 아직 프로젝트 1개야.',
  {baselines:[baseline('프로젝트','프로젝트 5개','known','동료는 프로젝트 5개를 완성했대.')]},{accepted:false,'baselines.0.current':'프로젝트 1개'})
const us11=invalid('conditional-deadline-is-not-a-decision',4,'If the client delays the launch, change the period to 12 weeks. No change for now.',
  {period:period('12 weeks')},{accepted:false,'period.weeks':8})
const us12=probe('polite-would-like-is-a-decision',4,'I would like to finish 4 books.',
  {objectives:[objective('reading','finish 4 books')]},{'objectives.0.result':'finish 4 books'})
const us13=invalid('other-person-goal-is-not-mine',4,"My colleague's goal is 8 articles. Keep my original goal.",
  {objectives:[objective('writing','8 articles')]},{accepted:false,'objectives.0.result':'3 articles'})
const us14=probe('remove-but-keep-different-target',4,'Remove drawing, but keep writing.',
  {area_changes:[change('drawing','remove','Remove drawing, but keep writing.')]},{areas:['writing'],objectiveAreas:['writing']})
const us15=invalid('curly-apostrophe-negative-deadline',4,'Don’t move the deadline to November 30, 2026.',
  {period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-11-30'}},{accepted:false,'period.weeks':8,'period.deadline':null})
const us17=invalid('unavailable-hours-cannot-replace-capacity',4,"I can't spend 3 hours per week. Keep the old time budget.",
  {capacity:capacity('3 hours per week','known','3 hours per week')},{accepted:false,'capacity.summary':'I can spend 1 hour per week.'})
const us19=invalid('deadline-normalization-must-match-user-date',4,'Move the deadline to November 30, 2026.',
  {period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-12-31'}},{accepted:false,'period.weeks':8,'period.deadline':null})
const us20=invalid('restore-does-not-revive-old-details',5,'Restore reading. I have not decided the details again yet.',
  {area_changes:[change('reading','restore','Restore reading.')],baselines:[baseline('reading','0 books')],objectives:[objective('reading','2 books')]},
  // Restoration itself may be accepted, but old cleared details must stay absent.
  {accepted:true,areas:['coding','reading'],baselineAreas:['coding'],objectiveAreas:['coding'],missing:'baseline'})

export const round4Personas=[
  {id:'KR-16',age:22,synthetic:true,context:kr,profile:'22세 신입 사무직 / 퇴근 후 독서 부담 줄이기',
    situation:'다른 사람이 추천한 많은 독서량을 거절하고 자신의 작은 목표를 유지한다.',
    liveQuestions:['하지 않겠다는 말의 수치를 새 목표로 저장하지 않는가?'],
    steps:single('ko-KR','독서','책 0권','책 3권 완독'),probes:[kr16,
      control('explicit-new-result-control',4,'목표를 책 2권 완독으로 줄일게.',{objectives:[objective('독서','책 2권 완독')]},{'objectives.0.result':'책 2권 완독'})],
    agentProbes:[agent(kr16,'어떤 독서 방식이 편할까요?',{'objectives.0.result':'책 3권 완독'})]},
  {id:'KR-17',age:25,synthetic:true,context:kr,profile:'25세 영상 편집 취업 준비 / 포트폴리오 진도 보고',
    situation:'최근 완성량을 업데이트하면서 바로 다음 실행 방법도 묻는다.',
    liveQuestions:['진도 보고와 질문을 함께 받아 이미 말한 진도를 다시 묻지 않는가?'],
    steps:single('ko-KR','영상 편집','1편','영상 6편 완성'),probes:[kr17,
      control('baseline-narrow-evidence-control',4,kr17.message,{baselines:[baseline('영상 편집','2편','known','최근 완성한 영상은 2편이야.')]},{'baselines.0.current':'2편'})],
    agentProbes:[agent(kr17,'어떤 종류의 영상을 더 만들고 싶으세요?',{'baselines.0.current':'2편'})]},
  {id:'KR-18',age:27,synthetic:true,context:kr,profile:'27세 대학원생·아르바이트 병행 / 연구 메모 시간 배분',
    situation:'아르바이트가 줄어 시간이 늘었고 어떤 요일에 배분할지 조언을 원한다.',
    liveQuestions:['가용 시간 저장과 배치 조언을 동시에 처리하는가?'],
    steps:single('ko-KR','연구 메모','1편','연구 메모 4편 완성'),probes:[kr18,
      control('availability-narrow-evidence-control',4,kr18.message,{capacity:capacity('주당 2시간 가능해.')},{'capacity.summary':'주당 2시간 가능해.'})]},
  {id:'KR-19',age:29,synthetic:true,context:kr,profile:'29세 승무원 / 외국어와 독서 중 하나에 집중',
    situation:'비행 일정이 늘어 일본어를 빼고 독서 방법을 함께 묻는다.',
    liveQuestions:['삭제할 목표와 남은 목표에 대한 질문을 구분하는가?'],
    steps:dual('ko-KR',['일본어','독서'],['대본 0개','책 0권'],['대본 3개 완성','책 2권 완독']),probes:[kr19,
      control('removal-only-control',4,'일본어는 제외해줘.',{area_changes:[change('일본어','remove','일본어는 제외해줘.')]},{areas:['독서']})]},
  {id:'KR-20',age:32,synthetic:true,context:kr,profile:'32세 복직한 부모 / 독서 경험 회고',
    situation:'현재 한 권을 마친 뒤 작년 육아 시절의 어려움을 회고한다.',
    liveQuestions:['회고하는 말만으로 현재 성과를 되돌리지 않는가?'],
    steps:single('ko-KR','독서','책 1권','책 3권 완독'),probes:[kr20,
      control('explicit-current-correction-control',4,'정정할게. 지금 완료한 책은 0권이야.',{baselines:[baseline('독서','0권','known','지금 완료한 책은 0권이야.')]},{'baselines.0.current':'0권'})],
    agentProbes:[agent(kr20,'이번에는 어떤 방식으로 이어가고 싶으세요?',{'baselines.0.current':'책 1권'})]},
  {id:'KR-21',age:34,synthetic:true,context:kr,profile:'34세 개발자 이직 준비 / 동료와 성과 비교',
    situation:'동료의 프로젝트 수를 이야기하면서 자신의 더 적은 진도는 구분한다.',
    liveQuestions:['비교 대상의 실적과 사용자 본인의 실적을 구분하는가?'],
    steps:single('ko-KR','프로젝트','프로젝트 1개','프로젝트 3개 완성'),probes:[kr21,
      control('own-progress-control',4,kr21.message,{baselines:[baseline('프로젝트','프로젝트 1개','known','나는 아직 프로젝트 1개야.')]},{'baselines.0.current':'프로젝트 1개'})],
    agentProbes:[agent(kr21,'본인의 프로젝트는 어느 부분을 진행 중인가요?',{'baselines.0.current':'프로젝트 1개'})]},
  {id:'KR-22',age:36,synthetic:true,context:kr,profile:'36세 현장 관리자 / 퇴근 후 걷기 횟수 늘리기',
    situation:'일반적인 주 2회 표현을 사용해 현재 운동 빈도를 전달한다.',
    liveQuestions:['일상적인 주 N회와 주당 N회를 같은 빈도로 이해하는가?'],
    steps:single('ko-KR','걷기','주 2회','주당 3회',4),
    probes:[probe('colloquial-korean-weekly-rate',4,'주 2회 걷고 있어.',{}, {feasibility:'ready','gaps.0.currentPerWeek':2,'gaps.0.requiredPerWeek':3}),
      control('weekly-rate-canonical-control',4,'현재 속도는 주당 2회야.',{baselines:[baseline('걷기','주당 2회')]},{feasibility:'ready','gaps.0.currentPerWeek':2})]},
  {id:'KR-23',age:39,synthetic:true,context:kr,profile:'39세 가족 돌봄·재택근무 / 학습 정리 재시작',
    situation:'돌봄 일정이 달라 시간은 범위로만 말할 수 있고 현재 진도는 모른다.',
    liveQuestions:['미측정과 추정 시간을 허용하되 정확한 성취량으로 과장하지 않는가?'],
    steps:[
      turn('학습 정리를 6주 동안 노트 3편 완성으로 진행할게.',{period:'6주',areas:[area('학습 정리')],objectives:[objective('학습 정리','노트 3편 완성')]},{missing:'baseline'}),
      turn('현재 수준은 모르겠어.',{baselines:[baseline('학습 정리','현재 수준은 모르겠어.','unmeasured')]},{missing:'capacity'}),
      turn('주당 30~60분 정도 가능해.',{capacity:capacity('주당 30~60분 정도 가능해.','estimate')},{missing:null,'capacity.status':'estimate',feasibility:'needs_measurement'}),
      turn('우선 측정하면서 해볼게.',{},{'baselines.0.status':'unmeasured',feasibility:'needs_measurement'}),
    ],probes:[{...invalid('silence-is-not-measured-level',4,'알겠어.',{baselines:[baseline('학습 정리','노트 2편')]},{accepted:false,'baselines.0.status':'unmeasured'}),allowUngroundedEvidence:true}]},
  {id:'KR-24',age:43,synthetic:true,context:kr,profile:'43세 가게 운영자 / 분기 행사 준비',
    situation:'행사 준비 기간을 두 달 반으로 늘려 현실적인 일정을 원한다.',
    liveQuestions:['정수 개월이 아닌 기간도 의미를 잃지 않는가?'],
    steps:single('ko-KR','행사 준비','자료 1개','자료 4개 완성'),probes:[
      probe('fractional-month-duration',4,'기간은 두 달 반으로 늘릴게.',{period:{evidence:'두 달 반',kind:'duration',normalized:'11 weeks'}},{'period.weeks':11}),
      control('equivalent-weeks-control',4,'기간을 11주로 변경할게.',{period:'11주'},{'period.weeks':11})]},
  {id:'KR-25',age:48,synthetic:true,context:kr,profile:'48세 월말 집중근무 직장인 / 일시적인 시간 소진',
    situation:'업무 피크로 실행 시간이 0분인데 이전 속도를 근거로 가능하다고 하면 안 된다.',
    liveQuestions:['시간이 전혀 없는 상태를 실행 준비 완료로 판단하지 않는가?'],
    steps:single('ko-KR','업무 노트','매주 1편','노트 4편 완성',4),probes:[
      probe('zero-capacity-is-not-ready',4,'지금은 주당 0분 가능해.',{capacity:capacity('주당 0분 가능해.')},{'capacity.summary':'주당 0분 가능해.',feasibilityReady:false}),
      control('positive-capacity-control',4,'주당 1시간 가능해.',{capacity:capacity('주당 1시간 가능해.')},{feasibility:'ready'})]},
  {id:'US-11',age:23,synthetic:true,context:us('America/New_York'),profile:'23세 미국 주니어 디자이너 / 고객 일정에 따른 가정',
    situation:'고객이 일정을 미룰 경우의 대안만 제시하며 지금의 기간은 유지한다.',
    liveQuestions:['조건부 계획을 지금 확정한 변경으로 저장하지 않는가?'],
    steps:single('en-US','design','1 project','3 projects'),probes:[us11,
      control('unconditional-duration-control',4,'Change the period to 12 weeks.',{period:period('12 weeks')},{'period.weeks':12})],
    agentProbes:[agent(us11,'Which project should we focus on first?',{'period.weeks':8})]},
  {id:'US-12',age:26,synthetic:true,context:us('America/Chicago'),profile:'26세 미국 서비스직 / 정중하게 독서 목표 수정',
    situation:'질문이 아니라 I would like라는 정중한 의사 표현으로 목표를 바꾼다.',
    liveQuestions:['정중한 의사 표현을 미확정 후보와 구별하는가?'],
    steps:single('en-US','reading','1 book','finish 3 books'),probes:[us12,
      control('plain-want-control',4,'I want to finish 4 books.',{objectives:[objective('reading','finish 4 books')]},{'objectives.0.result':'finish 4 books'})]},
  {id:'US-13',age:28,synthetic:true,context:us('America/Los_Angeles'),profile:'28세 미국 대학원생 / 동료의 글쓰기 목표 언급',
    situation:'동료의 더 큰 목표를 소개하지만 자신의 목표는 유지하고 싶다.',
    liveQuestions:['인용된 다른 사람의 목표를 사용자 목표로 저장하지 않는가?'],
    steps:single('en-US','writing','1 article','3 articles'),probes:[us13,
      control('own-goal-replay-control',4,us13.message,{objectives:[objective('writing','3 articles')]},{'objectives.0.result':'3 articles'})]},
  {id:'US-14',age:31,synthetic:true,context:us('America/Denver'),profile:'31세 미국 교대근무 부모 / 창작 목표 정리',
    situation:'그림을 제외하되 글쓰기를 남긴다는 대조 접속 표현을 사용한다.',
    liveQuestions:['but로 연결된 상반된 행동을 각 목표에 정확히 적용하는가?'],
    steps:dual('en-US',['drawing','writing'],['0 sketches','1 article'],['2 sketches','3 articles']),probes:[us14,
      control('semicolon-target-control',4,'Remove drawing; keep writing.',{area_changes:[change('drawing','remove','Remove drawing; keep writing.')]},{areas:['writing']})],
    agentProbes:[agent(us14,'What kind of writing would you like to do?',{areas:['writing']})]},
  {id:'US-15',age:33,synthetic:true,context:us('America/New_York'),profile:'33세 미국 자격증 준비 직장인 / 휴대폰 자동 문장부호',
    situation:'휴대폰이 자동으로 곡선 아포스트로피를 입력해도 변경하지 말라는 의도는 같다.',
    liveQuestions:['스마트폰 자동 문장부호가 금지 의도를 뒤집지 않는가?'],
    steps:single('en-US','certification','40 points','70 points'),probes:[us15,
      control('straight-apostrophe-control',4,"Don't move the deadline to November 30, 2026.",us15.candidate,{accepted:false,'period.weeks':8})],
    agentProbes:[agent(us15,'What should we focus on in the existing timeframe?',{'period.weeks':8,'period.deadline':null})]},
  {id:'US-16',age:35,synthetic:true,context:us('America/Chicago'),profile:'35세 미국 비영리단체 직원 / 격주 뉴스레터',
    situation:'격주 작업 빈도를 fortnight라는 말로 설명한다.',
    liveQuestions:['낯설지만 유효한 빈도 표현을 재질문 없이 계산할 수 있는가?'],
    steps:single('en-US','newsletter','2 articles every fortnight','12 articles',4),probes:[
      probe('fortnight-rate',4,'I write 2 articles every fortnight.',{}, {feasibility:'strained','gaps.0.currentPerWeek':1,'gaps.0.requiredPerWeek':3}),
      control('two-weeks-rate-control',4,'I now write 2 articles every 2 weeks.',{baselines:[baseline('newsletter','2 articles every 2 weeks')]},{feasibility:'strained','gaps.0.currentPerWeek':1})]},
  {id:'US-17',age:38,synthetic:true,context:us('America/Los_Angeles'),profile:'38세 미국 의료행정직 / 가족 돌봄으로 시간 제한',
    situation:'사용할 수 없는 큰 시간 예산을 분명히 거절하고 기존 시간만 유지한다.',
    liveQuestions:['불가능한 시간을 가용 시간으로 저장하지 않는가?'],
    steps:single('en-US','coursework','1 project','3 projects'),probes:[us17,
      control('available-time-control',4,'I can spend 2 hours per week.',{capacity:capacity('I can spend 2 hours per week.')},{'capacity.summary':'I can spend 2 hours per week.'})],
    agentProbes:[agent(us17,'Which small action would fit the time you have?',{'capacity.summary':'I can spend 1 hour per week.'})]},
  {id:'US-18',age:41,synthetic:true,context:us('America/Denver'),profile:'41세 미국 프리랜서 / 여러 목표 중 우선순위 변경',
    situation:'아이 돌봄이 늘어 코딩을 우선하고 독서는 줄이며 짧은 시간부터 시작한다.',
    liveQuestions:['순위를 정정할 때 다른 목표를 삭제하지 않는가?'],
    steps:[...dual('en-US',['reading','coding'],['1 book','0 projects'],['3 books','2 projects']),
      turn('coding comes first; reading can be reduced.',{priority:{mode:'ranked',primary_area:'coding',flexible_areas:['reading'],evidence:'coding comes first; reading can be reduced.'}},
        {areas:['reading','coding'],'priority.primaryArea':'coding','priority.flexibleAreas':['reading']}),
      turn('I can spend about 1.5 hours per week.',{capacity:capacity('I can spend about 1.5 hours per week.','estimate')},{'capacity.status':'estimate',missing:null}),
    ],probes:[invalid('ambiguous-it-is-not-removal-authority',6,'Drop it for now.',{area_changes:[change('reading','remove','Drop it for now.')]},{accepted:false,areas:['reading','coding']})]},
  {id:'US-19',age:44,synthetic:true,context:us('America/New_York'),profile:'44세 미국 소상공인 / 출시일 입력의 정확성',
    situation:'정확한 11월 마감을 입력했을 때 구조화 후보의 잘못된 12월 날짜를 걸러야 한다.',
    liveQuestions:['서버가 사용자 원문과 정규화된 날짜의 일치를 검증하는가?'],
    steps:single('en-US','launch','1 project','2 projects'),probes:[us19,
      control('correct-deadline-normalization-control',4,us19.message,{period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-11-30'}},{'period.deadline':'2026-11-30','period.weeks':11})],
    agentProbes:[agent(us19,'What is the next deliverable for your launch?',{'period.weeks':8,'period.deadline':null})]},
  {id:'US-20',age:49,synthetic:true,context:us('America/Los_Angeles'),profile:'49세 미국 경력 전환자 / 제외했던 취미 다시 시작',
    situation:'지웠던 독서 분야만 다시 열고 목표량·현재 수준은 새로 정하고 싶다.',
    liveQuestions:['복원 동의를 이전에 지운 모든 세부 정보의 복원 동의로 확대하지 않는가?'],
    steps:[...dual('en-US',['reading','coding'],['0 books','1 project'],['2 books','3 projects']),
      turn('Remove reading.',{area_changes:[change('reading','remove','Remove reading.')]},{areas:['coding'],baselineAreas:['coding'],objectiveAreas:['coding']}),
    ],probes:[us20,
      control('restore-without-old-details-control',5,us20.message,{area_changes:[change('reading','restore','Restore reading.')]},{areas:['coding','reading'],baselineAreas:['coding'],objectiveAreas:['coding'],missing:'baseline'})],
    agentProbes:[agent(us20,'Where are you starting with reading now?',{areas:['coding','reading'],baselineAreas:['coding'],objectiveAreas:['coding'],missing:'baseline'})]},
]
