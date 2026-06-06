const { clearSessionCookie, requireAdmin, setAdminPassword, verifyAdminPassword } = require("../_lib/auth");
const { json, readBody } = require("../_lib/http");

function validatePassword(password) {
  if (password.length < 12) return "새 비밀번호는 12자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "새 비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.";
  }
  return "";
}

module.exports = async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "POST 요청만 지원합니다." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, message: "요청 형식이 올바르지 않습니다." });
  }

  const currentPassword = String(body.currentPassword || "").slice(0, 200);
  const newPassword = String(body.newPassword || "").slice(0, 200);
  const confirmPassword = String(body.confirmPassword || "").slice(0, 200);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return json(res, 400, { ok: false, message: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." });
  }

  if (newPassword !== confirmPassword) {
    return json(res, 400, { ok: false, message: "새 비밀번호 확인이 일치하지 않습니다." });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return json(res, 400, { ok: false, message: passwordError });
  }

  try {
    if (!(await verifyAdminPassword(currentPassword))) {
      return json(res, 401, { ok: false, message: "현재 비밀번호가 올바르지 않습니다." });
    }

    await setAdminPassword(newPassword);
    res.setHeader("Set-Cookie", clearSessionCookie());
    return json(res, 200, { ok: true, message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해주세요." });
  } catch (error) {
    return json(res, 500, { ok: false, message: error.message });
  }
};
