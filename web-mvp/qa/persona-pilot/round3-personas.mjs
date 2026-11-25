// Fictional 20–40s life situations, not interviews, population claims or live AI replies.
// Expected outcomes and tool candidates are authored BEFORE executing the diagnosis.
const kr={locale:'ko-KR',countryCode:'KR',timeZone:'Asia/Seoul',currencyCode:'KRW',weekStartsOn:1}
const us=zone=>({locale:'en-US',countryCode:'US',timeZone:zone,currencyCode:'USD',weekStartsOn:0})
const area=name=>({name,evidence:name})
const baseline=(name,current,status='known',evidence=current)=>({area:name,current,status,evidence})
const objective=(name,result)=>({area:name,result,evidence:result,result_kind:'deliverable'})
const capacity=(summary,status='known')=>({summary,evidence:summary,status})
const period=evidence=>({evidence,kind:'duration',normalized:evidence})
const change=(name,action,evidence)=>({area:name,action,evidence})
const turn=(message,candidate,expect)=>({message,candidate,expect})

export const round3Personas=[
  {
    id:'KR-10',age:24,synthetic:true,context:kr,profile:'24세 첫 직장·첫 자취 / 지출 기록을 꾸준히 남기기',
    situation:'퇴근 후 기록을 미루다 포기해서 목표량을 줄이고, 실행 방법은 질문하고 싶다.',
    liveQuestions:['돈 관리 목표를 금융상품 추천으로 확장하지 않는가?','목표 확정과 방법 질문이 한 발언에 있어도 구분하는가?'],
    steps:[
      turn('지출 기록으로 4주 동안 기록 20일 완료가 목표야.',{period:'4주',areas:[area('지출 기록')],objectives:[objective('지출 기록','기록 20일 완료')]},{missing:'baseline'}),
      turn('현재 기록 3일 완료했어.',{baselines:[baseline('지출 기록','현재 기록 3일 완료')]},{missing:'capacity'}),
      turn('하루 5분 가능해.',{capacity:capacity('하루 5분 가능해.')},{missing:null}),
      turn('목표는 기록 10일 완료로 줄일게. 주말은 쉬어도 될까?',{objectives:[objective('지출 기록','기록 10일 완료')]},{missing:null,'objectives.0.result':'기록 10일 완료'}),
      turn('목표를 기록 10일 완료로 줄일게.',{objectives:[objective('지출 기록','기록 10일 완료')]},{missing:null,'objectives.0.result':'기록 10일 완료'}),
    ],
  },
  {
    id:'KR-11',age:28,synthetic:true,context:kr,profile:'28세 경력 공백 후 재취업 / 어학 시험 준비',
    situation:'작년 점수는 기억하지만 공백 후 현재 실력은 다시 측정해야 한다.',
    liveQuestions:['과거 점수를 지금 수준으로 단정하지 않는가?','모른다고 할 때 전체 계획을 막지 않고 첫 주 측정을 안내하는가?'],
    steps:[
      turn('어학 시험으로 8주 안에 모의고사 70점 달성이 목표야.',{period:'8주',areas:[area('어학 시험')],objectives:[objective('어학 시험','모의고사 70점 달성')]},{missing:'baseline'}),
      turn('지금 수준은 모르겠어.',{baselines:[baseline('어학 시험','지금 수준은 모르겠어.','unmeasured')]},{missing:'capacity','baselines.0.status':'unmeasured'}),
      turn('주 3회 20분 가능해.',{capacity:capacity('주 3회 20분 가능해.')},{missing:null,feasibility:'needs_measurement'}),
      turn('오늘 다시 측정한 점수는 50점이야.',{baselines:[baseline('어학 시험','측정한 점수는 50점')]},{missing:null,'baselines.0.status':'known','baselines.0.current':'측정한 점수는 50점'}),
    ],
    probes:[
      {id:'historical-score-current-unknown-broad',kind:'intended-extraction',seedAfterTurn:1,
        message:'작년에 측정한 점수는 65점이었고, 지금 수준은 모르겠어.',candidate:{baselines:[baseline('어학 시험','지금 수준은 모르겠어.','unmeasured','작년에 측정한 점수는 65점이었고, 지금 수준은 모르겠어.')]},expect:{'baselines.0.status':'unmeasured',missing:'capacity'}},
      {id:'historical-score-current-unknown-narrow-control',kind:'paired-control',seedAfterTurn:1,
        message:'작년에 측정한 점수는 65점이었고, 지금 수준은 모르겠어.',candidate:{baselines:[baseline('어학 시험','지금 수준은 모르겠어.','unmeasured')]},expect:{'baselines.0.status':'unmeasured',missing:'capacity'}},
    ],
  },
  {
    id:'KR-12',age:31,synthetic:true,context:kr,profile:'31세 교대근무자 / 퇴근 후 스트레칭 재개',
    situation:'주간 근무표가 달라 일정이 고정되지 않고 과거 실행 횟수도 따로 확인해야 한다.',
    liveQuestions:['유동적인 근무를 고정 시각으로 강요하지 않는가?','건강 효과를 보장하거나 진단하지 않는가?'],
    steps:[
      turn('스트레칭 4주 동안 주 3회 실천하고 싶어.',{period:'4주',areas:[area('스트레칭')],objectives:[objective('스트레칭','주 3회 실천')]},{missing:'baseline'}),
      turn('근무 일정이 매주 달라서 가능한 시간은 유동적이야.',{capacity:capacity('근무 일정이 매주 달라서 가능한 시간은 유동적이야.','unmeasured')},{missing:'baseline','capacity.status':'unmeasured'}),
      turn('현재 운동 횟수는 기록해본 적 없어.',{baselines:[baseline('스트레칭','현재 운동 횟수는 기록해본 적 없어.','unmeasured')]},{missing:null,feasibility:'needs_measurement'}),
      turn('이번에는 하루 10분 가능해.',{capacity:capacity('하루 10분 가능해.','estimate')},{missing:null,'capacity.status':'estimate'}),
    ],
    probes:[{id:'weekly-history-is-not-availability',kind:'invalid-model-candidate',seedAfterTurn:1,
      message:'내 주간 운동 기록은 하루 몇 번 했는지 아직 모르겠어.',candidate:{capacity:capacity('내 주간 운동 기록은 하루 몇 번 했는지 아직 모르겠어.','unmeasured')},
      expect:{accepted:false,capacity:null,missing:'baseline'}}],
    agentProbes:[{id:'weekly-history-full-agent',candidateKind:'deliberately-invalid-extraction',seedAfterTurn:1,
      message:'내 주간 운동 기록은 하루 몇 번 했는지 아직 모르겠어.',candidate:{capacity:capacity('내 주간 운동 기록은 하루 몇 번 했는지 아직 모르겠어.','unmeasured')},
      question:'최근 스트레칭을 어느 정도 해보셨나요?',expect:{capacity:null,missing:'baseline'}}],
  },
  {
    id:'KR-13',age:35,synthetic:true,context:kr,profile:'35세 프리랜서 / 포트폴리오·영어·독서 동시 시작 후 축소',
    situation:'의뢰가 늘어 여러 목표를 빼고, 일이 줄면 한 목표만 다시 시작하고 싶다.',
    liveQuestions:['여러 분야를 함께 제외하는 지시를 일부만 반영하지 않는가?','복원할 때 과거 세부 계획을 임의로 되살리지 않는가?'],
    steps:[
      turn('포트폴리오, 영어, 독서 세 분야를 8주 동안 할게.',{period:'8주',areas:[area('포트폴리오'),area('영어'),area('독서')]},{areas:['포트폴리오','영어','독서'],missing:'baseline'}),
      turn('포트폴리오는 초안 1개, 영어는 대본 0개, 독서는 0권이야.',{baselines:[baseline('포트폴리오','초안 1개'),baseline('영어','대본 0개'),baseline('독서','0권')]},{missing:'result'}),
      turn('독서를 제외해줘.',{area_changes:[change('독서','remove','독서를 제외해줘.')]},{areas:['포트폴리오','영어'],baselineAreas:['포트폴리오','영어'],missing:'result'}),
      turn('독서를 다시 추가해줘.',{area_changes:[change('독서','restore','독서를 다시 추가해줘.')]},{areas:['포트폴리오','영어','독서'],baselineAreas:['포트폴리오','영어'],missing:'baseline'}),
      turn('독서는 지금 1권 읽었어.',{baselines:[baseline('독서','지금 1권')]},{missing:'result','baselines.2.current':'지금 1권'}),
    ],
    probes:[{id:'remove-two-areas-one-predicate',kind:'intended-extraction',seedAfterTurn:2,
      message:'영어와 독서를 제외해줘.',candidate:{area_changes:[change('영어','remove','영어와 독서를 제외해줘.'),change('독서','remove','영어와 독서를 제외해줘.')]},
      expect:{areas:['포트폴리오'],baselineAreas:['포트폴리오'],areaCount:1,missing:'result'}}],
  },
  {
    id:'KR-14',age:41,synthetic:true,context:kr,profile:'41세 가족 돌봄 병행 직장인 / 학습 노트 정리',
    situation:'돌봄 일정 때문에 잠시 줄이거나 미뤄도 이미 준비한 내용은 잃고 싶지 않다.',
    liveQuestions:['목표 보류를 삭제로 오해하지 않는가?','복잡한 실행 조건을 강요하지 않고 적은 행동으로 시작하는가?'],
    steps:[
      turn('학습 노트 4편 완성을 12주 동안 진행할게.',{period:'12주',areas:[area('학습 노트')],objectives:[objective('학습 노트','4편 완성')]},{missing:'baseline'}),
      turn('한 달에 1편 작성하고 있어.',{baselines:[baseline('학습 노트','한 달에 1편')]},{missing:'capacity'}),
      turn('주당 1시간 가능해.',{capacity:capacity('주당 1시간 가능해.')},{missing:null,feasibility:'ready'}),
      turn('학습 노트는 잠시 보류하고 싶어. 삭제하지는 마.',{}, {areas:['학습 노트'],'objectives.0.result':'4편 완성','period.weeks':12}),
      turn('다시 시작할게. 우선 목표는 2편 완성으로 줄일게.',{objectives:[objective('학습 노트','2편 완성')]},{missing:null,'objectives.0.result':'2편 완성'}),
    ],
    probes:[{id:'pause-not-delete',kind:'invalid-model-candidate',seedAfterTurn:3,
      message:'학습 노트는 잠시 보류하고 싶어. 삭제하지는 마.',candidate:{area_changes:[change('학습 노트','remove','학습 노트는 잠시 보류하고 싶어. 삭제하지는 마.')]},
      expect:{accepted:false,areas:['학습 노트'],'objectives.0.result':'4편 완성'}}],
  },
  {
    id:'KR-15',age:47,synthetic:true,context:kr,profile:'47세 소규모 매장 운영 / 온라인 상품 설명 정리',
    situation:'매장 업무를 병행하며 상품 설명을 늘리려다 현실적인 완료 기간을 늘린다.',
    liveQuestions:['주간 처리량보다 큰 목표를 무조건 가능하다고 하지 않는가?','기간을 늘린다는 자연스러운 정정을 반영하는가?'],
    steps:[
      turn('상품 설명 60개 완성을 4주 동안 하고 싶어.',{period:'4주',areas:[area('상품 설명')],objectives:[objective('상품 설명','60개 완성')]},{missing:'baseline'}),
      turn('현재 매주 5개 작성해.',{baselines:[baseline('상품 설명','매주 5개')]},{missing:'capacity'}),
      turn('주당 1시간 가능해.',{capacity:capacity('주당 1시간 가능해.')},{missing:null,feasibility:'strained',next:'feasibility'}),
      turn('그러면 6주로 늘릴게.',{period:'6주'},{missing:null,'period.weeks':6,feasibility:'ready',next:null}),
      turn('기간을 6주로 변경할게.',{period:'6주'},{missing:null,'period.weeks':6,feasibility:'ready',next:null}),
    ],
  },
  {
    id:'US-07',age:25,synthetic:true,context:us('America/Chicago'),profile:'25세 미국 IT 지원직 / 자격시험 마감 변경',
    situation:'시험 날짜가 바뀌어 처음 정한 8주 기간을 달력 마감일로 옮겨야 한다.',
    liveQuestions:['달력 마감과 기간 정정을 구분하되 의도한 변경은 반영하는가?','시간대에 맞는 오늘 날짜로 남은 주를 계산하는가?'],
    steps:[
      turn('My certification goal is a practice score of 70 points in 8 weeks.',{period:period('8 weeks'),areas:[area('certification')],objectives:[objective('certification','practice score of 70 points')]},{missing:'baseline','period.weeks':8}),
      turn('I currently score 40 points.',{baselines:[baseline('certification','40 points')]},{missing:'capacity'}),
      turn('I can spend 30 minutes on weekdays.',{capacity:capacity('I can spend 30 minutes on weekdays.')},{missing:null}),
      turn('Change the deadline to November 30, 2026.',{period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-11-30'}},{missing:null,'period.deadline':'2026-11-30','period.weeks':11}),
    ],
    probes:[{id:'move-deadline-natural-wording',kind:'intended-extraction',seedAfterTurn:1,
      message:'Move the deadline to November 30, 2026.',candidate:{period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-11-30'}},expect:{'period.deadline':'2026-11-30','period.weeks':11,missing:'baseline'}}],
    agentProbes:[{id:'move-deadline-full-agent',seedAfterTurn:1,message:'Move the deadline to November 30, 2026.',
      candidate:{period:{evidence:'November 30, 2026',kind:'deadline',normalized:'2026-11-30'}},question:'What is your current practice score?',expect:{'period.deadline':'2026-11-30','period.weeks':11,missing:'baseline'}}],
  },
  {
    id:'US-08',age:30,synthetic:true,context:us('America/Los_Angeles'),profile:'30세 미국 육아 중 직장인 / 독서와 스케치 범위 줄이기',
    situation:'아이 돌봄 시간이 늘어 독서는 남기고 스케치는 빼고 싶다.',
    liveQuestions:['남길 목표와 제외할 목표를 같은 문장에서 구분하는가?','별도의 긴 설문 없이 이미 말한 선호를 존중하는가?'],
    steps:[
      turn('I want reading and sketching goals for 6 weeks.',{period:period('6 weeks'),areas:[area('reading'),area('sketching')]},{missing:'baseline'}),
      turn('I have read 0 books and completed 1 sketch.',{baselines:[baseline('reading','0 books'),baseline('sketching','1 sketch')]},{missing:'result'}),
      turn('I want to finish 1 book and complete 3 sketches.',{objectives:[objective('reading','finish 1 book'),objective('sketching','complete 3 sketches')]},{missing:'priority'}),
      turn('reading comes first; sketching can wait.',{priority:{mode:'ranked',primary_area:'reading',flexible_areas:['sketching'],evidence:'reading comes first; sketching can wait.'}},{missing:'capacity'}),
      turn('Remove sketching.',{area_changes:[change('sketching','remove','Remove sketching.')]},{areas:['reading'],missing:'capacity',priority:null}),
      turn('I can spend 10 minutes on weekdays.',{capacity:capacity('I can spend 10 minutes on weekdays.')},{missing:null,areas:['reading']}),
    ],
    probes:[{id:'keep-one-remove-another',kind:'intended-extraction',seedAfterTurn:4,
      message:'Keep reading and remove sketching.',candidate:{area_changes:[change('sketching','remove','Keep reading and remove sketching.')]},expect:{areas:['reading'],priority:null,missing:'capacity'}}],
    agentProbes:[{id:'keep-remove-full-agent',seedAfterTurn:4,message:'Keep reading and remove sketching.',
      candidate:{area_changes:[change('sketching','remove','Keep reading and remove sketching.')]},question:'How much time can you spend each week?',
      expect:{areas:['reading'],priority:null,missing:'capacity'}}],
  },
  {
    id:'US-09',age:38,synthetic:true,context:us('America/New_York'),profile:'38세 미국 직장인 / 격주 뉴스레터 집필',
    situation:'격주로 두 편 쓰는 현재 속도를 바탕으로 한 달 목표를 현실적으로 세우고 싶다.',
    liveQuestions:['every two weeks 같은 기준 기간을 주간 속도로 올바르게 비교하는가?','해석하지 못한 속도를 달성 가능하다는 뜻으로 바꾸지 않는가?'],
    steps:[
      turn('My newsletter goal is to publish 12 articles in 4 weeks.',{period:period('4 weeks'),areas:[area('newsletter')],objectives:[objective('newsletter','publish 12 articles')]},{missing:'baseline'}),
      turn('I write 2 articles every 2 weeks.',{baselines:[baseline('newsletter','2 articles every 2 weeks')]},{missing:'capacity'}),
      turn('I have one hour available each week.',{capacity:capacity('I have one hour available each week.')},{missing:null,feasibility:'strained',next:'feasibility',minimumConflicts:1}),
      turn('That averages 1 article per week.',{baselines:[baseline('newsletter','1 article per week')]},{missing:null,feasibility:'strained',next:'feasibility',minimumConflicts:1}),
      turn('Then I will publish 4 articles instead.',{objectives:[objective('newsletter','publish 4 articles')]},{missing:null,feasibility:'ready',next:null}),
    ],
  },
  {
    id:'US-10',age:46,synthetic:true,context:us('America/Denver'),profile:'46세 미국 경력 전환 준비자 / 저녁 코딩 프로젝트',
    situation:'과거 대화의 시작 기록보다 최근 완성한 결과를 기준으로 계획을 유지해야 한다.',
    liveQuestions:['과거 0개 기록이 최신 1개 완료 기록을 덮어쓰지 않는가?','현재까지 한 일을 인정하고 다음 행동을 구체적으로 제안하는가?'],
    steps:[
      turn('My coding goal is to finish 2 projects in 8 weeks.',{period:period('8 weeks'),areas:[area('coding')],objectives:[objective('coding','finish 2 projects')]},{missing:'baseline'}),
      turn('I have completed 0 projects.',{baselines:[baseline('coding','0 projects')]},{missing:'capacity','baselines.0.current':'0 projects'}),
      turn('I finished 1 project now.',{baselines:[baseline('coding','1 project')]},{missing:'capacity','baselines.0.current':'1 project'}),
      turn('My available time varies every week.',{capacity:capacity('My available time varies every week.','unmeasured')},{missing:null,feasibility:'needs_measurement'}),
      turn('I can spend 30 minutes on weekends.',{capacity:capacity('I can spend 30 minutes on weekends.','estimate')},{missing:null,'baselines.0.current':'1 project','capacity.status':'estimate'}),
    ],
    probes:[{id:'stale-baseline-replay',kind:'invalid-model-candidate',seedAfterTurn:3,
      message:'I have 1 project done now. Please use my latest progress.',candidate:{baselines:[baseline('coding','0 projects')]},expect:{accepted:false,'baselines.0.current':'1 project',missing:'capacity'}}],
    agentProbes:[{id:'stale-baseline-full-agent',candidateKind:'deliberately-invalid-extraction',seedAfterTurn:3,
      message:'I have 1 project done now. Please use my latest progress.',candidate:{baselines:[baseline('coding','0 projects')]},question:'How much time can you spend each week?',
      expect:{'baselines.0.current':'1 project',missing:'capacity'}}],
  },
]
