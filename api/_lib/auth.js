const crypto = require("crypto");
const { withClient } = require("./db");
const { clean, json } = require("./http");

const COOKIE_NAME = "winglia_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  return secret;
}

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPasswordHash(password, passwordHash) {
  if (passwordHash) {
    const [kind, salt, expectedHash] = passwordHash.split(":");
    if (kind !== "scrypt" || !salt || !expectedHash) return false;
    const actualHash = hashPassword(password, salt).split(":")[2];
    return timingSafeEqualText(actualHash, expectedHash);
  }

  return false;
}

function verifyPassword(password) {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const plainPassword = process.env.ADMIN_PASSWORD;

  if (passwordHash) return verifyPasswordHash(password, passwordHash);

  if (plainPassword) {
    return timingSafeEqualText(password, plainPassword);
  }

  throw new Error("ADMIN_PASSWORD_HASH is not configured.");
}

async function getStoredPasswordHash() {
  return await withClient(async (client) => {
    const result = await client.query("select value from admin_settings where key = 'password_hash'");
    return result.rows[0]?.value || "";
  });
}

async function verifyAdminPassword(password) {
  const storedPasswordHash = await getStoredPasswordHash();
  if (storedPasswordHash) return verifyPasswordHash(password, storedPasswordHash);
  return verifyPassword(password);
}

async function setAdminPassword(password) {
  const passwordHash = hashPassword(password);
  await withClient((client) =>
    client.query(
      `
        insert into admin_settings (key, value, updated_at)
        values ('password_hash', $1, now())
        on conflict (key)
        do update set value = excluded.value, updated_at = now()
      `,
      [passwordHash]
    )
  );
}

function isSecureRequest(req) {
  const host = clean(req.headers.host, 200);
  const forwardedProto = clean(req.headers["x-forwarded-proto"], 20);
  if (/localhost|127\.0\.0\.1/.test(host)) return false;
  return forwardedProto === "https" || process.env.VERCEL === "1";
}

function createSessionCookie(req) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ role: "admin", iat: now, exp: now + SESSION_TTL_SECONDS }));
  const signature = hmac(payload, getSessionSecret());
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=${payload}.${signature}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function getAdminSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = hmac(payload, getSessionSecret());
  if (!timingSafeEqualText(signature, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.role !== "admin") return null;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function requireAdmin(req, res) {
  try {
    const session = getAdminSession(req);
    if (session) return session;
  } catch {
    return null;
  }

  json(res, 401, { ok: false, message: "관리자 로그인이 필요합니다." });
  return null;
}

module.exports = {
  clearSessionCookie,
  createSessionCookie,
  hashPassword,
  requireAdmin,
  setAdminPassword,
  verifyAdminPassword,
  verifyPassword,
  verifyPasswordHash,
};
