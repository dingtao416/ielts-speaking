import { eq } from "drizzle-orm";

import { getDatabase } from "@/persistence/database";
import { user } from "@/persistence/schema";
import { activeStageBand } from "@/lib/profile";

/**
 * 当前训练档案（V1 PRD §7 UserProfile）：
 * 只由标准题诊断/复测更新；日常练习只读取。
 */
export interface StageState {
  finalGoalBand: number | null;
  currentBand: number | null;
  activeStageBand: number;
  diagnosticStatus: string; // none | in_progress | completed
}

/**
 * 读取用户当前训练档位：
 * 优先读 V1 列（final_goal_band/current_band/active_stage_band），
 * 回退到旧 AbilityProfile（targetBand/overallBand），最终默认 6.5。
 */
export async function readStageState(userId: string): Promise<StageState> {
  const db = getDatabase().db;
  const [row] = await db
    .select({
      finalGoalBand: user.finalGoalBand,
      currentBand: user.currentBand,
      activeStageBand: user.activeStageBand,
      diagnosticStatus: user.diagnosticStatus,
      targetBand: user.targetBand,
      profile: user.profile,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    return {
      finalGoalBand: null,
      currentBand: null,
      activeStageBand: 6.5,
      diagnosticStatus: "none",
    };
  }

  const finalGoalBand =
    row.finalGoalBand != null ? Number(row.finalGoalBand) : row.targetBand != null ? Number(row.targetBand) : null;
  const currentBand =
    row.currentBand != null
      ? Number(row.currentBand)
      : row.profile?.overallBand != null
        ? Number(row.profile.overallBand)
        : null;
  const active =
    row.activeStageBand != null
      ? Number(row.activeStageBand)
      : activeStageBand(
          currentBand ?? undefined,
          finalGoalBand ?? undefined,
        );

  return {
    finalGoalBand,
    currentBand,
    activeStageBand: active,
    diagnosticStatus: row.diagnosticStatus ?? "none",
  };
}
