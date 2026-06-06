const { createSessionCookie, verifyAdminPassword } = require("../_lib/auth");
const { json, readBody } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "POST 요청만 지원합니다." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, message: "요청 형식이 올바르지 않습니다." });
  }

  const password = String(body.password || "").slice(0, 200);
  if (!password) {
    return json(res, 400, { ok: false, message: "관리자 비밀번호를 입력해주세요." });
  }

  try {
    if (!(await verifyAdminPassword(password))) {
      return json(res, 401, { ok: false, message: "비밀번호가 올바르지 않습니다." });
    }
  } catch (error) {
    return json(res, 500, { ok: false, message: error.message });
  }

  res.setHeader("Set-Cookie", createSessionCookie(req));
  return json(res, 200, { ok: true, message: "로그인되었습니다." });
};
