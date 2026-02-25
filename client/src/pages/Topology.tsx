import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Server, Wifi, Network, Box, Router, HardDrive, LayoutGrid,
  X, Layers, Activity, Cable, Info,
} from "lucide-react";

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

/** Extrai o número U de strings como "1U", "3U", "12U" */
function parseU(val?: string | null): number {
  if (!val) return 0;
  const m = val.match(/(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 0;
}

/** Extrai o tamanho em U de strings como "2U", "4U" — padrão 1U */
function parseSizeU(model?: string | null): number {
  if (!model) return 1;
  const m = model.match(/(\d+)\s*[Uu]/);
  return m ? Math.min(parseInt(m[1], 10), 6) : 1;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Equipment = {
  id: number;
  name: string;
  type: string;
  model?: string | null;
  rack?: string | null;
  rackPosition?: string | null;
  status: string;
  ipAddress?: string | null;
  totalPorts?: number | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  roomId?: number | null;
  imageUrl?: string | null;
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
                title={`${eq.name} — ${EQUIPMENT_LABELS[eq.type] ?? eq.type} | ${eq.rackPosition ?? "?"}`}
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
                <span className="text-[10px] font-medium truncate leading-tight flex-1">{eq.name}</span>
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
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-zinc-500">Rack</p>
                <p className="text-xs font-mono text-zinc-200">{equipment.rack ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500">Posição (U)</p>
                <p className="text-xs font-mono text-zinc-200">{equipment.rackPosition ?? "—"}</p>
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

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function Topology() {
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

  const { data: equipments = [], isLoading } = trpc.equipments.list.useQuery({});
  const { data: rooms = [] } = trpc.rooms.list.useQuery();

  // Filtrar por sala
  const filtered = useMemo(() => {
    if (selectedRoomId === "all") return equipments as Equipment[];
    const rid = parseInt(selectedRoomId, 10);
    return (equipments as Equipment[]).filter(e => e.roomId === rid);
  }, [equipments, selectedRoomId]);

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
  const buildSlots = (eqs: Equipment[]): RackSlot[] => {
    // Inicializa todos os slots como vazios (U44 no topo, U1 na base)
    const slots: RackSlot[] = Array.from({ length: RACK_UNITS }, (_, i) => ({
      u: RACK_UNITS - i,   // U44 → idx 0, U1 → idx 43
      equipment: null,
      sizeU: 1,
      continuation: false,
    }));

    // Equipamentos com posição definida
    const withPos = eqs.filter(e => parseU(e.rackPosition) > 0);
    // Equipamentos sem posição (serão empilhados no topo livre)
    const withoutPos = eqs.filter(e => parseU(e.rackPosition) === 0);

    // Posicionar equipamentos com U definido
    for (const eq of withPos) {
      const uPos  = parseU(eq.rackPosition);           // ex: 3 → U3
      const sizeU = parseSizeU(eq.model);
      // idx no array: U44 = idx 0, U1 = idx 43
      const idx   = RACK_UNITS - uPos;
      if (idx < 0 || idx >= RACK_UNITS) continue;

      slots[idx] = { u: uPos, equipment: eq, sizeU, continuation: false };
      for (let s = 1; s < sizeU && idx + s < RACK_UNITS; s++) {
        slots[idx + s] = { u: uPos - s, equipment: null, sizeU: 1, continuation: true };
      }
    }

    // Equipamentos sem posição: preencher slots livres de baixo para cima
    let fillIdx = RACK_UNITS - 1; // começa no U1 (base)
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

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Topologia de Racks</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Racks de 44U — {rackedEquipments} de {totalEquipments} equipamentos posicionados
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Legenda compacta */}
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
        </div>
      </div>

      {/* Conteúdo */}
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

      {/* Rodapé */}
      <div className="flex-shrink-0 flex items-center gap-3 text-[10px] text-zinc-600 border-t border-zinc-800 pt-3 flex-wrap">
        <span>Clique em um equipamento para ver detalhes</span>
        <span>•</span>
        <span>Cada coluna = 1 rack de 44U</span>
        <span>•</span>
        <span>Numeração U: 44 no topo → 1 na base</span>
        <span>•</span>
        <span>Equipamentos sem posição são exibidos na base do rack</span>
      </div>
    </div>
  );
}
