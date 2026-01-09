"use client";

import { useEffect } from "react";
import { createIdleTimer } from "@/lib/utils/idleTimer";

export function useIdleLock(enabled: boolean, timeoutMs: number, onIdle: () => void) {
  useEffect(() => {
    if (!enabled) return;

    const timer = createIdleTimer({ timeoutMs, onIdle });
    timer.start();

    return () => timer.stop();
  }, [enabled, timeoutMs, onIdle]);
}
