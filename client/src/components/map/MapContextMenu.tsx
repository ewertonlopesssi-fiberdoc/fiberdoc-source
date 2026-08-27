import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Box, Radio, MapPin, Layers, Star, Copy } from "lucide-react";

// ─── Sub-componente: Menu de Contexto do Mapa ───────────────────────────────
// Aberto com o botão direito sobre o mapa. Cria o elemento já na coordenada
// clicada, dispensando o passo "escolher o tipo no topo, depois clicar no mapa".
//
// Deliberadamente escrito como sub-componente de topo, e não como IIFE dentro
// do render: foi exatamente esse padrão que causou o Erro React #185 no menu
// Adicionar Elemento (ver v5.96.43).
export interface MapContextMenuTarget {
  /** Posição do cursor na janela, para ancorar o menu. */
  x: number;
  y: number;
  /** Coordenada geográfica correspondente ao ponto clicado. */
  lat: number;
  lng: number;
}
export type MapContextMenuTipo = "ceo" | "cto" | "poste" | "reserva" | "poi";

interface MapContextMenuProps {
  target: MapContextMenuTarget;
  isAdmin: boolean;
  onClose: () => void;
  onAdd: (tipo: MapContextMenuTipo, lat: number, lng: number) => void;
  onCopyCoords: (lat: number, lng: number) => void;
  /**
   * Quais tipos oferecer. Omitido, oferece todos — que é o que o Mapa de
   * Infraestrutura quer. O Mapa 2.0 ainda não desenha reservas nem POIs, e
   * oferecer criação de algo que a tela não mostra depois seria pior do que
   * não oferecer: o item some sem explicação.
   */
  tipos?: MapContextMenuTipo[];
}
export default function MapContextMenu({ target, isAdmin, onClose, onAdd, onCopyCoords, tipos }: MapContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Fecha ao clicar fora ou com Esc — o menu vive fora do fluxo do Radix,
  // porque precisa ser posicionado em coordenadas absolutas do cursor.
  useEffect(() => {
    // O mousedown que abriu o menu ainda pode estar a propagar quando este
    // efeito corre; sem a espera de um tick o menu fecharia no mesmo clique.
    let armado = false;
    const timer = setTimeout(() => { armado = true; }, 0);
    const onDown = (ev: MouseEvent) => {
      if (!armado) return;
      if (ref.current && !ref.current.contains(ev.target as Node)) onClose();
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const TODOS: Array<{ tipo: MapContextMenuTipo; rotulo: string; Icone: any; cor: string }> = [
    { tipo: "cto", rotulo: "Adicionar CTO aqui", Icone: Box, cor: "text-emerald-400" },
    { tipo: "ceo", rotulo: "Adicionar CEO aqui", Icone: Radio, cor: "text-blue-400" },
    { tipo: "poste", rotulo: "Adicionar poste aqui", Icone: MapPin, cor: "text-amber-400" },
    { tipo: "reserva", rotulo: "Adicionar reserva aqui", Icone: Layers, cor: "text-cyan-400" },
    { tipo: "poi", rotulo: "Adicionar POI aqui", Icone: Star, cor: "text-violet-400" },
  ];
  const itens = tipos ? TODOS.filter(i => tipos.indexOf(i.tipo) !== -1) : TODOS;

  // Mantém o menu dentro da janela quando o clique é perto da borda.
  const LARGURA = 208;
  // Altura estimada a partir do número real de itens: com a lista filtrada o
  // menu é mais curto, e uma estimativa fixa o empurraria para cima à toa.
  const ALTURA_ESTIMADA = isAdmin ? 96 + itens.length * 29 : 96;
  const x = Math.min(target.x, window.innerWidth - LARGURA - 8);
  const y = Math.min(target.y, window.innerHeight - ALTURA_ESTIMADA - 8);


  // Renderizado em portal no body: dentro da árvore do mapa, qualquer ancestral
  // com transform, filter ou contexto de empilhamento próprio faria o
  // position:fixed passar a se ancorar nele, jogando o menu para fora da tela
  // ou para trás dos painéis sobrepostos.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: x, top: y, width: LARGURA, zIndex: 9999 }}
      className="rounded-md border border-border bg-popover shadow-lg py-1 text-popover-foreground"
      onContextMenu={e => e.preventDefault()}
    >
      {isAdmin && (
        <>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Criar neste ponto</div>
          {itens.map(({ tipo, rotulo, Icone, cor }) => (
            <button
              key={tipo}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left"
              onClick={() => { onAdd(tipo, target.lat, target.lng); onClose(); }}
            >
              <Icone className={`w-3.5 h-3.5 ${cor}`} />
              <span>{rotulo}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <button
        role="menuitem"
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left"
        onClick={() => { onCopyCoords(target.lat, target.lng); onClose(); }}
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        <span>Copiar coordenadas</span>
      </button>
      <div className="px-3 pt-1 pb-0.5 text-[10px] text-muted-foreground/70 font-mono">
        {target.lat.toFixed(6)}, {target.lng.toFixed(6)}
      </div>
    </div>,
    document.body
  );
}

