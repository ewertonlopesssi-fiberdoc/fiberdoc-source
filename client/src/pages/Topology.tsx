import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Server, Wifi, Network, Box, Router, HardDrive, LayoutGrid,
  X, Layers, Activity, Cable, Info, QrCode, GitBranch, LayoutTemplate,
  Save, Check,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import EquipmentQRCode from "@/components/EquipmentQRCode";

// ─── Constantes ───────────────────────────────────────────────────────────────
const RACK_UNITS = 44;
const U_HEIGHT_PX = 22;
const RACK_WIDTH_PX = 260;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EQUIPMENT_ICONS: Record<string, React.ElementType> = {
  switch: Network, olt: Wifi, dgo: Box, splitter: Layers,
  router: Router, server: Server, patch_panel: LayoutGrid,
  amplifier: Activity, other: HardDrive,
};

const EQUIPMENT_COLORS: Record<string, string> = {
  switch:      "bg-blue-500/20 border-blue-500/50 text-blue-300",
  olt:         "bg-emerald-500/20 border-emerald-500/50 text-emerald-300",
  dgo:         "bg-amber-500/20 border-amber-500/50 text-amber-300",
  splitter:    "bg-purple-500/20 border-purple-500/50 text-purple-300",
  router:      "bg-cyan-500/20 border-cyan-500/50 text-cyan-300",
  server:      "bg-rose-500/20 border-rose-500/50 text-rose-300",
  patch_panel: "bg-slate-500/20 border-slate-500/50 text-slate-300",
  amplifier:   "bg-orange-500/20 border-orange-500/50 text-orange-300",
  other:       "bg-zinc-500/20 border-zinc-500/50 text-zinc-300",
};

const EQUIPMENT_LABELS: Record<string, string> = {
  switch: "Switch", olt: "OLT", dgo: "DGO", splitter: "Splitter",
  router: "Roteador", server: "Servidor", patch_panel: "Patch Panel",
  amplifier: "Amplificador", other: "Outro",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  inactive: "bg-zinc-500",
  maintenance: "bg-amber-500",
};

// Cores para linhas de conexão no mapa
const CONNECTION_COLORS = [
  "#60a5fa", "#34d399", "#f59e0b", "#a78bfa", "#f87171",
  "#22d3ee", "#fb923c", "#e879f9", "#4ade80", "#facc15",
];

/** Extrai o número U de strings como "1U", "3U", "12U" */
function parseU(val?: string | null): number {
  if (!val) return 0;
  const m = val.match(/(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 0;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Equipment = {
  id: number;
  name: string;
  type: string;
  model?: string | null;
  rack?: string | null;
  rackPosition?: string | null;
  rackUnits?: number | null;
  status: string;
  ipAddress?: string | null;
  totalPorts?: number | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  roomId?: number | null;
  imageUrl?: string | null;
  portOccupancy?: { total: number; occupied: number; rate: number } | null;
};

type RackSlot = {
  u: number;           // posição 1..44 (1 = baixo, 44 = topo)
  equipment: Equipment | null;
  sizeU: number;
  continuation: boolean; // slot ocupado por equipamento acima
};

// ─── RackColumn ───────────────────────────────────────────────────────────────
function RackColumn({
  rackName,
  slots,
  onSelect,
  selectedId,
}: {
  rackName: string;
  slots: RackSlot[];
  onSelect: (eq: Equipment) => void;
  selectedId: number | null;
}) {
  const equipCount = slots.filter(s => s.equipment && !s.continuation).length;

  return (
    <div className="flex-shrink-0" style={{ width: RACK_WIDTH_PX }}>
      {/* Cabeçalho */}
      <div className="mb-2 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-800 border border-zinc-700">
          <Server className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide uppercase">{rackName}</span>
        </div>
      </div>

      {/* Corpo do rack */}
      <div
        className="relative rounded-lg border border-zinc-700 bg-zinc-900/60 overflow-hidden"
        style={{ width: RACK_WIDTH_PX }}
      >
        {/* Numeração lateral */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-zinc-800/80 border-r border-zinc-700 z-10 flex flex-col">
          {Array.from({ length: RACK_UNITS }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-[9px] text-zinc-500 font-mono border-b border-zinc-700/40 select-none"
              style={{ height: U_HEIGHT_PX }}
            >
              {RACK_UNITS - i}
            </div>
          ))}
        </div>

        {/* Área de equipamentos */}
        <div className="ml-8 relative" style={{ height: RACK_UNITS * U_HEIGHT_PX }}>
          {slots.map((slot) => {
            // Slot vazio ou continuação
            if (slot.continuation || !slot.equipment) {
              return (
                <div
                  key={`empty-${slot.u}`}
                  className="absolute left-0 right-0 border-b border-zinc-800/30"
                  style={{
                    top: (RACK_UNITS - slot.u) * U_HEIGHT_PX,
                    height: U_HEIGHT_PX,
                  }}
                />
              );
            }

            const eq = slot.equipment;
            const Icon = EQUIPMENT_ICONS[eq.type] ?? HardDrive;
            const colorClass = EQUIPMENT_COLORS[eq.type] ?? EQUIPMENT_COLORS.other;
            const isSelected = selectedId === eq.id;
            const heightPx = slot.sizeU * U_HEIGHT_PX;

            return (
              <button
                key={`eq-${eq.id}-u${slot.u}`}
                onClick={() => onSelect(eq)}
                className={`
                  absolute left-1 right-1 rounded border cursor-pointer transition-all duration-150
                  flex items-center gap-1.5 px-2 overflow-hidden
                  ${colorClass}
                  ${isSelected ? "ring-2 ring-white/30 brightness-125" : "hover:brightness-110"}
                `}
                style={{
                  top: (RACK_UNITS - slot.u) * U_HEIGHT_PX + 1,
                  height: heightPx - 2,
                }}
                title={`${eq.name} — ${EQUIPMENT_LABELS[eq.type] ?? eq.type} | ${eq.rackPosition ?? "?"}${slot.sizeU > 1 ? ` | ${slot.sizeU}U` : ""}`}
              >
                {eq.imageUrl ? (
                  <img
                    src={eq.imageUrl}
                    alt={eq.name}
                    className="w-4 h-4 flex-shrink-0 object-contain rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <Icon className="w-3 h-3 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  <span className="text-[10px] font-medium truncate leading-tight">{eq.name}</span>
                  {slot.sizeU >= 2 && (
                    <span className="text-[9px] opacity-60 font-mono">{slot.sizeU}U</span>
                  )}
                  {eq.portOccupancy && eq.portOccupancy.total > 0 && (
                    <div className="w-full bg-black/30 rounded-full h-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          eq.portOccupancy.rate >= 90 ? 'bg-rose-400' :
                          eq.portOccupancy.rate >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${eq.portOccupancy.rate}%` }}
                      />
                    </div>
                  )}
                </div>
                {slot.sizeU >= 2 && (
                  <span className="text-[9px] opacity-50 flex-shrink-0 font-mono">{eq.rackPosition}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rodapé */}
      <div className="mt-1 text-center text-[10px] text-zinc-500">
        {equipCount} equipamento{equipCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────
function DetailPanel({ equipment, onClose }: { equipment: Equipment; onClose: () => void }) {
  const { data: ports } = trpc.ports.byEquipment.useQuery({ equipmentId: equipment.id });
  const { data: slots } = trpc.slots.byEquipment.useQuery({ equipmentId: equipment.id });

  const Icon = EQUIPMENT_ICONS[equipment.type] ?? HardDrive;
  const colorClass = EQUIPMENT_COLORS[equipment.type] ?? EQUIPMENT_COLORS.other;

  const freePorts   = ports?.filter(p => p.status === "free").length ?? 0;
  const occupied    = ports?.filter(p => p.status === "occupied").length ?? 0;
  const total       = ports?.length ?? 0;
  const pct         = total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="w-80 flex-shrink-0 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`p-4 border-b border-zinc-700`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {equipment.imageUrl ? (
              <div className={`w-10 h-10 rounded-lg border overflow-hidden flex items-center justify-center ${colorClass}`}>
                <img
                  src={equipment.imageUrl}
                  alt={equipment.name}
                  className="w-full h-full object-contain p-1"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = 'none';
                    el.parentElement!.innerHTML = `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/></svg>`;
                  }}
                />
              </div>
            ) : (
              <div className={`p-2 rounded-lg border ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{equipment.name}</p>
              <p className="text-xs text-zinc-400">{EQUIPMENT_LABELS[equipment.type] ?? equipment.type}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[equipment.status] ?? "bg-zinc-500"}`} />
            <span className="text-xs text-zinc-300 capitalize">
              {equipment.status === "active" ? "Ativo" : equipment.status === "inactive" ? "Inativo" : "Manutenção"}
            </span>
          </div>

          {/* Posição no rack */}
          <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Server className="w-3 h-3" /> Posição no Rack
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-zinc-500">Rack</p>
                <p className="text-xs font-mono text-zinc-200">{equipment.rack ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500">Posição (U)</p>
                <p className="text-xs font-mono text-zinc-200">{equipment.rackPosition ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500">Altura</p>
                <p className="text-xs font-mono text-zinc-200">{equipment.rackUnits ?? 1}U</p>
              </div>
            </div>
          </div>

          {/* Informações gerais */}
          <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Info className="w-3 h-3" /> Informações
            </p>
            {([
              ["Modelo",      equipment.model],
              ["Fabricante",  equipment.manufacturer],
              ["Nº de Série", equipment.serialNumber],
              ["IP",          equipment.ipAddress],
            ] as [string, string | null | undefined][]).map(([label, value]) =>
              value ? (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] text-zinc-500">{label}</span>
                  <span className="text-[10px] font-mono text-zinc-300">{value}</span>
                </div>
              ) : null
            )}
          </div>

          {/* Ocupação de portas */}
          {total > 0 && (
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Cable className="w-3 h-3" /> Portas ({total})
              </p>
              <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${100 - pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-emerald-400">{freePorts} livres</span>
                <span className="text-rose-400">{occupied} ocupadas</span>
                <span className="text-zinc-400">{pct}% uso</span>
              </div>
            </div>
          )}

          {/* QR Code */}
          <div className="pt-1">
            <EquipmentQRCode
              equipmentId={equipment.id}
              equipmentName={equipment.name}
              equipmentType={EQUIPMENT_LABELS[equipment.type] ?? equipment.type}
            />
          </div>

          {/* Slots */}
          {slots && slots.length > 0 && (
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3" /> Slots ({slots.length})
              </p>
              {slots.map(slot => (
                <div key={slot.id} className="flex items-center justify-between py-1 border-b border-zinc-700/50 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-zinc-300">
                      Slot {slot.slotNumber}
                    </span>
                    {slot.label && (
                      <span className="text-[10px] text-zinc-500 truncate max-w-[80px]">— {slot.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {slot.speed && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/50 text-violet-300">
                        {slot.speed.toUpperCase()}
                      </Badge>
                    )}
                    <span className="text-[10px] text-zinc-400">{slot.totalPorts}p</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── ConnectionMap ─────────────────────────────────────────────────────────────
type PortLink = {
  portId: number;
  portNumber: string;
  portLabel: string | null;
  equipmentId: number;
  equipmentName: string;
  equipmentRack: string | null;
  equipmentRackPosition: string | null;
  connectedToEquipmentId: number;
  connectedToPortId: number;
};

type NodePos = { x: number; y: number; w: number; h: number };

function ConnectionMap({
  allEquipments,
  links,
  roomFilter = "all",
}: {
  allEquipments: Equipment[];
  links: PortLink[];
  roomFilter?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  // Drag-and-drop: posições customizadas por nodeId
  const [overrides, setOverrides] = useState<Map<number, { x: number; y: number }>>(new Map());
  const dragging = useRef<{ id: number; startMouseX: number; startMouseY: number; startNodeX: number; startNodeY: number } | null>(null);
  // Pontos de controle das linhas: key = "eqA-eqB", valor = {x, y} do ponto de controle
  const [ctrlPoints, setCtrlPoints] = useState<Map<string, { x: number; y: number }>>(new Map());
  const draggingCtrl = useRef<{ key: string; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutLoaded = useRef(false);

  // ─── Persistência: carregar layout salvo ───────────────────────────────────
  const { data: savedLayout } = trpc.topology.layout.get.useQuery(
    { roomFilter },
    { retry: false, refetchOnWindowFocus: false }
  );
  const [savedFeedback, setSavedFeedback] = useState(false);
  const saveLayout = trpc.topology.layout.save.useMutation({
    onSuccess: () => {
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    },
  });

  const handleManualSave = () => {
    const nodePositions: Record<string, { x: number; y: number }> = {};
    overrides.forEach((v, k) => { nodePositions[String(k)] = v; });
    const ctrlObj: Record<string, { x: number; y: number }> = {};
    ctrlPoints.forEach((v, k) => { ctrlObj[k] = v; });
    saveLayout.mutate({ roomFilter, nodePositions, ctrlPoints: ctrlObj });
  };

  // Restaurar layout ao carregar dados do banco
  const [overridesKey, setOverridesKey] = useState(0);
  if (savedLayout && !layoutLoaded.current) {
    layoutLoaded.current = true;
    try {
      const np = JSON.parse(savedLayout.nodePositions ?? "{}") as Record<string, { x: number; y: number }>;
      const cp = JSON.parse(savedLayout.ctrlPoints ?? "{}") as Record<string, { x: number; y: number }>;
      const newOverrides = new Map<number, { x: number; y: number }>();
      for (const [k, v] of Object.entries(np)) newOverrides.set(Number(k), v);
      const newCtrl = new Map<string, { x: number; y: number }>(Object.entries(cp));
      // Aplicar via setState no próximo tick para evitar render durante render
      setTimeout(() => {
        setOverrides(newOverrides);
        setCtrlPoints(newCtrl);
        setOverridesKey(k => k + 1);
      }, 0);
    } catch { /* JSON inválido, ignorar */ }
  }

  // Auto-save com debounce de 1.5s após qualquer mudança de layout
  const triggerSave = (newOverrides: Map<number, { x: number; y: number }>, newCtrl: Map<string, { x: number; y: number }>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const nodePositions: Record<string, { x: number; y: number }> = {};
      newOverrides.forEach((v, k) => { nodePositions[String(k)] = v; });
      const ctrlObj: Record<string, { x: number; y: number }> = {};
      newCtrl.forEach((v, k) => { ctrlObj[k] = v; });
      saveLayout.mutate({ roomFilter, nodePositions, ctrlPoints: ctrlObj });
    }, 1500);
  };

  // Construir mapa de equipamentos envolvidos em conexões
  const involvedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const link of links) {
      ids.add(link.equipmentId);
      ids.add(link.connectedToEquipmentId);
    }
    return ids;
  }, [links]);

  // Filtrar apenas equipamentos com conexões
  const nodes = useMemo(() => {
    return allEquipments.filter(e => involvedIds.has(e.id));
  }, [allEquipments, involvedIds]);

  // Agrupar conexões entre pares de equipamentos
  const pairLinks = useMemo(() => {
    const pairMap = new Map<string, { eqA: number; eqB: number; ports: string[] }>();
    for (const link of links) {
      const key = [Math.min(link.equipmentId, link.connectedToEquipmentId), Math.max(link.equipmentId, link.connectedToEquipmentId)].join('-');
      if (!pairMap.has(key)) {
        pairMap.set(key, { eqA: Math.min(link.equipmentId, link.connectedToEquipmentId), eqB: Math.max(link.equipmentId, link.connectedToEquipmentId), ports: [] });
      }
      const portLabel = link.portLabel || link.portNumber;
      pairMap.get(key)!.ports.push(portLabel);
    }
    return Array.from(pairMap.values());
  }, [links]);

  // Layout automático: posicionar nós em grade
  const NODE_W = 160;
  const NODE_H = 56;
  const COL_GAP = 80;
  const ROW_GAP = 60;
  const COLS = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const PADDING = 40;

  const nodePositions = useMemo((): Map<number, NodePos> => {
    const map = new Map<number, NodePos>();
    nodes.forEach((node, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const ov = overrides.get(node.id);
      map.set(node.id, {
        x: ov ? ov.x : PADDING + col * (NODE_W + COL_GAP),
        y: ov ? ov.y : PADDING + row * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      });
    });
    return map;
  }, [nodes, COLS, overrides]);

  // Dimensões dinâmicas: crescem conforme nós são movidos
  const dynamicBounds = useMemo(() => {
    let maxX = PADDING * 2 + COLS * (NODE_W + COL_GAP);
    let maxY = PADDING * 2 + Math.ceil(nodes.length / COLS) * (NODE_H + ROW_GAP);
    nodePositions.forEach(pos => {
      maxX = Math.max(maxX, pos.x + pos.w + PADDING);
      maxY = Math.max(maxY, pos.y + pos.h + PADDING);
    });
    ctrlPoints.forEach(cp => {
      maxX = Math.max(maxX, cp.x + PADDING);
      maxY = Math.max(maxY, cp.y + PADDING);
    });
    return { w: Math.max(maxX, 600), h: Math.max(maxY, 500) };
  }, [nodePositions, ctrlPoints, nodes.length, COLS]);
  const svgWidth = dynamicBounds.w;
  const svgHeight = dynamicBounds.h;

  // Drag handler para nós
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: number, pos: NodePos) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = {
      id: nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: pos.x,
      startNodeY: pos.y,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const nx = Math.max(0, dragging.current.startNodeX + ev.clientX - dragging.current.startMouseX);
      const ny = Math.max(0, dragging.current.startNodeY + ev.clientY - dragging.current.startMouseY);
      setOverrides(prev => { const m = new Map(prev); m.set(dragging.current!.id, { x: nx, y: ny }); return m; });
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Auto-save após soltar o nó
      setOverrides(prev => { triggerSave(prev, ctrlPoints); return prev; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [ctrlPoints]);

  // Drag handler para ponto de controle da linha
  const handleCtrlMouseDown = useCallback((e: React.MouseEvent, key: string, cx: number, cy: number) => {
    e.preventDefault();
    e.stopPropagation();
    draggingCtrl.current = { key, startMouseX: e.clientX, startMouseY: e.clientY, startX: cx, startY: cy };
    const onMove = (ev: MouseEvent) => {
      if (!draggingCtrl.current) return;
      const nx = draggingCtrl.current.startX + ev.clientX - draggingCtrl.current.startMouseX;
      const ny = draggingCtrl.current.startY + ev.clientY - draggingCtrl.current.startMouseY;
      setCtrlPoints(prev => { const m = new Map(prev); m.set(draggingCtrl.current!.key, { x: nx, y: ny }); return m; });
    };
    const onUp = () => {
      draggingCtrl.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Auto-save após soltar o ponto de controle
      setCtrlPoints(prev => { triggerSave(overrides, prev); return prev; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [overrides]);

  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-3">
        <GitBranch className="w-12 h-12 opacity-20" />
        <p className="text-sm font-medium">Nenhuma conexão de porta encontrada</p>
        <p className="text-xs text-zinc-600 text-center max-w-sm">
          Vincule portas entre equipamentos na tela de Equipamentos para visualizar o mapa de conexões aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-auto">
      <svg
        ref={svgRef}
        width={Math.max(svgWidth, 400)}
        height={Math.max(svgHeight, 300)}
        className="block"
        style={{ minWidth: svgWidth, minHeight: svgHeight }}
      >
        {/* Definições de marcadores de seta */}
        <defs>
          {CONNECTION_COLORS.map((color, i) => (
            <marker
              key={i}
              id={`arrow-${i}`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={color} opacity="0.8" />
            </marker>
          ))}
        </defs>

        {/* Linhas de conexão */}
        {pairLinks.map((pair, idx) => {
          const posA = nodePositions.get(pair.eqA);
          const posB = nodePositions.get(pair.eqB);
          if (!posA || !posB) return null;

          const color = CONNECTION_COLORS[idx % CONNECTION_COLORS.length];
          const isHovered = hoveredLink === idx;
          const pairKey = `${pair.eqA}-${pair.eqB}`;

          // Centros dos nós
          const ax = posA.x + posA.w / 2;
          const ay = posA.y + posA.h / 2;
          const bx = posB.x + posB.w / 2;
          const by = posB.y + posB.h / 2;

          // Ponto de controle: customizado pelo usuário ou calculado automaticamente
          const defaultCtrlX = (ax + bx) / 2;
          const defaultCtrlY = (ay + by) / 2;
          const ctrl = ctrlPoints.get(pairKey);
          const cpx = ctrl ? ctrl.x : defaultCtrlX;
          const cpy = ctrl ? ctrl.y : defaultCtrlY;

          // Bezier quadrática passando pelo ponto de controle
          const pathD = `M ${ax} ${ay} Q ${cpx} ${cpy} ${bx} ${by}`;

          // Ponto médio real da curva quadrática (t=0.5)
          const midX = 0.25 * ax + 0.5 * cpx + 0.25 * bx;
          const midY = 0.25 * ay + 0.5 * cpy + 0.25 * by;

          const portCount = pair.ports.length;
          const portText = portCount === 1
            ? `Porta: ${pair.ports[0]}`
            : `${portCount} portas: ${pair.ports.slice(0, 3).join(", ")}${portCount > 3 ? "..." : ""}`;

          return (
            <g key={idx}>
              {/* Área invisível para facilitar hover (mais larga) */}
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  setHoveredLink(idx);
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 36, text: portText });
                }}
                onMouseMove={(e) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 36, text: portText });
                }}
                onMouseLeave={() => { setHoveredLink(null); setTooltip(null); }}
              />
              {/* Linha visível */}
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 3 : 2}
                strokeOpacity={isHovered ? 1 : 0.6}
                strokeDasharray={isHovered ? "none" : "6 3"}
                style={{ pointerEvents: "none", transition: "stroke-width 0.15s, stroke-opacity 0.15s" }}
              />
              {/* Ponto de controle arrastável (visível ao hover) */}
              {isHovered && (
                <g
                  transform={`translate(${cpx}, ${cpy})`}
                  style={{ cursor: "crosshair" }}
                  onMouseDown={(e) => handleCtrlMouseDown(e, pairKey, cpx, cpy)}
                >
                  <circle r={8} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.5} />
                  <circle r={3} fill={color} fillOpacity={0.9} />
                </g>
              )}
              {/* Linhas guia do ponto de controle (visíveis ao hover) */}
              {isHovered && (
                <>
                  <line x1={ax} y1={ay} x2={cpx} y2={cpy} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
                  <line x1={bx} y1={by} x2={cpx} y2={cpy} stroke={color} strokeWidth={0.5} strokeOpacity={0.3} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
                </>
              )}
              {/* Contador de portas no ponto médio da curva */}
              {portCount > 1 && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <circle r="10" fill="#1e1e2e" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
                  <text textAnchor="middle" dominantBaseline="central" fontSize="9" fill={color} fontWeight="bold">
                    {portCount}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nós de equipamento */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const Icon = EQUIPMENT_ICONS[node.type] ?? HardDrive;
          const colorClass = EQUIPMENT_COLORS[node.type] ?? EQUIPMENT_COLORS.other;
          // Extrair cor de borda da classe
          const borderColorMap: Record<string, string> = {
            switch: "#3b82f6", olt: "#10b981", dgo: "#f59e0b", splitter: "#8b5cf6",
            router: "#06b6d4", server: "#f43f5e", patch_panel: "#64748b",
            amplifier: "#f97316", other: "#71717a",
          };
          const strokeColor = borderColorMap[node.type] ?? "#71717a";

          // Contar conexões deste nó
          const linkCount = links.filter(l => l.equipmentId === node.id || l.connectedToEquipmentId === node.id).length;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              style={{ cursor: "grab" }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id, pos)}
            >
              {/* Fundo do nó */}
              <rect
                x={0}
                y={0}
                width={pos.w}
                height={pos.h}
                rx={8}
                fill="#18181b"
                stroke={strokeColor}
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
              {/* Ícone (texto SVG simulado) */}
              <circle cx={22} cy={pos.h / 2} r={14} fill={strokeColor} fillOpacity="0.15" />
              {/* Badge de contagem de links */}
              <rect x={pos.w - 28} y={4} width={24} height={16} rx={8} fill={strokeColor} fillOpacity="0.2" />
              <text
                x={pos.w - 16}
                y={12}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="9"
                fill={strokeColor}
                fontWeight="bold"
              >
                {linkCount}
              </text>
              {/* Nome do equipamento */}
              <text
                x={40}
                y={pos.h / 2 - 8}
                fontSize="11"
                fontWeight="600"
                fill="#e4e4e7"
                dominantBaseline="central"
              >
                {node.name.length > 16 ? node.name.slice(0, 15) + "…" : node.name}
              </text>
              {/* Tipo */}
              <text
                x={40}
                y={pos.h / 2 + 9}
                fontSize="9"
                fill="#a1a1aa"
                dominantBaseline="central"
              >
                {EQUIPMENT_LABELS[node.type] ?? node.type}
                {node.rack ? ` · ${node.rack}` : ""}
                {node.rackPosition ? ` ${node.rackPosition}` : ""}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-zinc-800 border border-zinc-600 text-zinc-200 text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)" }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Botões de controle do layout */}
      <div className="absolute top-3 right-3 flex gap-2 z-10">
        <button
          className={`flex items-center gap-1.5 bg-zinc-800 border text-xs rounded-md px-2.5 py-1 transition-colors ${
            savedFeedback
              ? "border-emerald-500 text-emerald-400"
              : "border-zinc-600 text-zinc-300 hover:bg-zinc-700"
          }`}
          onClick={handleManualSave}
          disabled={saveLayout.isPending}
          title="Salvar layout atual no banco"
        >
          {savedFeedback ? (
            <><Check className="w-3 h-3" /> Salvo!</>
          ) : saveLayout.isPending ? (
            <><Save className="w-3 h-3 animate-pulse" /> Salvando...</>
          ) : (
            <><Save className="w-3 h-3" /> Salvar layout</>
          )}
        </button>
        {(overrides.size > 0 || ctrlPoints.size > 0) && (
          <button
            className="bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs rounded-md px-2.5 py-1 hover:bg-zinc-700 transition-colors"
            onClick={() => {
              const empty = new Map();
              setOverrides(empty);
              setCtrlPoints(empty as Map<string, { x: number; y: number }>);
              saveLayout.mutate({ roomFilter, nodePositions: {}, ctrlPoints: {} });
            }}
          >
            Resetar layout
          </button>
        )}
      </div>
      {/* Legenda */}
      <div className="absolute bottom-3 right-3 bg-zinc-900/80 border border-zinc-700 rounded-lg p-2 text-[10px] text-zinc-400 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-blue-400 opacity-60" style={{ borderTop: "2px dashed #60a5fa" }} />
          <span>Conexão de portas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-zinc-700 border border-zinc-500 flex items-center justify-center text-[8px] text-zinc-300 font-bold">N</div>
          <span>Número de portas vinculadas</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-zinc-700/60">
          <span>↕ Arraste nós para mover</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>○ Passe o mouse na linha e arraste o ponto</span>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function Topology() {
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [qrRoom, setQrRoom] = useState<{ id: number; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"rack" | "map">("rack");

  const { data: equipments = [], isLoading } = trpc.equipments.list.useQuery({});
  const { data: rooms = [] } = trpc.rooms.list.useQuery();
  const { data: portLinks = [] } = trpc.ports.allLinks.useQuery();

  // Filtrar por sala
  const filtered = useMemo(() => {
    if (selectedRoomId === "all") return equipments as Equipment[];
    const rid = parseInt(selectedRoomId, 10);
    return (equipments as Equipment[]).filter(e => e.roomId === rid);
  }, [equipments, selectedRoomId]);

  // Filtrar links pela sala selecionada
  const filteredLinks = useMemo(() => {
    if (selectedRoomId === "all") return portLinks as PortLink[];
    const ids = new Set(filtered.map(e => e.id));
    return (portLinks as PortLink[]).filter(l => ids.has(l.equipmentId) || ids.has(l.connectedToEquipmentId));
  }, [portLinks, filtered, selectedRoomId]);

  // Agrupar por rack
  const rackGroups = useMemo(() => {
    const groups: Record<string, Equipment[]> = {};
    for (const eq of filtered) {
      const key = eq.rack?.trim() || "Sem Rack";
      if (!groups[key]) groups[key] = [];
      groups[key].push(eq);
    }
    return groups;
  }, [filtered]);

  // Construir array de 44 slots para um rack
  // CORREÇÃO v5.9: usa eq.rackUnits (campo do banco) em vez de parseSizeU(eq.model)
  const buildSlots = (eqs: Equipment[]): RackSlot[] => {
    const slots: RackSlot[] = Array.from({ length: RACK_UNITS }, (_, i) => ({
      u: RACK_UNITS - i,   // U44 → idx 0, U1 → idx 43
      equipment: null,
      sizeU: 1,
      continuation: false,
    }));

    const withPos = eqs.filter(e => parseU(e.rackPosition) > 0);
    const withoutPos = eqs.filter(e => parseU(e.rackPosition) === 0);

    for (const eq of withPos) {
      const uPos  = parseU(eq.rackPosition);
      // Usar rackUnits do banco; fallback para 1 se não definido
      const sizeU = Math.max(1, Math.min(eq.rackUnits ?? 1, RACK_UNITS));
      const idx   = RACK_UNITS - uPos;
      if (idx < 0 || idx >= RACK_UNITS) continue;

      slots[idx] = { u: uPos, equipment: eq, sizeU, continuation: false };
      for (let s = 1; s < sizeU && idx + s < RACK_UNITS; s++) {
        slots[idx + s] = { u: uPos - s, equipment: null, sizeU: 1, continuation: true };
      }
    }

    let fillIdx = RACK_UNITS - 1;
    for (const eq of withoutPos) {
      while (fillIdx >= 0 && (slots[fillIdx].equipment || slots[fillIdx].continuation)) fillIdx--;
      if (fillIdx < 0) break;
      slots[fillIdx] = { u: RACK_UNITS - fillIdx, equipment: eq, sizeU: 1, continuation: false };
      fillIdx--;
    }

    return slots;
  };

  const rackNames = Object.keys(rackGroups).sort((a, b) => {
    if (a === "Sem Rack") return 1;
    if (b === "Sem Rack") return -1;
    return a.localeCompare(b, "pt-BR", { numeric: true });
  });

  const totalEquipments   = filtered.length;
  const rackedEquipments  = filtered.filter(e => e.rack).length;
  const totalLinks        = filteredLinks.length;

  return (
    <>
    <div className="flex flex-col h-full min-h-0 gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Topologia de Rede</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {activeTab === "rack"
              ? `Racks de 44U — ${rackedEquipments} de ${totalEquipments} equipamentos posicionados`
              : `${totalLinks} conexão${totalLinks !== 1 ? "ões" : ""} de porta entre equipamentos`
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Abas Rack / Mapa */}
          <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab("rack")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === "rack"
                  ? "bg-zinc-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              Rack
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === "map"
                  ? "bg-zinc-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Mapa
              {totalLinks > 0 && (
                <span className="bg-cyan-500/30 text-cyan-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {totalLinks}
                </span>
              )}
            </button>
          </div>

          {/* Legenda compacta (apenas na aba rack) */}
          {activeTab === "rack" && (
            <div className="hidden xl:flex items-center gap-3 flex-wrap">
              {(["switch","olt","dgo","splitter","router","server","patch_panel"] as const).map(type => {
                const Icon = EQUIPMENT_ICONS[type] ?? HardDrive;
                const cls  = EQUIPMENT_COLORS[type] ?? "";
                const textCls = cls.split(" ").find(c => c.startsWith("text-")) ?? "text-zinc-400";
                return (
                  <div key={type} className={`flex items-center gap-1 text-[10px] ${textCls}`}>
                    <Icon className="w-3 h-3" />
                    <span>{EQUIPMENT_LABELS[type]}</span>
                  </div>
                );
              })}
            </div>
          )}

          <Separator orientation="vertical" className="h-6 bg-zinc-700 hidden xl:block" />

          {/* Filtro por sala */}
          <Select value={selectedRoomId} onValueChange={v => { setSelectedRoomId(v); setSelectedEquipment(null); }}>
            <SelectTrigger className="w-44 h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-200">
              <SelectValue placeholder="Todas as salas" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="all" className="text-xs text-zinc-200">Todas as salas</SelectItem>
              {(rooms as { id: number; name: string }[]).map(r => (
                <SelectItem key={r.id} value={String(r.id)} className="text-xs text-zinc-200">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeTab === "rack" && selectedRoomId !== "all" && (() => {
            const room = (rooms as { id: number; name: string }[]).find(r => String(r.id) === selectedRoomId);
            return room ? (
              <Button variant="outline" size="sm" className="h-8 px-2 bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700" onClick={() => setQrRoom({ id: room.id, name: room.name })}>
                <QrCode className="w-3.5 h-3.5 mr-1" />
                <span className="text-xs">QR Code</span>
              </Button>
            ) : null;
          })()}
        </div>
      </div>

      {/* Conteúdo */}
      {activeTab === "rack" ? (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Racks */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
                Carregando equipamentos...
              </div>
            ) : rackNames.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-2">
                <Server className="w-10 h-10 opacity-30" />
                <p className="text-sm">Nenhum equipamento encontrado</p>
                <p className="text-xs text-zinc-600">Cadastre equipamentos com rack e posição para visualizá-los aqui</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div
                  className="flex gap-6 pb-6 pr-4"
                  style={{ minHeight: RACK_UNITS * U_HEIGHT_PX + 80 }}
                >
                  {rackNames.map(rackName => (
                    <RackColumn
                      key={rackName}
                      rackName={rackName}
                      slots={buildSlots(rackGroups[rackName] ?? [])}
                      onSelect={setSelectedEquipment}
                      selectedId={selectedEquipment?.id ?? null}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Painel de detalhes */}
          {selectedEquipment && (
            <DetailPanel
              equipment={selectedEquipment}
              onClose={() => setSelectedEquipment(null)}
            />
          )}
        </div>
      ) : (
        /* Aba Mapa de Conexões */
        <div className="flex-1 min-h-0 bg-zinc-900/40 border border-zinc-700/50 rounded-xl overflow-hidden relative">
          <ConnectionMap
            allEquipments={filtered as Equipment[]}
            links={filteredLinks as PortLink[]}
            roomFilter={selectedRoomId}
          />
        </div>
      )}

      {/* Rodapé */}
      <div className="flex-shrink-0 flex items-center gap-3 text-[10px] text-zinc-600 border-t border-zinc-800 pt-3 flex-wrap">
        {activeTab === "rack" ? (
          <>
            <span>Clique em um equipamento para ver detalhes</span>
            <span>•</span>
            <span>Cada coluna = 1 rack de 44U</span>
            <span>•</span>
            <span>Numeração U: 44 no topo → 1 na base</span>
            <span>•</span>
            <span>Altura em U respeitada conforme cadastro</span>
          </>
        ) : (
          <>
            <span>Passe o mouse sobre as linhas para ver as portas vinculadas</span>
            <span>•</span>
            <span>O número no centro da linha indica quantas portas estão conectadas</span>
            <span>•</span>
            <span>Apenas equipamentos com vínculos de porta são exibidos</span>
          </>
        )}
      </div>
    </div>

    <Dialog open={qrRoom !== null} onOpenChange={() => setQrRoom(null)}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <QrCode className="h-4 w-4" />
            QR Code — {qrRoom?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {qrRoom && (
            <>
              <div className="p-4 bg-white rounded-xl">
                <QRCodeSVG value={`${window.location.origin}/relatorio-sala/${qrRoom.id}`} size={200} level="H" includeMargin={false} />
              </div>
              <p className="text-xs text-zinc-400 text-center">Escaneie para abrir o relatório de ocupação desta sala</p>
              <p className="text-xs font-mono text-zinc-600 break-all text-center">{window.location.origin}/relatorio-sala/{qrRoom.id}</p>
              <Button variant="outline" className="w-full border-zinc-600 text-zinc-200 hover:bg-zinc-800" onClick={() => window.open(`${window.location.origin}/relatorio-sala/${qrRoom.id}`, "_blank")}>
                Abrir Relatório
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
