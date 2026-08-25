(function () {
  "use strict";

  const client = window.supabaseClient;
  const loginForm = document.querySelector("#login-form");
  const logoutLinks = Array.from(document.querySelectorAll("[data-logout]"));

  function showMessage(text, type) {
    const message = document.querySelector("#login-message");
    if (!message) return;
    message.className = "notice notice-" + (type || "error");
    message.textContent = text;
    message.hidden = false;
  }

  function authErrorMessage(error, action) {
    const code = String(error && error.code || "");
    const message = String(error && error.message || "").toLowerCase();
    if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "이메일 인증을 완료한 후 로그인해 주세요.";
    if (code === "user_already_exists" || message.includes("already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (code === "weak_password" || message.includes("password should be")) return "비밀번호는 6자 이상으로 입력해 주세요.";
    if (code === "email_address_invalid" || message.includes("invalid email")) return "올바른 이메일 주소를 입력해 주세요.";
    return action + "에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }

  function setLoginBusy(isBusy, activeButton) {
    if (!loginForm) return;
    const loginButton = document.querySelector("#login-submit");
    const signupButton = document.querySelector("#signup-submit");
    loginButton.disabled = isBusy;
    signupButton.disabled = isBusy;
    loginButton.textContent = isBusy && activeButton === loginButton ? "로그인 중..." : "로그인";
    signupButton.textContent = isBusy && activeButton === signupButton ? "가입 중..." : "회원가입";
  }

  if (!client) {
    if (loginForm) showMessage("인증 서비스를 불러오지 못했습니다. 페이지를 새로고침해 주세요.", "error");
    if (logoutLinks.length) window.location.replace("login.html");
    window.authReady = Promise.resolve(false);
    return;
  }

  if (loginForm) {
    const loginButton = document.querySelector("#login-submit");
    const signupButton = document.querySelector("#signup-submit");

    client.auth.getSession().then(function (result) {
      if (result.data && result.data.session) window.location.replace("index.html");
    }).catch(function () {});

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!loginForm.reportValidity()) return;
      setLoginBusy(true, loginButton);
      const email = loginForm.elements.email.value.trim();
      const password = loginForm.elements.password.value;
      try {
        const result = await client.auth.signInWithPassword({ email: email, password: password });
        if (result.error) {
          showMessage(authErrorMessage(result.error, "로그인"), "error");
          setLoginBusy(false);
          return;
        }
        window.location.replace("index.html");
      } catch (error) {
        showMessage(authErrorMessage(error, "로그인"), "error");
        setLoginBusy(false);
      }
    });

    signupButton.addEventListener("click", async function () {
      if (!loginForm.reportValidity()) return;
      setLoginBusy(true, signupButton);
      const email = loginForm.elements.email.value.trim();
      const password = loginForm.elements.password.value;
      try {
        const result = await client.auth.signUp({ email: email, password: password });
        if (result.error) {
          showMessage(authErrorMessage(result.error, "회원가입"), "error");
          setLoginBusy(false);
          return;
        }
        if (result.data && result.data.session) {
          window.location.replace("index.html");
          return;
        }
        showMessage("회원가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.", "success");
        setLoginBusy(false);
      } catch (error) {
        showMessage(authErrorMessage(error, "회원가입"), "error");
        setLoginBusy(false);
      }
    });
  }

  if (logoutLinks.length) {
    logoutLinks.forEach(function (link) {
      link.addEventListener("click", async function (event) {
        event.preventDefault();
        link.setAttribute("aria-busy", "true");
        try {
          const result = await client.auth.signOut({ scope: "local" });
          if (result.error) throw result.error;
          window.location.replace("login.html");
        } catch (error) {
          link.removeAttribute("aria-busy");
          window.alert("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      });
    });

    window.authReady = (async function () {
      try {
        const result = await client.auth.getUser();
        if (result.error || !result.data || !result.data.user) throw result.error || new Error("No authenticated user");
        logoutLinks.forEach(function (link) { link.hidden = false; });
        return true;
      } catch (error) {
        window.location.replace("login.html");
        return false;
      }
    })();

    client.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") window.location.replace("login.html");
    });
  }
})();
