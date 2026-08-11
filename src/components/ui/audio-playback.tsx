"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { useT } from "@/lib/i18n";

function formatTime(s: number) {
  const secs = Math.max(0, Math.floor(s));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/**
 * 自绘音频播放条：播放/暂停 + 进度 + 时长。
 * 替代原生 <audio controls>，视觉与交互对齐全站设计系统。
 */
export function AudioPlayback({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const { t } = useT();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(a.currentTime);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play();
      setPlaying(true);
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const label = playing ? t("common.pause") : t("common.play");

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />
        )}
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-xs tabular-nums text-tertiary-text">
        {playing ? formatTime(current) : formatTime(duration || 0)}
      </span>
    </div>
  );
}
