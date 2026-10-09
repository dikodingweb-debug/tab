import { randomUUID, createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Environment variable ${name} is required.`);
  return value;
}

const gasApiUrl = requiredEnv("GAS_API_URL");
const expectedOrigin = requiredEnv("EXPECTED_ORIGIN").replace(/\/+$/, "");
const rpID = requiredEnv("RP_ID");
const hmacSecret = requiredEnv("PASSKEY_HMAC_SECRET");
if (new URL(gasApiUrl).protocol !== "https:") {
  throw new Error("GAS_API_URL must use HTTPS.");
}
if (hmacSecret.length < 32) throw new Error("PASSKEY_HMAC_SECRET must be at least 32 characters.");
const originUrl = new URL(expectedOrigin);
if ((originUrl.protocol !== "https:" && originUrl.hostname !== "localhost" && originUrl.hostname !== "127.0.0.1") ||
    originUrl.origin !== expectedOrigin) {
  throw new Error("EXPECTED_ORIGIN must be an HTTPS origin (localhost is allowed for development), without a path.");
}
if (originUrl.hostname !== rpID) {
  throw new Error("RP_ID must exactly match the hostname in EXPECTED_ORIGIN.");
}

const databasePath = resolve(process.env.DATABASE_PATH || "./data/passkeys.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credentials (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS credentials_user_id ON credentials(user_id);
  CREATE TABLE IF NOT EXISTS challenges (
    challenge TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin.replace(/\/+$/, "") === expectedOrigin) return callback(null, true);
    return callback(new Error("Origin tidak diizinkan."));
  },
  methods: ["POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "64kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));

function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

async function gasRequest(payload) {
  const response = await fetch(gasApiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || "Apps Script menolak permintaan.");
  return data;
}

function saveChallenge(challenge, purpose, userId) {
  const now = Date.now();
  db.prepare("DELETE FROM challenges WHERE expires_at <= ?").run(now);
  db.prepare("INSERT INTO challenges (challenge, purpose, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .run(challenge, purpose, userId, now + 5 * 60_000);
}

function consumeChallenge(challenge, purpose, userId) {
  const consume = db.transaction(() => {
    const row = db.prepare("SELECT * FROM challenges WHERE challenge = ?").get(challenge);
    if (!row) return null;
    db.prepare("DELETE FROM challenges WHERE challenge = ?").run(challenge);
    if (row.purpose !== purpose || row.user_id !== userId || row.expires_at <= Date.now()) return null;
    return row;
  });
  if (!challenge || !consume()) throw new Error("Tantangan passkey tidak valid atau kedaluwarsa.");
}

function syncUser(user) {
  db.prepare(`
    INSERT INTO users (user_id, username) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET username = excluded.username
  `).run(String(user.user_id), String(user.username).toLowerCase());
}

function requirePasskeyUser(body) {
  const username = String(body.username || "").trim().toLowerCase();
  if (!username) throw new Error("Username wajib diisi.");
  return gasRequest({ action: "findPasskeyUser", username });
}

function signTicket(userId) {
  const payload = Buffer.from(JSON.stringify({
    iss: "everus-webauthn",
    sub: String(userId),
    exp: Math.floor(Date.now() / 1000) + 90,
    jti: randomUUID()
  })).toString("base64url");
  const signature = createHmac("sha256", hmacSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

app.post("/api/register/options", route(async (req, res) => {
  const { user } = await gasRequest({ action: "getPasskeyUser", token: String(req.body.token || "") });
  syncUser(user);
  const existing = db.prepare("SELECT credential_id, transports FROM credentials WHERE user_id = ?").all(String(user.user_id));
  const options = await generateRegistrationOptions({
    rpName: "EverUS",
    rpID,
    userName: String(user.username),
    userID: new Uint8Array(Buffer.from(String(user.user_id), "utf8")),
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required"
    },
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: existing.map(item => ({
      id: item.credential_id,
      transports: JSON.parse(item.transports)
    }))
  });
  saveChallenge(options.challenge, "registration", String(user.user_id));
  res.json({ ok: true, options });
}));

app.post("/api/register/verify", route(async (req, res) => {
  const { user } = await gasRequest({ action: "getPasskeyUser", token: String(req.body.token || "") });
  const challenge = String(req.body.challenge || "");
  consumeChallenge(challenge, "registration", String(user.user_id));
  const verification = await verifyRegistrationResponse({
    response: req.body.response,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registrasi passkey tidak berhasil diverifikasi.");
  }

  const credential = verification.registrationInfo.credential;
  const transports = Array.isArray(credential.transports) ? credential.transports : [];
  syncUser(user);
  db.prepare(`
    INSERT INTO credentials (credential_id, user_id, public_key, counter, transports, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    credential.id,
    String(user.user_id),
    Buffer.from(credential.publicKey),
    credential.counter,
    JSON.stringify(transports),
    Date.now()
  );
  res.json({ ok: true });
}));

app.post("/api/authenticate/options", route(async (req, res) => {
  const { user } = await requirePasskeyUser(req.body);
  syncUser(user);
  const credentials = db.prepare(
    "SELECT credential_id, transports FROM credentials WHERE user_id = ?"
  ).all(String(user.user_id));
  if (!credentials.length) throw new Error("Passkey belum didaftarkan untuk akun ini.");
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(item => ({
      id: item.credential_id,
      transports: JSON.parse(item.transports)
    })),
    userVerification: "required"
  });
  saveChallenge(options.challenge, "authentication", String(user.user_id));
  res.json({ ok: true, options });
}));

app.post("/api/authenticate/verify", route(async (req, res) => {
  const { user } = await requirePasskeyUser(req.body);
  const challenge = String(req.body.challenge || "");
  consumeChallenge(challenge, "authentication", String(user.user_id));
  const credential = db.prepare(
    "SELECT * FROM credentials WHERE credential_id = ? AND user_id = ?"
  ).get(String(req.body.response?.id || ""), String(user.user_id));
  if (!credential) throw new Error("Passkey tidak terdaftar untuk akun ini.");

  const verification = await verifyAuthenticationResponse({
    response: req.body.response,
    expectedChallenge: challenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: {
      id: credential.credential_id,
      publicKey: new Uint8Array(credential.public_key),
      counter: Number(credential.counter),
      transports: JSON.parse(credential.transports)
    },
    requireUserVerification: true
  });
  if (!verification.verified) throw new Error("Verifikasi passkey gagal.");
  const newCounter = verification.authenticationInfo.newCounter;
  const update = db.prepare(
    "UPDATE credentials SET counter = ? WHERE credential_id = ? AND counter = ?"
  ).run(newCounter, credential.credential_id, credential.counter);
  if (update.changes !== 1) throw new Error("Passkey sudah digunakan atau berubah. Silakan coba lagi.");

  res.json({ ok: true, ticket: signTicket(user.user_id) });
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ ok: false, message: "Format request tidak valid." });
  }
  if (error.message === "Origin tidak diizinkan.") {
    return res.status(403).json({ ok: false, message: error.message });
  }
  const status = error.statusCode || 400;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    ok: false,
    message: status >= 500 ? "Layanan passkey mengalami kesalahan." : error.message
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`WebAuthn service listening on ${port}`));
