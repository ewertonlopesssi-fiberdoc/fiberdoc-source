import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Painel de detalhes redimensionável ─────────────────────────────────────
export default function ResizableDetailPanel({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [width, setWidth] = useState(700);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(700);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newW = Math.min(Math.max(startWRef.current + delta, 320), window.innerWidth - 80);
      setWidth(newW);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}
    >
      {/* Overlay para fechar ao clicar fora */}
      <div
        style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
        onClick={onClose}
      />
      {/* Painel */}
      <div
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: `${width}px`, maxWidth: "100vw",
          background: "var(--background)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          pointerEvents: "auto",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Handle de redimensionamento */}
        <div
          onMouseDown={onMouseDown}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: "6px",
            cursor: "ew-resize",
            background: "transparent",
            zIndex: 10,
          }}
          title="Arraste para redimensionar"
        >
          <div style={{
            position: "absolute", left: "2px", top: "50%", transform: "translateY(-50%)",
            width: "2px", height: "40px", borderRadius: "2px",
            background: "var(--border)",
            opacity: 0.6,
          }} />
        </div>
        {/* Cabeçalho */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 20px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px" }}
          >
            ✕
          </button>
        </div>
        {/* Conteúdo */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
