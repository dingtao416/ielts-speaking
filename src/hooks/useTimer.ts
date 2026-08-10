"use client";

import { useEffect, useRef, useState } from "react";

/** 秒表计时 hook（练习时长） */
export function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [running]);

  const start = () => {
    setElapsed(0);
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const stop = () => {
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    setElapsed(0);
  };

  return { elapsed, running, start, pause, resume, stop, reset };
}

/** 倒计时 hook（如 Part 2 的准备时间） */
export function useCountdown(seconds: number, onComplete?: () => void) {
  const [remaining, setRemaining] = useState(seconds);
  const [active, setActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      return;
    }
    setRemaining(seconds);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          setActive(false);
          onCompleteRef.current?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [active, seconds]);

  const startCountdown = () => setActive(true);
  const resetCountdown = () => {
    setActive(false);
    setRemaining(seconds);
  };

  return { remaining, active, startCountdown, resetCountdown };
}
