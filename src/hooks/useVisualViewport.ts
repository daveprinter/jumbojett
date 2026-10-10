import { useEffect, useState, type CSSProperties } from "react";

/** Position portalled prompts within the area not covered by the mobile keyboard. */
export function useVisualViewport(): CSSProperties | undefined {
  const [position, setPosition] = useState<CSSProperties>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setPosition({
      top: viewport.offsetTop + viewport.height / 2,
      left: viewport.offsetLeft + viewport.width / 2,
      maxHeight: Math.max(0, viewport.height - 32),
      maxWidth: Math.max(0, viewport.width - 32),
    });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return position;
}