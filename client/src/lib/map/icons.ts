import L from "leaflet";

// Cores padrão de fibras ópticas (norma ABNT/EIA-598)
export const FIBER_VIA_COLORS: Record<number, string> = {
  1:  "#00B050",  // verde
  2:  "#FFFF00",  // amarelo
  3:  "#FFFFFF",  // branco
  4:  "#0070C0",  // azul
  5:  "#FF0000",  // vermelho
  6:  "#7030A0",  // violeta
  7:  "#7B3F00",  // marrom
  8:  "#FF99CC",  // rosa
  9:  "#111827",  // preto
  10: "#808080",  // cinza
  11: "#FF6600",  // laranja
  12: "#00B0F0",  // aqua/turquesa
};


export const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e", maintenance: "#f59e0b", inactive: "#ef4444",
};

/**
 * Cor da moldura por estado de projeto. Espelha PROJECT_STATUS_COLOR de
 * shared/projectStatus.ts, sem `deployed` — que não recebe moldura.
 *
 * Duplicado aqui de propósito: este módulo é carregado dentro do render de
 * cada marcador, e um import do shared traria junto helpers que nada têm a
 * ver com desenho. Se as cores mudarem lá, mudam aqui.
 */
const PROJECT_RING_COLOR: Record<string, string> = {
  planned: "#a855f7",
  pending: "#f59e0b",
  certified: "#06b6d4",
};

export function createLeafletIcon(
  type: "ceo" | "cto",
  status: string,
  name: string,
  selected = false,
  onuBadge?: { total: number; online?: number } | null,
  customColor?: string | null,
  showName = true,
  /**
   * Estado de projeto (planned/pending/deployed/certified). Ver
   * shared/projectStatus.ts. Elementos `deployed` — a esmagadora maioria —
   * ficam idênticos ao que sempre foram: marcar o caso normal só criaria
   * ruído. Os outros três ganham uma moldura colorida.
   */
  projectStatus?: string | null
) {
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Badge de ONUs: verde se todos online, amarelo se parcial, cinza se só total
  let badgeHtml = "";
  if (type === "cto" && onuBadge && onuBadge.total > 0) {
    const hasOnline = onuBadge.online != null;
    const allOnline = hasOnline && onuBadge.online === onuBadge.total;
    const noneOnline = hasOnline && onuBadge.online === 0;
    const badgeColor = !hasOnline ? "rgba(100,116,139,0.9)" : allOnline ? "rgba(16,185,129,0.9)" : noneOnline ? "rgba(239,68,68,0.85)" : "rgba(234,179,8,0.9)";
    const badgeText = hasOnline ? `${onuBadge.online}/${onuBadge.total}` : `${onuBadge.total}`;
    badgeHtml = `<div style="background:${badgeColor};color:white;font-size:9px;font-weight:700;padding:0px 3px;border-radius:3px;margin-top:1px;white-space:nowrap;line-height:14px;">${badgeText}</div>`;
  }
  const nameHtml = showName ? `<div style="background:rgba(0,0,0,0.75);color:white;font-size:10px;font-weight:600;padding:1px 4px;border-radius:3px;margin-top:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>` : "";
  // Indicador de status: ponto colorido abaixo da imagem
  const statusColor = customColor ?? STATUS_COLOR[status] ?? "#6b7280";
  const selectedRing = selected ? `<div style="position:absolute;inset:-3px;border:3px solid #22d3ee;border-radius:4px;pointer-events:none;"></div>` : "";
  const imgSrc = type === "cto" ? "/icons/cto.png" : "/icons/ceo.png";
  // Moldura de estado de projeto. Tracejada para "em projeto", porque o
  // elemento ainda não existe em campo — a linha interrompida comunica isso
  // sem precisar de legenda. Contínua para os demais.
  let projectRing = "";
  let projectOpacity = "";
  if (projectStatus && projectStatus !== "deployed") {
    const cor = PROJECT_RING_COLOR[projectStatus];
    if (cor) {
      const traco = projectStatus === "planned" ? "dashed" : "solid";
      projectRing = `<div style="position:absolute;inset:-5px;border:2px ${traco} ${cor};border-radius:6px;pointer-events:none;"></div>`;
      // Em projeto aparece esmaecido: está no mapa, mas não está lá.
      if (projectStatus === "planned") projectOpacity = "opacity:0.72;";
    }
  }
  // Imagem diretamente sem container branco — apenas sombra e anel de seleção
  const iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${projectOpacity}"><div style="position:relative;display:inline-flex;"><img src="${imgSrc}" style="width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));" />${projectRing}${selectedRing}<div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:10px;height:4px;background:${statusColor};border-radius:2px;"></div></div>${nameHtml}${badgeHtml}</div>`;
  return L.divIcon({ html: iconHtml, className: "", iconSize: [80, onuBadge && onuBadge.total > 0 ? 70 : 58], iconAnchor: [40, 24] });
}

