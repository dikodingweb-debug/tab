document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const error = document.getElementById("loginError");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginButton = form.querySelector("button[type=submit]");

  function setBusy(busy, activeButton, busyText) {
    loginButton.disabled = busy;
    if (activeButton) activeButton.textContent = busy ? busyText : activeButton.dataset.defaultText;
  }

  function showError(err) {
    error.textContent = err && err.message ? err.message : "Terjadi kesalahan. Silakan coba lagi.";
    error.hidden = false;
  }

  function redirectWithToken(token) {
    sessionStorage.setItem("td_session_token", token);
    window.location.href = "dashboard.html";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    setBusy(true, loginButton, "Memproses…");
    try {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) throw new Error("Username dan password wajib diisi.");
      const result = await API.login(username, password);
      redirectWithToken(result.token);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false, loginButton);
    }
  });

  loginButton.dataset.defaultText = loginButton.textContent;
});
