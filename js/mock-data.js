(function () {
  const DAY = 24 * 60 * 60 * 1000;

  function dateOnly(offset) {
    const date = new Date(Date.now() + offset * DAY);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  window.DEFAULT_SURVEY_QUESTIONS = [
    { id: "q1", type: "score", text: "교육 내용은 전반적으로 만족스러웠나요?", groupName: "기본 문항", groupOrder: 1, displayOrder: 1 },
    { id: "q2", type: "score", text: "교육 내용이 실무에 도움이 될 것 같나요?", groupName: "기본 문항", groupOrder: 1, displayOrder: 2 },
    { id: "q3", type: "text", text: "교육에서 가장 도움이 된 점을 알려주세요.", groupName: "기본 문항", groupOrder: 1, displayOrder: 3 },
    { id: "q4", type: "text", text: "개선이 필요한 점이 있다면 알려주세요.", groupName: "기본 문항", groupOrder: 1, displayOrder: 4 }
  ];

  window.createDefaultCourses = function () {
    return [
      {
        id: "edu-1",
        name: "신입사원 업무 기본 교육",
        date: dateOnly(5),
        startTime: "10:00",
        endTime: "17:00",
        place: "본관 3층 교육장",
        capacity: 8,
        questions: JSON.parse(JSON.stringify(window.DEFAULT_SURVEY_QUESTIONS)),
        applicants: [
          { id: "a1", name: "김교육", phone: "010-1234-5678", resident: "900101-1234567", organization: "운영1팀", agreed: true, appliedAt: dateOnly(-3) + " 09:20", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "미확인", surveyCompleted: false },
          { id: "a2", name: "이수강", phone: "010-2345-6789", resident: "910202-2345678", organization: "기획팀", agreed: true, appliedAt: dateOnly(-2) + " 14:10", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "부재", smsStatus: "미발송", attendance: "미확인", surveyCompleted: false },
          { id: "a3", name: "박학습", phone: "010-3456-7890", resident: "920303-1234567", organization: "인사팀", agreed: true, appliedAt: dateOnly(-1) + " 18:05", applyType: "마감 후 신청", status: "신청", duplicate: false, callStatus: "미통화", smsStatus: "발송완료", attendance: "미확인", surveyCompleted: false },
          { id: "a4", name: "최참여", phone: "010-4567-8901", resident: "930404-2345678", organization: "운영2팀", agreed: true, appliedAt: dateOnly(-1) + " 19:11", applyType: "마감 후 신청", status: "취소", duplicate: false, callStatus: "미통화", smsStatus: "미발송", attendance: "미확인", surveyCompleted: false }
        ],
        responses: []
      },
      {
        id: "edu-2",
        name: "고객 응대 역량 강화",
        date: dateOnly(0),
        startTime: "13:00",
        endTime: "23:59",
        place: "별관 세미나실 A",
        capacity: 3,
        questions: JSON.parse(JSON.stringify(window.DEFAULT_SURVEY_QUESTIONS)),
        applicants: [
          { id: "b1", name: "정서비스", phone: "010-5678-9012", resident: "940505-1234567", organization: "고객지원팀", agreed: true, appliedAt: dateOnly(-5) + " 11:00", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "출석", surveyCompleted: false },
          { id: "b2", name: "한응대", phone: "010-6789-0123", resident: "950606-2345678", organization: "서비스팀", agreed: true, appliedAt: dateOnly(-4) + " 16:20", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "출석", surveyCompleted: false },
          { id: "b3", name: "오친절", phone: "010-6789-0123", resident: "960707-1234567", organization: "서비스팀", agreed: true, appliedAt: dateOnly(-3) + " 09:05", applyType: "정상 신청", status: "신청", duplicate: true, callStatus: "부재", smsStatus: "미발송", attendance: "결석", surveyCompleted: false },
          { id: "b4", name: "임상담", phone: "010-7890-1234", resident: "970808-2345678", organization: "상담팀", agreed: true, appliedAt: dateOnly(-1) + " 17:30", applyType: "마감 후 신청", status: "신청", duplicate: false, callStatus: "미통화", smsStatus: "미발송", attendance: "미확인", surveyCompleted: false }
        ],
        responses: []
      },
      {
        id: "edu-3",
        name: "팀장 리더십 워크숍",
        date: dateOnly(-4),
        startTime: "09:30",
        endTime: "17:30",
        place: "연수원 대강의실",
        capacity: 6,
        questions: JSON.parse(JSON.stringify(window.DEFAULT_SURVEY_QUESTIONS)),
        applicants: [
          { id: "c1", name: "강리더", phone: "010-8901-2345", resident: "850101-1234567", organization: "경영지원팀", agreed: true, appliedAt: dateOnly(-10) + " 10:20", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "출석", surveyCompleted: true },
          { id: "c2", name: "윤팀장", phone: "010-9012-3456", resident: "860202-2345678", organization: "사업1팀", agreed: true, appliedAt: dateOnly(-9) + " 15:40", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "출석", surveyCompleted: true },
          { id: "c3", name: "서관리", phone: "010-0123-4567", resident: "870303-1234567", organization: "사업2팀", agreed: true, appliedAt: dateOnly(-8) + " 13:25", applyType: "정상 신청", status: "신청", duplicate: false, callStatus: "통화완료", smsStatus: "발송완료", attendance: "결석", surveyCompleted: false }
        ],
        responses: [
          { name: "강리더", answers: { q1: 5, q2: 5, q3: "사례 중심 설명이 유익했습니다.", q4: "실습 시간이 더 길면 좋겠습니다." } },
          { name: "윤팀장", answers: { q1: 4, q2: 5, q3: "팀 운영 도구를 배울 수 있었습니다.", q4: "자료를 미리 받고 싶습니다." } }
        ]
      }
    ];
  };
})();
