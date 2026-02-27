import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "regispot-theme";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export default function useTheme() {
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });

  const resolved = mode === "system" ? getSystemTheme() : mode;

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setTheme = useCallback((next) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    const next = resolved === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolved, setTheme]);

  return { mode, resolved, setTheme, toggle };
}
