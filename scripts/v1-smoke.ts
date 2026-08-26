// V1 数据层冒烟：验证熟悉话题/标准话题加载器与题组解析（tsx scripts/v1-smoke.ts）
import {
  getFamiliarCategories,
  getFamiliarSet,
  getFamiliarSetVersion,
  getStandardTopicSets,
  getStandardTopicSetsByScope,
  getStandardTopicYears,
  getStandardTopicSetById,
  getDiagnosticTopicSets,
  resolveStandardTopicSet,
  getStandardBankVersion,
} from "../src/lib/bank";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// 熟悉话题
const familiarVersion = getFamiliarSetVersion();
check("familiar version", typeof familiarVersion === "string" && familiarVersion.length > 0, familiarVersion);
const cats = getFamiliarCategories();
check("familiar categories = 3", cats.length === 3, `${cats.length}`);
for (const c of cats) {
  check(
    `category ${c.id}: 3-4 questions`,
    c.questions.length >= 3 && c.questions.length <= 4,
    `${c.questions.length} 题`,
  );
  check(
    `category ${c.id}: unique ids`,
    new Set(c.questions.map((q) => q.id)).size === c.questions.length,
  );
}
check("getFamiliarSet(work_study)", getFamiliarSet("work_study") !== null);
check("getFamiliarSet(bad)", getFamiliarSet("nope") === null);

// 标准话题
const version = getStandardBankVersion();
check("standard bankVersion", typeof version === "string" && version.length > 0, version);
const sets = getStandardTopicSets();
check("standard sets published >= 15", sets.length >= 15, `${sets.length} 组`);
const years = getStandardTopicYears();
check("standard years desc", years.every((y, i) => i === 0 || years[i - 1] > y), years.join(","));
const latest = getStandardTopicSetsByScope("latest");
check("latest sets = 5", latest.length === 5, `${latest.length}`);
const diag = getDiagnosticTopicSets();
check("diagnostic sets = 2", diag.length === 2, `${diag.length}`);
const diagResolved = diag.map((s) => resolveStandardTopicSet(s));
const diagTotal = diagResolved.reduce((n, s) => n + s.questions.length, 0);
check("diagnostic total = 8", diagTotal === 8, `${diagTotal} 题`);
check("diagnostic questions resolvable", diagResolved.every((s) => s.questions.length === 4));

// 全部题组 id 可解析且题量 3-4
for (const s of sets) {
  const r = resolveStandardTopicSet(s);
  check(
    `set ${s.id}: ${r.questions.length}/${s.questionIds.length} resolved (3-4)`,
    r.questions.length >= 3 && r.questions.length <= 4 && r.questions.length === s.questionIds.length,
    `topic=${s.topic} scope=${s.scope}`,
  );
}
check("getStandardTopicSetById(st-latest-hometown)", getStandardTopicSetById("st-latest-hometown") !== null);
check("getStandardTopicSetById(bad)", getStandardTopicSetById("nope") === null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
