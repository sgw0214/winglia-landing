const crypto = require("crypto");
const { Pool } = require("pg");

const SERVICE_LABELS = {
  lead_response: "리드·문의 응답 관리",
  sheets_ops: "Excel·Google Sheets 업무 정리",
  settlement_audit: "정산·데이터 예외 점검",
  document_expiry: "증빙·문서 만료 관리",
  automation_monitoring: "자동화 모니터링",
  undecided: "상담 후 결정",
};

let pool;
let schemaReady;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getPool() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    const usesLocalDatabase = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      max: 1,
      ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function ensureSchema(client) {
  if (schemaReady) return;

  await client.query(`
    create table if not exists applications (
      id bigserial primary key,
      created_at timestamptz not null default now(),
      status text not null default 'new',
      name text not null,
      organization text,
      email text not null,
      phone text,
      service_type text not null,
      preferred_contact text not null default 'email',
      message text not null,
      consent boolean not null default true,
      source text not null default 'landing',
      owner_email_subject text not null,
      owner_email_body text not null,
      customer_email_subject text not null,
      customer_email_body text not null,
      notification_status text not null default 'not_configured',
      notification_sent_at timestamptz,
      notification_error text,
      ip_hash text,
      user_agent text
    )
  `);
  await client.query("create index if not exists applications_created_at_idx on applications (created_at desc)");
  await client.query("create index if not exists applications_status_idx on applications (status)");
  await client.query("create index if not exists applications_service_type_idx on applications (service_type)");

  schemaReady = true;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.socket?.remoteAddress || "");
  if (!ip) return null;

  const salt = process.env.IP_HASH_SALT || "winglia";
  return crypto.createHash("sha256").update(`${salt}:${ip.split(",")[0].trim()}`).digest("hex");
}

function normalizePayload(body) {
  const serviceType = clean(body.serviceType, 80);
  const preferredContact = clean(body.preferredContact || "email", 40);

  return {
    name: clean(body.name, 80),
    organization: clean(body.organization, 120),
    email: clean(body.email, 120).toLowerCase(),
    phone: clean(body.phone, 60),
    serviceType: SERVICE_LABELS[serviceType] ? serviceType : "undecided",
    preferredContact,
    message: cleanMultiline(body.message, 3000),
    consent: body.consent === true || body.consent === "true" || body.consent === "on",
    website: clean(body.website, 120),
  };
}

function validate(payload) {
  const errors = [];
  if (!payload.name) errors.push("이름을 입력해주세요.");
  if (!payload.email || !isEmail(payload.email)) errors.push("답변 받을 이메일을 정확히 입력해주세요.");
  if (!payload.message || payload.message.length < 10) errors.push("현재 상황과 원하는 결과를 10자 이상 적어주세요.");
  if (!payload.consent) errors.push("개인정보 수집 및 업무 검토 목적 이용에 동의해주세요.");
  return errors;
}

function buildEmailTemplates(payload) {
  const serviceLabel = SERVICE_LABELS[payload.serviceType];
  const requester = payload.organization ? `${payload.organization} / ${payload.name}` : payload.name;
  const ownerSubject = `[Winglia 신청] ${serviceLabel} - ${requester}`;
  const ownerBody = [
    "Winglia 신규 업무 의뢰가 접수되었습니다.",
    "",
    `이름: ${payload.name}`,
    `조직/상호: ${payload.organization || "-"}`,
    `이메일: ${payload.email}`,
    `연락처: ${payload.phone || "-"}`,
    `희망 연락 방식: ${payload.preferredContact}`,
    `신청 업무: ${serviceLabel}`,
    "",
    "[현재 상황 / 원하는 결과]",
    payload.message,
    "",
    "권장 첫 응답:",
    "1. 접수 확인",
    "2. 필요한 자료 1~3개 요청",
    "3. 처리 가능 범위와 예상 산출물 안내",
  ].join("\n");

  const customerSubject = "[Winglia] 업무 의뢰가 접수되었습니다";
  const customerBody = [
    `${payload.name}님, Winglia 업무 의뢰가 접수되었습니다.`,
    "",
    "보내주신 내용을 기준으로 처리 가능 범위, 예상 산출물, 진행 방식을 확인하겠습니다.",
    "보통 48시간 안에 답변드리며, 추가 자료가 필요하면 입력하신 이메일로 안내드립니다.",
    "",
    `신청 업무: ${serviceLabel}`,
    "",
    "Winglia",
  ].join("\n");

  return { ownerSubject, ownerBody, customerSubject, customerBody };
}

async function sendOwnerNotification({ subject, body, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const to = process.env.OWNER_EMAIL;

  if (!apiKey || !from || !to) {
    return { status: "not_configured", error: null };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: body,
      reply_to: replyTo,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { status: "failed", error: errorText.slice(0, 1000) };
  }

  return { status: "sent", error: null };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return json(res, 204, {});
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "POST 요청만 지원합니다." });
  }

  let payload;
  try {
    payload = normalizePayload(await readBody(req));
  } catch {
    return json(res, 400, { ok: false, message: "요청 형식이 올바르지 않습니다." });
  }

  if (payload.website) {
    return json(res, 200, { ok: true, message: "접수되었습니다." });
  }

  const errors = validate(payload);
  if (errors.length) {
    return json(res, 400, { ok: false, message: errors.join(" ") });
  }

  const templates = buildEmailTemplates(payload);

  let client;
  try {
    const db = getPool();
    client = await db.connect();
    await ensureSchema(client);

    const insertResult = await client.query(
      `
        insert into applications (
          name,
          organization,
          email,
          phone,
          service_type,
          preferred_contact,
          message,
          consent,
          owner_email_subject,
          owner_email_body,
          customer_email_subject,
          customer_email_body,
          ip_hash,
          user_agent
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        returning id
      `,
      [
        payload.name,
        payload.organization || null,
        payload.email,
        payload.phone || null,
        payload.serviceType,
        payload.preferredContact,
        payload.message,
        payload.consent,
        templates.ownerSubject,
        templates.ownerBody,
        templates.customerSubject,
        templates.customerBody,
        hashIp(req),
        clean(req.headers["user-agent"], 500) || null,
      ]
    );

    const applicationId = insertResult.rows[0].id;
    const notification = await sendOwnerNotification({
      subject: templates.ownerSubject,
      body: templates.ownerBody,
      replyTo: payload.email,
    });

    await client.query(
      `
        update applications
        set notification_status = $1,
            notification_sent_at = case when $1 = 'sent' then now() else notification_sent_at end,
            notification_error = $2
        where id = $3
      `,
      [notification.status, notification.error, applicationId]
    );

    return json(res, 200, {
      ok: true,
      id: applicationId,
      message: "접수되었습니다. 확인 후 48시간 안에 안내드리겠습니다.",
      notificationStatus: notification.status,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      message: "접수 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    if (client) client.release();
  }
};
