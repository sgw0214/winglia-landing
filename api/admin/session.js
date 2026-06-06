const { requireAdmin } = require("../_lib/auth");
const { json } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "GET 요청만 지원합니다." });
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  return json(res, 200, { ok: true, expiresAt: session.exp });
};
