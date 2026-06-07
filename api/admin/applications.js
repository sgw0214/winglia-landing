const { requireAdmin } = require("../_lib/auth");
const { SERVICE_LABELS, STATUS_LABELS, withClient } = require("../_lib/db");
const { clean, cleanMultiline, json, readBody } = require("../_lib/http");

const MAX_LIMIT = 200;

function parseQuery(req) {
  const url = new URL(req.url, `https://${req.headers.host || "winglia.local"}`);
  return {
    status: clean(url.searchParams.get("status") || "all", 40),
    q: clean(url.searchParams.get("q") || "", 120),
    limit: Math.min(Number(url.searchParams.get("limit") || 80) || 80, MAX_LIMIT),
  };
}

function normalizeRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    name: row.name,
    organization: row.organization || "",
    email: row.email,
    phone: row.phone || "",
    serviceType: row.service_type,
    serviceLabel: SERVICE_LABELS[row.service_type] || row.service_type,
    preferredContact: row.preferred_contact,
    message: row.message,
    adminNote: row.admin_note || "",
    nextAction: row.next_action || "",
    notificationStatus: row.notification_status,
  };
}

async function listApplications(req, res) {
  const { status, q, limit } = parseQuery(req);
  const allowedStatus = STATUS_LABELS[status] ? status : "all";
  const search = q ? `%${q}%` : null;

  const result = await withClient((client) =>
    client.query(
      `
        select
          id,
          created_at,
          updated_at,
          status,
          name,
          organization,
          email,
          phone,
          service_type,
          preferred_contact,
          message,
          admin_note,
          next_action,
          notification_status
        from applications
        where ($1::text = 'all' or status = $1)
          and (
            $2::text is null
            or name ilike $2
            or coalesce(organization, '') ilike $2
            or email ilike $2
            or message ilike $2
          )
        order by created_at desc
        limit $3
      `,
      [allowedStatus, search, limit]
    )
  );

  return json(res, 200, {
    ok: true,
    applications: result.rows.map(normalizeRow),
    statusLabels: STATUS_LABELS,
    serviceLabels: SERVICE_LABELS,
  });
}

async function updateApplication(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, message: "요청 형식이 올바르지 않습니다." });
  }

  const id = Number(body.id);
  const status = clean(body.status, 40);
  const adminNote = cleanMultiline(body.adminNote, 3000);
  const nextAction = cleanMultiline(body.nextAction, 1000);

  if (!Number.isInteger(id) || id <= 0) {
    return json(res, 400, { ok: false, message: "신청 ID가 올바르지 않습니다." });
  }

  if (!STATUS_LABELS[status]) {
    return json(res, 400, { ok: false, message: "상태값이 올바르지 않습니다." });
  }

  const result = await withClient((client) =>
    client.query(
      `
        update applications
        set status = $1,
            admin_note = $2,
            next_action = $3,
            updated_at = now()
        where id = $4
        returning
          id,
          created_at,
          updated_at,
          status,
          name,
          organization,
          email,
          phone,
          service_type,
          preferred_contact,
          message,
          admin_note,
          next_action,
          notification_status
      `,
      [status, adminNote, nextAction, id]
    )
  );

  if (!result.rowCount) {
    return json(res, 404, { ok: false, message: "신청을 찾을 수 없습니다." });
  }

  return json(res, 200, { ok: true, application: normalizeRow(result.rows[0]) });
}

async function deleteApplication(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "winglia.local"}`);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return json(res, 400, { ok: false, message: "삭제할 신청 ID가 올바르지 않습니다." });
  }

  const result = await withClient((client) =>
    client.query("delete from applications where id = $1 returning id", [id])
  );

  if (!result.rowCount) {
    return json(res, 404, { ok: false, message: "삭제할 신청을 찾을 수 없습니다." });
  }

  return json(res, 200, { ok: true, id });
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  try {
    if (req.method === "GET") return await listApplications(req, res);
    if (req.method === "PATCH") return await updateApplication(req, res);
    if (req.method === "DELETE") return await deleteApplication(req, res);
    return json(res, 405, { ok: false, message: "GET, PATCH 또는 DELETE 요청만 지원합니다." });
  } catch (error) {
    return json(res, 500, { ok: false, message: error.message });
  }
};
