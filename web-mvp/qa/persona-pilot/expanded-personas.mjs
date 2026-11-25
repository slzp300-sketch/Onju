// Ten additional fictional people. Situations are hypotheses, not prevalence
// claims or user research. All extraction candidates are manually authored.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const us=zone=>({locale:'en-US',countryCode:'US',timeZone:zone,currencyCode:'USD',weekStartsOn:0})
const area=name=>({name,evidence:name})
const objective=(name,result)=>({area:name,result,evidence:result,result_kind:'deliverable'})
const baseline=(name,current,status='known')=>({area:name,current,evidence:current,status})
const capacity=(summary,status='known')=>({summary,evidence:summary,status})
const period=(evidence,normalized)=>({evidence,kind:'duration',normalized})
const turn=(message,candidate,expect)=>({message,candidate,expect})

export const expandedPersonas=[
  {
    id:'KR-04',age:24,synthetic:true,context:kr,
    profile:'24세 취업 준비생 · 아르바이트와 면접 준비 병행',
    situation:'지원서와 면접 준비를 동시에 벌여 완성하지 못함. 결과물을 적게 잡아 끝내고 싶음.',
    liveQuestions:['막연한 취업 성공을 보장하지 않고 사용자가 통제할 수 있는 준비 행동으로 연결하는가?','줄이겠다는 선택에 죄책감을 주지 않는가?'],
    steps:[
      turn('취업 준비로 면접 답변 6개 완성을 목표로 할게.',{areas:[area('취업 준비')],objectives:[objective('취업 준비','면접 답변 6개 완성')]},{missing:'period'}),
      turn('기간은 6주로 정할게.',{period:'6주'},{'period.weeks':6,missing:'baseline'}),
      turn('지금은 답변 2개 작성했어.',{baselines:[baseline('취업 준비','답변 2개 작성')]},{missing:'capacity','baselines.0.current':'답변 2개 작성'}),
      turn('주당 90분 가능해. 아르바이트 끝나고 할 거야.',{capacity:capacity('주당 90분 가능해.')},{missing:null,'capacity.status':'known'}),
      turn('우선 면접 답변 3개 완성으로 목표를 줄일게.',{objectives:[objective('취업 준비','면접 답변 3개 완성')]},{missing:null,'objectives.0.result':'면접 답변 3개 완성','period.weeks':6}),
    ],
  },
  {
    id:'KR-05',age:28,synthetic:true,context:kr,
    profile:'28세 직장인 · 퇴근 후 자격시험 준비',
    situation:'공부 경험은 있고 최근 점수도 알지만 기간은 아직 선택하지 못함.',
    liveQuestions:['추천받으려는 기간과 사용자가 선택한 기간을 구분하는가?','이미 측정한 점수를 다시 물어보지 않는가?'],
    steps:[
      turn('자격시험에서 모의고사 70점 달성이 목표야.',{areas:[area('자격시험')],objectives:[objective('자격시험','모의고사 70점 달성')]},{missing:'period'}),
      turn('8주가 좋을까? 아직 미정이야.',{period:'8주'},{accepted:false,missing:'period','period':null}),
      turn('기간은 8주로 확정할게.',{period:'8주'},{missing:'baseline','period.weeks':8}),
      turn('현재 측정한 점수는 65점이야.',{baselines:[baseline('자격시험','측정한 점수는 65점')]},{missing:'capacity','baselines.0.status':'known'}),
      turn('주 3회 30분 가능해.',{capacity:capacity('주 3회 30분 가능해.')},{missing:null}),
    ],
    probes:[{id:'measured-is-not-unmeasured',kind:'invalid-model-candidate',message:'현재 측정한 점수는 65점이야.',
      candidate:{baselines:[baseline('자격시험','측정한 점수는 65점','unmeasured')]},expect:{accepted:false,'baselines.0.current':'측정한 점수는 65점','baselines.0.status':'known'}}],
    agentProbes:[{id:'measured-baseline-full-agent',candidateKind:'deliberately-invalid-extraction',seedAfterTurn:4,
      message:'현재 측정한 점수는 65점이야.',candidate:{baselines:[baseline('자격시험','측정한 점수는 65점','unmeasured')]},
      question:'일주일에 몇 번, 한 번에 몇 분 정도 쓸 수 있나요?',
      expect:{'baselines.0.current':'측정한 점수는 65점','baselines.0.status':'known',missing:'capacity'}}],
  },
  {
    id:'KR-06',age:33,synthetic:true,context:kr,
    profile:'33세 맞벌이 양육자 · 짧은 영어 발표 준비',
    situation:'아이의 수면과 돌봄에 따라 빈 시간이 달라져 고정된 저녁 시간을 약속하기 어려움.',
    liveQuestions:['유동적이라고 한 시간을 고정 일정으로 만들지 않는가?','한 번 놓쳐도 짧게 재개할 수 있는 행동을 제시하는가?'],
    steps:[
      turn('영어 발표 대본 1개 완성을 4주 동안 하고 싶어.',{areas:[area('영어 발표')],period:'4주',objectives:[objective('영어 발표','대본 1개 완성')]},{missing:'baseline','period.weeks':4}),
      turn('발표는 해본 적 없어.',{baselines:[baseline('영어 발표','해본 적 없어.','unmeasured')]},{missing:'capacity','baselines.0.status':'unmeasured'}),
      turn('아이 돌봄 때문에 가능한 시간은 유동적이야.',{capacity:capacity('아이 돌봄 때문에 가능한 시간은 유동적이야.','unmeasured')},{missing:null,'capacity.status':'unmeasured',feasibility:'needs_measurement'}),
      turn('이번에는 평일 하루 10분 가능해. 주말에는 못 해.',{capacity:capacity('평일 하루 10분 가능해. 주말에는 못 해.')},{missing:null,'capacity.status':'known','capacity.summary':'평일 하루 10분 가능해. 주말에는 못 해.'}),
    ],
  },
  {
    id:'KR-07',age:37,synthetic:true,context:kr,
    profile:'37세 재직자 · 이직 준비와 독서를 함께 하다 목표 축소',
    situation:'여러 목표를 동시에 시작했다가 야근이 늘어 이직 포트폴리오만 남기고 싶음.',
    liveQuestions:['목표를 빼 달라는 요청을 삭제/보류 선택으로 확인하고 반영하는가?','제외한 목표의 현재 수준과 우선순위를 계속 묻지 않는가?'],
    steps:[
      turn('포트폴리오와 독서 두 분야를 8주 동안 할게.',{period:'8주',areas:[area('포트폴리오'),area('독서')]},{missing:'baseline',areas:['포트폴리오','독서'],'period.weeks':8}),
      turn('포트폴리오는 초안 1개, 독서는 현재 0권이야.',{baselines:[baseline('포트폴리오','초안 1개'),baseline('독서','현재 0권')]},{missing:'result'}),
      turn('포트폴리오 2개 완성과 책 1권 완독이 목표야.',{objectives:[objective('포트폴리오','포트폴리오 2개 완성'),objective('독서','책 1권 완독')]},{missing:'priority'}),
      turn('포트폴리오가 우선이고 독서는 줄여도 돼.',{priority:{mode:'ranked',primary_area:'포트폴리오',flexible_areas:['독서'],evidence:'포트폴리오가 우선이고 독서는 줄여도 돼.'}},{missing:'capacity'}),
      turn('주당 2시간 가능해.',{capacity:capacity('주당 2시간 가능해.')},{missing:null}),
    ],
    probes:[{id:'remove-one-goal-capability',kind:'capability-gap',message:'독서 목표는 빼고 포트폴리오만 남겨줘.',
      note:'record_goal_brief has append/update fields but no removal field. The candidate is the closest representable retained scope, not proof of a live model choosing the wrong tool.',
      candidate:{areas:[area('포트폴리오')]},expect:{areas:['포트폴리오'],objectiveAreas:['포트폴리오'],baselineAreas:['포트폴리오']}}],
  },
  {
    id:'KR-08',age:42,synthetic:true,context:kr,
    profile:'42세 자영업자 · 가게 홍보 글 꾸준히 발행',
    situation:'영업과 운영 업무에 밀려 현재 주 1편을 쓰는데 4주 동안 12편을 쓰려 함.',
    liveQuestions:['현재 속도 대비 세 배의 목표를 무조건 가능하다고 하지 않는가?','줄이기/기간 늘리기/시간 확보의 차이를 설명하고 선택받는가?'],
    steps:[
      turn('홍보 글 12편 완성을 4주 동안 해볼게.',{period:'4주',areas:[area('홍보 글')],objectives:[objective('홍보 글','12편 완성')]},{missing:'baseline'}),
      turn('현재는 매주 1편 작성해.',{baselines:[baseline('홍보 글','매주 1편 작성')]},{missing:'capacity'}),
      turn('일주일에 1시간 가능해.',{capacity:capacity('일주일에 1시간 가능해.')},{missing:null,feasibility:'strained',next:'feasibility',minimumConflicts:1}),
      turn('무리하지 않고 4편 완성으로 줄일게.',{objectives:[objective('홍보 글','4편 완성')]},{missing:null,feasibility:'ready',next:null}),
    ],
  },
  {
    id:'KR-09',age:47,synthetic:true,context:kr,
    profile:'47세 직장인 · 가족 돌봄 중 가계 지출 기록 정리',
    situation:'월별 지출을 확인할 보고서를 만들고 싶지만 기록 기준도 실행 시간도 아직 명확하지 않음.',
    liveQuestions:['현재 기록 상태를 모른다는 말을 가용 시간도 모른다는 뜻으로 확대하지 않는가?','가족의 개인정보나 계좌번호를 불필요하게 요구하지 않는가?'],
    steps:[
      turn('가계부를 8주 동안 정리해서 월간 보고서 2개 완성할게.',{period:'8주',areas:[area('가계부')],objectives:[objective('가계부','월간 보고서 2개 완성')]},{missing:'baseline'}),
      turn('현재 보고서 1개 완성했어.',{baselines:[baseline('가계부','보고서 1개 완성')]},{missing:'capacity'}),
      turn('가능한 시간은 주당 20분 정도야.',{capacity:capacity('가능한 시간은 주당 20분 정도야.')},{missing:null}),
      turn('돌봄 일정이 바뀌어서 주당 10분으로 줄일게.',{capacity:capacity('돌봄 일정이 바뀌어서 주당 10분으로 줄일게.')},{missing:null,'capacity.summary':'돌봄 일정이 바뀌어서 주당 10분으로 줄일게.'}),
    ],
    probes:[{id:'unknown-level-not-capacity',kind:'invalid-model-candidate',seedAfterTurn:2,
      message:'현재 기록 수준은 잘 모르겠어.',candidate:{capacity:capacity('현재 기록 수준은 잘 모르겠어.','unmeasured')},
      expect:{accepted:false,capacity:null,missing:'capacity'}}],
  },
  {
    id:'US-03',age:26,synthetic:true,context:us('America/Chicago'),
    profile:'26세 대학원생 · 수업·아르바이트 사이 논문 읽기',
    situation:'매주 가용 시간이 달라 짧은 시간 두 번 정도만 확보할 수 있음. 시간을 먼저 이야기함.',
    liveQuestions:['정해진 질문 순서 밖에서 먼저 말한 시간도 저장하는가?','제약을 고정 시간표 입력으로 바꾸지 않는가?'],
    steps:[
      turn('My research reading goal is to summarize 4 papers in 4 weeks.',{period:period('4 weeks','4주'),areas:[area('research reading')],objectives:[objective('research reading','summarize 4 papers')]},{missing:'baseline','period.weeks':4}),
      turn('Some weeks I only get two 15-minute windows.',{capacity:capacity('Some weeks I only get two 15-minute windows.','estimate')},{missing:'baseline','capacity.status':'estimate'}),
      turn('I have summarized 1 paper.',{baselines:[baseline('research reading','summarized 1 paper')]},{missing:null,'baselines.0.current':'summarized 1 paper'}),
      turn('My available time is about 30 minutes per week.',{capacity:capacity('My available time is about 30 minutes per week.','estimate')},{missing:null,'capacity.status':'estimate'}),
    ],
    agentProbes:[{id:'fragmented-time-full-agent',candidateKind:'intended-extraction',seedAfterTurn:1,
      message:'Some weeks I only get two 15-minute windows.',candidate:{capacity:capacity('Some weeks I only get two 15-minute windows.','estimate')},
      question:'What is your current progress with research reading?',expect:{'capacity.status':'estimate',missing:'baseline'}}],
  },
  {
    id:'US-04',age:31,synthetic:true,context:us('America/New_York'),
    profile:'31세 양육 중인 직장인 · 승진 발표 준비 기간 변경',
    situation:'처음에는 3개월로 잡았지만 발표 일정이 앞당겨져 8주로 바꿔야 함.',
    liveQuestions:['기간 변경을 명시했을 때 이전 값을 고집하지 않는가?','기존에 확인한 목표와 현재 상태는 유지하는가?'],
    steps:[
      turn('I want to work on my presentation for 3 months.',{period:period('3 months','3개월'),areas:[area('presentation')]},{missing:'baseline','period.weeks':13}),
      turn('Change the timeframe to 8 weeks.',{period:period('8 weeks','8주')},{missing:'baseline','period.weeks':8}),
      turn('I have 1 outline.',{baselines:[baseline('presentation','1 outline')]},{missing:'result'}),
      turn('I want to complete 1 presentation.',{objectives:[objective('presentation','complete 1 presentation')]},{missing:'capacity'}),
      turn('I can spend 20 minutes on weekdays.',{capacity:capacity('I can spend 20 minutes on weekdays.')},{missing:null,'period.weeks':8}),
    ],
    agentProbes:[{id:'explicit-period-change-full-agent',seedAfterTurn:1,message:'Change the timeframe to 8 weeks.',
      candidate:{period:period('8 weeks','8주')},question:'What is your current progress with the presentation?',
      expect:{'period.weeks':8,'period.label':'8 weeks',missing:'baseline'}}],
  },
  {
    id:'US-05',age:36,synthetic:true,context:us('America/Los_Angeles'),
    profile:'36세 프로젝트 계약직 · 중단했던 독서 재개',
    situation:'일정이 일정하지 않지만 초보는 아님. 과거 읽은 기록과 재시작 의지를 함께 설명함.',
    liveQuestions:['not a beginner처럼 부정한 상태를 반대로 저장하지 않는가?','재시작을 경험이 없는 상태로 취급하지 않는가?'],
    steps:[
      turn('My reading goal is to finish 2 books in 8 weeks.',{period:period('8 weeks','8주'),areas:[area('reading')],objectives:[objective('reading','finish 2 books')]},{missing:'baseline'}),
      turn('I am not a complete beginner. I finished 1 book last month.',{baselines:[baseline('reading','1 book last month')]},{missing:'capacity','baselines.0.status':'known'}),
      turn('My schedule changes every week, so my available time varies.',{capacity:capacity('My schedule changes every week, so my available time varies.','unmeasured')},{missing:null,feasibility:'needs_measurement'}),
      turn('For now I can spend 15 minutes on weekdays.',{capacity:capacity('For now I can spend 15 minutes on weekdays.','estimate')},{missing:null,'capacity.status':'estimate'}),
    ],
    probes:[{id:'negated-beginner-not-unmeasured',kind:'invalid-model-candidate',message:'I am not a complete beginner.',
      candidate:{baselines:[baseline('reading','I am not a complete beginner.','unmeasured')]},expect:{accepted:false,'baselines.0.status':'known','baselines.0.current':'1 book last month'}}],
    agentProbes:[{id:'negated-beginner-full-agent',candidateKind:'deliberately-invalid-extraction',seedAfterTurn:2,
      message:'I am not a complete beginner.',candidate:{baselines:[baseline('reading','I am not a complete beginner.','unmeasured')]},
      question:'How much time can you comfortably spend each week?',
      expect:{'baselines.0.status':'known','baselines.0.current':'1 book last month',missing:'capacity'}}],
  },
  {
    id:'US-06',age:44,synthetic:true,context:us('America/New_York'),
    profile:'44세 팀 관리자 · 본업 외 뉴스레터 발행',
    situation:'주 1편 발행하던 뉴스레터를 추가 시간 없이 4주에 12편으로 늘리려 함.',
    liveQuestions:['영어로 표현된 현재 속도·목표량도 한국어와 같은 기준으로 비교하는가?','가능하다는 말보다 실제 필요한 실행량을 먼저 설명하는가?'],
    steps:[
      turn('My newsletter goal is to publish 12 articles in 4 weeks.',{period:period('4 weeks','4주'),areas:[area('newsletter')],objectives:[objective('newsletter','publish 12 articles')]},{missing:'baseline'}),
      turn('I currently publish 1 article per week.',{baselines:[baseline('newsletter','1 article per week')]},{missing:'capacity'}),
      turn('I have one hour available each week.',{capacity:capacity('I have one hour available each week.')},{missing:null,feasibility:'strained',next:'feasibility',minimumConflicts:1}),
      turn('Then I will publish 4 articles instead.',{objectives:[objective('newsletter','publish 4 articles')]},{missing:null,'objectives.0.result':'publish 4 articles',feasibility:'ready',next:null}),
    ],
  },
]
