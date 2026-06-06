const { requireAdmin } = require("../_lib/auth");
const { SERVICE_LABELS, STATUS_LABELS, withClient } = require("../_lib/db");
const { json } = require("../_lib/http");

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "GET 요청만 지원합니다." });
  }

  try {
    const result = await withClient((client) =>
      client.query(`
        select
          id,
          created_at,
          updated_at,
          status,
          service_type,
          name,
          organization,
          email,
          phone,
          preferred_contact,
          message,
          admin_note,
          next_action
        from applications
        order by created_at desc
      `)
    );

    const headers = [
      "DB ID",
      "접수일시",
      "수정일시",
      "상태",
      "업무유형",
      "이름",
      "조직/상호",
      "이메일",
      "연락처",
      "선호 연락 방식",
      "문의내용",
      "처리메모",
      "다음 액션",
    ];

    const rows = result.rows.map((row) => [
      row.id,
      row.created_at,
      row.updated_at,
      STATUS_LABELS[row.status] || row.status,
      SERVICE_LABELS[row.service_type] || row.service_type,
      row.name,
      row.organization,
      row.email,
      row.phone,
      row.preferred_contact,
      row.message,
      row.admin_note,
      row.next_action,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="winglia-applications-${Date.now()}.csv"`);
    return res.end(`\uFEFF${csv}`);
  } catch (error) {
    return json(res, 500, { ok: false, message: error.message });
  }
};
