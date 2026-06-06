const { clearSessionCookie } = require("../_lib/auth");
const { json } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "POST 요청만 지원합니다." });
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return json(res, 200, { ok: true, message: "로그아웃되었습니다." });
};
