(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const form = document.querySelector("#login-form");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const account = form.elements.account.value.trim();
      const password = form.elements.password.value.trim();
      const message = document.querySelector("#login-message");

      if (!account || !password) {
        message.textContent = "아이디 또는 이메일과 비밀번호를 모두 입력해 주세요.";
        message.hidden = false;
        return;
      }

      window.location.href = "index.html";
    });
  });
})();
