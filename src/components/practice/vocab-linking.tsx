"use client";

import {
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { highlightVagueOnly, langFromAsr } from "@/lib/lexicon";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 转录稿中可交互的黄色词汇词事件（事件委托，经 [data-vague] 取词）。
 */
export interface VocabTranscriptHandlers {
  onMouseOver: (e: MouseEvent) => void;
  onMouseOut: (e: MouseEvent) => void;
  onClick: (e: MouseEvent) => void;
  onFocus: (e: FocusEvent) => void;
  onBlur: (e: FocusEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

/**
 * 黄色标注词联动：悬停瞬态筛选 + 点击固定选中。
 * 生效值 active = hover ?? selected（悬停临时覆盖，移开后回到固定词）。
 * 黄色词由 dangerouslySetInnerHTML 渲染，无法挂逐词处理器，
 * 统一用容器事件委托：e.target.closest("[data-vague]") 取词。
 */
export function useVocabLinking() {
  const [hoverVocab, setHoverVocab] = useState<string | null>(null);
  const [selectedVocab, setSelectedVocab] = useState<string | null>(null);
  const active = hoverVocab ?? selectedVocab;

  function vocabFromEvent(e: MouseEvent | FocusEvent | KeyboardEvent) {
    const el = (e.target as HTMLElement).closest?.("[data-vague]");
    return el ? el.getAttribute("data-vague") : null;
  }

  const transcriptHandlers: VocabTranscriptHandlers = {
    onMouseOver: (e) => {
      const v = vocabFromEvent(e);
      if (v) setHoverVocab(v);
    },
    onMouseOut: (e) => {
      const v = vocabFromEvent(e);
      if (v) setHoverVocab(null);
    },
    onClick: (e) => {
      const v = vocabFromEvent(e);
      if (v) setSelectedVocab((prev) => (prev === v ? null : v));
    },
    onFocus: (e) => {
      const v = vocabFromEvent(e);
      if (v) setHoverVocab(v);
    },
    onBlur: (e) => {
      const v = vocabFromEvent(e);
      if (v) setHoverVocab(null);
    },
    onKeyDown: (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const v = vocabFromEvent(e);
      if (v) {
        e.preventDefault();
        setSelectedVocab((prev) => (prev === v ? null : v));
      }
    },
  };

  /** 汇总词条：悬停瞬态筛选 */
  const onItemHover = (original: string | null) => setHoverVocab(original);
  /** 汇总词条：点击固定选中（toggle） */
  const onItemClick = (original: string) =>
    setSelectedVocab((prev) => (prev === original ? null : original));

  const reset = () => {
    setHoverVocab(null);
    setSelectedVocab(null);
  };

  return { active, transcriptHandlers, onItemHover, onItemClick, reset };
}

/** 带黄色词汇标记的可交互转录稿（悬停/点击/聚焦联动）。 */
export function VocabLinkedTranscript({
  transcript,
  handlers,
  className,
}: {
  transcript: string;
  handlers: VocabTranscriptHandlers;
  className?: string;
}) {
  const asrLang = useSettingsStore((s) => s.asrLang);
  const lang = langFromAsr(asrLang);
  return (
    <p
      className={className}
      onMouseOver={handlers.onMouseOver}
      onMouseOut={handlers.onMouseOut}
      onClick={handlers.onClick}
      onFocus={handlers.onFocus}
      onBlur={handlers.onBlur}
      onKeyDown={handlers.onKeyDown}
      dangerouslySetInnerHTML={{
        __html: highlightVagueOnly(transcript, lang, { interactive: true }),
      }}
    />
  );
}

interface VocabHighlightItem {
  original: string;
  suggestion: string;
  note?: string;
}

/**
 * 标黄词汇汇总：按 active 联动筛选，只展示对应词条；命中的词条加「已联动」高亮。
 * 词条本身支持悬停（瞬态）/点击（固定）。
 */
export function VocabSummaryList({
  highlights,
  active,
  onItemHover,
  onItemClick,
}: {
  highlights: VocabHighlightItem[];
  active: string | null;
  onItemHover: (original: string | null) => void;
  onItemClick: (original: string) => void;
}) {
  const { t } = useT();
  const visible = highlights.filter((v) => !active || v.original === active);

  if (visible.length === 0) {
    return <p className="text-sm text-tertiary-text">{t("aiCoach.noVocab")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((v, i) => {
        const linked = v.original === active;
        return (
          <li
            key={i}
            className={`flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              linked
                ? "bg-[var(--vague-color)]/10 ring-2 ring-[var(--vague-color)]"
                : "bg-muted/40"
            }`}
            onMouseEnter={() => onItemHover(v.original)}
            onMouseLeave={() => onItemHover(null)}
            onClick={() => onItemClick(v.original)}
          >
            <span className="font-medium text-foreground">{v.original}</span>
            <span className="text-secondary-text">→</span>
            <span className="font-medium text-[var(--vague-color)]">
              {v.suggestion}
            </span>
            {v.note ? (
              <span className="w-full text-xs text-tertiary-text">
                {v.note}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
