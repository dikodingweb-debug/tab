document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const error = document.getElementById("loginError");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Memproses…";
    try {
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value;
      if (!username || !password) throw new Error("Username dan password wajib diisi.");
      const result = await API.login(username, password);
      sessionStorage.setItem("td_session_token", result.token);
      window.location.href = "dashboard.html";
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Masuk";
    }
  });
});
