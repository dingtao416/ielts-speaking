// 本地开发环境准备脚本：生成 .env.local（若缺失必需键）+ 提示。
// 用法: node scripts/prepare-env.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const examplePath = join(root, ".env.local.example");

const missing = [];
let content = "";

if (existsSync(envPath)) {
  content = readFileSync(envPath, "utf-8");
} else if (existsSync(examplePath)) {
  content = readFileSync(examplePath, "utf-8");
} else {
  console.error("找不到 .env.local.example");
  process.exit(1);
}

const pattern = /^([A-Z0-9_]+)=.*$/gm;
const defined = new Set();
for (const m of content.matchAll(pattern)) {
  if (m[1].trim()) defined.add(m[1]);
}

if (!defined.has("BETTER_AUTH_SECRET") && !/BETTER_AUTH_SECRET=.+/.test(content)) {
  missing.push("BETTER_AUTH_SECRET");
}

const assignments = [
  ["IELTS_PUBLIC_BASE_URL", "http://localhost:3000"],
  ["BETTER_AUTH_URL", "http://localhost:3000"],
  ["BETTER_AUTH_SECRET", randomBytes(32).toString("base64url")],
];

for (const [key, value] of assignments) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    if (/^[A-Z0-9_]+=\s*$/m.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    }
  } else {
    content += `\n${key}=${value}`;
  }
}

writeFileSync(envPath, content.trimEnd() + "\n", "utf-8");
console.log(`✓ .env.local 已准备 (${missing.length ? `新增 ${missing.join(", ")}` : "无缺失"})`);
console.log("下一步: docker 不需要；请确保本机 PostgreSQL 在 5432 运行并已创建 ielts 库。");
console.log("运行 npm run db:migrate 初始化表结构，然后 npm run dev。");
