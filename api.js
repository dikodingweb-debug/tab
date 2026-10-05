/* Satu pintu komunikasi frontend -> Apps Script. */
(function () {
  const config = window.APP_CONFIG || {};
  async function request(action, payload = {}) {
    if (!config.API_URL || config.API_URL.includes("PASTE_YOUR")) throw new Error("API_URL belum dikonfigurasi di js/config.js");
    const response = await fetch(config.API_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }), redirect: "follow"
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Request gagal.");
    return data;
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
