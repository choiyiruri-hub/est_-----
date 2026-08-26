(function () {
  "use strict";

  const client = window.supabaseClient;
  const loginForm = document.querySelector("#login-form");
  const logoutLinks = Array.from(document.querySelectorAll("[data-logout]"));
  const AUTH_TIMEOUT_MS = 10000;

  function withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        const error = new Error("Authentication request timed out");
        error.code = "auth_timeout";
        reject(error);
      }, timeoutMs || AUTH_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(function () {
      window.clearTimeout(timer);
    });
  }

  function isTimeoutError(error) {
    return Boolean(error && error.code === "auth_timeout");
  }

  function loginRedirect(reason) {
    const query = reason ? "?auth=" + encodeURIComponent(reason) : "";
    window.location.replace("login.html" + query);
  }

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
    loginButton.disabled = isBusy;
    loginButton.textContent = isBusy && activeButton === loginButton ? "로그인 중..." : "로그인";
  }

  if (!client) {
    if (loginForm) showMessage("인증 서비스를 불러오지 못했습니다. 페이지를 새로고침해 주세요.", "error");
    if (logoutLinks.length) loginRedirect("unavailable");
    window.authReady = Promise.resolve(false);
    return;
  }

  if (loginForm) {
    const loginButton = document.querySelector("#login-submit");

    const authReason = new URLSearchParams(window.location.search).get("auth");
    if (authReason === "timeout") {
      showMessage("로그인 상태 확인이 지연되어 로그인 화면으로 돌아왔습니다. 다시 로그인해 주세요.", "error");
    } else if (authReason) {
      showMessage("로그인이 필요하거나 세션이 만료되었습니다. 다시 로그인해 주세요.", "error");
    } else {
      withTimeout(client.auth.getUser()).then(function (result) {
        if (!result.error && result.data && result.data.user) window.location.replace("index.html");
      }).catch(function (error) {
        if (isTimeoutError(error)) {
          showMessage("자동 로그인 확인이 지연되고 있습니다. 이메일과 비밀번호로 로그인해 주세요.", "error");
        }
      });
    }

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!loginForm.reportValidity()) return;
      setLoginBusy(true, loginButton);
      const email = loginForm.elements.email.value.trim();
      const password = loginForm.elements.password.value;
      try {
        const result = await withTimeout(client.auth.signInWithPassword({ email: email, password: password }));
        if (result.error) {
          showMessage(authErrorMessage(result.error, "로그인"), "error");
          setLoginBusy(false);
          return;
        }
        window.location.replace("index.html");
      } catch (error) {
        showMessage(isTimeoutError(error) ? "로그인 요청이 지연되고 있습니다. 네트워크 연결을 확인한 후 다시 시도해 주세요." : authErrorMessage(error, "로그인"), "error");
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
          const result = await withTimeout(client.auth.signOut({ scope: "local" }));
          if (result.error) throw result.error;
          loginRedirect();
        } catch (error) {
          link.removeAttribute("aria-busy");
          window.alert("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      });
    });

    window.authReady = (async function () {
      try {
        const result = await withTimeout(client.auth.getUser());
        if (result.error || !result.data || !result.data.user) throw result.error || new Error("No authenticated user");
        logoutLinks.forEach(function (link) { link.hidden = false; });
        return true;
      } catch (error) {
        loginRedirect(isTimeoutError(error) ? "timeout" : "required");
        return false;
      }
    })();

    client.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") loginRedirect("required");
    });
  }
})();
