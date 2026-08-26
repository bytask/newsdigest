"use client";

import { useEffect } from "react";

// マウント後に本文中の pre.mermaid を一括レンダリングする
export default function Mermaid() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nodes = document.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])");
      if (nodes.length === 0) return;
      const mermaid = (await import("mermaid")).default;
      if (cancelled) return;
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "neutral",
        themeVariables: dark
          ? {
              background: "#1c1c1e",
              primaryColor: "#2c2c2e",
              primaryTextColor: "#f5f5f7",
              primaryBorderColor: "#48484a",
              lineColor: "#98989d",
              fontFamily: "-apple-system, system-ui, sans-serif",
            }
          : {
              background: "#ffffff",
              primaryColor: "#f5f5f7",
              primaryTextColor: "#1d1d1f",
              primaryBorderColor: "#d2d2d7",
              lineColor: "#6e6e73",
              fontFamily: "-apple-system, system-ui, sans-serif",
            },
      });
      await mermaid.run({ nodes });
    })().catch((e) => console.error("[mermaid]", e));
    return () => { cancelled = true; };
  }, []);
  return null;
}
