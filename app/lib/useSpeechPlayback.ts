"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TtsGender } from "./tts";
import { createTtsSession, type TtsSessionState } from "./ttsSession";

export function useSpeechPlayback(gender: TtsGender, onStart: () => void, onEnd: () => void) {
  const callbacks = useRef({ onStart, onEnd });
  useEffect(() => { callbacks.current = { onStart, onEnd }; });
  const sessionRef = useRef<ReturnType<typeof createTtsSession> | null>(null);
  const mountedRef = useRef(false);
  const [state, setState] = useState<TtsSessionState>({ busy: false, error: "" });

  const getSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = createTtsSession(gender, {
        onState: setState,
        onStart: () => callbacks.current.onStart(),
        onEnd: () => callbacks.current.onEnd(),
      });
    }
    return sessionRef.current;
  }, [gender]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [gender]);

  const speak = useCallback((text: string) => {
    if (!mountedRef.current) return Promise.resolve();
    return getSession().enqueue([text]);
  }, [getSession]);
  const speakQueue = useCallback((texts: string[]) => {
    if (!mountedRef.current) return Promise.resolve();
    return getSession().enqueue(texts);
  }, [getSession]);
  const retry = useCallback(() => {
    if (mountedRef.current) void getSession().retry();
  }, [getSession]);
  const reset = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setState({ busy: false, error: "" });
  }, []);

  return { ...state, speak, speakQueue, retry, reset };
}
