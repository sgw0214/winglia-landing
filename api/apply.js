const crypto = require("crypto");
const { SERVICE_LABELS, withClient } = require("./_lib/db");
const { clean, cleanMultiline, json, readBody } = require("./_lib/http");

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

  try {
    const applicationId = await withClient(async (client) => {
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
            notification_status,
            ip_hash,
            user_agent
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          "admin_queue",
          hashIp(req),
          clean(req.headers["user-agent"], 500) || null,
        ]
      );
      return insertResult.rows[0].id;
    });

    return json(res, 200, {
      ok: true,
      id: applicationId,
      message: "접수되었습니다. 확인 후 48시간 안에 안내드리겠습니다.",
      notificationStatus: "admin_queue",
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      message: "접수 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
