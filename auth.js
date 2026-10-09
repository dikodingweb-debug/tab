document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const error = document.getElementById("loginError");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginButton = form.querySelector("button[type=submit]");
  const passkeyLoginButton = document.getElementById("passkeyLoginBtn");
  const passkeySetupButton = document.getElementById("passkeySetupBtn");
  const passkeyHint = document.getElementById("passkeyHint");
  const passkeyConfigured = Boolean(window.APP_CONFIG && window.APP_CONFIG.WEBAUTHN_API_URL);
  const passkeySupported = Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
  const buttons = [loginButton, passkeyLoginButton, passkeySetupButton].filter(Boolean);

  if (!passkeyConfigured) {
    passkeyLoginButton.disabled = true;
    passkeySetupButton.disabled = true;
    passkeyHint.textContent = "Login sidik jari belum tersedia sampai layanan passkey dikonfigurasi.";
  } else if (!passkeySupported) {
    passkeyLoginButton.disabled = true;
    passkeySetupButton.disabled = true;
    passkeyHint.textContent = "Passkey memerlukan browser yang mendukung dan koneksi HTTPS.";
  } else {
    passkeyHint.textContent = "Passkey menggunakan sidik jari, pengenalan wajah, atau kunci layar perangkat.";
  }

  function setBusy(busy, activeButton, busyText) {
    buttons.forEach(button => {
      const isPasskeyButton = button === passkeyLoginButton || button === passkeySetupButton;
      button.disabled = busy || isPasskeyButton && (!passkeyConfigured || !passkeySupported);
    });
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

  passkeyLoginButton.dataset.defaultText = passkeyLoginButton.textContent;
  passkeySetupButton.dataset.defaultText = passkeySetupButton.textContent;
  loginButton.dataset.defaultText = loginButton.textContent;

  passkeyLoginButton.addEventListener("click", async () => {
    error.hidden = true;
    setBusy(true, passkeyLoginButton, "Menunggu verifikasi…");
    try {
      const username = usernameInput.value.trim();
      if (!username) throw new Error("Masukkan username terlebih dahulu.");
      const ticket = await PasskeyClient.authenticate(username);
      const result = await API.loginPasskey(ticket);
      redirectWithToken(result.token);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false, passkeyLoginButton);
    }
  });

  passkeySetupButton.addEventListener("click", async () => {
    error.hidden = true;
    setBusy(true, passkeySetupButton, "Mendaftarkan passkey…");
    try {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) throw new Error("Isi username dan password untuk mendaftar passkey.");
      const result = await API.login(username, password);
      await PasskeyClient.register(result.token);
      passwordInput.value = "";
      redirectWithToken(result.token);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false, passkeySetupButton);
    }
  });
});
