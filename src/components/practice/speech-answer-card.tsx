"use client";

import { useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { highlightTokens } from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * 轻量录音答题卡片（诊断/引导用）。
 * 复用 useSpeechRecognition + 字幕高亮，但不带词级统计面板。
 */
export function SpeechAnswerCard({
  question: _question,
  onResult,
}: {
  question: string;
  onResult: (text: string) => void;
}) {
  const { t } = useT();
  const speech = useSpeechRecognition("en-US");
  const fullTextRef = useRef("");
  const interimRef = useRef("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    speech.setOnResult((result) => {
      if (result.isFinal) {
        fullTextRef.current = fullTextRef.current
          ? `${fullTextRef.current} ${result.text}`
          : result.text;
        interimRef.current = "";
        onResultRef.current(fullTextRef.current);
      } else {
        interimRef.current = result.text;
      }
    });
  }, [speech]);

  function handleStart() {
    fullTextRef.current = "";
    interimRef.current = "";
    onResultRef.current("");
    speech.start();
  }

  const showText = fullTextRef.current || interimRef.current;

  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-[90px] rounded-xl border border-border bg-muted/40 p-3">
        {speech.supported ? (
          showText ? (
            <p
              className="text-base leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: highlightTokens(
                  `${fullTextRef.current}${interimRef.current ? " " + interimRef.current : ""}`,
                ),
              }}
            />
          ) : (
            <p className="text-sm text-tertiary-text">
              {speech.state === "listening"
                ? "正在聆听…"
                : "点击下方按钮开始作答"}
            </p>
          )
        ) : (
          <p className="text-sm text-secondary-text">
            {speech.unsupportedReason === "insecure-context"
              ? t("practice.micInsecure")
              : t("practice.micUnsupported")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {speech.state === "idle" || speech.state === "error" ? (
          <Button
            onClick={handleStart}
            className="rounded-full"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            {t("practice.start")}
          </Button>
        ) : (
          <Button
            onClick={() => {
              speech.stop();
              onResultRef.current(fullTextRef.current);
            }}
            className="rounded-full"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {t("practice.stop")}
          </Button>
        )}
        {fullTextRef.current ? (
          <span className="text-xs text-tertiary-text">
            {fullTextRef.current.split(/\s+/).length} {t("common.words")}
          </span>
        ) : null}
      </div>

      {speech.error && speech.state === "error" ? (
        <p className="text-xs text-[var(--filler-color)]">{speech.error}</p>
      ) : null}
    </div>
  );
}
