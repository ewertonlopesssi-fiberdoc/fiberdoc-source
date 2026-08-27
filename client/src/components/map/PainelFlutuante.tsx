import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Painel flutuante para as telas de mapa.
 *
 * O diálogo modal do sistema escurece a tela inteira e prende o foco, o que
 * é certo para "confirma?" e errado para editar enquanto se olha o desenho:
 * quem está a projetar precisa de ver a caixa que está a mexer, e às vezes
 * de arrastar o painel para fora de cima dela.
 *
 * Daí este componente, e não uma variante do Dialog: sem overlay, sem prender
 * o foco, arrastável pela barra de título, e a posição fica lembrada por
 * chave. O mapa por baixo continua vivo.
 */

type Pos = { x: number; y: number };

const MARGEM = 8;

function chaveArmazenamento(chave: string) {
  return `fiberdoc.mapa2.painel.${chave}`;
}

function lerPosicao(chave: string): Pos | null {
  try {
    const cru = localStorage.getItem(chaveArmazenamento(chave));
    if (!cru) return null;
    const p = JSON.parse(cru);
    if (typeof p?.x === "number" && typeof p?.y === "number") return { x: p.x, y: p.y };
  } catch { /* localStorage pode falhar; a posição é conveniência, não dado */ }
  return null;
}

function gravarPosicao(chave: string, pos: Pos) {
  try {
    localStorage.setItem(chaveArmazenamento(chave), JSON.stringify(pos));
  } catch { /* idem */ }
}

/**
 * Mantém o painel dentro da janela.
 *
 * Sem isto, uma posição gravada num monitor grande deixa o painel fora do
 * ecrã num portátil — e como ele só se arrasta pela própria barra de título,
 * ficaria inalcançável.
 */
function encaixar(pos: Pos, larg: number, alt: number): Pos {
  const maxX = Math.max(MARGEM, window.innerWidth - larg - MARGEM);
  const maxY = Math.max(MARGEM, window.innerHeight - alt - MARGEM);
  return {
    x: Math.min(Math.max(pos.x, MARGEM), maxX),
    y: Math.min(Math.max(pos.y, MARGEM), maxY),
  };
}

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  /** Chave para lembrar a posição entre aberturas. */
  chave: string;
  /** Largura em pixels. Estreito de propósito: o mapa é que importa. */
  largura?: number;
  className?: string;
  children: ReactNode;
}

export default function PainelFlutuante({
  aberto, aoFechar, titulo, chave, largura = 320, className, children,
}: Props) {
  const refPainel = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);

  // Posição inicial: a lembrada, ou encostado à esquerda a meia altura —
  // longe do centro, que é onde costuma estar o que se acabou de clicar.
  useLayoutEffect(() => {
    if (!aberto) { setPos(null); return; }
    const alt = refPainel.current?.offsetHeight ?? 360;
    const guardada = lerPosicao(chave);
    const inicial = guardada ?? {
      x: MARGEM * 3,
      y: Math.max(MARGEM, Math.round((window.innerHeight - alt) / 2)),
    };
    setPos(encaixar(inicial, largura, alt));
  }, [aberto, chave, largura]);

  // Se a janela mudar de tamanho, reencaixa — mesma razão do encaixar().
  useEffect(() => {
    if (!aberto) return;
    const aoRedimensionar = () => {
      const alt = refPainel.current?.offsetHeight ?? 360;
      setPos(p => (p ? encaixar(p, largura, alt) : p));
    };
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [aberto, largura]);

  // Escape fecha, como no diálogo — o hábito já existe.
  useEffect(() => {
    if (!aberto) return;
    const aoTecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [aberto, aoFechar]);

  // Os ouvintes do arrasto vivem no document, não na barra: soltar o rato
  // fora do painel tem de terminar o arrasto, senão ele fica colado ao cursor.
  const iniciarArrasto = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const caixa = refPainel.current?.getBoundingClientRect();
    if (!caixa) return;
    arrasto.current = { dx: e.clientX - caixa.left, dy: e.clientY - caixa.top };

    const aoMover = (ev: PointerEvent) => {
      const a = arrasto.current;
      if (!a) return;
      const alt = refPainel.current?.offsetHeight ?? 360;
      setPos(encaixar({ x: ev.clientX - a.dx, y: ev.clientY - a.dy }, largura, alt));
    };
    const aoSoltar = () => {
      arrasto.current = null;
      document.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerup", aoSoltar);
      setPos(p => { if (p) gravarPosicao(chave, p); return p; });
    };
    document.addEventListener("pointermove", aoMover);
    document.addEventListener("pointerup", aoSoltar);
    e.preventDefault();
  }, [chave, largura]);

  if (!aberto) return null;

  return (
    <div
      ref={refPainel}
      role="dialog"
      aria-label={titulo}
      className={cn(
        "fixed z-[9999] rounded-lg border border-border bg-background shadow-2xl",
        // Enquanto a posição não está medida o painel fica escondido, para
        // não piscar no canto superior esquerdo antes do primeiro encaixe.
        pos ? "opacity-100" : "opacity-0 pointer-events-none",
        className
      )}
      style={{ width: largura, left: pos?.x ?? 0, top: pos?.y ?? 0 }}
    >
      <div
        onPointerDown={iniciarArrasto}
        className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border cursor-move select-none rounded-t-lg bg-muted/40"
      >
        <span className="text-sm font-semibold truncate">{titulo}</span>
        <button
          type="button"
          onClick={aoFechar}
          onPointerDown={e => e.stopPropagation()}
          aria-label="Fechar"
          className="rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-accent"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 max-h-[70vh] overflow-y-auto">{children}</div>
    </div>
  );
}
