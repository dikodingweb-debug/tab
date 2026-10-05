/* Satu pintu komunikasi frontend -> Apps Script. */
(function () {
  const config = window.APP_CONFIG || {};
  async function request(action, payload = {}) {
    if (!config.API_URL || config.API_URL.includes("PASTE_YOUR")) throw new Error("API_URL belum dikonfigurasi di js/config.js");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), config.API_TIMEOUT_MS || 20000);
    try {
      const response = await fetch(config.API_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload }), redirect: "follow",
        signal: controller.signal
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.message || "Request gagal.");
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Server terlalu lama merespons. Periksa koneksi internet lalu coba lagi.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  window.API = {
    login: (username, password) => request("login", { username, password }),
    getDashboard: (token) => request("getDashboard", { token }),
    getPendingPayment: (token) => request("getPendingPayment", { token }),
    createTransaction: (token) => request("createTransaction", { token }),
    approveTransaction: (token, transactionId) => request("approveTransaction", { token, transactionId }),
    rejectTransaction: (token, transactionId, reason) => request("rejectTransaction", { token, transactionId, reason }),
    markNotificationRead: (token, notificationId) => request("markNotificationRead", { token, notificationId }),
    deleteNotification: (token, notificationId) => request("deleteNotification", { token, notificationId }),
    deleteAllNotifications: (token) => request("deleteAllNotifications", { token }),
    setSavingPrice: (token, amount) => request("setSavingPrice", { token, amount }),
    updateCredentials: (token, currentPassword, newUsername, newPassword) => request("updateCredentials", { token, currentPassword, newUsername, newPassword })
  };
})();
