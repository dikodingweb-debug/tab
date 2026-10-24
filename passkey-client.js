(function () {
  const config = window.APP_CONFIG || {};

  function apiUrl(path) {
    const base = String(config.WEBAUTHN_API_URL || "").replace(/\/+$/, "");
    if (!base) throw new Error("Layanan passkey belum dikonfigurasi.");
    return base + path;
  }

  async function request(path, payload) {
    let response;
    try {
      response = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Tidak dapat menghubungi layanan passkey. Periksa URL layanan dan konfigurasi CORS.");
      }
      throw error;
    }
    let data;
    try {
      data = await response.json();
    } catch (_error) {
      throw new Error("Respons dari layanan passkey tidak valid.");
    }
    if (!response.ok || !data.ok) throw new Error(data.message || "Permintaan passkey gagal.");
    return data;
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function encodeBase64Url(value) {
    const bytes = new Uint8Array(value);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function credentialToJSON(credential) {
    const response = {
      clientDataJSON: encodeBase64Url(credential.response.clientDataJSON)
    };
    if (credential.response.attestationObject) {
      response.attestationObject = encodeBase64Url(credential.response.attestationObject);
      if (typeof credential.response.getTransports === "function") {
        response.transports = credential.response.getTransports();
      }
    } else {
      response.authenticatorData = encodeBase64Url(credential.response.authenticatorData);
      response.signature = encodeBase64Url(credential.response.signature);
      response.userHandle = credential.response.userHandle
        ? encodeBase64Url(credential.response.userHandle)
        : null;
    }
    return {
      id: credential.id,
      rawId: encodeBase64Url(credential.rawId),
      type: credential.type,
      response,
      authenticatorAttachment: credential.authenticatorAttachment || null,
      clientExtensionResults: credential.getClientExtensionResults()
    };
  }

  function prepareOptions(options) {
    const prepared = Object.assign({}, options, {
      challenge: decodeBase64Url(options.challenge)
    });
    if (options.user) {
      prepared.user = Object.assign({}, options.user, { id: decodeBase64Url(options.user.id) });
    }
    ["allowCredentials", "excludeCredentials"].forEach(key => {
      if (options[key]) {
        prepared[key] = options[key].map(item => Object.assign({}, item, {
          id: decodeBase64Url(item.id)
        }));
      }
    });
    return prepared;
  }

  async function register(token) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error("Perangkat atau browser ini belum mendukung passkey.");
    }
    const { options } = await request("/register/options", { token });
    const credential = await navigator.credentials.create({ publicKey: prepareOptions(options) });
    if (!credential) throw new Error("Pendaftaran sidik jari dibatalkan.");
    await request("/register/verify", {
      token,
      challenge: options.challenge,
      response: credentialToJSON(credential)
    });
  }

  async function authenticate(username) {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error("Perangkat atau browser ini belum mendukung passkey.");
    }
    const { options } = await request("/authenticate/options", { username });
    const credential = await navigator.credentials.get({ publicKey: prepareOptions(options) });
    if (!credential) throw new Error("Login sidik jari dibatalkan.");
    const result = await request("/authenticate/verify", {
      username,
      challenge: options.challenge,
      response: credentialToJSON(credential)
    });
    return result.ticket;
  }

  window.PasskeyClient = { register, authenticate };
})();
