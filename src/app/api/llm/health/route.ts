import { NextResponse } from "next/server";

import { getLlmConfig } from "@/lib/llm";

export const runtime = "nodejs";

export async function GET() {
  const config = getLlmConfig();
  return NextResponse.json({
    provider: config.provider,
    model: config.model,
    configured: config.configured,
  });
}
