import { eq, desc } from "drizzle-orm";

import { getDatabase } from "@/persistence/database";
import { user, sessionRecords, type AbilityProfile, type BandScores } from "@/persistence/schema";
import { roundHalf, buildStagePath } from "@/lib/profile";

/**
 * 单次练习后更新用户能力档案。
 * 规则：
 * - 综合水平用近期多次加权平均（新权重高，平滑过渡）
 * - 四维 band 用最近 5 次均值
 * - 更新 mainIssues（取本次 + 保留历史核心问题）
 */
export async function updateProfileFromSession(
  userId: string,
  bands: BandScores,
  mainIssues: string[],
): Promise<AbilityProfile | null> {
  const db = getDatabase().db;

  // 读当前档案
  const [userRow] = await db
    .select({ targetBand: user.targetBand, profile: user.profile })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userRow) return null;
  const current = userRow.profile;
  const targetBand = userRow.targetBand ? Number(userRow.targetBand) : 6.5;

  // 取最近 5 次的 bands（含本次还没存，先查历史）
  const recent = await db
    .select({ bands: sessionRecords.bands })
    .from(sessionRecords)
    .where(eq(sessionRecords.userId, userId))
    .orderBy(desc(sessionRecords.createdAt))
    .limit(5);

  const recentBands = recent
    .map((r) => r.bands)
    .filter((b): b is BandScores => Boolean(b));

  // 综合水平：本次 + 历史 加权平均
  const series = [bands.overall, ...recentBands.map((b) => b.overall)].slice(0, 5);
  const weights = [0.4, 0.25, 0.15, 0.12, 0.08].slice(0, series.length);
  const wSum = weights.reduce((s, w) => s + w, 0);
  const weighted = series.reduce((s, b, i) => s + b * weights[i], 0) / wSum;
  // 与当前平滑
  const overall = roundHalf((current?.overallBand ?? 5.0) * 0.3 + weighted * 0.7);

  // 四维：最近几次均值
  const allBands = [...recentBands, bands].slice(0, 5);
  const dimAvg = (key: keyof BandScores) =>
    roundHalf(allBands.reduce((s, b) => s + (b[key] as number), 0) / allBands.length);

  const dimensions: BandScores = {
    fluency: dimAvg("fluency"),
    lexical: dimAvg("lexical"),
    grammar: dimAvg("grammar"),
    pronunciation: dimAvg("pronunciation"),
    overall,
  };

  // mainIssues：本次 + 历史，去重合并（保留最多 5 条）
  const merged = [...(mainIssues ?? []), ...(current?.mainIssues ?? [])];
  const unique = [...new Set(merged)].slice(0, 5);

  const profile: AbilityProfile = {
    overallBand: overall,
    targetBand,
    dimensions,
    mainIssues: unique,
    stagePath: current?.stagePath?.length
      ? current.stagePath
      : buildStagePath(overall, targetBand),
    updatedAt: new Date().toISOString(),
  };

  await db
    .update(user)
    .set({ profile })
    .where(eq(user.id, userId));

  return profile;
}
