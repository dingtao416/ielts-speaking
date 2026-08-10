import { NextResponse } from "next/server";

import { chatComplete, parseJsonFromLlm } from "@/lib/llm";
import { getFiveTierPrompt } from "@/lib/prompts";
import { getQuestionById } from "@/lib/bank";
import { readAuthenticatedActor } from "@/application/authentication";
import { getDatabase } from "@/persistence/database";
import { user, frameworks } from "@/persistence/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

// 五层目标级回答：原文→结构化→可改进→目标级→提升步骤
export async function POST(request: Request) {
  try {
    const actor = await readAuthenticatedActor(request.headers);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const questionId: string = body?.questionId;
    const fullText: string = body?.fullText;

    if (!questionId || !fullText || typeof fullText !== "string") {
      return NextResponse.json(
        { error: "questionId and fullText are required" },
        { status: 400 },
      );
    }

    const question = getQuestionById(questionId);
    if (!question) {
      return NextResponse.json({ error: "question not found" }, { status: 404 });
    }

    // 读用户档案（当前水平 + 目标分）
    const db = getDatabase().db;
    const [userRow] = await db
      .select({ targetBand: user.targetBand, profile: user.profile })
      .from(user)
      .where(eq(user.id, actor.userId))
      .limit(1);

    const targetBand = userRow?.targetBand ? Number(userRow.targetBand) : 6.5;
    const currentBand = userRow?.profile?.overallBand ?? 5.0;
    const mainIssues = userRow?.profile?.mainIssues ?? [];

    // 找该话题已有的框架（用于复用故事素材）
    const [frameworkRow] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.userId, actor.userId))
      .orderBy(frameworks.updatedAt)
      .limit(20);

    const framework = frameworkRow
      ? {
          structure: frameworkRow.structure ?? [],
          keyPoints: frameworkRow.keyPoints ?? [],
          expressions: frameworkRow.expressions ?? [],
          stories: frameworkRow.stories ?? [],
        }
      : null;

    const prompt = getFiveTierPrompt(question, fullText, {
      targetBand,
      currentBand,
      framework,
      mainIssues,
    });

    const content = await chatComplete(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      { maxTokens: 2500, temperature: 0.4 },
    );

    const parsed = parseJsonFromLlm<{
      original?: string;
      structured?: string;
      improvable?: string;
      target?: string;
      steps?: string[];
      focus?: string;
    }>(content);

    return NextResponse.json({
      original: parsed.original ?? fullText,
      structured: parsed.structured ?? "",
      improvable: parsed.improvable ?? "",
      target: parsed.target ?? "",
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      focus: parsed.focus ?? "",
      targetBand,
      currentBand,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "生成目标级回答失败" },
      { status: 500 },
    );
  }
}
