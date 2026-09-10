(function () {
  const db = window.supabaseClient;

  function requireDb() {
    if (!db) throw new Error("Supabase 연결을 사용할 수 없습니다.");
    return db;
  }

  function throwIfError(result) {
    if (result.error) throw result.error;
    return result.data || [];
  }

  function timeText(value) {
    return String(value || "").slice(0, 5);
  }

  const DEFAULT_QUESTION_GROUP = "기본 문항";

  function questionFromRow(question) {
    return {
      id: question.id,
      type: question.question_type,
      text: question.question_text,
      displayOrder: question.display_order,
      groupName: String(question.group_name || DEFAULT_QUESTION_GROUP).trim() || DEFAULT_QUESTION_GROUP,
      groupOrder: Number(question.group_order) || 1
    };
  }

  function groupQuestions(questions) {
    const groups = [];
    questions.forEach(function (question) {
      const name = String(question.groupName || DEFAULT_QUESTION_GROUP).trim() || DEFAULT_QUESTION_GROUP;
      let group = groups.find(function (item) { return item.name === name; });
      if (!group) {
        group = { name: name, order: Number(question.groupOrder) || groups.length + 1, questions: [] };
        groups.push(group);
      }
      group.questions.push(question);
    });
    return groups.sort(function (a, b) { return a.order - b.order; });
  }

  function normalizeQuestionOrder(questions) {
    const ordered = [];
    groupQuestions(questions).forEach(function (group, groupIndex) {
      group.questions.forEach(function (question) {
        question.groupName = group.name;
        question.groupOrder = groupIndex + 1;
        question.displayOrder = ordered.length + 1;
        ordered.push(question);
      });
    });
    return ordered;
  }

  function courseRow(course) {
    return {
      name: course.name,
      course_date: course.date,
      start_time: course.startTime,
      end_time: course.endTime,
      place: course.place,
      capacity: Number(course.capacity),
      instructor_name: course.instructorName,
      instructor_bio: course.instructorBio,
      description: course.description,
      poster_path: course.poster || null
    };
  }

  function applicantRowForDb(applicant) {
    return {
      course_id: applicant.courseId,
      name: applicant.name,
      phone: applicant.phone,
      email: applicant.email,
      resident_number: applicant.resident,
      organization: applicant.organization,
      privacy_consent: applicant.privacyConsent,
      marketing_consent: applicant.marketingConsent,
      application_type: applicant.applyType,
      status: applicant.status,
      is_duplicate: applicant.duplicate,
      call_status: applicant.callStatus,
      sms_status: applicant.smsStatus,
      attendance_status: applicant.attendance
    };
  }

  async function getCourses(includePrivate) {
    const client = requireDb();
    const courseResult = await client.from("courses").select("*").order("course_date", { ascending: false });
    const questionResult = await client.from("course_survey_questions").select("*").order("group_order", { ascending: true }).order("display_order", { ascending: true });
    const courseRows = throwIfError(courseResult);
    const questionRows = throwIfError(questionResult);
    let applicationRows = [];
    let responseRows = [];
    let answerRows = [];

    if (includePrivate) {
      const results = await Promise.all([
        client.from("applications").select("*").order("applied_at", { ascending: true }),
        client.from("survey_responses").select("*"),
        client.from("survey_answers").select("*")
      ]);
      applicationRows = throwIfError(results[0]);
      responseRows = throwIfError(results[1]);
      answerRows = throwIfError(results[2]);
    }

    return courseRows.map(function (row) {
      const questions = questionRows.filter(function (question) { return question.course_id === row.id; }).map(questionFromRow);
      const responses = responseRows.filter(function (response) { return response.course_id === row.id; }).map(function (response) {
        const answers = {};
        answerRows.filter(function (answer) { return answer.response_id === response.id; }).forEach(function (answer) {
          answers[answer.question_id] = answer.score_value == null ? answer.text_value : answer.score_value;
        });
        return { id: response.id, gender: response.gender || null, age: response.age == null ? null : Number(response.age), createdAt: response.created_at || "", answers: answers };
      }).sort(function (a, b) {
        return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id));
      });
      const applicants = applicationRows.filter(function (applicant) { return applicant.course_id === row.id; }).map(function (applicant) {
        return {
          id: applicant.id,
          courseId: applicant.course_id,
          name: applicant.name,
          phone: applicant.phone,
          email: applicant.email,
          resident: applicant.resident_number,
          organization: applicant.organization,
          agreed: applicant.privacy_consent,
          privacyConsent: applicant.privacy_consent,
          marketingConsent: applicant.marketing_consent,
          appliedAt: formatDateTime(new Date(applicant.applied_at)),
          applyType: applicant.application_type,
          status: applicant.status,
          duplicate: applicant.is_duplicate,
          callStatus: applicant.call_status,
          smsStatus: applicant.sms_status,
          attendance: applicant.attendance_status,
          contactNote: applicant.contact_note || ""
        };
      });
      return {
        id: row.id,
        name: row.name,
        date: row.course_date,
        startTime: timeText(row.start_time),
        endTime: timeText(row.end_time),
        place: row.place,
        capacity: row.capacity,
        instructorName: row.instructor_name,
        instructorBio: row.instructor_bio,
        description: row.description,
        poster: row.poster_path || "",
        questions: questions,
        applicants: applicants,
        responses: responses
      };
    });
  }

  async function getQuestions() {
    const result = await requireDb().from("survey_question_templates").select("*").order("group_order", { ascending: true }).order("display_order", { ascending: true });
    if (result.error) console.error("survey_question_templates 조회 실패", result.error);
    return normalizeQuestionOrder(throwIfError(result).map(questionFromRow));
  }

  async function getQuestionGroups() {
    const result = await requireDb().from("survey_question_groups").select("*").order("display_order", { ascending: true });
    if (result.error) console.error("survey_question_groups 조회 실패", result.error);
    return throwIfError(result).map(function (group) {
      return { id: group.id, name: group.name, displayOrder: group.display_order };
    });
  }

  function normalizedGroupName(value) {
    return String(value || "").trim().toLocaleLowerCase("ko-KR");
  }

  function param(name) { return new URLSearchParams(location.search).get(name); }
  function selectedCourse(courses) {
    const id = param("id");
    if (!id) return courses[0];
    return courses.find(function (course) { return course.id === id; }) || courses[0];
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char];
    });
  }
  function dateTime(course, time) { return new Date(course.date + "T" + time + ":00"); }
  function deadline(course) {
    const date = new Date(course.date + "T17:00:00");
    date.setDate(date.getDate() - 1);
    return date;
  }
  function surveyDeadline(course) {
    const date = new Date(course.date + "T23:59:59");
    date.setDate(date.getDate() + 2);
    return date;
  }
  function status(course) {
    const now = new Date();
    if (now > dateTime(course, course.endTime)) return "교육 종료";
    if (now >= deadline(course)) return "신청 마감";
    return "신청 접수 중";
  }
  function formatDate(value) {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value + "T00:00:00"));
  }
  function formatDateTime(value) {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
  }
  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return digits.slice(0, 3) + "-" + digits.slice(3);
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }
  function formatResident(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 6) return digits;
    return digits.slice(0, 6) + "-" + digits.slice(6);
  }
  function activeApplicants(course) { return course.applicants.filter(function (item) { return item.status !== "취소"; }); }
  function counts(course) {
    const active = activeApplicants(course);
    return {
      current: active.length,
      over: Math.max(0, active.length - Number(course.capacity)),
      attended: active.filter(function (item) { return item.attendance === "출석"; }).length,
      survey: course.responses.length
    };
  }
  function badge(text) {
    const classes = {
      "정상 신청": "success", "신청 접수 중": "success", "출석": "success", "응답완료": "success", "발송완료": "success", "통화완료": "success",
      "마감 후 신청": "warning", "마감 후 접수": "warning", "부재": "warning", "중복 신청": "warning",
      "취소": "danger", "결석": "danger", "교육 종료": "neutral", "신청 마감": "neutral",
      "미응답": "neutral", "미통화": "neutral", "미발송": "neutral", "미확인": "neutral"
    };
    return '<span class="badge badge-' + (classes[text] || "neutral") + '">' + escapeHtml(text) + "</span>";
  }
  function setMessage(element, text, type) {
    if (!element) return;
    element.className = "notice notice-" + (type || "info");
    element.textContent = text;
    element.hidden = false;
  }
  function addCourseLinks(root, course) {
    root.querySelectorAll("[data-course-link]").forEach(function (link) {
      link.href = link.getAttribute("data-course-link") + "?id=" + encodeURIComponent(course.id);
    });
  }

  async function initDashboard() {
    let courses = [];
    const body = document.querySelector("#course-list");
    const search = document.querySelector("#course-search");
    const selectAll = document.querySelector("#select-all-courses");
    const deleteButton = document.querySelector("#delete-selected-courses");
    const selectedIds = new Set();
    let visibleCourses = [];

    function updateSelectionControls() {
      const selectedVisible = visibleCourses.filter(function (course) { return selectedIds.has(course.id); }).length;
      selectAll.checked = visibleCourses.length > 0 && selectedVisible === visibleCourses.length;
      selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleCourses.length;
      selectAll.disabled = visibleCourses.length === 0;
      deleteButton.disabled = selectedIds.size === 0;
      deleteButton.textContent = selectedIds.size ? "선택 삭제 (" + selectedIds.size + ")" : "선택 삭제";
    }

    function render(filter) {
      const normalized = (filter || "").trim().toLowerCase();
      visibleCourses = courses.filter(function (course) { return course.name.toLowerCase().includes(normalized); });
      body.innerHTML = visibleCourses.map(function (course) {
        const count = counts(course);
        return '<tr data-href="education-detail.html?id=' + encodeURIComponent(course.id) + '" tabindex="0">' +
          '<td class="selection-cell"><input class="table-select course-check" type="checkbox" value="' + escapeHtml(course.id) + '" aria-label="' + escapeHtml(course.name) + ' 선택" ' + (selectedIds.has(course.id) ? "checked" : "") + "></td>" +
          '<td><a class="table-link" href="education-detail.html?id=' + encodeURIComponent(course.id) + '">' + escapeHtml(course.name) + "</a></td>" +
          "<td>" + escapeHtml(course.date) + "</td><td>" + course.startTime + "–" + course.endTime + "</td><td>" + escapeHtml(course.instructorName || "-") + "</td>" +
          "<td>" + escapeHtml(course.place) + "</td><td>" + course.capacity + "명</td><td>" + count.current + "명</td>" +
          '<td class="' + (count.over ? "text-danger" : "") + '">' + count.over + "명</td><td>" + count.attended + "명</td><td>" + count.survey + "명</td><td>" + badge(status(course)) + "</td></tr>";
      }).join("") || '<tr><td colspan="12" class="empty-cell">' + (courses.length ? "검색 결과가 없습니다." : "등록된 교육이 없습니다. 새 교육을 생성해 주세요.") + "</td></tr>";
      updateSelectionControls();
    }

    search.addEventListener("input", function () { render(search.value); });
    body.addEventListener("change", function (event) {
      if (!event.target.classList.contains("course-check")) return;
      if (event.target.checked) selectedIds.add(event.target.value);
      else selectedIds.delete(event.target.value);
      updateSelectionControls();
    });
    selectAll.addEventListener("change", function () {
      visibleCourses.forEach(function (course) {
        if (selectAll.checked) selectedIds.add(course.id);
        else selectedIds.delete(course.id);
      });
      render(search.value);
    });
    deleteButton.addEventListener("click", async function () {
      const selectedCourses = courses.filter(function (course) { return selectedIds.has(course.id); });
      if (!selectedCourses.length) return;
      const prompt = selectedCourses.length === 1
        ? "‘" + selectedCourses[0].name + "’ 교육을 삭제할까요?\n연결된 신청자와 만족도 정보도 함께 삭제되며 복구할 수 없습니다."
        : "선택한 " + selectedCourses.length + "개 교육을 삭제할까요?\n연결된 신청자와 만족도 정보도 함께 삭제되며 복구할 수 없습니다.";
      if (!window.confirm(prompt)) return;
      deleteButton.disabled = true;
      const result = await requireDb().from("courses").delete().in("id", Array.from(selectedIds));
      if (result.error) {
        deleteButton.disabled = false;
        setMessage(document.querySelector("#dashboard-message"), "교육을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      courses = courses.filter(function (course) { return !selectedIds.has(course.id); });
      const removedCount = selectedCourses.length;
      selectedIds.clear();
      render(search.value);
      setMessage(document.querySelector("#dashboard-message"), removedCount + "개 교육을 삭제했습니다.", "success");
    });
    render("");
    try {
      courses = await getCourses(true);
      render("");
    } catch (error) {
      console.error(error);
      setMessage(document.querySelector("#dashboard-message"), "교육 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    }
  }

  async function initEducationForm() {
    let courses = [];
    try {
      courses = await getCourses(true);
    } catch (error) {
      console.error(error);
      setMessage(document.querySelector("#form-message"), "교육 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      document.querySelector("#education-submit").disabled = true;
      return;
    }
    const id = param("id");
    const course = id ? courses.find(function (item) { return item.id === id; }) : null;
    const form = document.querySelector("#education-form");
    const title = document.querySelector("#form-title");
    const submit = document.querySelector("#education-submit");
    const cancel = document.querySelector("#education-cancel");
    const deadlineOutput = document.querySelector("#application-deadline");
    const posterInput = document.querySelector("#poster-file");
    const posterPreview = document.querySelector("#poster-preview");
    const posterPreviewImage = document.querySelector("#poster-preview-image");

    function populateTimeOptions(select, limit, step) {
      const fragment = document.createDocumentFragment();
      for (let number = 0; number < limit; number += step) {
        const value = String(number).padStart(2, "0");
        fragment.appendChild(new Option(value, value));
      }
      select.appendChild(fragment);
    }

    populateTimeOptions(form.elements.startHour, 24, 1);
    populateTimeOptions(form.elements.endHour, 24, 1);
    populateTimeOptions(form.elements.startMinute, 60, 10);
    populateTimeOptions(form.elements.endMinute, 60, 10);

    function showPoster(source) {
      posterPreview.hidden = !source;
      if (source) posterPreviewImage.src = source;
      else posterPreviewImage.removeAttribute("src");
    }

    if (course) {
      title.textContent = "교육 정보 수정";
      submit.textContent = "변경사항 저장";
      ["name", "date", "place", "capacity", "instructorName", "instructorBio", "description"].forEach(function (key) { form.elements[key].value = course[key] || ""; });
      const startParts = String(course.startTime || "").split(":");
      const endParts = String(course.endTime || "").split(":");
      form.elements.startHour.value = startParts[0] || "";
      form.elements.startMinute.value = startParts[1] || "";
      form.elements.endHour.value = endParts[0] || "";
      form.elements.endMinute.value = endParts[1] || "";
      showPoster(course.poster || "");
      cancel.href = "education-detail.html?id=" + course.id;
    }

    posterInput.addEventListener("change", function () {
      const file = posterInput.files[0];
      if (!file) { showPoster(course ? course.poster || "" : ""); return; }
      if (!file.type.startsWith("image/")) {
        posterInput.value = "";
        showPoster(course ? course.poster || "" : "");
        setMessage(document.querySelector("#form-message"), "이미지 파일만 등록할 수 있습니다.", "error");
        return;
      }
      if (file.size > 1024 * 1024) {
        posterInput.value = "";
        showPoster(course ? course.poster || "" : "");
        setMessage(document.querySelector("#form-message"), "포스터 이미지는 1MB 이하로 등록해 주세요.", "error");
        return;
      }
      showPoster(URL.createObjectURL(file));
    });

    function updateDeadline() {
      if (!form.elements.date.value) { deadlineOutput.textContent = "교육일을 선택하면 자동 계산됩니다."; return; }
      deadlineOutput.textContent = formatDateTime(deadline({ date: form.elements.date.value }));
    }

    function readPoster(file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.addEventListener("load", function () { resolve(reader.result); });
        reader.addEventListener("error", function () { reject(reader.error); });
        reader.readAsDataURL(file);
      });
    }

    form.elements.date.addEventListener("change", updateDeadline);
    updateDeadline();
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const startTime = form.elements.startHour.value + ":" + form.elements.startMinute.value;
      const endTime = form.elements.endHour.value + ":" + form.elements.endMinute.value;
      if (endTime <= startTime) {
        setMessage(document.querySelector("#form-message"), "종료시간은 시작시간보다 늦어야 합니다.", "error");
        return;
      }
      const values = Object.fromEntries(new FormData(form).entries());
      const posterFile = posterInput.files[0];
      let poster = course ? course.poster || "" : "";
      submit.disabled = true;
      if (posterFile) {
        try { poster = await readPoster(posterFile); }
        catch (error) {
          submit.disabled = false;
          setMessage(document.querySelector("#form-message"), "포스터 이미지를 읽지 못했습니다. 다른 파일을 선택해 주세요.", "error");
          return;
        }
      }
      delete values.posterFile;
      const courseValues = {
        name: values.name.trim(), date: values.date, startTime: startTime, endTime: endTime,
        place: values.place.trim(), capacity: Number(values.capacity), instructorName: values.instructorName.trim(),
        instructorBio: values.instructorBio.trim(), description: values.description.trim(), poster: poster
      };
      let targetId = course && course.id;
      try {
        if (course) {
          const updateResult = await requireDb().from("courses").update(courseRow(courseValues)).eq("id", course.id).select("id").maybeSingle();
          throwIfError(updateResult);
          if (!updateResult.data) throw new Error("Course update was not permitted");
        } else {
          const inserted = throwIfError(await requireDb().from("courses").insert(courseRow(courseValues)).select("id").single());
          targetId = inserted.id;
          const questions = await getQuestions();
          if (questions.length) {
            const questionRows = questions.map(function (question, index) {
              return {
                course_id: targetId,
                question_type: question.type,
                question_text: question.text,
                display_order: question.displayOrder || index + 1,
                group_name: question.groupName,
                group_order: question.groupOrder
              };
            });
            const questionResult = await requireDb().from("course_survey_questions").insert(questionRows);
            if (questionResult.error) {
              await requireDb().from("courses").delete().eq("id", targetId);
              throw questionResult.error;
            }
          }
        }
      } catch (error) {
        console.error(error);
        submit.disabled = false;
        const permissionDenied = error && (error.code === "42501" || String(error.message || "").toLowerCase().includes("row-level security"));
        setMessage(document.querySelector("#form-message"), permissionDenied
          ? "교육 정보를 저장할 권한이 없습니다. 데이터베이스 접근 설정을 확인해 주세요."
          : "교육 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      location.href = "education-detail.html?id=" + targetId;
    });
  }

  async function initDetail() {
    let courses = [];
    try {
      courses = await getCourses(true);
    } catch (error) {
      console.error(error);
      setMessage(document.querySelector("#detail-message"), "교육 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    const course = selectedCourse(courses);
    if (!course) {
      document.querySelector("#detail-title").textContent = "교육 정보가 없습니다.";
      document.querySelectorAll(".tab-panel, .tabs, .heading-actions").forEach(function (element) { element.hidden = true; });
      setMessage(document.querySelector("#detail-message"), "등록된 교육이 없습니다. 교육 목록에서 새 교육을 생성해 주세요.", "info");
      return;
    }
    addCourseLinks(document, course);
    document.querySelector("#detail-title").textContent = course.name;
    document.querySelector("#print-course-name").textContent = course.name;
    document.querySelector("#print-course-date").textContent = formatDate(course.date);
    document.querySelector("#detail-meta").innerHTML = [
      ["교육일", formatDate(course.date)], ["교육시간", course.startTime + "–" + course.endTime], ["장소", course.place],
      ["정원", course.capacity + "명"], ["신청 인원", '<span id="current-count"></span>'], ["초과 인원", '<span id="over-count"></span>'],
      ["신청 마감", formatDateTime(deadline(course))], ["교육 상태", badge(status(course))]
    ].map(function (item) { return '<div class="meta-item"><span>' + item[0] + "</span><strong>" + item[1] + "</strong></div>"; }).join("");
    document.querySelector("#survey-deadline").textContent = formatDateTime(surveyDeadline(course));
    if (new Date() > surveyDeadline(course)) document.querySelector("#survey-period-state").innerHTML = badge("응답기간 종료");

    document.querySelector("#copy-apply-link").addEventListener("click", function () {
      const url = new URL("apply.html?id=" + course.id, location.href).href;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () { setMessage(document.querySelector("#detail-message"), "신청 링크를 복사했습니다.", "success"); });
      } else {
        setMessage(document.querySelector("#detail-message"), "신청 링크: " + url, "info");
      }
    });

    document.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("[data-tab]").forEach(function (item) { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", item === button); });
        document.querySelectorAll(".tab-panel").forEach(function (panel) { panel.hidden = panel.id !== button.dataset.tab; });
      });
    });

    function applicantRow(applicant, index) {
      const surveyState = "익명 설문";
      return '<tr class="' + (applicant.status === "취소" ? "row-cancelled" : "") + '">' +
        '<td><input type="checkbox" class="applicant-check" value="' + applicant.id + '" aria-label="' + escapeHtml(applicant.name) + ' 선택"></td>' +
        '<td><span class="applicant-number">' + (index + 1) + '.</span><strong>' + escapeHtml(applicant.name) + "</strong> " + (applicant.duplicate ? badge("중복 신청") : "") + "</td>" +
        "<td>" + escapeHtml(applicant.phone) + "</td><td>" + escapeHtml(applicant.email || "-") + "</td><td>" + escapeHtml(applicant.resident) + "</td><td>" + escapeHtml(applicant.organization) + "</td>" +
        "<td>" + (applicant.agreed ? "동의" : "미동의") + "</td><td>" + escapeHtml(applicant.appliedAt) + "</td><td>" + badge(applicant.applyType) + "</td>" +
        "<td>" + badge(applicant.status) + "</td><td>" + badge(applicant.callStatus) + "</td><td>" + badge(applicant.smsStatus) + "</td><td>" + badge(applicant.attendance) + "</td><td>" + badge(surveyState) + "</td>" +
        '<td><div class="inline-actions applicant-actions"><button class="button button-small button-ghost" data-edit="' + applicant.id + '">수정</button><button class="button button-small ' + (applicant.status === "취소" ? "button-secondary" : "button-danger") + '" data-toggle="' + applicant.id + '">' + (applicant.status === "취소" ? "복구" : "취소") + "</button></div></td></tr>";
    }

    function contactRow(applicant) {
      return '<tr><td><input type="checkbox" class="contact-check" value="' + applicant.id + '" aria-label="' + escapeHtml(applicant.name) + ' 선택"></td><td>' + escapeHtml(applicant.name) + "</td><td>" + escapeHtml(applicant.phone) + "</td>" +
        '<td><select data-call="' + applicant.id + '"><option>미통화</option><option>부재</option><option>통화완료</option></select></td>' +
        '<td><select data-sms="' + applicant.id + '"><option>미발송</option><option>발송완료</option></select></td>' +
        '<td><input class="contact-note-input" data-contact-note="' + applicant.id + '" value="' + escapeHtml(applicant.contactNote || "") + '" maxlength="200" placeholder="메모 입력" aria-label="' + escapeHtml(applicant.name) + ' 비고"></td></tr>';
    }
    function attendanceRow(applicant) {
      return '<tr><td><input type="checkbox" class="attendance-check" value="' + applicant.id + '" aria-label="' + escapeHtml(applicant.name) + ' 선택"></td><td>' + escapeHtml(applicant.name) + "</td><td>" + escapeHtml(applicant.organization) + "</td>" +
        '<td><select data-attendance="' + applicant.id + '"><option>미확인</option><option>출석</option><option>결석</option></select></td></tr>';
    }
    function renderAll() {
      const count = counts(course);
      document.querySelector("#current-count").textContent = count.current + "명";
      document.querySelector("#over-count").textContent = count.over + "명";
      document.querySelector("#over-count").classList.toggle("text-danger", count.over > 0);
      document.querySelector("#applicant-body").innerHTML = course.applicants.map(applicantRow).join("") || '<tr><td colspan="15" class="empty-cell">신청자가 없습니다.</td></tr>';
      const active = activeApplicants(course);
      document.querySelector("#contact-body").innerHTML = active.map(contactRow).join("") || '<tr><td colspan="6" class="empty-cell">연락 대상이 없습니다.</td></tr>';
      document.querySelector("#attendance-body").innerHTML = active.map(attendanceRow).join("") || '<tr><td colspan="4" class="empty-cell">출석 대상이 없습니다.</td></tr>';
      ["contact-select-all", "attendance-select-all"].forEach(function (id) {
        const box = document.querySelector("#" + id);
        box.checked = false;
        box.indeterminate = false;
        box.disabled = !active.length;
      });
      document.querySelector("#mark-selected-sms-sent").disabled = true;
      document.querySelector("#mark-selected-attended").disabled = true;
      document.querySelectorAll("[data-call]").forEach(function (select) { const item = course.applicants.find(function (a) { return a.id === select.dataset.call; }); select.value = item.callStatus; });
      document.querySelectorAll("[data-sms]").forEach(function (select) { const item = course.applicants.find(function (a) { return a.id === select.dataset.sms; }); select.value = item.smsStatus; });
      document.querySelectorAll("[data-attendance]").forEach(function (select) { const item = course.applicants.find(function (a) { return a.id === select.dataset.attendance; }); select.value = item.attendance; });
      updateSummaries();
      renderSurveyResults();
    }
    function updateSummaries() {
      const active = activeApplicants(course);
      document.querySelector("#contact-summary").innerHTML = ["미통화", "부재"].map(function (state) { return '<div class="summary-card"><span>' + state + '</span><strong>' + active.filter(function (a) { return a.callStatus === state; }).length + "명</strong></div>"; }).join("") + '<div class="summary-card"><span>문자 미발송</span><strong>' + active.filter(function (a) { return a.smsStatus === "미발송"; }).length + "명</strong></div>";
      document.querySelector("#attendance-summary").innerHTML = ["출석", "결석", "미확인"].map(function (state) { return '<div class="summary-card"><span>' + state + '</span><strong>' + active.filter(function (a) { return a.attendance === state; }).length + "명</strong></div>"; }).join("");
      document.querySelector("#survey-summary").innerHTML = '<div class="summary-card"><span>제출 건수</span><strong>' + course.responses.length + '건</strong></div>';
    }
    function renderSurveyResults() {
      function scoreDistribution(label, values, isOverall, averageOverride) {
        const counts = [1, 2, 3, 4, 5].map(function (score) {
          return values.filter(function (value) { return value === score; }).length;
        });
        const maxCount = Math.max(1, ...counts);
        const middleCount = maxCount > 1 ? Math.ceil(maxCount / 2) + "명" : "";
        const average = averageOverride !== undefined ? averageOverride : (values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null);
        const scoreText = average !== null ? average.toFixed(1) + " / 5" : "-";
        const chartLabel = label + " 점수별 응답 인원: " + counts.map(function (count, index) { return (index + 1) + "점 " + count + "명"; }).join(", ");
        const bars = counts.map(function (count) {
          const height = count ? (isOverall ? count / maxCount * 100 : Math.max(5, count / maxCount * 100)) : 0;
          return '<div class="score-bar-column"><span class="score-bar-value">' + count + '명</span><span class="score-bar" style="height:' + height + '%"></span></div>';
        }).join("");
        return '<section class="score-result-pair' + (isOverall ? ' score-result-overall' : '') + '">' +
          '<div class="score-result-copy"><span>' + escapeHtml(label) + '</span><strong>' + scoreText + '</strong><small>응답 수 ' + (isOverall ? course.responses.length : values.length) + '</small></div>' +
          '<div class="score-distribution" role="img" aria-label="' + escapeHtml(chartLabel) + '">' +
          '<div class="score-y-axis" aria-hidden="true"><span>' + maxCount + '명</span><span>' + middleCount + '</span><span>0명</span></div>' +
          '<div class="score-plot"><div class="score-bars">' + bars + '</div><div class="score-x-axis"><span>1점</span><span>2점</span><span>3점</span><span>4점</span><span>5점</span></div></div></div></section>';
      }
      document.querySelector("#response-count").textContent = course.responses.length + "건";
      const scores = course.questions.filter(function (q) { return q.type === "score"; });
      const scoreValues = [];
      course.responses.forEach(function (response) {
        scores.forEach(function (question) {
          const value = Number(response.answers[question.id]);
          if (value) scoreValues.push(value);
        });
      });
      const overallScore = scoreValues.length ? scoreValues.reduce(function (sum, value) { return sum + value; }, 0) / scoreValues.length : null;
      const overallAverage = overallScore !== null ? overallScore.toFixed(1) : "-";
      const respondentScoreBuckets = course.responses.map(function (response) {
        const values = scores.map(function (question) { return Number(response.answers[question.id]); }).filter(Boolean);
        if (!values.length) return null;
        const average = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
        return Math.min(5, Math.max(1, Math.floor(average)));
      }).filter(function (value) { return value !== null; });
      const textAnswerCount = course.questions.filter(function (question) { return question.type === "text"; }).reduce(function (count, question) {
        return count + course.responses.filter(function (response) { return response.answers[question.id]; }).length;
      }, 0);
      document.querySelector("#overall-results-summary").innerHTML =
        '<div class="summary-card"><span>제출 건수</span><strong>' + course.responses.length + '건</strong></div>' +
        '<div class="summary-card"><span>점수형 문항</span><strong>' + scores.length + '개</strong></div>' +
        '<div class="summary-card"><span>주관식 답변</span><strong>' + textAnswerCount + '건</strong></div>' +
        '<div class="summary-card"><span>전체 평균</span><strong>' + overallAverage + (scoreValues.length ? ' / 5' : '') + '</strong></div>';
      document.querySelector("#overall-score-chart").innerHTML = scores.length ? scoreDistribution("전체 객관식 평균", respondentScoreBuckets, true, overallScore) : "";
      document.querySelector("#score-results").innerHTML = scores.length ? '<div class="question-average-chart" role="img" aria-label="문항별 평균 점수 비교 차트"><div class="question-average-axis-row" aria-hidden="true"><span>문항 · 응답 수</span><div class="question-average-axis"><div><span style="left:20%">1점</span><span style="left:40%">2점</span><span style="left:60%">3점</span><span style="left:80%">4점</span><span style="left:100%">5점</span></div></div></div>' + scores.map(function (question, questionIndex) {
        const values = course.responses.map(function (response) { return Number(response.answers[question.id]); }).filter(Boolean);
        const average = values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null;
        const scoreText = average !== null ? average.toFixed(1) + " / 5" : "-";
        const width = average !== null ? Math.min(100, Math.max(0, average / 5 * 100)) : 0;
        return '<div class="question-average-row"><div class="question-average-label"><span>' + (questionIndex + 1) + '</span><div><strong>' + escapeHtml(question.text) + '</strong><small>응답 ' + values.length + '명</small></div></div><div class="question-average-meter" role="img" aria-label="' + escapeHtml(question.text + ": 평균 " + scoreText + ", 응답 " + values.length + "명") + '"><span class="question-average-fill" style="width:' + width + '%"></span><strong class="question-average-value">' + scoreText + '</strong></div></div>';
      }).join("") + '</div>' : '<p class="muted">점수형 문항이 없습니다.</p>';
      document.querySelector("#score-distributions").innerHTML = scores.map(function (question) {
        const values = course.responses.map(function (response) { return Number(response.answers[question.id]); }).filter(Boolean);
        return scoreDistribution(question.text, values, false);
      }).join("") || '<p class="muted">점수형 문항이 없습니다.</p>';
      const texts = course.questions.filter(function (q) { return q.type === "text"; });
      document.querySelector("#text-results").innerHTML = texts.map(function (question) {
        const answers = course.responses.filter(function (response) { return response.answers[question.id]; }).map(function (response) {
          const responseIndex = course.responses.indexOf(response) + 1;
          const gender = response.gender || "미입력";
          const age = response.age == null ? "미입력" : response.age + "세";
          return '<article class="comment"><p>' + escapeHtml(response.answers[question.id]) + '</p><span>응답자 ' + responseIndex + ' · 성별 ' + escapeHtml(gender) + ' · 나이 ' + escapeHtml(age) + "</span></article>";
        }).join("");
        return '<section class="comment-group"><h4>' + escapeHtml(question.text) + "</h4>" + (answers || '<p class="muted">등록된 답변이 없습니다.</p>') + "</section>";
      }).join("") || '<p class="muted">주관식 문항이 없습니다.</p>';
      const select = document.querySelector("#respondent-select");
      select.innerHTML = '<option value="">응답자 선택</option>' + course.responses.map(function (_, index) { return '<option value="' + index + '">응답자 ' + (index + 1) + "</option>"; }).join("");
      document.querySelector("#respondent-detail").innerHTML = '<p class="muted">응답자를 선택하면 상세 답변이 표시됩니다.</p>';
    }

    function renderRespondentDetail(responseIndex) {
      const response = course.responses[responseIndex];
      const gender = response && response.gender || "미입력";
      const age = response && response.age != null ? response.age + "세" : "미입력";
      document.querySelector("#respondent-detail").innerHTML = response ?
        '<div class="respondent-detail-heading"><div><h4>응답자 ' + (responseIndex + 1) + '</h4><p class="helper">성별: ' + escapeHtml(gender) + ' · 나이: ' + escapeHtml(age) + '</p></div><button class="button button-small button-danger" type="button" data-delete-response="' + escapeHtml(response.id) + '">이 응답 삭제</button></div>' +
        course.questions.map(function (q) { return '<div class="answer-row"><span>' + escapeHtml(q.text) + '</span><strong>' + escapeHtml(response.answers[q.id] || "-") + (q.type === "score" && response.answers[q.id] ? "점" : "") + "</strong></div>"; }).join("") :
        '<p class="muted">응답자를 선택하면 상세 답변이 표시됩니다.</p>';
    }

    document.querySelector("#applicant-body").addEventListener("click", async function (event) {
      const editId = event.target.dataset.edit;
      const toggleId = event.target.dataset.toggle;
      if (editId) openEdit(editId);
      if (toggleId) {
        const item = course.applicants.find(function (a) { return a.id === toggleId; });
        const nextStatus = item.status === "취소" ? "신청" : "취소";
        const result = await requireDb().from("applications").update({ status: nextStatus }).eq("id", item.id);
        if (result.error) {
          setMessage(document.querySelector("#detail-message"), "신청 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
          return;
        }
        item.status = nextStatus;
        renderAll();
      }
    });
    function openEdit(id) {
      const item = course.applicants.find(function (a) { return a.id === id; });
      const dialog = document.querySelector("#edit-dialog");
      const form = document.querySelector("#edit-applicant-form");
      form.elements.applicantId.value = item.id;
      ["name", "phone", "resident", "organization"].forEach(function (key) { form.elements[key].value = item[key]; });
      dialog.showModal();
    }
    document.querySelector("#edit-applicant-form").addEventListener("submit", async function (event) {
      event.preventDefault(); const form = event.currentTarget;
      const item = course.applicants.find(function (a) { return a.id === form.elements.applicantId.value; });
      const changes = {
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        resident: form.elements.resident.value.trim(),
        organization: form.elements.organization.value.trim()
      };
      const result = await requireDb().from("applications").update({
        name: changes.name,
        phone: changes.phone,
        resident_number: changes.resident,
        organization: changes.organization
      }).eq("id", item.id);
      if (result.error) {
        setMessage(document.querySelector("#detail-message"), "신청자 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      Object.assign(item, changes);
      document.querySelector("#edit-dialog").close();
      renderAll();
    });
    document.querySelector("#edit-cancel").addEventListener("click", function () { document.querySelector("#edit-dialog").close(); });
    document.querySelector("#print-survey-results").addEventListener("click", function () {
      document.body.classList.add("printing-survey-results");
      window.addEventListener("afterprint", function () {
        document.body.classList.remove("printing-survey-results");
      }, { once: true });
      window.print();
    });
    document.querySelector("#select-all").addEventListener("change", function (event) { document.querySelectorAll(".applicant-check").forEach(function (box) { box.checked = event.target.checked; }); });

    function syncBulkSelection(checkSelector, selectAllId, actionButtonId) {
      const boxes = Array.from(document.querySelectorAll(checkSelector));
      const selectedCount = boxes.filter(function (box) { return box.checked; }).length;
      const selectAll = document.querySelector("#" + selectAllId);
      selectAll.checked = boxes.length > 0 && selectedCount === boxes.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < boxes.length;
      document.querySelector("#" + actionButtonId).disabled = selectedCount === 0;
    }
    function toggleBulkSelection(checkSelector, selectAllId, actionButtonId, checked) {
      document.querySelectorAll(checkSelector).forEach(function (box) { box.checked = checked; });
      syncBulkSelection(checkSelector, selectAllId, actionButtonId);
    }
    document.querySelector("#contact-select-all").addEventListener("change", function (event) {
      toggleBulkSelection(".contact-check", "contact-select-all", "mark-selected-sms-sent", event.target.checked);
    });
    document.querySelector("#attendance-select-all").addEventListener("change", function (event) {
      toggleBulkSelection(".attendance-check", "attendance-select-all", "mark-selected-attended", event.target.checked);
    });
    document.querySelector("#contact-body").addEventListener("change", function (event) {
      changeStatus(event);
      saveContactNote(event);
      if (event.target.classList.contains("contact-check")) syncBulkSelection(".contact-check", "contact-select-all", "mark-selected-sms-sent");
    });
    document.querySelector("#attendance-body").addEventListener("change", function (event) {
      changeStatus(event);
      if (event.target.classList.contains("attendance-check")) syncBulkSelection(".attendance-check", "attendance-select-all", "mark-selected-attended");
    });
    document.querySelector("#mark-selected-sms-sent").addEventListener("click", async function () {
      const ids = Array.from(document.querySelectorAll(".contact-check:checked")).map(function (box) { return box.value; });
      const selected = activeApplicants(course).filter(function (applicant) { return ids.includes(applicant.id); });
      if (!selected.length) return;
      const result = await requireDb().from("applications").update({ sms_status: "발송완료" }).in("id", ids);
      if (result.error) {
        setMessage(document.querySelector("#detail-message"), "문자 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      selected.forEach(function (applicant) { applicant.smsStatus = "발송완료"; });
      renderAll();
      setMessage(document.querySelector("#detail-message"), "선택한 " + selected.length + "명의 문자 상태를 발송완료로 변경했습니다.", "success");
    });
    document.querySelector("#mark-selected-attended").addEventListener("click", async function () {
      const ids = Array.from(document.querySelectorAll(".attendance-check:checked")).map(function (box) { return box.value; });
      const selected = activeApplicants(course).filter(function (applicant) { return ids.includes(applicant.id); });
      if (!selected.length) return;
      const result = await requireDb().from("applications").update({ attendance_status: "출석" }).in("id", ids);
      if (result.error) {
        setMessage(document.querySelector("#detail-message"), "출석 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      selected.forEach(function (applicant) { applicant.attendance = "출석"; });
      renderAll();
      setMessage(document.querySelector("#detail-message"), "선택한 " + selected.length + "명을 출석으로 변경했습니다.", "success");
    });
    async function changeStatus(event) {
      const select = event.target; const id = select.dataset.call || select.dataset.sms || select.dataset.attendance;
      if (!id) return; const item = course.applicants.find(function (a) { return a.id === id; });
      const previous = select.dataset.call ? item.callStatus : select.dataset.sms ? item.smsStatus : item.attendance;
      const changes = select.dataset.call ? { call_status: select.value } : select.dataset.sms ? { sms_status: select.value } : { attendance_status: select.value };
      const result = await requireDb().from("applications").update(changes).eq("id", id);
      if (result.error) {
        select.value = previous;
        setMessage(document.querySelector("#detail-message"), "운영 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      if (select.dataset.call) item.callStatus = select.value;
      if (select.dataset.sms) item.smsStatus = select.value;
      if (select.dataset.attendance) item.attendance = select.value;
      updateSummaries();
    }
    async function saveContactNote(event) {
      const input = event.target;
      const id = input.dataset.contactNote;
      if (!id) return;
      const item = course.applicants.find(function (applicant) { return applicant.id === id; });
      const previous = item.contactNote || "";
      const note = input.value.trim();
      const result = await requireDb().from("applications").update({ contact_note: note }).eq("id", id);
      if (result.error) {
        input.value = previous;
        setMessage(document.querySelector("#detail-message"), "비고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      item.contactNote = note;
      input.value = note;
    }
    function download(applicants) {
      if (!applicants.length) { setMessage(document.querySelector("#detail-message"), "다운로드할 신청자를 선택해 주세요.", "error"); return; }
      const rows = applicants.map(function (a) { return "<tr><td>" + escapeHtml(a.name) + "</td><td>" + a.phone.replace(/-/g, "") + "</td></tr>"; }).join("");
      const html = '<html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr><th>이름</th><th>전화번호</th></tr></thead><tbody>' + rows + "</tbody></table></body></html>";
      const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
      link.download = course.date.replace(/-/g, "") + "_" + course.name.replace(/[\\/:*?\"<>|]/g, "") + "_신청자명단.xls";
      link.click(); URL.revokeObjectURL(link.href);
    }
    document.querySelector("#download-all").addEventListener("click", function () { download(course.applicants); });
    document.querySelector("#download-selected").addEventListener("click", function () { const ids = Array.from(document.querySelectorAll(".applicant-check:checked")).map(function (box) { return box.value; }); download(course.applicants.filter(function (a) { return ids.includes(a.id); })); });
    document.querySelector("#respondent-select").addEventListener("change", function (event) {
      const responseIndex = event.target.value === "" ? -1 : Number(event.target.value);
      renderRespondentDetail(responseIndex);
    });
    document.querySelector("#respondent-detail").addEventListener("click", async function (event) {
      const responseId = event.target.dataset.deleteResponse;
      if (!responseId) return;
      const responseIndex = course.responses.findIndex(function (response) { return String(response.id) === responseId; });
      if (responseIndex < 0 || !confirm("이 응답은 복구할 수 없습니다. 삭제할까요?")) return;
      event.target.disabled = true;
      const result = await requireDb().rpc("delete_survey_response", {
        p_course_id: String(course.id),
        p_response_id: responseId
      });
      if (result.error) {
        console.error("만족도 개별 응답 삭제 실패", result.error);
        event.target.disabled = false;
        setMessage(document.querySelector("#detail-message"), "응답을 삭제하지 못했습니다. 관리자 삭제 권한 SQL 적용 여부를 확인해 주세요.", "error");
        return;
      }
      course.responses.splice(responseIndex, 1);
      renderAll();
      setMessage(document.querySelector("#detail-message"), "선택한 만족도 응답을 삭제했습니다.", "success");
    });
    renderAll();
  }

  async function initApply() {
    const form = document.querySelector("#apply-form");
    let courses = [];
    try {
      const sessionResult = await requireDb().auth.getSession();
      const includePrivate = Boolean(sessionResult.data && sessionResult.data.session);
      courses = await getCourses(includePrivate);
    } catch (error) {
      console.error(error);
      document.querySelector("#public-course-title").textContent = "교육 정보를 불러오지 못했습니다.";
      document.querySelector("#public-course-meta").hidden = true;
      form.hidden = true;
      setMessage(document.querySelector("#apply-message"), "잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    const course = selectedCourse(courses);
    if (!course) {
      document.querySelector("#public-course-title").textContent = "신청 가능한 교육이 없습니다.";
      document.querySelector("#public-course-meta").hidden = true;
      form.hidden = true;
      setMessage(document.querySelector("#apply-message"), "관리자가 교육을 등록하면 신청할 수 있습니다.", "info");
      return;
    }
    document.querySelector("#public-course-title").textContent = course.name;
    document.querySelector("#public-course-meta").innerHTML = '<div><span>교육일</span><strong>' + formatDate(course.date) + '</strong></div><div><span>시간</span><strong>' + course.startTime + "–" + course.endTime + '</strong></div><div><span>장소</span><strong>' + escapeHtml(course.place) + '</strong></div><div><span>신청 마감</span><strong>' + formatDateTime(deadline(course)) + "</strong></div>";
    const courseInfo = document.querySelector("#public-course-info");
    const poster = typeof course.poster === "string" && /^(data:image\/|https?:\/\/)/.test(course.poster) ? course.poster : "";
    const hasCourseInfo = poster || course.instructorName || course.instructorBio || course.description;
    if (hasCourseInfo) {
      const instructor = course.instructorName || course.instructorBio
        ? '<div class="course-info-item"><span>강사 정보</span>' + (course.instructorName ? "<strong>" + escapeHtml(course.instructorName) + "</strong>" : "") + (course.instructorBio ? "<p>" + escapeHtml(course.instructorBio) + "</p>" : "") + "</div>"
        : "";
      const description = course.description
        ? '<div class="course-info-item"><span>교육 내용</span><p>' + escapeHtml(course.description) + "</p></div>"
        : "";
      courseInfo.innerHTML = '<div class="course-info-layout ' + (poster ? "" : "no-poster") + '">' +
        (poster ? '<img class="course-poster" src="' + escapeHtml(poster) + '" alt="' + escapeHtml(course.name) + ' 교육 포스터">' : "") +
        '<div class="course-info-content"><h2>교육 안내</h2>' + instructor + description + "</div></div>";
      courseInfo.hidden = false;
    }
    if (new Date() >= deadline(course)) {
      form.hidden = true;
      setMessage(document.querySelector("#apply-period-notice"), "교육 신청 기간이 종료되었습니다. 교육 일정이 변경되어 신청 기간이 다시 열리면 이 페이지에서 신청할 수 있습니다.", "error");
      return;
    }
    if (activeApplicants(course).length >= Number(course.capacity)) {
      setMessage(document.querySelector("#capacity-notice"), "현재 신청 인원이 정원에 도달했습니다. 신청은 가능하지만, 교육 관리자가 참여 가능 여부를 확인한 후 별도로 연락드리겠습니다.", "warning");
    }
    let duplicateConfirmed = false;
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (new Date() >= deadline(course)) {
        form.hidden = true;
        setMessage(document.querySelector("#apply-period-notice"), "교육 신청 기간이 종료되어 신청할 수 없습니다.", "error");
        return;
      }
      const values = Object.fromEntries(new FormData(form).entries());
      if (values.privacyConsent !== "동의") {
        setMessage(document.querySelector("#apply-message"), "교육 신청을 위해 필수 개인정보 수집·이용에 동의해 주세요.", "error");
        document.querySelector("#apply-message").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (!/^[0-9]{6}-[0-9]{7}$/.test(values.resident.trim())) {
        setMessage(document.querySelector("#apply-message"), "주민등록번호 앞 6자리와 뒤 7자리를 모두 입력해 주세요.", "error");
        form.elements.resident.focus();
        return;
      }
      const phone = form.elements.phone.value.replace(/\s/g, "");
      const duplicate = course.applicants.some(function (a) { return a.phone.replace(/-/g, "") === phone.replace(/-/g, ""); });
      if (duplicate && !duplicateConfirmed) {
        duplicateConfirmed = true;
        setMessage(document.querySelector("#apply-message"), "같은 전화번호의 신청이 이미 있습니다. 다시 ‘계속 신청하기’를 누르면 별도 신청으로 접수됩니다.", "warning");
        document.querySelector("#apply-submit").textContent = "계속 신청하기"; return;
      }
      const applicant = {
        courseId: course.id,
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        resident: values.resident.trim(),
        organization: values.organization.trim(),
        privacyConsent: true,
        marketingConsent: values.marketingConsent === "동의",
        applyType: "정상 신청",
        status: "신청",
        duplicate: duplicate,
        callStatus: "미통화",
        smsStatus: "미발송",
        attendance: "미확인"
      };
      const submit = document.querySelector("#apply-submit");
      submit.disabled = true;
      const result = await requireDb().from("applications").insert(applicantRowForDb(applicant));
      if (result.error) {
        console.error(result.error);
        submit.disabled = false;
        setMessage(document.querySelector("#apply-message"), "신청 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      const overCapacity = course.applicants.length ? activeApplicants(course).length + 1 > Number(course.capacity) : false;
      form.hidden = true;
      document.querySelector("#capacity-notice").hidden = true;
      setMessage(document.querySelector("#apply-message"), overCapacity
        ? "신청이 접수되었습니다.\n현재 정원을 초과하여 교육 관리자가 참여 가능 여부를 확인한 후 별도로 연락드리겠습니다.\n\n문의: 064-741-2973"
        : "정상 신청으로 접수되었습니다.\n\n문의: 064-741-2973", overCapacity ? "warning" : "success");
    });
    form.elements.phone.addEventListener("input", function (event) {
      event.target.value = formatPhone(event.target.value);
      duplicateConfirmed = false;
      document.querySelector("#apply-submit").textContent = "교육 신청하기";
    });
    form.elements.resident.addEventListener("input", function (event) {
      event.target.value = formatResident(event.target.value);
    });
  }

  async function initSurvey() {
    const form = document.querySelector("#survey-form");
    let courses = [];
    try {
      courses = await getCourses(false);
    } catch (error) {
      console.error(error);
      document.querySelector("#survey-course-title").textContent = "만족도 조사를 불러오지 못했습니다.";
      form.hidden = true;
      setMessage(document.querySelector("#survey-message"), "잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    const course = selectedCourse(courses);
    if (!course) {
      document.querySelector("#survey-course-title").textContent = "참여 가능한 만족도 조사가 없습니다.";
      form.hidden = true;
      setMessage(document.querySelector("#survey-message"), "등록된 교육을 찾을 수 없습니다.", "info");
      return;
    }
    document.querySelector("#survey-course-title").textContent = course.name;
    let questionNumber = 0;
    document.querySelector("#survey-question-list").innerHTML = groupQuestions(course.questions).map(function (group, groupIndex) {
      const questionsHtml = group.questions.map(function (q) {
        questionNumber += 1;
        if (q.type === "score") return '<fieldset class="question"><legend>' + questionNumber + ". " + escapeHtml(q.text) + '</legend><div class="score-options">' + [1, 2, 3, 4, 5].map(function (score) { return '<label><input type="radio" name="' + q.id + '" value="' + score + '" required><span>' + score + "점</span></label>"; }).join("") + "</div></fieldset>";
        return '<label class="field question"><span>' + questionNumber + ". " + escapeHtml(q.text) + '</span><textarea name="' + q.id + '" rows="4" required></textarea></label>';
      }).join("");
      return '<section class="survey-question-group" aria-labelledby="survey-group-' + (groupIndex + 1) + '"><h2 id="survey-group-' + (groupIndex + 1) + '">' + escapeHtml(group.name) + '</h2><div class="survey-group-questions">' + questionsHtml + "</div></section>";
    }).join("");
    if (!course.questions.length) {
      form.hidden = true;
      setMessage(document.querySelector("#survey-message"), "등록된 만족도 문항이 없습니다.", "info");
      return;
    }
    if (new Date() > surveyDeadline(course)) {
      form.hidden = true; setMessage(document.querySelector("#survey-message"), "만족도 조사 응답 기간이 종료되었습니다.", "error"); return;
    }
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const age = Number(values.age);
      if (values.gender !== "남성" && values.gender !== "여성") {
        setMessage(document.querySelector("#survey-message"), "성별을 선택해 주세요.", "warning");
        return;
      }
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        setMessage(document.querySelector("#survey-message"), "나이는 1세 이상 120세 이하의 정수로 입력해 주세요.", "warning");
        return;
      }
      const responseId = crypto.randomUUID();
      const responseResult = await requireDb().from("survey_responses").insert({
        id: responseId,
        course_id: course.id,
        respondent_name: null,
        gender: values.gender,
        age: age
      });
      if (responseResult.error) {
        console.error(responseResult.error);
        setMessage(document.querySelector("#survey-message"), "만족도 응답을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      const answerRows = course.questions.map(function (question) {
        return {
          response_id: responseId,
          question_id: question.id,
          score_value: question.type === "score" ? Number(values[question.id]) : null,
          text_value: question.type === "text" ? values[question.id] : null
        };
      });
      const answerResult = await requireDb().from("survey_answers").insert(answerRows);
      if (answerResult.error) {
        console.error(answerResult.error);
        setMessage(document.querySelector("#survey-message"), "문항별 답변을 저장하지 못했습니다. 관리자에게 문의해 주세요.", "error");
        return;
      }
      form.hidden = true;
      setMessage(document.querySelector("#survey-message"), "만족도 조사 응답이 완료되었습니다. 참여해 주셔서 감사합니다.", "success");
    });
  }

  async function initSurveySettings() {
    let questions = [];
    let groups = [];
    let activeGroupName = "";
    let editingGroupIndex = null;
    const list = document.querySelector("#settings-list");
    const questionDialog = document.querySelector("#question-dialog");
    const questionForm = document.querySelector("#question-form");
    const groupDialog = document.querySelector("#group-dialog");
    const groupForm = document.querySelector("#group-form");
    try {
      const results = await Promise.all([getQuestions(), getQuestionGroups()]);
      questions = results[0];
      groups = results[1];

      groupQuestions(questions).forEach(function (questionGroup) {
        const exists = groups.some(function (group) { return normalizedGroupName(group.name) === normalizedGroupName(questionGroup.name); });
        if (!exists) groups.push({ id: null, name: questionGroup.name, displayOrder: groups.length + 1 });
      });
    } catch (error) {
      console.error("만족도 문항 설정 초기화 실패", error);
      setMessage(document.querySelector("#settings-message"), "만족도 문항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      document.querySelector("#save-questions").disabled = true;
    }

    function normalizeSettingsOrder() {
      const orderedQuestions = [];
      groups.forEach(function (group, groupIndex) {
        group.displayOrder = groupIndex + 1;
        questions.filter(function (question) {
          return normalizedGroupName(question.groupName) === normalizedGroupName(group.name);
        }).forEach(function (question) {
          question.groupName = group.name;
          question.groupOrder = group.displayOrder;
          question.displayOrder = orderedQuestions.length + 1;
          orderedQuestions.push(question);
        });
      });
      questions = orderedQuestions;
    }

    function render() {
      normalizeSettingsOrder();
      let questionNumber = 0;
      list.innerHTML = groups.map(function (group, groupIndex) {
        const groupItems = questions.filter(function (question) { return question.groupName === group.name; });
        const items = groupItems.map(function (question, questionIndex) {
          const index = questions.indexOf(question);
          questionNumber += 1;
          return '<li class="question-item"><div><span class="question-number">' + questionNumber + '</span><div><strong>' + escapeHtml(question.text) + '</strong><span class="type-label">' + (question.type === "score" ? "점수형 · 1~5점" : "주관식") + '</span></div></div><div class="inline-actions"><button class="button button-small button-ghost" data-move="up" data-index="' + index + '" ' + (questionIndex === 0 ? "disabled" : "") + '>위로</button><button class="button button-small button-ghost" data-move="down" data-index="' + index + '" ' + (questionIndex === groupItems.length - 1 ? "disabled" : "") + '>아래로</button><button class="button button-small button-ghost" data-edit-question="' + index + '">수정</button><button class="button button-small button-danger" data-delete-question="' + index + '">삭제</button></div></li>';
        }).join("");
        const questionList = items || '<li class="empty-cell question-group-empty">등록된 문항이 없습니다.</li>';
        return '<section class="question-group-card"><div class="question-group-header"><div><span class="group-order-label">주제 ' + (groupIndex + 1) + '</span><h3>' + escapeHtml(group.name) + '</h3><span>' + groupItems.length + '개 문항</span></div><div class="inline-actions"><button class="button button-small button-ghost" data-edit-group="' + groupIndex + '">주제 수정</button><button class="button button-small button-danger" data-delete-group="' + groupIndex + '">주제 삭제</button><button class="button button-small" data-add-question="' + groupIndex + '">문항 추가</button><button class="button button-small button-ghost" data-move-group="up" data-group-index="' + groupIndex + '" ' + (groupIndex === 0 ? "disabled" : "") + '>주제 위로</button><button class="button button-small button-ghost" data-move-group="down" data-group-index="' + groupIndex + '" ' + (groupIndex === groups.length - 1 ? "disabled" : "") + '>주제 아래로</button></div></div><ol class="question-list">' + questionList + "</ol></section>";
      }).join("") || '<div class="empty-cell">등록된 주제가 없습니다. 주제를 추가해 주세요.</div>';
    }

    const originalIds = new Set(questions.map(function (question) { return question.id; }));
    const originalGroupIds = new Set(groups.filter(function (group) { return group.id; }).map(function (group) { return group.id; }));
    document.querySelector("#add-group").addEventListener("click", function () {
      editingGroupIndex = null;
      groupForm.reset();
      groupForm.elements.name.setCustomValidity("");
      document.querySelector("#group-dialog-title").textContent = "주제 추가";
      groupDialog.showModal();
    });
    document.querySelector("#group-cancel").addEventListener("click", function () {
      editingGroupIndex = null;
      groupDialog.close();
    });
    groupForm.elements.name.addEventListener("input", function () { groupForm.elements.name.setCustomValidity(""); });
    groupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const name = groupForm.elements.name.value.trim();
      const duplicate = groups.some(function (group, groupIndex) {
        return groupIndex !== editingGroupIndex && normalizedGroupName(group.name) === normalizedGroupName(name);
      });
      if (duplicate) {
        groupForm.elements.name.setCustomValidity("같은 이름의 주제가 이미 있습니다.");
        groupForm.elements.name.reportValidity();
        return;
      }
      if (editingGroupIndex === null) {
        groups.push({ id: null, name: name, displayOrder: groups.length + 1 });
      } else {
        const group = groups[editingGroupIndex];
        const previousName = group.name;
        group.name = name;
        questions.forEach(function (question) {
          if (normalizedGroupName(question.groupName) === normalizedGroupName(previousName)) question.groupName = name;
        });
      }
      groupDialog.close();
      editingGroupIndex = null;
      render();
    });

    document.querySelector("#question-cancel").addEventListener("click", function () { questionDialog.close(); });
    list.addEventListener("click", function (event) {
      const add = event.target.dataset.addQuestion;
      const editGroup = event.target.dataset.editGroup;
      const deleteGroup = event.target.dataset.deleteGroup;
      const edit = event.target.dataset.editQuestion;
      const remove = event.target.dataset.deleteQuestion;
      const move = event.target.dataset.move;
      const moveGroup = event.target.dataset.moveGroup;
      const index = Number(event.target.dataset.index);
      if (editGroup !== undefined) {
        editingGroupIndex = Number(editGroup);
        groupForm.reset();
        groupForm.elements.name.setCustomValidity("");
        groupForm.elements.name.value = groups[editingGroupIndex].name;
        document.querySelector("#group-dialog-title").textContent = "주제 수정";
        groupDialog.showModal();
      }
      if (deleteGroup !== undefined) {
        const groupIndex = Number(deleteGroup);
        const group = groups[groupIndex];
        if (confirm("'" + group.name + "' 주제를 삭제할까요?")) {
          const hasQuestions = questions.some(function (question) {
            return normalizedGroupName(question.groupName) === normalizedGroupName(group.name);
          });
          if (hasQuestions) {
            alert("문항을 다른 주제로 이동하거나 먼저 삭제해 주세요");
          } else {
            groups.splice(groupIndex, 1);
            render();
          }
        }
      }
      if (add !== undefined) {
        const group = groups[Number(add)];
        activeGroupName = group.name;
        questionForm.reset();
        questionForm.elements.index.value = "";
        document.querySelector("#question-dialog-title").textContent = "문항 추가";
        document.querySelector("#question-dialog-group").textContent = "주제: " + group.name;
        questionDialog.showModal();
      }
      if (edit !== undefined) {
        const question = questions[Number(edit)];
        activeGroupName = question.groupName;
        questionForm.elements.index.value = edit;
        questionForm.elements.type.value = question.type;
        questionForm.elements.text.value = question.text;
        document.querySelector("#question-dialog-title").textContent = "문항 수정";
        document.querySelector("#question-dialog-group").textContent = "주제: " + question.groupName;
        questionDialog.showModal();
      }
      if (remove !== undefined && confirm("이 문항을 삭제할까요?")) { questions.splice(Number(remove), 1); render(); }
      if (move) {
        const groupItems = questions.filter(function (question) { return question.groupName === questions[index].groupName; });
        const position = groupItems.indexOf(questions[index]);
        const targetQuestion = groupItems[move === "up" ? position - 1 : position + 1];
        const targetIndex = questions.indexOf(targetQuestion);
        if (targetQuestion) {
          const temporary = questions[index];
          questions[index] = questions[targetIndex];
          questions[targetIndex] = temporary;
          render();
        }
      }
      if (moveGroup) {
        const groupIndex = Number(event.target.dataset.groupIndex);
        const targetIndex = moveGroup === "up" ? groupIndex - 1 : groupIndex + 1;
        if (groups[targetIndex]) {
          const temporary = groups[groupIndex];
          groups[groupIndex] = groups[targetIndex];
          groups[targetIndex] = temporary;
          render();
        }
      }
    });
    questionForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const indexValue = questionForm.elements.index.value;
      const index = Number(indexValue);
      const previous = indexValue === "" ? null : questions[index];
      const item = {
        id: previous ? previous.id : null,
        type: questionForm.elements.type.value,
        text: questionForm.elements.text.value.trim(),
        groupName: activeGroupName,
        groupOrder: groups.findIndex(function (group) { return group.name === activeGroupName; }) + 1
      };
      if (previous) {
        questions[index] = item;
      } else {
        const lastGroupIndex = questions.reduce(function (lastIndex, question, questionIndex) {
          return question.groupName === activeGroupName ? questionIndex : lastIndex;
        }, -1);
        if (lastGroupIndex >= 0) questions.splice(lastGroupIndex + 1, 0, item);
        else questions.push(item);
      }
      questionDialog.close();
      render();
    });
    document.querySelector("#save-questions").addEventListener("click", async function () {
      const saveButton = document.querySelector("#save-questions");
      saveButton.disabled = true;
      const currentIds = new Set(questions.filter(function (question) { return question.id; }).map(function (question) { return question.id; }));
      const removedIds = Array.from(originalIds).filter(function (id) { return !currentIds.has(id); });
      const currentGroupIds = new Set(groups.filter(function (group) { return group.id; }).map(function (group) { return group.id; }));
      const removedGroupIds = Array.from(originalGroupIds).filter(function (id) { return !currentGroupIds.has(id); });
      try {
        normalizeSettingsOrder();
        if (removedGroupIds.length) throwIfError(await requireDb().from("survey_question_groups").delete().in("id", removedGroupIds));
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          const group = groups[groupIndex];
          const values = { name: group.name, display_order: group.displayOrder };
          if (group.id) {
            throwIfError(await requireDb().from("survey_question_groups").update(values).eq("id", group.id));
          } else {
            const insertedGroup = throwIfError(await requireDb().from("survey_question_groups").insert(values).select("id").single());
            group.id = insertedGroup.id;
          }
        }
        if (removedIds.length) throwIfError(await requireDb().from("survey_question_templates").delete().in("id", removedIds));
        for (let index = 0; index < questions.length; index += 1) {
          const question = questions[index];
          const values = { question_type: question.type, question_text: question.text, display_order: question.displayOrder, group_name: question.groupName, group_order: question.groupOrder };
          if (question.id) {
            throwIfError(await requireDb().from("survey_question_templates").update(values).eq("id", question.id));
          } else {
            const insertedQuestion = throwIfError(await requireDb().from("survey_question_templates").insert(values).select("id").single());
            question.id = insertedQuestion.id;
          }
        }
      } catch (error) {
        console.error(error);
        saveButton.disabled = false;
        const duplicateGroup = error && error.code === "23505";
        setMessage(document.querySelector("#settings-message"), duplicateGroup ? "같은 이름의 주제가 이미 있습니다." : "만족도 문항을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
      setMessage(document.querySelector("#settings-message"), "변경사항을 저장했습니다. 이후 새로 생성하는 교육부터 적용됩니다.", "success");
      setTimeout(function () { location.href = "index.html"; }, 700);
    });
    render();
  }

  async function initCourseSurveySettings() {
    const courseId = param("id");
    const list = document.querySelector("#course-settings-list");
    const message = document.querySelector("#course-settings-message");
    const saveButton = document.querySelector("#save-course-questions");
    const addGroupButton = document.querySelector("#course-add-group");
    const groupDialog = document.querySelector("#course-group-dialog");
    const groupForm = document.querySelector("#course-group-form");
    const questionDialog = document.querySelector("#course-question-dialog");
    const questionForm = document.querySelector("#course-question-form");
    const questionLockNote = document.querySelector("#course-question-lock-note");
    let questions = [];
    let groups = [];
    let originalIds = new Set();
    let originalTypes = new Map();
    let activeGroupName = "";
    let isDirty = false;

    function detailUrl() {
      return "education-detail.html?id=" + encodeURIComponent(courseId || "");
    }

    document.querySelector("#course-survey-back").href = courseId ? detailUrl() : "index.html";
    document.querySelector("#course-survey-back-top").href = courseId ? detailUrl() : "index.html";

    function setDirty(value) {
      isDirty = Boolean(value);
      saveButton.disabled = !isDirty;
    }

    function groupsFromQuestions() {
      groups = groupQuestions(questions).map(function (group, index) {
        return { name: group.name, displayOrder: index + 1 };
      });
    }

    function captureOriginalState() {
      originalIds = new Set(questions.filter(function (question) { return question.id; }).map(function (question) { return question.id; }));
      originalTypes = new Map(questions.filter(function (question) { return question.id; }).map(function (question) { return [question.id, question.type]; }));
    }

    async function getAnsweredIds(questionIds) {
      if (!questionIds.length) return new Set();
      const result = await requireDb().from("survey_answers").select("question_id").in("question_id", questionIds);
      return new Set(throwIfError(result).map(function (answer) { return answer.question_id; }));
    }

    async function loadCourseQuestions() {
      const result = await requireDb().from("course_survey_questions").select("*").eq("course_id", courseId).order("group_order", { ascending: true }).order("display_order", { ascending: true });
      const loadedQuestions = normalizeQuestionOrder(throwIfError(result).map(questionFromRow));
      const answeredIds = await getAnsweredIds(loadedQuestions.map(function (question) { return question.id; }));
      loadedQuestions.forEach(function (question) { question.hasAnswers = answeredIds.has(question.id); });
      return loadedQuestions;
    }

    if (!courseId) {
      addGroupButton.disabled = true;
      setMessage(message, "교육 정보가 지정되지 않았습니다. 교육 상세 화면에서 다시 열어 주세요.", "error");
      return;
    }

    try {
      const courseResult = await requireDb().from("courses").select("id,name").eq("id", courseId).maybeSingle();
      if (courseResult.error) throw courseResult.error;
      if (!courseResult.data) throw new Error("Course not found");
      document.querySelector("#course-survey-settings-title").textContent = courseResult.data.name + " 만족도 문항 설정";
      questions = await loadCourseQuestions();
      groupsFromQuestions();
      captureOriginalState();
    } catch (error) {
      console.error("교육별 만족도 문항 조회 실패", error);
      addGroupButton.disabled = true;
      saveButton.disabled = true;
      setMessage(message, "이 교육의 만족도 문항을 불러오지 못했습니다. 데이터베이스 권한과 교육 정보를 확인해 주세요.", "error");
      return;
    }

    function normalizeCourseSettingsOrder() {
      const orderedQuestions = [];
      groups.forEach(function (group, groupIndex) {
        group.displayOrder = groupIndex + 1;
        questions.filter(function (question) {
          return normalizedGroupName(question.groupName) === normalizedGroupName(group.name);
        }).forEach(function (question) {
          question.groupName = group.name;
          question.groupOrder = group.displayOrder;
          question.displayOrder = orderedQuestions.length + 1;
          orderedQuestions.push(question);
        });
      });
      questions = orderedQuestions;
    }

    function render() {
      normalizeCourseSettingsOrder();
      let questionNumber = 0;
      list.innerHTML = groups.map(function (group, groupIndex) {
        const groupItems = questions.filter(function (question) { return question.groupName === group.name; });
        const items = groupItems.map(function (question, questionIndex) {
          const index = questions.indexOf(question);
          questionNumber += 1;
          const answerState = question.hasAnswers ? '<span class="badge badge-warning">답변 있음 · 삭제/유형 변경 불가</span>' : "";
          const deleteDisabled = question.hasAnswers ? ' disabled title="이미 저장된 답변이 있어 삭제할 수 없습니다."' : "";
          return '<li class="question-item"><div><span class="question-number">' + questionNumber + '</span><div><strong>' + escapeHtml(question.text) + '</strong><span class="type-label">' + (question.type === "score" ? "점수형 · 1~5점" : "주관식") + " " + answerState + '</span></div></div><div class="inline-actions"><button class="button button-small button-ghost" data-course-move="up" data-index="' + index + '" ' + (questionIndex === 0 ? "disabled" : "") + '>위로</button><button class="button button-small button-ghost" data-course-move="down" data-index="' + index + '" ' + (questionIndex === groupItems.length - 1 ? "disabled" : "") + '>아래로</button><button class="button button-small button-ghost" data-course-edit-question="' + index + '">수정</button><button class="button button-small button-danger" data-course-delete-question="' + index + '"' + deleteDisabled + '>삭제</button></div></li>';
        }).join("");
        const questionList = items || '<li class="empty-cell question-group-empty">등록된 문항이 없습니다. 문항을 추가해야 이 주제를 저장할 수 있습니다.</li>';
        const removeGroup = groupItems.length ? "" : '<button class="button button-small button-danger" data-course-delete-group="' + groupIndex + '">빈 주제 삭제</button>';
        return '<section class="question-group-card"><div class="question-group-header"><div><span class="group-order-label">주제 ' + (groupIndex + 1) + '</span><h3>' + escapeHtml(group.name) + '</h3><span>' + groupItems.length + '개 문항</span></div><div class="inline-actions"><button class="button button-small" data-course-add-question="' + groupIndex + '">문항 추가</button><button class="button button-small button-ghost" data-course-move-group="up" data-group-index="' + groupIndex + '" ' + (groupIndex === 0 ? "disabled" : "") + '>주제 위로</button><button class="button button-small button-ghost" data-course-move-group="down" data-group-index="' + groupIndex + '" ' + (groupIndex === groups.length - 1 ? "disabled" : "") + '>주제 아래로</button>' + removeGroup + '</div></div><ol class="question-list">' + questionList + "</ol></section>";
      }).join("") || '<div class="empty-cell">이 교육에 등록된 문항이 없습니다. 주제를 추가한 뒤 문항을 등록해 주세요.</div>';
    }

    addGroupButton.addEventListener("click", function () {
      groupForm.reset();
      groupForm.elements.name.setCustomValidity("");
      groupDialog.showModal();
    });
    document.querySelector("#course-group-cancel").addEventListener("click", function () { groupDialog.close(); });
    groupForm.elements.name.addEventListener("input", function () { groupForm.elements.name.setCustomValidity(""); });
    groupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const name = groupForm.elements.name.value.trim();
      const duplicate = groups.some(function (group) { return normalizedGroupName(group.name) === normalizedGroupName(name); });
      if (duplicate) {
        groupForm.elements.name.setCustomValidity("같은 이름의 주제가 이미 있습니다.");
        groupForm.elements.name.reportValidity();
        return;
      }
      groups.push({ name: name, displayOrder: groups.length + 1 });
      groupDialog.close();
      setDirty(true);
      render();
    });

    document.querySelector("#course-question-cancel").addEventListener("click", function () { questionDialog.close(); });
    list.addEventListener("click", function (event) {
      const add = event.target.dataset.courseAddQuestion;
      const edit = event.target.dataset.courseEditQuestion;
      const remove = event.target.dataset.courseDeleteQuestion;
      const move = event.target.dataset.courseMove;
      const moveGroup = event.target.dataset.courseMoveGroup;
      const removeGroup = event.target.dataset.courseDeleteGroup;
      const index = Number(event.target.dataset.index);
      if (add !== undefined) {
        const group = groups[Number(add)];
        activeGroupName = group.name;
        questionForm.reset();
        questionForm.elements.index.value = "";
        questionForm.elements.type.disabled = false;
        questionLockNote.hidden = true;
        document.querySelector("#course-question-dialog-title").textContent = "문항 추가";
        document.querySelector("#course-question-dialog-group").textContent = "주제: " + group.name;
        questionDialog.showModal();
      }
      if (edit !== undefined) {
        const question = questions[Number(edit)];
        activeGroupName = question.groupName;
        questionForm.elements.index.value = edit;
        questionForm.elements.type.value = question.type;
        questionForm.elements.type.disabled = question.hasAnswers;
        questionForm.elements.text.value = question.text;
        questionLockNote.hidden = !question.hasAnswers;
        document.querySelector("#course-question-dialog-title").textContent = "문항 수정";
        document.querySelector("#course-question-dialog-group").textContent = "주제: " + question.groupName;
        questionDialog.showModal();
      }
      if (remove !== undefined) {
        const question = questions[Number(remove)];
        if (question.hasAnswers) {
          setMessage(message, "이미 저장된 답변이 있는 문항은 삭제할 수 없습니다.", "warning");
        } else if (confirm("이 교육에서 해당 문항을 삭제할까요?")) {
          questions.splice(Number(remove), 1);
          setDirty(true);
          render();
        }
      }
      if (move) {
        const groupItems = questions.filter(function (question) { return question.groupName === questions[index].groupName; });
        const position = groupItems.indexOf(questions[index]);
        const targetQuestion = groupItems[move === "up" ? position - 1 : position + 1];
        const targetIndex = questions.indexOf(targetQuestion);
        if (targetQuestion) {
          const temporary = questions[index];
          questions[index] = questions[targetIndex];
          questions[targetIndex] = temporary;
          setDirty(true);
          render();
        }
      }
      if (moveGroup) {
        const groupIndex = Number(event.target.dataset.groupIndex);
        const targetIndex = moveGroup === "up" ? groupIndex - 1 : groupIndex + 1;
        if (groups[targetIndex]) {
          const temporary = groups[groupIndex];
          groups[groupIndex] = groups[targetIndex];
          groups[targetIndex] = temporary;
          setDirty(true);
          render();
        }
      }
      if (removeGroup !== undefined && !questions.some(function (question) { return question.groupName === groups[Number(removeGroup)].name; })) {
        groups.splice(Number(removeGroup), 1);
        setDirty(true);
        render();
      }
    });

    questionForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const indexValue = questionForm.elements.index.value;
      const index = Number(indexValue);
      const previous = indexValue === "" ? null : questions[index];
      const type = questionForm.elements.type.value;
      if (previous && previous.hasAnswers && type !== previous.type) {
        setMessage(message, "이미 저장된 답변이 있어 문항 유형을 변경할 수 없습니다.", "warning");
        return;
      }
      const item = {
        id: previous ? previous.id : null,
        type: type,
        text: questionForm.elements.text.value.trim(),
        groupName: activeGroupName,
        groupOrder: groups.findIndex(function (group) { return group.name === activeGroupName; }) + 1,
        hasAnswers: previous ? previous.hasAnswers : false
      };
      if (previous) {
        questions[index] = item;
      } else {
        const lastGroupIndex = questions.reduce(function (lastIndex, question, questionIndex) {
          return question.groupName === activeGroupName ? questionIndex : lastIndex;
        }, -1);
        if (lastGroupIndex >= 0) questions.splice(lastGroupIndex + 1, 0, item);
        else questions.push(item);
      }
      questionDialog.close();
      setDirty(true);
      render();
    });

    saveButton.addEventListener("click", async function () {
      if (!isDirty) return;
      const emptyGroup = groups.find(function (group) {
        return !questions.some(function (question) { return normalizedGroupName(question.groupName) === normalizedGroupName(group.name); });
      });
      if (emptyGroup) {
        setMessage(message, "'" + emptyGroup.name + "' 주제에 문항을 하나 이상 추가하거나 빈 주제를 삭제해 주세요.", "warning");
        return;
      }
      saveButton.disabled = true;
      normalizeCourseSettingsOrder();
      const currentIds = new Set(questions.filter(function (question) { return question.id; }).map(function (question) { return question.id; }));
      const removedIds = Array.from(originalIds).filter(function (id) { return !currentIds.has(id); });
      try {
        const answeredIds = await getAnsweredIds(Array.from(originalIds));
        if (removedIds.some(function (id) { return answeredIds.has(id); })) {
          throw new Error("답변이 등록된 문항이 포함되어 삭제할 수 없습니다. 페이지를 새로고침해 주세요.");
        }
        const changedAnsweredQuestion = questions.find(function (question) {
          return question.id && answeredIds.has(question.id) && originalTypes.get(question.id) !== question.type;
        });
        if (changedAnsweredQuestion) throw new Error("답변이 등록된 문항은 유형을 변경할 수 없습니다. 페이지를 새로고침해 주세요.");

        for (let index = 0; index < questions.length; index += 1) {
          const question = questions[index];
          const values = { question_type: question.type, question_text: question.text, display_order: question.displayOrder, group_name: question.groupName, group_order: question.groupOrder };
          if (question.id) {
            const updateResult = await requireDb().from("course_survey_questions").update(values).eq("course_id", courseId).eq("id", question.id).select("id").maybeSingle();
            if (updateResult.error) throw updateResult.error;
            if (!updateResult.data) throw new Error("문항 수정 대상이 현재 교육에 속하지 않습니다.");
          } else {
            const insertedQuestion = throwIfError(await requireDb().from("course_survey_questions").insert(Object.assign({ course_id: courseId }, values)).select("id").single());
            question.id = insertedQuestion.id;
          }
        }
        if (removedIds.length) {
          const deleteResult = await requireDb().from("course_survey_questions").delete().eq("course_id", courseId).in("id", removedIds).select("id");
          const deletedRows = throwIfError(deleteResult);
          if (deletedRows.length !== removedIds.length) throw new Error("일부 문항을 삭제할 수 없습니다. 답변 연결 여부를 확인해 주세요.");
        }

        questions = await loadCourseQuestions();
        groupsFromQuestions();
        captureOriginalState();
        setDirty(false);
        render();
        setMessage(message, "이 교육의 만족도 문항을 저장했습니다. 공통 문항과 다른 교육은 변경되지 않았습니다.", "success");
      } catch (error) {
        console.error("교육별 만족도 문항 저장 실패", error);
        saveButton.disabled = false;
        const reason = String(error && error.message || "");
        const protectedQuestion = (error && error.code === "23503") || reason.includes("답변") || reason.includes("문항 수정 대상");
        setMessage(message, protectedQuestion ? reason : "이 교육의 만족도 문항을 저장하지 못했습니다. 데이터베이스 권한을 확인한 후 다시 시도해 주세요.", protectedQuestion ? "warning" : "error");
      }
    });

    setDirty(false);
    render();
  }

  document.addEventListener("DOMContentLoaded", async function () {
    if (window.authReady) {
      const isAuthenticated = await window.authReady;
      if (!isAuthenticated) return;
    }
    const page = document.body.dataset.page;
    if (page === "dashboard") initDashboard();
    if (page === "education-form") initEducationForm();
    if (page === "education-detail") initDetail();
    if (page === "apply") initApply();
    if (page === "survey") initSurvey();
    if (page === "survey-settings") initSurveySettings();
    if (page === "course-survey-settings") initCourseSurveySettings();
  });
})();
