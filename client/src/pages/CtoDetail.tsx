import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Radio, Layers, Pencil, Trash2, Link2, Link2Off, Tag, Printer, Cable, XCircle, MapPin, LocateFixed, Loader2, Minus,
  Wifi, WifiOff, RefreshCw, Zap, RotateCcw, ChevronDown, ChevronUp,
  Signal, GitBranch, Box, Ruler, Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

import { RATIOS_DESBALANCEADOS } from "@shared/optica/desbalanceado";
// ─── Notificar mapa pai (quando aberto em iframe) ─────────────────────────────
function notifyCtoParent(ctoId: number) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "fiber-doc-invalidate", ctoId }, "*");
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Tube = {
  id: number; ctoId: number; type: "tube" | "splitter";
  identifier: string; totalVias: number; color: string | null; notes: string | null;
  splitterType?: "balanced" | "unbalanced" | null;
  ratio?: string | null;
};

const BALANCED_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"];
// A lista vive em shared/optica/desbalanceado.ts, a mesma que o servidor usa
// para calcular a perda de cada saida. Estava escrita a mao aqui e no CtoDetail,
// e faltavam-lhe o 99/1 e o 95/5: quem quis registar um "S/P 1/99" nao tinha
// onde, ficou o 90/10 que e o valor por omissao, e escreveu a verdade no nome.
// Sao 10 dB de erro no balanco, para o lado optimista.
const UNBALANCED_RATIOS: readonly string[] = RATIOS_DESBALANCEADOS;
function formatRatio(ratio: string): string {
  if (ratio.includes("_")) {
    const [base, pct] = ratio.split("_");
    return `${base} (${pct})`;
  }
  return ratio;
}
type Via = {
  id: number; tubeId: number; ctoId: number; viaNumber: number;
  label: string | null; fusedToViaId: number | null; fusedToTubeId: number | null;
  fiberId: number | null; notes: string | null;
};
type Fiber = {
  id: number; name: string;
  originEquipmentId: number | null; destinationEquipmentId: number | null;
  color: string | null; type: string | null;
  cableId: string | null; notes: string | null;
};

// ─── Cores padrão de fibra óptica (grupo 1, vias 1–12) ───────────────────────────
const FIBER_VIA_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
  1:  { bg: "bg-green-500/20",   text: "text-green-300",   border: "border-green-500/40",   label: "Verde" },
  2:  { bg: "bg-yellow-500/20",  text: "text-yellow-300",  border: "border-yellow-500/40",  label: "Amarelo" },
  3:  { bg: "bg-white/20",       text: "text-white",       border: "border-white/40",       label: "Branco" },
  4:  { bg: "bg-blue-500/20",    text: "text-blue-300",    border: "border-blue-500/40",    label: "Azul" },
  5:  { bg: "bg-red-500/20",     text: "text-red-300",     border: "border-red-500/40",     label: "Vermelho" },
  6:  { bg: "bg-violet-500/20",  text: "text-violet-300",  border: "border-violet-500/40",  label: "Violeta" },
  7:  { bg: "bg-amber-700/20",   text: "text-amber-400",   border: "border-amber-700/40",   label: "Marrom" },
  8:  { bg: "bg-pink-500/20",    text: "text-pink-300",    border: "border-pink-500/40",    label: "Rosa" },
  9:  { bg: "bg-zinc-800/60",    text: "text-zinc-200",    border: "border-zinc-500/40",    label: "Preto" },
  10: { bg: "bg-slate-500/20",   text: "text-slate-300",   border: "border-slate-500/40",   label: "Cinza" },
  11: { bg: "bg-orange-500/20",  text: "text-orange-300",  border: "border-orange-500/40",  label: "Laranja" },
  12: { bg: "bg-cyan-500/20",    text: "text-cyan-300",    border: "border-cyan-500/40",    label: "Aqua" },
};

// ─── Componente: Card de Via ────────────────────────────────────────────────
function ViaCard({
  via, tubes, allVias, fibers, tubeType,
  onSetFusion, onClearFusion, onEditLabel, onClearFiber, onDeleteVia,
}: {
  via: Via;
  tubes: Tube[];
  allVias: Via[];
  fibers: Fiber[];
  tubeType?: "tube" | "splitter";
  onSetFusion: (via: Via) => void;
  onClearFusion: (via: Via) => void;
  onEditLabel: (via: Via) => void;
  onClearFiber: (viaId: number) => void;
  onDeleteVia: (via: Via) => void;
}) {
  const fused = via.fusedToViaId !== null;
  const fusedTube = fused ? tubes.find(t => t.id === via.fusedToTubeId) : null;
  const fusedVia = fused ? allVias.find(v => v.id === via.fusedToViaId) : null;
  const fiber = via.fiberId ? (fibers as Fiber[]).find(f => f.id === via.fiberId) : null;
  const isEntryVia = tubeType === "splitter" && via.viaNumber === 0;
  const fiberColor = isEntryVia ? null : (FIBER_VIA_COLORS[via.viaNumber] ?? null);
  const viaLabel = isEntryVia ? "ENT" : String(via.viaNumber).padStart(2, "0");

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 transition-all group",
        fused
          ? "border-cyan-500/40 bg-cyan-500/5"
          : "border-border/40 bg-card hover:border-border/70"
      )}
    >
      {/* Número da via + ações */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-bold w-7 h-7 rounded-md flex items-center justify-center border shrink-0",
              fused
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                : fiberColor
                  ? cn(fiberColor.bg, fiberColor.text, fiberColor.border)
                  : "bg-muted text-muted-foreground border-border/40"
            )}
            title={isEntryVia ? "Entrada" : (fiberColor ? fiberColor.label : undefined)}
          >
            {viaLabel}
          </span>
          {via.label && (
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{via.label}</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEditLabel(via)}
            className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Editar etiqueta"
          >
            <Tag className="h-3 w-3" />
          </button>
          {/* Fibra */}
          {fiber ? (
            <button
              onClick={() => onClearFiber(via.id)}
              className="h-5 w-5 rounded flex items-center justify-center text-emerald-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remover fibra associada"
            >
              <XCircle className="h-3 w-3" />
            </button>
          ) : null}
          {/* Excluir via (somente se livre) */}
          {!fused && (
            <button
              onClick={() => onDeleteVia(via)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Excluir via"
            >
              <Minus className="h-3 w-3" />
            </button>
          )}
          {/* Fusão */}
          {fused ? (
            <button
              onClick={() => onClearFusion(via)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remover fusão"
            >
              <Link2Off className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={() => onSetFusion(via)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              title="Identificar fusão"
            >
              <Link2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Fibra associada */}
      {fiber && (
        <div className="text-[10px] text-emerald-300 bg-emerald-500/10 rounded px-2 py-1 border border-emerald-500/20 mb-1">
          <span className="font-medium">FIBRA</span>
          <span className="text-emerald-200/70 mx-1">→</span>
          <span className="truncate">{fiber.name}</span>
        </div>
      )}

      {/* Fusão */}
      {fused && fusedTube && fusedVia ? (
        <div className="text-[10px] text-cyan-300 bg-cyan-500/10 rounded px-2 py-1 border border-cyan-500/20">
          <span className="font-medium">IDENT. FUSÃO</span>
          <span className="text-cyan-200/70 mx-1">→</span>
          <span>VIA {fusedVia.viaNumber === 0 ? "ENT" : String(fusedVia.viaNumber).padStart(2, "0")} do {fusedTube.identifier}</span>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground/40 italic">
          IDENT. FUSÃO
        </div>
      )}

      {via.notes && (
        <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">{via.notes}</p>
      )}
    </div>
  );
}

// ─── Componente: Painel de Tubo ───────────────────────────────────────────────
function TubePanel({
  tube, tubes, ctoId, fibers,
  onEditTube, onDeleteTube, isAdmin,
}: {
  tube: Tube;
  tubes: Tube[];
  ctoId: number;
  fibers: Fiber[];
  onEditTube: (tube: Tube) => void;
  onDeleteTube: (tubeId: number) => void;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [fusionDialog, setFusionDialog] = useState<Via | null>(null);
  const [clearFusionConfirmDialog, setClearFusionConfirmDialog] = useState<Via | null>(null);
  const [labelDialog, setLabelDialog] = useState<Via | null>(null);
  const [fiberDialog, setFiberDialog] = useState<Via | null>(null);
  const [fusionTubeId, setFusionTubeId] = useState<string>("");
  const [fusionViaNumber, setFusionViaNumber] = useState<string>("");
  const [labelValue, setLabelValue] = useState("");
  const [labelNotes, setLabelNotes] = useState("");
  const [fiberSearch, setFiberSearch] = useState("");
  const [selectedFiberId, setSelectedFiberId] = useState<string>("");
  const [viaColorFilter, setViaColorFilter] = useState<number | null>(null);
  const [viaStatusFilter, setViaStatusFilter] = useState<"all" | "fused" | "free">("all");
  const [deleteViaConfirmDialog, setDeleteViaConfirmDialog] = useState<Via | null>(null);
  const [sgpClientSearch, setSgpClientSearch] = useState("");
  const [sgpClientSelected, setSgpClientSelected] = useState<{ id: number; name: string; login?: string } | null>(null);

  const { data: vias = [], isLoading } = trpc.ctoVias.byTube.useQuery({ tubeId: tube.id });
  const { data: allVias = [] } = trpc.ctoVias.byCto.useQuery({ ctoId });
  const { data: sgpClients } = trpc.sgp.searchClients.useQuery(
    { query: sgpClientSearch },
    { enabled: sgpClientSearch.length >= 2 }
  );

  const targetTubeVias = (allVias as Via[]).filter(v => v.tubeId === parseInt(fusionTubeId));

  const setFusionMutation = trpc.ctoVias.setFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão identificada!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
      utils.ctoVias.byTube.invalidate();
      notifyCtoParent(ctoId);
      setFusionDialog(null);
      setFusionTubeId("");
      setFusionViaNumber("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const clearFusionMutation = trpc.ctoVias.clearFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão removida!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
      utils.ctoVias.byTube.invalidate();
      notifyCtoParent(ctoId);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateLabelMutation = trpc.ctoVias.update.useMutation({
    onSuccess: () => {
      toast.success("Etiqueta salva!");
      // Invalidar todos os tubos do CTO para reflectir sincronização bidirecional da etiqueta
      utils.ctoVias.byTube.invalidate();
      utils.ctoVias.byCto.invalidate({ ctoId });
      setLabelDialog(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const setFiberMutation = trpc.ctoVias.setFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra associada!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
      setFiberDialog(null);
      setSelectedFiberId("");
      setFiberSearch("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const clearFiberMutation = trpc.ctoVias.clearFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra desassociada!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteViaMutation = trpc.ctoVias.deleteVia.useMutation({
    onSuccess: () => {
      toast.success("Via excluída!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
      setDeleteViaConfirmDialog(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function handleSetFusion() {
    if (!fusionDialog || !fusionTubeId || !fusionViaNumber) return;
    const targetVia = targetTubeVias.find(v => v.viaNumber === parseInt(fusionViaNumber));
    if (!targetVia) { toast.error("Via não encontrada"); return; }
    setFusionMutation.mutate({
      viaId: fusionDialog.id,
      fusedToTubeId: parseInt(fusionTubeId),
      fusedToViaId: targetVia.id,
      // Se um cliente SGP foi seleccionado, usa o nome como label da via
      label: sgpClientSelected ? sgpClientSelected.name : undefined,
    }, {
      onSuccess: () => {
        setSgpClientSearch("");
        setSgpClientSelected(null);
      },
    });
  }

  function openLabelDialog(via: Via) {
    setLabelDialog(via);
    setLabelValue(via.label ?? "");
    setLabelNotes(via.notes ?? "");
  }

  function openFiberDialog(via: Via) {
    setFiberDialog(via);
    setSelectedFiberId(via.fiberId ? String(via.fiberId) : "");
    setFiberSearch("");
  }

  // Para splitters: contar saídas ocupadas (excluir via de entrada viaNumber=0)
  const splitterOutputVias = tube.type === "splitter" ? (vias as Via[]).filter(v => v.viaNumber !== 0) : (vias as Via[]);
  const fusedCount = splitterOutputVias.filter(v => v.fusedToViaId !== null).length;
  const splitterTotalOutputs = tube.type === "splitter" ? splitterOutputVias.length : tube.totalVias;
  const occupancyPct = splitterTotalOutputs > 0 ? Math.round((fusedCount / splitterTotalOutputs) * 100) : 0;
  const occupancyBarColor = occupancyPct >= 90 ? "#ef4444" : occupancyPct >= 60 ? "#f59e0b" : "#22c55e";
  const otherTubes = tubes.filter(t => t.id !== tube.id);

  const filteredFibers = fibers.filter(f =>
    fiberSearch === "" ||
    f.name.toLowerCase().includes(fiberSearch.toLowerCase()) ||
    (f.cableId ?? "").toLowerCase().includes(fiberSearch.toLowerCase()) ||
    (f.notes ?? "").toLowerCase().includes(fiberSearch.toLowerCase())
  );

  return (
    <div>
      {/* Cabeçalho do tubo com botões editar/excluir */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center border",
            tube.type === "splitter"
              ? "bg-violet-500/10 border-violet-500/20"
              : "bg-emerald-500/10 border-emerald-500/20"
          )}>
            <Layers className={cn("h-4 w-4", tube.type === "splitter" ? "text-violet-400" : "text-emerald-400")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{tube.identifier}</h3>
              {tube.color && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40">
                  {tube.color}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {tube.type === "splitter"
                ? `${splitterTotalOutputs} saídas · ${fusedCount} ocupada${fusedCount !== 1 ? "s" : ""}`
                : `${tube.totalVias} vias · ${fusedCount} fusionada${fusedCount !== 1 ? "s" : ""}`
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="h-2 w-20 rounded-full bg-muted overflow-hidden mr-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${occupancyPct}%`, background: occupancyBarColor }}
            />
          </div>
          <span className="text-xs mr-3" style={{ color: occupancyBarColor }}>
            {occupancyPct}%
          </span>
          {isAdmin && (
            <button
              onClick={() => onEditTube(tube)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/40"
              title={`Editar ${tube.identifier}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onDeleteTube(tube.id)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border/40"
              title={`Remover ${tube.identifier}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de filtros de vias */}
      {!isLoading && tube.type === "tube" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1 border border-border/40 rounded-lg p-1">
            {(["all", "fused", "free"] as const).map(s => (
              <button
                key={s}
                onClick={() => setViaStatusFilter(s)}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded transition-colors",
                  viaStatusFilter === s
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "all" ? "Todas" : s === "fused" ? "Fusionadas" : "Livres"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setViaColorFilter(null)}
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors",
                viaColorFilter === null
                  ? "border-foreground/40 bg-muted text-foreground"
                  : "border-border/30 text-muted-foreground hover:border-border/60"
              )}
            >
              Cor: Todas
            </button>
            {Object.entries(FIBER_VIA_COLORS).map(([num, c]) => (
              <button
                key={num}
                onClick={() => setViaColorFilter(viaColorFilter === Number(num) ? null : Number(num))}
                title={c.label}
                className={cn(
                  "w-6 h-6 rounded border-2 transition-all font-bold text-[9px] flex items-center justify-center",
                  c.bg, c.text,
                  viaColorFilter === Number(num)
                    ? "border-white/70 scale-110 shadow-md"
                    : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                )}
              >
                {num}
              </button>
            ))}
          </div>
          {(viaColorFilter !== null || viaStatusFilter !== "all") && (
            <button
              onClick={() => { setViaColorFilter(null); setViaStatusFilter("all"); }}
              className="text-[10px] text-muted-foreground hover:text-destructive ml-1"
            >
              × Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid de vias */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: tube.totalVias }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (() => {
        const filteredVias = (vias as Via[]).filter(v => {
          const colorOk = viaColorFilter === null || v.viaNumber === viaColorFilter;
          const statusOk = viaStatusFilter === "all"
            || (viaStatusFilter === "fused" && v.fusedToViaId !== null)
            || (viaStatusFilter === "free" && v.fusedToViaId === null);
          return colorOk && statusOk;
        });
        return (
          <>
            {filteredVias.length === 0 && (
              <p className="text-xs text-muted-foreground/50 italic py-2">Nenhuma via encontrada com os filtros selecionados.</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
              {filteredVias.map(via => (
                <ViaCard
                  key={via.id}
                  via={via}
                  tubes={tubes}
                  allVias={allVias as Via[]}
                  fibers={fibers}
                  tubeType={tube.type}
                  onSetFusion={v => { setFusionDialog(v); setFusionTubeId(""); setFusionViaNumber(""); }}
                  onClearFusion={via => setClearFusionConfirmDialog(via)}
                  onEditLabel={openLabelDialog}
                  onClearFiber={id => clearFiberMutation.mutate({ viaId: id })}
                  onDeleteVia={v => setDeleteViaConfirmDialog(v)}
                />
              ))}
            </div>
          </>
        );
      })()}

      {/* Dialog: Confirmar Exclusão de Via */}
      <Dialog open={deleteViaConfirmDialog !== null} onOpenChange={() => setDeleteViaConfirmDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Excluir Via</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground mb-2">
              Tem certeza que deseja excluir a <span className="font-semibold">VIA {deleteViaConfirmDialog?.viaNumber}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Esta ação remove a via permanentemente. Vias com fusão ativa não podem ser excluídas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteViaConfirmDialog(null)} className="border-border/50">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => {
              if (deleteViaConfirmDialog) deleteViaMutation.mutate({ viaId: deleteViaConfirmDialog.id });
            }} disabled={deleteViaMutation.isPending}>
              {deleteViaMutation.isPending ? "Excluindo..." : "Excluir Via"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmação de Desfazer Fusão */}
      <Dialog open={clearFusionConfirmDialog !== null} onOpenChange={() => setClearFusionConfirmDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Desfazer Fusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground mb-2">
              Tem certeza que deseja remover a fusão da <span className="font-semibold">VIA {clearFusionConfirmDialog?.viaNumber}</span>?
            </p>
            <p className="text-xs text-muted-foreground">
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearFusionConfirmDialog(null)} className="border-border/50">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => {
              if (clearFusionConfirmDialog) {
                clearFusionMutation.mutate({ viaId: clearFusionConfirmDialog.id });
                setClearFusionConfirmDialog(null);
              }
            }} disabled={clearFusionMutation.isPending}>
              {clearFusionMutation.isPending ? "Removendo..." : "Remover Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Identificar Fusão */}
      <Dialog open={fusionDialog !== null} onOpenChange={() => setFusionDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Identificar Fusão — VIA {fusionDialog?.viaNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Selecione o tubo/splitter de destino e o número da via para registrar a fusão.
            </p>
            <div className="space-y-1.5">
              <Label>Tubo / Splitter de destino</Label>
              <Select value={fusionTubeId || "__none__"} onValueChange={v => { setFusionTubeId(v === "__none__" ? "" : v); setFusionViaNumber(""); }}>
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue placeholder="Selecione o tubo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione...</SelectItem>
                  {otherTubes.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.identifier} ({t.type === "splitter" ? "Splitter" : "Tubo"} · {t.totalVias} vias)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fusionTubeId && (
              <div className="space-y-1.5">
                <Label>Número da Via</Label>
                <Select value={fusionViaNumber || "__none__"} onValueChange={v => setFusionViaNumber(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50">
                    <SelectValue placeholder="Selecione a via..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {targetTubeVias.map(v => (
                      <SelectItem key={v.id} value={String(v.viaNumber)}>
                        VIA {v.viaNumber}{v.label ? ` — ${v.label}` : ""}
                        {v.fusedToViaId ? " (já fusionada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Vincular cliente SGP ao label */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                Vincular cliente SGP (opcional)
              </Label>
              <Input
                placeholder="Pesquisar por nome, login ou contrato..."
                value={sgpClientSearch}
                onChange={e => { setSgpClientSearch(e.target.value); setSgpClientSelected(null); }}
                className="bg-background border-border/50"
              />
              {sgpClients && (sgpClients as any).clients?.length > 0 && !sgpClientSelected && (
                <div className="rounded-md border border-border/50 bg-background max-h-36 overflow-y-auto">
                  {((sgpClients as any).clients as any[]).slice(0, 8).map((c: any) => (
                    <button
                      key={c.id ?? c.login}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                      onClick={() => {
                        setSgpClientSelected({ id: c.id, name: c.nome ?? c.name ?? c.login, login: c.login });
                        setSgpClientSearch(c.nome ?? c.name ?? c.login ?? "");
                      }}
                    >
                      <span className="font-medium">{c.nome ?? c.name ?? c.login}</span>
                      {c.login && <span className="text-muted-foreground ml-2 text-xs">{c.login}</span>}
                    </button>
                  ))}
                </div>
              )}
              {sgpClientSelected && (
                <div className="flex items-center gap-2 p-2 rounded bg-cyan-500/10 border border-cyan-500/20 text-sm">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-300 font-medium">{sgpClientSelected.name}</span>
                  {sgpClientSelected.login && <span className="text-muted-foreground text-xs">({sgpClientSelected.login})</span>}
                  <button onClick={() => { setSgpClientSelected(null); setSgpClientSearch(""); }} className="ml-auto text-muted-foreground hover:text-foreground">×</button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFusionDialog(null)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSetFusion}
              disabled={!fusionTubeId || !fusionViaNumber || setFusionMutation.isPending}
            >
              {setFusionMutation.isPending ? "Salvando..." : "Identificar Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Etiqueta */}
      <Dialog open={labelDialog !== null} onOpenChange={() => setLabelDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Editar Etiqueta — VIA {labelDialog?.viaNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Input
                value={labelValue}
                onChange={e => setLabelValue(e.target.value)}
                placeholder="Ex: Cliente João, Backbone Norte..."
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={labelNotes}
                onChange={e => setLabelNotes(e.target.value)}
                placeholder="Notas adicionais..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialog(null)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={() => labelDialog && updateLabelMutation.mutate({ id: labelDialog.id, label: labelValue || undefined, notes: labelNotes || undefined })}
              disabled={updateLabelMutation.isPending}
            >
              {updateLabelMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Associar Fibra Óptica */}
      <Dialog open={fiberDialog !== null} onOpenChange={() => setFiberDialog(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Associar Fibra — VIA {fiberDialog?.viaNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Selecione a fibra óptica que passa por esta via para criar rastreabilidade completa.
            </p>
            <div className="space-y-1.5">
              <Label>Buscar fibra</Label>
              <Input
                value={fiberSearch}
                onChange={e => setFiberSearch(e.target.value)}
                placeholder="Nome, origem ou destino..."
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fibra óptica</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 bg-background">
                {filteredFibers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma fibra encontrada</p>
                ) : (
                  filteredFibers.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFiberId(String(f.id))}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-border/30 last:border-0",
                        selectedFiberId === String(f.id)
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      <div className="font-medium">{f.name}</div>
                      {f.cableId && (
                        <div className="text-xs text-muted-foreground mt-0.5">Cabo: {f.cableId}</div>
                      )}
                      {(f.color || f.type) && (
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {[f.color, f.type].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFiberDialog(null)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={() => fiberDialog && selectedFiberId && setFiberMutation.mutate({
                viaId: fiberDialog.id,
                fiberId: parseInt(selectedFiberId),
              })}
              disabled={!selectedFiberId || setFiberMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {setFiberMutation.isPending ? "Associando..." : "Associar Fibra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Componente: Painel SGP ONUs ────────────────────────────────────────────
function SgpOnuPanel({ ctoId: _ctoId, sgpCtoId, ctoName: _ctoName }: { ctoId: number; sgpCtoId: number; ctoName: string }) {
  const [expanded, setExpanded] = useState(false);
  const { isAdmin: _isAdmin, isOperator } = useRole();
  const isAdmin = _isAdmin || isOperator;
  const { data, isLoading, refetch } = trpc.sgp.onusByCto.useQuery(
    { sgpCtoId },
    { enabled: expanded }
  );
  const authorizeMut = trpc.sgp.authorizeOnu.useMutation({
    onSuccess: () => { toast.success("ONU autorizada com sucesso"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const resetMut = trpc.sgp.resetOnu.useMutation({
    onSuccess: () => { toast.success("ONU resetada com sucesso"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const onus = (data?.onus ?? []) as any[];
  const online = onus.filter(o => o.status === "online" || o.status === 1 || o.ativo === 1 || o.online === true).length;
  const offline = onus.length - online;

  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-0">
        <button
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="flex items-center gap-3">
            <Wifi className="w-4 h-4 text-cyan-400" />
            <span className="font-medium text-sm">ONUs no SGP</span>
            {onus.length > 0 && (
              <div className="flex gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                  <Wifi className="w-3 h-3 mr-1" />{online} online
                </Badge>
                {offline > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                    <WifiOff className="w-3 h-3 mr-1" />{offline} offline
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {expanded && (
              <button
                onClick={e => { e.stopPropagation(); refetch(); }}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Atualizar"
              >
                <RefreshCw className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border/50 p-4">
            {data?.error && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-red-500/10 text-red-400 border border-red-500/20 mb-3">
                <WifiOff className="w-4 h-4 flex-shrink-0" />{data.error}
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />Carregando ONUs do SGP...
              </div>
            ) : onus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma ONU encontrada nesta CTO</p>
            ) : (
              <div className="space-y-2">
                {onus.map((onu: any, i: number) => {
                  const isOnline = onu.status === "online" || onu.status === 1 || onu.ativo === 1 || onu.online === true;
                  return (
                    <div key={i} className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-sm",
                      isOnline ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                    )}>
                      <div className="flex items-center gap-3">
                        {isOnline
                          ? <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          : <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0" />}
                        <div>
                          <p className="font-medium">{onu.serial ?? onu.mac ?? onu.ident ?? `ONU ${i + 1}`}</p>
                          {(onu.cliente ?? onu.login ?? onu.contrato) && (
                            <p className="text-xs text-muted-foreground">
                              {onu.cliente ?? onu.login ?? `Contrato ${onu.contrato}`}
                            </p>
                          )}
                        </div>
                      </div>
                      {isAdmin && onu.olt_id && (
                        <div className="flex gap-1">
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            disabled={authorizeMut.isPending}
                            onClick={() => authorizeMut.mutate({
                              oltId: onu.olt_id, onu: onu.onu ?? onu.numero ?? 0,
                              slot: onu.slot ?? 0, pon: onu.pon ?? 0,
                            })}
                          >
                            <Zap className="w-3 h-3" />Autorizar
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs gap-1 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                            disabled={resetMut.isPending}
                            onClick={() => resetMut.mutate({
                              oltId: onu.olt_id, onu: onu.onu ?? onu.numero ?? 0,
                              slot: onu.slot ?? 0, pon: onu.pon ?? 0,
                            })}
                          >
                            <RotateCcw className="w-3 h-3" />Resetar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function CtoDetail() {
  const [, params] = useRoute("/cto/:id");
  const [, setLocation] = useLocation();
  const ctoId = parseInt(params?.id ?? "0");

  const [tubeDialog, setTubeDialog] = useState(false);
  const [editTube, setEditTube] = useState<Tube | null>(null);
  const [deleteTubeId, setDeleteTubeId] = useState<number | null>(null);
  const [tubeForm, setTubeForm] = useState({
    identifier: "", type: "tube" as "tube" | "splitter",
    totalVias: "8", color: "", notes: "",
    splitterType: "balanced" as "balanced" | "unbalanced",
    ratio: "1:8",
  });
  const [printFilterOpen, setPrintFilterOpen] = useState(false);
  const [selectedTubeIds, setSelectedTubeIds] = useState<Set<number>>(new Set());
  const [geoLoading, setGeoLoading] = useState(false);

  const { isAdmin: _isAdmin, isOperator } = useRole();
  const isAdmin = _isAdmin || isOperator;
  const utils = trpc.useUtils();
  const { data: cto, isLoading: ctoLoading } = trpc.ctos.byId.useQuery({ id: ctoId }, { enabled: ctoId > 0 });
  const { data: tubes = [], isLoading: tubesLoading } = trpc.ctoTubes.byCto.useQuery({ ctoId }, { enabled: ctoId > 0 });
  const { data: allVias = [] } = trpc.ctoVias.byCto.useQuery({ ctoId }, { enabled: ctoId > 0 });
  const { data: fibers = [] } = trpc.fibers.list.useQuery({});
  const { data: ctoMapEl } = trpc.ctos.mapElement.useQuery({ ctoId }, { enabled: ctoId > 0 });
  // Balanço óptico: buscar estimativa de sinal a partir da OLT
  const { data: opticalBalance } = trpc.infraMap.opticalBalance.useQuery(
    { ctoElementId: ctoMapEl?.id ?? 0 },
    { enabled: (ctoMapEl?.id ?? 0) > 0 }
  );

  const updateCtoMutation = trpc.ctos.update.useMutation({
    onSuccess: () => {
      toast.success("Localização da CTO atualizada!");
      utils.ctos.byId.invalidate({ id: ctoId });
      utils.ctos.list.invalidate();
      notifyCtoParent(ctoId);
    },
    onError: e => toast.error("Erro ao atualizar: " + e.message),
  });

  async function handleGetLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`
          );
          const data = await res.json();
          const newAddress = data?.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          updateCtoMutation.mutate({ id: ctoId, address: newAddress, lat, lng });
        } catch {
          updateCtoMutation.mutate({ id: ctoId, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng });
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === 1) toast.error("Permissão de localização negada. Habilite o GPS no navegador.");
        else if (err.code === 2) toast.error("Posição indisponível. Verifique o GPS do dispositivo.");
        else toast.error("Tempo esgotado ao obter localização.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const createTubeMutation = trpc.ctoTubes.create.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter adicionado!");
      utils.ctoTubes.byCto.invalidate({ ctoId });
      notifyCtoParent(ctoId);
      setTubeDialog(false);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateTubeMutation = trpc.ctoTubes.update.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter atualizado!");
      utils.ctoTubes.byCto.invalidate({ ctoId });
      notifyCtoParent(ctoId);
      setTubeDialog(false);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deleteTubeMutation = trpc.ctoTubes.delete.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter removido!");
      utils.ctoTubes.byCto.invalidate({ ctoId });
      utils.ctoVias.byCto.invalidate({ ctoId });
      notifyCtoParent(ctoId);
      setDeleteTubeId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function resetTubeForm() {
    setTubeForm({ identifier: "", type: "tube", totalVias: "8", color: "", notes: "", splitterType: "balanced", ratio: "1:8" });
  }

  function handleOpenPrintFilter() {
    setSelectedTubeIds(new Set((tubes as Tube[]).map(t => t.id)));
    setPrintFilterOpen(true);
  }

  function handlePrint(tubesToPrint?: Tube[]) {
    const tubeList2 = tubesToPrint ?? (tubes as Tube[]);
    const viaById2: Record<number, any> = {};
    for (const v of allVias as any[]) viaById2[v.id] = v;
    const tubeById2: Record<number, any> = {};
    for (const t of tubeList2) tubeById2[t.id] = t;
    const viasByTube2: Record<number, any[]> = {};
    for (const v of allVias as any[]) {
      if (!viasByTube2[v.tubeId]) viasByTube2[v.tubeId] = [];
      viasByTube2[v.tubeId].push(v);
    }
    for (const k of Object.keys(viasByTube2)) {
      viasByTube2[Number(k)].sort((a: any, b: any) => a.viaNumber - b.viaNumber);
    }
    const totalViasP = tubeList2.reduce((s: number, t: Tube) => s + t.totalVias, 0);
    const fusedViasP = (allVias as any[]).filter((v: any) =>
      v.fusedToViaId !== null && tubeList2.some((t: Tube) => t.id === v.tubeId)
    ).length;
    const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const PRINT_VIA_COLORS: Record<number, { bg: string; text: string; border: string }> = {
      1:  { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
      2:  { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
      3:  { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
      4:  { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
      5:  { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
      6:  { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
      7:  { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
      8:  { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
      9:  { bg: "#1f2937", text: "#f9fafb", border: "#374151" },
      10: { bg: "#f3f4f6", text: "#374151", border: "#9ca3af" },
      11: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
      12: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
    };

    function escHtml(s: string | null | undefined) {
      return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function getColorBadge(colorName: string | null): string {
      if (!colorName) return "";
      const map: Record<string, { bg: string; text: string; border: string }> = {
        azul: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
        verde: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
        amarelo: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
        vermelho: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
        laranja: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
        roxo: { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
        rosa: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
        branco: { bg: "#f9fafb", text: "#374151", border: "#d1d5db" },
        preto: { bg: "#1f2937", text: "#f9fafb", border: "#374151" },
        cinza: { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
        marrom: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
        ciano: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
      };
      const key = colorName.toLowerCase().trim();
      const style = map[key] ?? { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
      return "<span style='background:" + style.bg + ";color:" + style.text + ";border:1px solid " + style.border + ";padding:1px 6px;border-radius:3px;font-size:7pt;font-weight:700;margin-left:6mm'>" + colorName.toUpperCase() + "</span>";
    }

    function renderSoloHtml(tube: any): string {
      const vias = viasByTube2[tube.id] ?? [];
      const fused = vias.filter((v: any) => v.fusedToViaId !== null).length;
      const colorBadge = getColorBadge(tube.color);
      return `
        <div class="tube-section">
          <div class="tube-title${tube.type === "splitter" ? " splitter-title" : ""}">
            ${tube.type === "splitter" ? "SPLITTER" : "TUBO"} &mdash; ${escHtml(tube.identifier)}
            ${colorBadge}
            <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${tube.totalVias} vias &middot; ${fused} fusionada${fused !== 1 ? "s" : ""}</span>
          </div>
          <table><thead><tr>
            <th style="width:8%">VIA</th><th style="width:20%">ETIQUETA</th>
            <th style="width:12%">STATUS</th><th style="width:35%">IDENT. FUS&Atilde;O</th><th>OBSERVA&Ccedil;&Otilde;ES</th>
          </tr></thead><tbody>
          ${vias.map((via: any, idx: number) => {
            const fusedTube2 = via.fusedToTubeId ? tubeById2[via.fusedToTubeId] : null;
            const fusedVia2 = via.fusedToViaId ? viaById2[via.fusedToViaId] : null;
            const isFused = !!(fusedTube2 && fusedVia2);
            const bg = idx % 2 === 0 ? "#fff" : "#f8f9fa";
            const labelCell = via.label ? "<b>" + escHtml(via.label) + "</b>" : "<span style='color:#9ca3af;font-style:italic'>&mdash;</span>";
            const statusCell = isFused
              ? "<span style='background:#d1fae5;color:#059669;padding:1px 5px;border-radius:3px;font-size:7pt;font-weight:700'>FUSIONADA</span>"
              : "<span style='background:#f3f4f6;color:#9ca3af;padding:1px 5px;border-radius:3px;font-size:7pt'>LIVRE</span>";
            const fusionColor = isFused ? "#059669" : "#9ca3af";
            const fusionText = isFused
              ? "VIA " + fusedVia2!.viaNumber + " do " + escHtml(fusedTube2!.identifier) + (fusedVia2!.label ? " (" + escHtml(fusedVia2!.label) + ")" : "")
              : "&mdash;";
            const vc = PRINT_VIA_COLORS[via.viaNumber];
            const viaCell = vc
              ? "<span style='background:" + vc.bg + ";color:" + vc.text + ";border:1px solid " + vc.border + ";padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700'>" + via.viaNumber + "</span>"
              : "<b>" + via.viaNumber + "</b>";
            return "<tr style='background:" + bg + "'>" +
              "<td style='text-align:center'>" + viaCell + "</td>" +
              "<td>" + labelCell + "</td>" +
              "<td style='text-align:center'>" + statusCell + "</td>" +
              "<td style='color:" + fusionColor + "'>" + fusionText + "</td>" +
              "<td style='font-size:8pt;color:#6b7280'>" + escHtml(via.notes) + "</td>" +
              "</tr>";
          }).join("")}
          </tbody></table>
        </div>`;
    }

    const allContent = tubeList2.map((t: any) => renderSoloHtml(t)).join("");
    const ctoName = escHtml(cto?.name);
    const ctoAddr = cto?.address ? "<div style='font-size:9pt;color:#6b7280;margin-top:1mm'>" + escHtml(cto.address) + "</div>" : "";
    const statusColor = cto?.status === "active" ? "#059669" : "#d97706";
    const statusLabel = cto?.status === "active" ? "Ativo" : cto?.status === "maintenance" ? "Manuten&ccedil;&atilde;o" : "Inativo";
    const statsHtml = [
      { l: "Tubos", v: tubeList2.filter(t => t.type === "tube").length },
      { l: "Splitters", v: tubeList2.filter(t => t.type === "splitter").length },
      { l: "Total de Vias", v: totalViasP },
      { l: "Vias Fusionadas", v: fusedViasP },
      { l: "Vias Livres", v: totalViasP - fusedViasP },
      { l: "Ocupa&ccedil;&atilde;o", v: totalViasP > 0 ? Math.round((fusedViasP / totalViasP) * 100) + "%" : "0%" },
    ].map(s => "<div class='stat'><div class='stat-val'>" + s.v + "</div><div class='stat-lbl'>" + s.l + "</div></div>").join("");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8">
      <title>Mapa de Fus&otilde;es &mdash; CTO ${ctoName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: white; padding: 14mm 16mm; }
        h1 { font-size: 16pt; font-weight: 800; color: #1a1a2e; margin-bottom: 2mm; }
        h2 { font-size: 14pt; font-weight: 700; color: #059669; margin-bottom: 1mm; }
        .header { border-bottom: 2px solid #1a1a2e; padding-bottom: 6mm; margin-bottom: 6mm; display: flex; justify-content: space-between; align-items: flex-start; }
        .header-right { text-align: right; font-size: 8pt; color: #6b7280; }
        .stats { display: flex; gap: 6mm; margin-bottom: 6mm; flex-wrap: wrap; }
        .stat { border: 1px solid #ddd; padding: 3mm 5mm; text-align: center; min-width: 22mm; }
        .stat-val { font-size: 14pt; font-weight: 700; color: #1a1a2e; }
        .stat-lbl { font-size: 7pt; color: #6b7280; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; font-size: 9pt; }
        th { background: #1a1a2e; color: white; padding: 4px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; border: 1px solid #333; }
        td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: middle; }
        .tube-section { margin-bottom: 8mm; page-break-inside: avoid; }
        .tube-title { font-size: 10pt; font-weight: 700; margin-bottom: 2mm; padding: 3px 8px; background: #d1fae5; border-left: 4px solid #059669; }
        .splitter-title { background: #f3e8ff; border-left-color: #7c3aed; }
        .footer { border-top: 1px solid #ddd; padding-top: 4mm; margin-top: 6mm; font-size: 7pt; color: #6b7280; display: flex; justify-content: space-between; }
        @media print { body { padding: 0; } @page { size: A4 portrait; margin: 14mm 16mm; } }
      </style>
    </head><body>
      <div class="header">
        <div>
          <h1>MAPA DE FUS&Otilde;ES &mdash; CTO</h1>
          <h2>${ctoName}</h2>
          ${ctoAddr}
        </div>
        <div class="header-right">
          <div style="font-weight:700;font-size:9pt;color:#1a1a2e;margin-bottom:1mm">FiberDoc</div>
          <div>Gerado em: ${now}</div>
          <div style="margin-top:1mm">Status: <b style="color:${statusColor}">${statusLabel}</b></div>
        </div>
      </div>
      <div class="stats">${statsHtml}</div>
      ${allContent}
      <div class="footer">
        <span>FiberDoc &mdash; Sistema de Gest&atilde;o de Infraestrutura de Rede &Oacute;ptica</span>
        <span>${ctoName} &middot; ${now}</span>
      </div>
    </body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Popup bloqueado pelo navegador. Permita popups para este site."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  function openEditTube(tube: Tube) {
    setEditTube(tube);
    setTubeForm({
      identifier: tube.identifier,
      type: tube.type,
      totalVias: String(tube.totalVias),
      color: tube.color ?? "",
      notes: tube.notes ?? "",
      splitterType: (tube.splitterType as any) ?? "balanced",
      ratio: tube.ratio ?? "1:8",
    });
    setTubeDialog(true);
  }

  function handleTubeSubmit() {
    if (!tubeForm.identifier) return;
    const isSpl = tubeForm.type === "splitter";
    if (editTube) {
      updateTubeMutation.mutate({
        id: editTube.id,
        identifier: tubeForm.identifier,
        type: tubeForm.type,
        color: tubeForm.color || undefined,
        notes: tubeForm.notes || undefined,
        ...(isSpl ? { splitterType: tubeForm.splitterType, ratio: tubeForm.ratio } : {}),
      } as any);
    } else {
      createTubeMutation.mutate({
        ctoId,
        identifier: tubeForm.identifier,
        type: tubeForm.type,
        totalVias: isSpl ? parseInt(tubeForm.ratio.split(":")[1] ?? "8") : (parseInt(tubeForm.totalVias) || 8),
        color: tubeForm.color || undefined,
        notes: tubeForm.notes || undefined,
        ...(isSpl ? { splitterType: tubeForm.splitterType, ratio: tubeForm.ratio } : {}),
      } as any);
    }
  }

  if (ctoLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!cto) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">CTO não encontrada.</p>
        <Button variant="link" onClick={() => setLocation("/cto")} className="mt-2">Voltar</Button>
      </div>
    );
  }

  const tubeList = tubes as Tube[];
  const fiberList = (fibers as unknown) as Fiber[];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/cto")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Radio className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">{cto.name}</h1>
            {cto.address && (
              <p className="text-xs text-muted-foreground">{cto.address}</p>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleGetLocation}
              disabled={geoLoading || updateCtoMutation.isPending}
              className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
              title="Atualizar localização com GPS do dispositivo"
            >
              {geoLoading || updateCtoMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Obtendo...</>
              ) : (
                <><LocateFixed className="h-4 w-4" /> Minha Localização</>
              )}
            </Button>
          )}
          {ctoMapEl && (
            <Button
              variant="outline"
              onClick={() => setLocation(`/mapa?lat=${ctoMapEl.lat}&lng=${ctoMapEl.lng}&highlight=${ctoMapEl.id}`)}
              className="gap-2 border-border/50"
              title="Ver localização no mapa"
            >
              <MapPin className="h-4 w-4" />
              Ver no Mapa
            </Button>
          )}
          {tubeList.length > 0 && (
            <Button variant="outline" onClick={handleOpenPrintFilter} className="gap-2">
              <Printer className="h-4 w-4" />
              Mapa de Fusões
            </Button>
          )}
          {isAdmin && (
            <Button
              onClick={() => { setEditTube(null); resetTubeForm(); setTubeDialog(true); }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Tubo / Splitter
            </Button>
          )}
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tubos", value: tubeList.filter(t => t.type === "tube").length, color: "text-emerald-400" },
          { label: "Splitters", value: tubeList.filter(t => t.type === "splitter").length, color: "text-violet-400" },
          { label: "Total de Vias", value: tubeList.reduce((s, t) => s + t.totalVias, 0), color: "text-foreground" },
          { label: "Fusionadas", value: (allVias as Via[]).filter(v => v.fusedToViaId !== null).length, color: "text-cyan-400" },
        ].map(stat => (
          <Card key={stat.label} className="border-border/50 bg-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Painel de Balanço Óptico */}
      {opticalBalance && (() => {
        const ob = opticalBalance as any;
        const rxPower: number | null = ob.rxPowerDbm ?? null;
        const txPower: number = ob.txPowerDbm ?? 0;
        const totalLoss: number = ob.totalLossDb ?? 0;
        const distKm: number = ob.distanceKm ?? 0;
        const cableLoss: number = ob.cableLossDb ?? 0;
        const splitterLoss: number = ob.splitterLossDb ?? 0;
        const fusionLoss: number = ob.fusionLossDb ?? 0;
        const quality: string = ob.signalQuality ?? "no_signal";
        const pathSteps: any[] = ob.path ?? [];
        const warnings: string[] = ob.warnings ?? [];
        // Encontrar o nome da OLT e porta no percurso
        const oltStep = pathSteps.find((s: any) => s.type === "olt");
        const oltLabel = oltStep?.label ?? null;
        // Cor da potência RX
        const rxColor = quality === "optimal" ? "text-emerald-400"
          : quality === "good" ? "text-cyan-400"
          : quality === "marginal" ? "text-amber-400"
          : quality === "weak" ? "text-red-400"
          : "text-muted-foreground";
        const qualityBadgeClass = quality === "optimal" ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
          : quality === "good" ? "border-cyan-500/50 text-cyan-400 bg-cyan-500/10"
          : quality === "marginal" ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
          : quality === "weak" ? "border-red-500/50 text-red-400 bg-red-500/10"
          : "border-border/50 text-muted-foreground";
        const qualityLabel = quality === "optimal" ? "★ Ótimo"
          : quality === "good" ? "● Bom"
          : quality === "marginal" ? "▲ Marginal"
          : quality === "weak" ? "⚠ Fraco"
          : "✕ Sem sinal";
        // Mostrar sempre quando opticalBalance existir (mesmo sem OLT/DGO encontrado)
        // para que o usuário saiba que a CTO está no mapa mas sem sinal rastreado
        return (
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "h-9 w-9 rounded-lg border flex items-center justify-center shrink-0",
                  ob.found ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/30 border-border/30"
                )}>
                  <Zap className={cn("h-4 w-4", ob.found ? "text-amber-400" : "text-muted-foreground")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Balanço Óptico Estimado</h3>
                    {ob.found && (
                      <Badge variant="outline" className={cn("text-xs", qualityBadgeClass)}>
                        {qualityLabel}
                      </Badge>
                    )}
                  </div>
                  {!ob.found ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {warnings.length > 0
                          ? "Rastreio interrompido — verifique os avisos abaixo:"
                          : "Não foi possível calcular — CTO não está conectada a uma OLT ou DGO no mapa."}
                      </p>
                      {warnings.length === 0 && (
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          Verifique se: (1) a CTO tem cabo vinculado, (2) o cabo chega a um CEO com fusões configuradas, (3) existe um vínculo OLT ou DGO no CEO de entrada.
                        </p>
                      )}
                      {warnings.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-amber-400/80">⚠ {w}</p>
                      ))}
                    </div>
                  ) : (
                    <>
                      {/* Grid de métricas principais */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-0.5">Potência RX (CTO)</p>
                          <p className={cn("text-xl font-bold", rxColor)}>
                            {rxPower !== null ? `${rxPower > 0 ? "+" : ""}${rxPower.toFixed(1)}` : "—"} dBm
                          </p>
                        </div>
                        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-0.5">Potência TX (OLT)</p>
                          <p className="text-sm font-semibold text-foreground">{txPower > 0 ? "+" : ""}{txPower.toFixed(1)} dBm</p>
                          {oltLabel && <p className="text-xs text-muted-foreground truncate mt-0.5">{oltLabel}</p>}
                        </div>
                        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-0.5">Distância Total</p>
                          <p className="text-sm font-semibold text-foreground">{distKm.toFixed(2)} km</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Cabo: -{cableLoss.toFixed(1)} dB</p>
                        </div>
                        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                          <p className="text-xs text-muted-foreground mb-0.5">Perda Total</p>
                          <p className="text-sm font-semibold text-red-400">-{totalLoss.toFixed(1)} dB</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {splitterLoss > 0 && `Spl: -${splitterLoss.toFixed(1)} dB`}
                            {splitterLoss > 0 && fusionLoss > 0 && " · "}
                            {fusionLoss > 0 && `Fus: -${fusionLoss.toFixed(1)} dB`}
                          </p>
                        </div>
                      </div>
                      {/* Percurso visual com ícones */}
                      {pathSteps.length > 0 && (() => {
                        // Agrupar: colapsar CEOs sem splitter consecutivos em um único nó
                        // e separar cabos, splitters, reservas e OLT/DGO
                        type Node =
                          | { kind: "source"; label: string; powerDbm: number }
                          | { kind: "cable"; label: string; distKm: number; powerDbm: number }
                          | { kind: "ceo"; label: string; powerDbm: number }
                          | { kind: "splitter"; label: string; lossDb: number; powerDbm: number }
                          | { kind: "reserve"; label: string; powerDbm: number }
                          | { kind: "cto"; label: string; powerDbm: number };

                        const nodes: Node[] = [];
                        for (const step of pathSteps) {
                          const pwr = step.cumulativePowerDbm ?? 0;
                          if (step.type === "olt") {
                            nodes.push({ kind: "source", label: step.label, powerDbm: pwr });
                          } else if (step.type === "cable") {
                            // Detectar reserva técnica pelo label (contém "reserva")
                            if (step.label && step.label.toLowerCase().includes("reserva")) {
                              nodes.push({ kind: "reserve", label: step.label, powerDbm: pwr });
                            } else {
                              nodes.push({ kind: "cable", label: step.label, distKm: step.distKm ?? 0, powerDbm: pwr });
                            }
                          } else if (step.type === "splitter") {
                            nodes.push({ kind: "splitter", label: step.label, lossDb: Math.abs(step.lossDb ?? 0), powerDbm: pwr });
                          } else if (step.type === "ceo") {
                            // Verificar se o próximo step é splitter (CEO com splitter)
                            const nextStep = pathSteps[pathSteps.indexOf(step) + 1];
                            if (nextStep?.type === "splitter") {
                              // CEO com splitter: será tratado junto com o splitter
                              nodes.push({ kind: "ceo", label: step.label, powerDbm: pwr });
                            } else {
                              nodes.push({ kind: "ceo", label: step.label, powerDbm: pwr });
                            }
                          } else if (step.type === "cto") {
                            nodes.push({ kind: "cto", label: step.label, powerDbm: pwr });
                          }
                        }

                        const pwrColor = (dbm: number) =>
                          dbm >= -15 ? "text-emerald-400" :
                          dbm >= -20 ? "text-cyan-400" :
                          dbm >= -25 ? "text-amber-400" :
                          dbm >= -30 ? "text-red-400" : "text-muted-foreground";

                        return (
                          <div className="mt-3">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Percurso do Sinal</p>
                            <div className="flex flex-wrap items-center gap-0.5">
                              {nodes.map((node, i) => (
                                <div key={i} className="flex items-center gap-0.5">
                                  {i > 0 && (
                                    <span className="text-muted-foreground/40 text-xs mx-0.5">›</span>
                                  )}
                                  {node.kind === "source" && (
                                    <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25">
                                      <Signal className="w-3.5 h-3.5 text-amber-400" />
                                      <span className={cn("text-[10px] font-bold font-mono leading-none", pwrColor(node.powerDbm))}>
                                        {node.powerDbm > 0 ? "+" : ""}{node.powerDbm.toFixed(1)}
                                      </span>
                                    </div>
                                  )}
                                  {node.kind === "cable" && (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/20 border border-border/20">
                                      <Cable className="w-2.5 h-2.5 text-muted-foreground/50" />
                                      {node.distKm > 0 && (
                                        <span className="text-[9px] text-muted-foreground/60 font-mono">{(node.distKm * 1000).toFixed(0)}m</span>
                                      )}
                                    </div>
                                  )}
                                  {node.kind === "reserve" && (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                                      <Bookmark className="w-2.5 h-2.5 text-orange-400" />
                                    </div>
                                  )}
                                  {node.kind === "ceo" && (() => {
                                    // Verificar se o próximo nó é splitter
                                    const nextNode = nodes[i + 1];
                                    const hasSplitter = nextNode?.kind === "splitter";
                                    return (
                                      <div className={cn(
                                        "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border",
                                        hasSplitter
                                          ? "bg-violet-500/10 border-violet-500/25"
                                          : "bg-blue-500/10 border-blue-500/20"
                                      )}>
                                        <Box className={cn("w-3.5 h-3.5", hasSplitter ? "text-violet-400" : "text-blue-400")} />
                                        {hasSplitter && (
                                          <span className="text-[9px] text-violet-300/80 font-mono leading-none">
                                            {nextNode.label.match(/1[:/]\d+/)?.[0] ?? "Spl"}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {node.kind === "splitter" && (() => {
                                    // Splitter interno CTO (sem CEO anterior imediato) ou standalone
                                    const prevNode = nodes[i - 1];
                                    if (prevNode?.kind === "ceo") return null; // já renderizado no CEO
                                    return (
                                      <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/25">
                                        <GitBranch className="w-3.5 h-3.5 text-violet-400" />
                                        <span className="text-[9px] text-violet-300/80 font-mono leading-none">
                                          -{node.lossDb.toFixed(1)}dB
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  {node.kind === "cto" && (
                                    <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                                      <span className={cn("text-[10px] font-bold font-mono leading-none", pwrColor(node.powerDbm))}>
                                        {node.powerDbm > 0 ? "+" : ""}{node.powerDbm.toFixed(1)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Avisos */}
                      {warnings.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {warnings.map((w: string, i: number) => (
                            <p key={i} className="text-xs text-amber-400/80">⚠ {w}</p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Painel SGP — ONUs */}
      {cto.sgpId && (
        <SgpOnuPanel ctoId={cto.id} sgpCtoId={cto.sgpId} ctoName={cto.name} />
      )}

      {/* Abas por tubo */}
      {tubesLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : tubeList.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nenhum tubo ou splitter cadastrado</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Clique em "Adicionar Tubo / Splitter" para começar
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 bg-card">
          <CardContent className="p-0">
            <Tabs defaultValue={String(tubeList[0]?.id)}>
              <div className="border-b border-border/50 px-4 pt-3 pb-0">
                <TabsList className="bg-transparent h-auto gap-1 flex-wrap">
                  {tubeList.map(tube => (
                    <TabsTrigger
                      key={tube.id}
                      value={String(tube.id)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary",
                        tube.type === "splitter" ? "data-[state=active]:border-violet-400 data-[state=active]:text-violet-400" : "data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400"
                      )}
                    >
                      {tube.type === "splitter" ? "⊕" : "○"} {tube.identifier}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {tubeList.map(tube => (
                <TabsContent key={tube.id} value={String(tube.id)} className="p-4 mt-0">
                  <TubePanel
                    tube={tube}
                    tubes={tubeList}
                    ctoId={ctoId}
                    fibers={fiberList}
                    onEditTube={openEditTube}
                    onDeleteTube={id => setDeleteTubeId(id)}
                    isAdmin={isAdmin}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Criar/Editar Tubo */}
      <Dialog open={tubeDialog} onOpenChange={setTubeDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editTube ? "Editar Tubo/Splitter" : "Adicionar Tubo / Splitter"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tubeForm.type} onValueChange={v => setTubeForm({ ...tubeForm, type: v as any })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tube">Tubo</SelectItem>
                    <SelectItem value="splitter">Splitter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Identificação *</Label>
                <Input
                  value={tubeForm.identifier}
                  onChange={e => setTubeForm({ ...tubeForm, identifier: e.target.value })}
                  placeholder={tubeForm.type === "splitter" ? `Ex: SPLITTER ${formatRatio(tubeForm.ratio)} #1` : "Ex: TUBO 1"}
                  className="bg-background border-border/50"
                />
              </div>
            </div>
            {tubeForm.type === "splitter" && !editTube && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo de Splitter</Label>
                    <Select value={tubeForm.splitterType} onValueChange={v => setTubeForm({ ...tubeForm, splitterType: v as any, ratio: v === "balanced" ? "1:8" : "1:2_90/10" })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">Balanceado</SelectItem>
                        <SelectItem value="unbalanced">Desbalanceado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Razão de Divisão</Label>
                    <Select value={tubeForm.ratio} onValueChange={v => setTubeForm({ ...tubeForm, ratio: v })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(tubeForm.splitterType === "balanced" ? BALANCED_RATIOS : UNBALANCED_RATIOS).map(r => (
                          <SelectItem key={r} value={r}>{formatRatio(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Perda estimada por via:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">VIA 00 (Entrada) — 0 dB</span>
                    {tubeForm.splitterType === "balanced" ? (() => {
                      const outputCount = parseInt(tubeForm.ratio.split(":")[1] ?? "2");
                      const lossMap: Record<string, number> = { "1:2": 3.5, "1:4": 7.2, "1:8": 10.5, "1:16": 13.5, "1:32": 17.0 };
                      const loss = lossMap[tubeForm.ratio] ?? 3.5;
                      return Array.from({ length: outputCount }, (_, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">VIA {String(i + 1).padStart(2, "0")} — ~{loss} dB</span>
                      ));
                    })() : (() => {
                      const match = tubeForm.ratio.match(/(\d+)\/(\d+)/);
                      if (!match) return null;
                      const p1 = parseInt(match[1]); const p2 = parseInt(match[2]);
                      const loss1 = (-10 * Math.log10(p1 / 100)).toFixed(1);
                      const loss2 = (-10 * Math.log10(p2 / 100)).toFixed(1);
                      return [
                        <span key="1" className="text-[10px] px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">VIA 01 ({p1}%) — ~{loss1} dB</span>,
                        <span key="2" className="text-[10px] px-2 py-1 rounded border border-violet-500/40 bg-violet-500/10 text-violet-300">VIA 02 ({p2}%) — ~{loss2} dB</span>,
                      ];
                    })()}
                  </div>
                </div>
              </>
            )}
            {tubeForm.type !== "splitter" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantidade de Vias *</Label>
                <Input
                  type="number"
                  min={1}
                  max={256}
                  value={tubeForm.totalVias}
                  onChange={e => setTubeForm({ ...tubeForm, totalVias: e.target.value })}
                  placeholder="Ex: 8"
                  className="bg-background border-border/50"
                  disabled={!!editTube}
                />
                {editTube && (
                  <p className="text-[10px] text-muted-foreground">
                    A quantidade de vias não pode ser alterada após a criação.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Cor do Tubo</Label>
                <Input
                  value={tubeForm.color}
                  onChange={e => setTubeForm({ ...tubeForm, color: e.target.value })}
                  placeholder="Ex: Azul, Verde..."
                  className="bg-background border-border/50"
                />
              </div>
            </div>
            )}
            {tubeForm.type === "splitter" && (
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input
                  value={tubeForm.color}
                  onChange={e => setTubeForm({ ...tubeForm, color: e.target.value })}
                  placeholder="Ex: Azul, Verde..."
                  className="bg-background border-border/50"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={tubeForm.notes}
                onChange={e => setTubeForm({ ...tubeForm, notes: e.target.value })}
                placeholder="Notas sobre este tubo..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTubeDialog(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleTubeSubmit}
              disabled={!tubeForm.identifier || createTubeMutation.isPending || updateTubeMutation.isPending}
            >
              {createTubeMutation.isPending || updateTubeMutation.isPending
                ? "Salvando..."
                : editTube ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de tubo */}
      <Dialog open={deleteTubeId !== null} onOpenChange={() => setDeleteTubeId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover Tubo/Splitter</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todas as vias e fusões deste tubo serão removidas. Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTubeId(null)} className="border-border/50">Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTubeId && deleteTubeMutation.mutate({ id: deleteTubeId })}
              disabled={deleteTubeMutation.isPending}
            >
              {deleteTubeMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Filtro de Impressão */}
      <Dialog open={printFilterOpen} onOpenChange={setPrintFilterOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Selecionar Tubos para Imprimir
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-4 text-sm">
              <button className="text-primary hover:underline" onClick={() => setSelectedTubeIds(new Set(tubeList.map(t => t.id)))}>Todos</button>
              <span className="text-muted-foreground">/</span>
              <button className="text-muted-foreground hover:underline" onClick={() => setSelectedTubeIds(new Set())}>Nenhum</button>
              <span className="ml-auto text-muted-foreground text-xs">{selectedTubeIds.size} selecionado{selectedTubeIds.size !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tubeList.map(tube => {
                const viaCount = (allVias as Via[]).filter(v => v.tubeId === tube.id).length;
                const fusedCount2 = (allVias as Via[]).filter(v => v.tubeId === tube.id && v.fusedToViaId !== null).length;
                return (
                  <div key={tube.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer" onClick={() => {
                    const next = new Set(selectedTubeIds);
                    if (next.has(tube.id)) next.delete(tube.id); else next.add(tube.id);
                    setSelectedTubeIds(next);
                  }}>
                    <Checkbox checked={selectedTubeIds.has(tube.id)} onCheckedChange={() => {}} className="pointer-events-none" />
                    <div className={cn("h-7 w-7 rounded flex items-center justify-center text-xs", tube.type === "splitter" ? "bg-violet-500/10 text-violet-400" : "bg-emerald-500/10 text-emerald-400")}>
                      {tube.type === "splitter" ? "⊕" : "○"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tube.identifier}</div>
                      <div className="text-xs text-muted-foreground">{fusedCount2}/{viaCount} vias fusionadas</div>
                    </div>
                    {tube.color && (
                      <Badge variant="outline" className="text-xs shrink-0">{tube.color}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintFilterOpen(false)}>Cancelar</Button>
            <Button
              disabled={selectedTubeIds.size === 0}
              onClick={() => {
                const filtered = tubeList.filter(t => selectedTubeIds.has(t.id));
                setPrintFilterOpen(false);
                handlePrint(filtered);
              }}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Imprimir ({selectedTubeIds.size} tubo{selectedTubeIds.size !== 1 ? "s" : ""})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
