const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const roots = ["api", "admin", "script.js"];

function collectJs(target, files = []) {
  const stat = fs.statSync(target);
  if (stat.isFile() && target.endsWith(".js")) {
    files.push(target);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(target)) {
    collectJs(path.join(target, entry), files);
  }

  return files;
}

const files = roots.flatMap((root) => collectJs(root));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${files.length} JavaScript files.`);
