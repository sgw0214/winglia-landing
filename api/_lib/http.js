function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

module.exports = {
  clean,
  cleanMultiline,
  json,
  readBody,
};
