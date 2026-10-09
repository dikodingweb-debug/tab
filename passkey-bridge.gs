/*
 * Add these three cases to route_() in the existing Apps Script:
 *   case "getPasskeyUser": return getPasskeyUser_(p);
 *   case "findPasskeyUser": return findPasskeyUser_(p);
 *   case "loginPasskey": return loginPasskey_(p);
 *
 * Set Script Property PASSKEY_HMAC_SECRET to the same random secret as
 * PASSKEY_HMAC_SECRET in the WebAuthn service environment.
 */

function getPasskeyUser_(p) {
  return { ok:true, user:publicUser_(requireSession_(p.token)) };
}

function findPasskeyUser_(p) {
  const username = String(p.username || "").trim().toLowerCase();
  if (!username) throw new Error("Username wajib diisi.");
  const user = activeUsers_().find(u => String(u.username).toLowerCase() === username);
  if (!user) throw new Error("Passkey tidak ditemukan untuk akun tersebut.");
  return { ok:true, user:publicUser_(user) };
}

function loginPasskey_(p) {
  const ticket = String(p.ticket || "");
  const parts = ticket.split(".");
  if (ticket.length > 2048 || parts.length !== 2) throw new Error("Tiket passkey tidak valid.");

  const secret = PropertiesService.getScriptProperties().getProperty("PASSKEY_HMAC_SECRET");
  if (!secret || secret.length < 32) throw new Error("PASSKEY_HMAC_SECRET belum dikonfigurasi.");

  const expected = Utilities.computeHmacSha256Signature(parts[0], secret, Utilities.Charset.UTF_8);
  const received = decodePasskeyBase64Url_(parts[1]);
  if (!constantTimeBytesEqual_(expected, received)) throw new Error("Tiket passkey tidak valid.");

  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(decodePasskeyBase64Url_(parts[0])).getDataAsString("UTF-8"));
  } catch (err) {
    throw new Error("Tiket passkey tidak valid.");
  }
  if (claims.iss !== "everus-webauthn" || !claims.sub ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(String(claims.jti || "")) ||
      !Number.isFinite(Number(claims.exp)) || Number(claims.exp) < Math.floor(Date.now() / 1000) ||
      Number(claims.exp) > Math.floor(Date.now() / 1000) + 120) {
    throw new Error("Tiket passkey kedaluwarsa atau tidak valid.");
  }

  const user = activeUsers_().find(u => String(u.user_id) === String(claims.sub));
  if (!user) throw new Error("Akun tidak aktif.");

  const properties = PropertiesService.getScriptProperties();
  const replayKey = "PASSKEY_USED_" + String(claims.jti).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Math.floor(Date.now() / 1000);
    const allProperties = properties.getProperties();
    Object.keys(allProperties).forEach(key => {
      if (key.indexOf("PASSKEY_USED_") === 0 && Number(allProperties[key]) < now) {
        properties.deleteProperty(key);
      }
    });
    if (properties.getProperty(replayKey)) throw new Error("Tiket passkey sudah digunakan.");
    properties.setProperty(replayKey, String(claims.exp));
  } finally {
    lock.releaseLock();
  }

  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  append_("Sessions", [token, user.user_id, now, expires]);
  cacheSession_(token, user, expires);
  return { ok:true, token, user:publicUser_(user) };
}

function decodePasskeyBase64Url_(value) {
  let encoded = String(value).replace(/-/g, "+").replace(/_/g, "/");
  while (encoded.length % 4) encoded += "=";
  return Utilities.base64Decode(encoded);
}

function constantTimeBytesEqual_(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }
  return difference === 0;
}
