"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

import {
  speechErrorMessageKey,
  useSpeechRecognition,
} from "@/hooks/useSpeechRecognition";
import { countUnits, highlightTokens, langFromAsr } from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { Button } from "@/components/ui/button";

/**
 * 轻量录音答题卡片（诊断/引导用）。
 * 复用 useSpeechRecognition + 字幕高亮，但不带词级统计面板。
 */
export function SpeechAnswerCard({
  question: _question,
  onResult,
  lang,
}: {
  question: string;
  onResult: (text: string) => void;
  lang?: string;
}) {
  const { t } = useT();
  const configuredAsrLang = useSettingsStore((s) => s.asrLang);
  const asrLang = lang ?? configuredAsrLang;
  const speech = useSpeechRecognition(asrLang);
  const fullTextRef = useRef("");
  const interimRef = useRef("");
  const [displayText, setDisplayText] = useState("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    speech.setOnResult((result) => {
      if (result.isFinal) {
        fullTextRef.current = fullTextRef.current
          ? `${fullTextRef.current} ${result.text}`
          : result.text;
        interimRef.current = "";
        setDisplayText(fullTextRef.current);
        onResultRef.current(fullTextRef.current);
      } else {
        interimRef.current = result.text;
        setDisplayText(
          `${fullTextRef.current}${fullTextRef.current && result.text ? " " : ""}${result.text}`,
        );
      }
    });
  }, [speech]);

  function handleStart() {
    fullTextRef.current = "";
    interimRef.current = "";
    setDisplayText("");
    onResultRef.current("");
    speech.start();
  }

  const showText = displayText;

  return (
    <div className="flex flex-col gap-3">
      <div className="min-h-[90px] rounded-xl border border-border bg-muted/40 p-3">
        {speech.supported ? (
          showText ? (
            <p
              className="text-base leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: highlightTokens(
                  showText,
                  langFromAsr(asrLang),
                ),
              }}
            />
          ) : (
            <p className="text-sm text-tertiary-text">
              {speech.state === "listening"
                ? t("practice.speechCard.listening")
                : t("practice.speechCard.startHint")}
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
            {countUnits(fullTextRef.current, langFromAsr(asrLang))} {t("common.words")}
          </span>
        ) : null}
      </div>

      {speech.error && speech.state === "error" ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-xl border border-[var(--danger-color)]/30 bg-[var(--danger-color)]/5 p-3"
        >
          <p className="text-xs leading-relaxed text-[var(--danger-color)]">
            {t(speechErrorMessageKey(speech.error))}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStart}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
