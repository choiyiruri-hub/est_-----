(function () {
  const STORE = {
    courses: "edu-manager-courses-v1",
    questions: "edu-manager-questions-v1",
    surveyNames: "edu-manager-survey-names-v1"
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : clone(fallback);
    } catch (error) { return clone(fallback); }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function getCourses() {
    const stored = read(STORE.courses, null);
    if (Array.isArray(stored)) return stored;
    const courses = window.createDefaultCourses();
    write(STORE.courses, courses);
    return courses;
  }
  function saveCourses(courses) { write(STORE.courses, courses); }
  function getQuestions() { return read(STORE.questions, window.DEFAULT_SURVEY_QUESTIONS); }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function selectedCourse(courses) {
    const id = param("id") || "edu-1";
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

  function initDashboard() {
    let courses = getCourses();
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
    deleteButton.addEventListener("click", function () {
      const selectedCourses = courses.filter(function (course) { return selectedIds.has(course.id); });
      if (!selectedCourses.length) return;
      const prompt = selectedCourses.length === 1
        ? "‘" + selectedCourses[0].name + "’ 교육을 삭제할까요?\n연결된 신청자와 만족도 정보도 함께 삭제되며 복구할 수 없습니다."
        : "선택한 " + selectedCourses.length + "개 교육을 삭제할까요?\n연결된 신청자와 만족도 정보도 함께 삭제되며 복구할 수 없습니다.";
      if (!window.confirm(prompt)) return;
      courses = courses.filter(function (course) { return !selectedIds.has(course.id); });
      selectedIds.forEach(function (id) {
        try { localStorage.removeItem(STORE.surveyNames + "-" + id); } catch (error) { /* Ignore unavailable storage. */ }
      });
      saveCourses(courses);
      const removedCount = selectedCourses.length;
      selectedIds.clear();
      render(search.value);
      setMessage(document.querySelector("#dashboard-message"), removedCount + "개 교육을 삭제했습니다.", "success");
    });
    render("");
  }

  function initEducationForm() {
    const courses = getCourses();
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
      let targetCourse = course;
      if (course) {
        Object.assign(course, courseValues);
      } else {
        targetCourse = Object.assign({ id: "edu-" + Date.now() }, courseValues, {
          questions: clone(getQuestions()), applicants: [], responses: []
        });
        courses.unshift(targetCourse);
      }
      try { saveCourses(courses); }
      catch (error) {
        submit.disabled = false;
        setMessage(document.querySelector("#form-message"), "교육 정보를 저장하지 못했습니다. 포스터 용량을 줄인 후 다시 시도해 주세요.", "error");
        return;
      }
      if (!course) {
        location.href = "education-detail.html?id=" + targetCourse.id;
        return;
      }
      location.href = "education-detail.html?id=" + course.id;
    });
  }

  function initDetail() {
    const courses = getCourses();
    const course = selectedCourse(courses);
    if (!course) { location.replace("index.html"); return; }
    addCourseLinks(document, course);
    document.querySelector("#detail-title").textContent = course.name;
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
      const surveyState = applicant.surveyCompleted ? "응답완료" : "미응답";
      return '<tr class="' + (applicant.status === "취소" ? "row-cancelled" : "") + '">' +
        '<td><input type="checkbox" class="applicant-check" value="' + applicant.id + '" aria-label="' + escapeHtml(applicant.name) + ' 선택"></td>' +
        '<td><span class="applicant-number">' + (index + 1) + '.</span><strong>' + escapeHtml(applicant.name) + "</strong> " + (applicant.duplicate ? badge("중복 신청") : "") + "</td>" +
        "<td>" + escapeHtml(applicant.phone) + "</td><td>" + escapeHtml(applicant.email || "-") + "</td><td>" + escapeHtml(applicant.resident) + "</td><td>" + escapeHtml(applicant.organization) + "</td>" +
        "<td>" + (applicant.agreed ? "동의" : "미동의") + "</td><td>" + escapeHtml(applicant.appliedAt) + "</td><td>" + badge(applicant.applyType) + "</td>" +
        "<td>" + badge(applicant.status) + "</td><td>" + badge(applicant.callStatus) + "</td><td>" + badge(applicant.smsStatus) + "</td><td>" + badge(applicant.attendance) + "</td><td>" + badge(surveyState) + "</td>" +
        '<td><div class="inline-actions applicant-actions"><button class="button button-small button-ghost" data-edit="' + applicant.id + '">수정</button><button class="button button-small ' + (applicant.status === "취소" ? "button-secondary" : "button-danger") + '" data-toggle="' + applicant.id + '">' + (applicant.status === "취소" ? "복구" : "취소") + "</button></div></td></tr>";
    }

    function contactRow(applicant) {
      return "<tr><td>" + escapeHtml(applicant.name) + "</td><td>" + escapeHtml(applicant.phone) + "</td>" +
        '<td><select data-call="' + applicant.id + '"><option>미통화</option><option>부재</option><option>통화완료</option></select></td>' +
        '<td><select data-sms="' + applicant.id + '"><option>미발송</option><option>발송완료</option></select></td></tr>';
    }
    function attendanceRow(applicant) {
      return "<tr><td>" + escapeHtml(applicant.name) + "</td><td>" + escapeHtml(applicant.organization) + "</td>" +
        '<td><select data-attendance="' + applicant.id + '"><option>미확인</option><option>출석</option><option>결석</option></select></td></tr>';
    }
    function renderAll() {
      const count = counts(course);
      document.querySelector("#current-count").textContent = count.current + "명";
      document.querySelector("#over-count").textContent = count.over + "명";
      document.querySelector("#over-count").classList.toggle("text-danger", count.over > 0);
      document.querySelector("#applicant-body").innerHTML = course.applicants.map(applicantRow).join("") || '<tr><td colspan="15" class="empty-cell">신청자가 없습니다.</td></tr>';
      const active = activeApplicants(course);
      const allSmsButton = document.querySelector("#mark-all-sms-sent");
      allSmsButton.disabled = !active.length || active.every(function (applicant) { return applicant.smsStatus === "발송완료"; });
      document.querySelector("#contact-body").innerHTML = active.map(contactRow).join("") || '<tr><td colspan="4" class="empty-cell">연락 대상이 없습니다.</td></tr>';
      document.querySelector("#attendance-body").innerHTML = active.map(attendanceRow).join("") || '<tr><td colspan="3" class="empty-cell">출석 대상이 없습니다.</td></tr>';
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
      const completed = active.filter(function (a) { return a.surveyCompleted; }).length;
      document.querySelector("#survey-summary").innerHTML = '<div class="summary-card"><span>응답완료</span><strong>' + completed + '명</strong></div><div class="summary-card"><span>미응답</span><strong>' + Math.max(0, active.length - completed) + "명</strong></div>";
    }
    function renderSurveyResults() {
      document.querySelector("#response-count").textContent = course.responses.length + "명";
      const scores = course.questions.filter(function (q) { return q.type === "score"; });
      const scoreValues = [];
      course.responses.forEach(function (response) {
        scores.forEach(function (question) {
          const value = Number(response.answers[question.id]);
          if (value) scoreValues.push(value);
        });
      });
      const surveyTargetCount = activeApplicants(course).length;
      const responseRate = surveyTargetCount ? Math.round((course.responses.length / surveyTargetCount) * 100) : 0;
      const overallAverage = scoreValues.length ? (scoreValues.reduce(function (sum, value) { return sum + value; }, 0) / scoreValues.length).toFixed(1) : "-";
      document.querySelector("#overall-results-summary").innerHTML =
        '<div class="summary-card"><span>교육 대상</span><strong>' + surveyTargetCount + '명</strong></div>' +
        '<div class="summary-card"><span>응답 완료</span><strong>' + course.responses.length + '명</strong></div>' +
        '<div class="summary-card"><span>응답률</span><strong>' + responseRate + '%</strong></div>' +
        '<div class="summary-card"><span>전체 평균</span><strong>' + overallAverage + (scoreValues.length ? ' / 5' : '') + '</strong></div>';
      document.querySelector("#score-results").innerHTML = scores.map(function (question) {
        const values = course.responses.map(function (response) { return Number(response.answers[question.id]); }).filter(Boolean);
        const average = values.length ? (values.reduce(function (a, b) { return a + b; }, 0) / values.length).toFixed(1) : "-";
        return '<div class="result-row"><span>' + escapeHtml(question.text) + "</span><strong>" + average + (values.length ? " / 5" : "") + "</strong></div>";
      }).join("") || '<p class="muted">점수형 문항이 없습니다.</p>';
      const texts = course.questions.filter(function (q) { return q.type === "text"; });
      document.querySelector("#text-results").innerHTML = texts.map(function (question) {
        const answers = course.responses.filter(function (response) { return response.answers[question.id]; }).map(function (response) {
          return '<article class="comment"><p>' + escapeHtml(response.answers[question.id]) + '</p><span>' + escapeHtml(response.name) + "</span></article>";
        }).join("");
        return '<section class="comment-group"><h4>' + escapeHtml(question.text) + "</h4>" + (answers || '<p class="muted">등록된 답변이 없습니다.</p>') + "</section>";
      }).join("") || '<p class="muted">주관식 문항이 없습니다.</p>';
      const select = document.querySelector("#respondent-select");
      select.innerHTML = '<option value="">응답자 선택</option>' + course.responses.map(function (r, index) { return '<option value="' + index + '">' + escapeHtml(r.name) + "</option>"; }).join("");
      document.querySelector("#respondent-detail").innerHTML = '<p class="muted">응답자를 선택하면 상세 답변이 표시됩니다.</p>';
    }

    document.querySelector("#applicant-body").addEventListener("click", function (event) {
      const editId = event.target.dataset.edit;
      const toggleId = event.target.dataset.toggle;
      if (editId) openEdit(editId);
      if (toggleId) {
        const item = course.applicants.find(function (a) { return a.id === toggleId; });
        item.status = item.status === "취소" ? "신청" : "취소";
        saveCourses(courses); renderAll();
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
    document.querySelector("#edit-applicant-form").addEventListener("submit", function (event) {
      event.preventDefault(); const form = event.currentTarget;
      const item = course.applicants.find(function (a) { return a.id === form.elements.applicantId.value; });
      ["name", "phone", "resident", "organization"].forEach(function (key) { item[key] = form.elements[key].value.trim(); });
      saveCourses(courses); document.querySelector("#edit-dialog").close(); renderAll();
    });
    document.querySelector("#edit-cancel").addEventListener("click", function () { document.querySelector("#edit-dialog").close(); });
    document.querySelector("#select-all").addEventListener("change", function (event) { document.querySelectorAll(".applicant-check").forEach(function (box) { box.checked = event.target.checked; }); });
    document.querySelector("#contact-body").addEventListener("change", changeStatus);
    document.querySelector("#attendance-body").addEventListener("change", changeStatus);
    document.querySelector("#mark-all-sms-sent").addEventListener("click", function () {
      const active = activeApplicants(course);
      active.forEach(function (applicant) { applicant.smsStatus = "발송완료"; });
      saveCourses(courses);
      renderAll();
      setMessage(document.querySelector("#detail-message"), active.length + "명의 문자 상태를 발송완료로 변경했습니다.", "success");
    });
    function changeStatus(event) {
      const select = event.target; const id = select.dataset.call || select.dataset.sms || select.dataset.attendance;
      if (!id) return; const item = course.applicants.find(function (a) { return a.id === id; });
      if (select.dataset.call) item.callStatus = select.value;
      if (select.dataset.sms) item.smsStatus = select.value;
      if (select.dataset.attendance) item.attendance = select.value;
      saveCourses(courses); updateSummaries();
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
      const response = course.responses[Number(event.target.value)];
      document.querySelector("#respondent-detail").innerHTML = response ? '<h4>' + escapeHtml(response.name) + '</h4>' + course.questions.map(function (q) { return '<div class="answer-row"><span>' + escapeHtml(q.text) + '</span><strong>' + escapeHtml(response.answers[q.id] || "-") + (q.type === "score" && response.answers[q.id] ? "점" : "") + "</strong></div>"; }).join("") : '<p class="muted">응답자를 선택하면 상세 답변이 표시됩니다.</p>';
    });
    renderAll();
  }

  function initApply() {
    const courses = getCourses(); const course = selectedCourse(courses); const form = document.querySelector("#apply-form");
    window.addEventListener("storage", function (event) {
      if (event.key === STORE.courses) location.reload();
    });
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
    const poster = typeof course.poster === "string" && course.poster.startsWith("data:image/") ? course.poster : "";
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
    form.addEventListener("submit", function (event) {
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
      const phone = form.elements.phone.value.replace(/\s/g, "");
      const duplicate = course.applicants.some(function (a) { return a.phone.replace(/-/g, "") === phone.replace(/-/g, ""); });
      if (duplicate && !duplicateConfirmed) {
        duplicateConfirmed = true;
        setMessage(document.querySelector("#apply-message"), "같은 전화번호의 신청이 이미 있습니다. 다시 ‘계속 신청하기’를 누르면 별도 신청으로 접수됩니다.", "warning");
        document.querySelector("#apply-submit").textContent = "계속 신청하기"; return;
      }
      const now = new Date();
      course.applicants.push({
        id: "a-" + Date.now(), name: values.name.trim(), phone: values.phone.trim(), email: values.email.trim(),
        resident: values.resident.trim(), organization: values.organization.trim(), agreed: true,
        privacyConsent: values.privacyConsent, marketingConsent: values.marketingConsent,
        marketingAgreed: values.marketingConsent === "동의", appliedAt: formatDateTime(now),
        applyType: "정상 신청", status: "신청", duplicate: duplicate,
        callStatus: "미통화", smsStatus: "미발송", attendance: "미확인", surveyCompleted: false
      });
      const overCapacity = activeApplicants(course).length > Number(course.capacity);
      saveCourses(courses);
      form.hidden = true;
      document.querySelector("#capacity-notice").hidden = true;
      setMessage(document.querySelector("#apply-message"), overCapacity
        ? "신청이 접수되었습니다.\n현재 정원을 초과하여 교육 관리자가 참여 가능 여부를 확인한 후 별도로 연락드리겠습니다."
        : "정상 신청으로 접수되었습니다.", overCapacity ? "warning" : "success");
    });
    form.elements.phone.addEventListener("input", function (event) {
      event.target.value = formatPhone(event.target.value);
      duplicateConfirmed = false;
      document.querySelector("#apply-submit").textContent = "교육 신청하기";
    });
  }

  function initSurvey() {
    const courses = getCourses(); const course = selectedCourse(courses); const form = document.querySelector("#survey-form");
    if (!course) {
      document.querySelector("#survey-course-title").textContent = "참여 가능한 만족도 조사가 없습니다.";
      form.hidden = true;
      setMessage(document.querySelector("#survey-message"), "등록된 교육을 찾을 수 없습니다.", "info");
      return;
    }
    document.querySelector("#survey-course-title").textContent = course.name;
    document.querySelector("#survey-question-list").innerHTML = course.questions.map(function (q, index) {
      if (q.type === "score") return '<fieldset class="question"><legend>' + (index + 1) + ". " + escapeHtml(q.text) + '</legend><div class="score-options">' + [1, 2, 3, 4, 5].map(function (score) { return '<label><input type="radio" name="' + q.id + '" value="' + score + '" required><span>' + score + "점</span></label>"; }).join("") + "</div></fieldset>";
      return '<label class="field question"><span>' + (index + 1) + ". " + escapeHtml(q.text) + '</span><textarea name="' + q.id + '" rows="4" required></textarea></label>';
    }).join("");
    if (new Date() > surveyDeadline(course)) {
      form.hidden = true; setMessage(document.querySelector("#survey-message"), "만족도 조사 응답 기간이 종료되었습니다.", "error"); return;
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault(); const values = Object.fromEntries(new FormData(form).entries()); const name = values.name.trim();
      const key = STORE.surveyNames + "-" + course.id; const names = read(key, course.responses.map(function (r) { return r.name; }));
      if (names.some(function (item) { return item === name; })) { setMessage(document.querySelector("#survey-message"), "이미 만족도 조사에 참여하셨습니다.", "warning"); return; }
      const answers = {}; course.questions.forEach(function (q) { answers[q.id] = values[q.id]; });
      course.responses.push({ name: name, answers: answers }); names.push(name); write(key, names);
      const applicant = course.applicants.find(function (a) { return a.name === name && a.status !== "취소"; }); if (applicant) applicant.surveyCompleted = true;
      saveCourses(courses); form.hidden = true; setMessage(document.querySelector("#survey-message"), "만족도 조사 응답이 완료되었습니다. 참여해 주셔서 감사합니다.", "success");
    });
  }

  function initSurveySettings() {
    let questions = getQuestions(); const list = document.querySelector("#settings-list"); const dialog = document.querySelector("#question-dialog"); const form = document.querySelector("#question-form");
    function render() {
      list.innerHTML = questions.map(function (q, index) { return '<li class="question-item"><div><span class="question-number">' + (index + 1) + '</span><div><strong>' + escapeHtml(q.text) + '</strong><span class="type-label">' + (q.type === "score" ? "점수형 · 1~5점" : "주관식") + '</span></div></div><div class="inline-actions"><button class="button button-small button-ghost" data-move="up" data-index="' + index + '" ' + (index === 0 ? "disabled" : "") + '>위로</button><button class="button button-small button-ghost" data-move="down" data-index="' + index + '" ' + (index === questions.length - 1 ? "disabled" : "") + '>아래로</button><button class="button button-small button-ghost" data-edit-question="' + index + '">수정</button><button class="button button-small button-danger" data-delete-question="' + index + '">삭제</button></div></li>'; }).join("") || '<li class="empty-cell">문항이 없습니다. 문항을 추가해 주세요.</li>';
    }
    document.querySelector("#add-question").addEventListener("click", function () { form.reset(); form.elements.index.value = ""; document.querySelector("#question-dialog-title").textContent = "문항 추가"; dialog.showModal(); });
    document.querySelector("#question-cancel").addEventListener("click", function () { dialog.close(); });
    list.addEventListener("click", function (event) {
      const edit = event.target.dataset.editQuestion; const remove = event.target.dataset.deleteQuestion; const move = event.target.dataset.move; const index = Number(event.target.dataset.index);
      if (edit !== undefined) { const q = questions[Number(edit)]; form.elements.index.value = edit; form.elements.type.value = q.type; form.elements.text.value = q.text; document.querySelector("#question-dialog-title").textContent = "문항 수정"; dialog.showModal(); }
      if (remove !== undefined && confirm("이 문항을 삭제할까요?")) { questions.splice(Number(remove), 1); render(); }
      if (move) { const target = move === "up" ? index - 1 : index + 1; const temp = questions[index]; questions[index] = questions[target]; questions[target] = temp; render(); }
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); const index = form.elements.index.value; const item = { id: index === "" ? "q-" + Date.now() : questions[Number(index)].id, type: form.elements.type.value, text: form.elements.text.value.trim() }; if (index === "") questions.push(item); else questions[Number(index)] = item; dialog.close(); render(); });
    document.querySelector("#save-questions").addEventListener("click", function () { write(STORE.questions, questions); setMessage(document.querySelector("#settings-message"), "변경사항을 저장했습니다. 이후 새로 생성하는 교육부터 적용됩니다.", "success"); setTimeout(function () { location.href = "index.html"; }, 700); });
    render();
  }

  document.addEventListener("DOMContentLoaded", function () {
    const page = document.body.dataset.page;
    if (page === "dashboard") initDashboard();
    if (page === "education-form") initEducationForm();
    if (page === "education-detail") initDetail();
    if (page === "apply") initApply();
    if (page === "survey") initSurvey();
    if (page === "survey-settings") initSurveySettings();
  });
})();
