import { useEffect, useRef, useState, type ComponentProps } from "react";
import { SheetContent } from "@/components/ui/sheet";

export function ResizableSheetContent({
  children,
  style,
  defaultWidth = 720,
  storageKey = "nmgr-detail-width",
  ...props
}: ComponentProps<typeof SheetContent> & { defaultWidth?: number; storageKey?: string }) {
  const [width, setWidth] = useState(defaultWidth);
  const [limit, setLimit] = useState(1440);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    const resize = () => setLimit(Math.min(1440, window.innerWidth));
    resize();
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved >= 360 && saved <= 1440) setWidth(saved);
    } catch {}
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [storageKey]);
  function change(value: number) {
    const next = Math.max(Math.min(360, limit), Math.min(limit, value));
    setWidth(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {}
  }
  return (
    <SheetContent
      {...props}
      style={{
        ...style,
        width: Math.min(width, limit),
        maxWidth: "100vw",
        transitionProperty: "opacity, transform",
      }}
    >
      <div
        className="nm-resize-handle"
        role="separator"
        aria-label="Resize detail panel"
        aria-orientation="vertical"
        aria-valuemin={Math.min(360, limit)}
        aria-valuemax={limit}
        aria-valuenow={Math.min(width, limit)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { x: e.clientX, width: Math.min(width, limit) };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            change(drag.current.width + drag.current.x - e.clientX);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            change(
              e.key === "Home"
                ? 360
                : e.key === "End"
                  ? limit
                  : width + (e.key === "ArrowLeft" ? 40 : -40),
            );
          }
        }}
      />
      {children}
    </SheetContent>
  );
}
