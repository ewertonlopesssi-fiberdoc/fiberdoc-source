import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowLeft, Plus, Box, Layers, Pencil, Trash2, Link2, Link2Off, Tag, Printer, Cable, XCircle,
  MapPin, LocateFixed, Loader2, ChevronDown, ChevronRight, GitBranch, LayoutGrid,
} from "lucide-react";
import { CeoFusionPrint } from "@/components/CeoFusionPrint";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Tube = {
  id: number; ceoId: number; bandejaId: number | null;
  type: "tube" | "splitter";
  identifier: string; totalVias: number; color: string | null; notes: string | null;
};
type Via = {
  id: number; tubeId: number; ceoId: number; viaNumber: number;
  label: string | null; fusedToViaId: number | null; fusedToTubeId: number | null;
  fusedToSplitterId: number | null; fusedToSplitterViaId: number | null;
  fiberId: number | null; notes: string | null;
};
type Fiber = {
  id: number; name: string;
  originEquipmentId: number | null; destinationEquipmentId: number | null;
  color: string | null; type: string | null;
  cableId: string | null; notes: string | null;
};
type Bandeja = {
  id: number; ceoId: number; number: number;
  label: string | null; notes: string | null;
};
type Splitter = {
  id: number; ceoId: number; bandejaId: number;
  identifier: string;
  splitterType: "balanced" | "unbalanced";
  ratio: string; notes: string | null;
};
type SplitterVia = {
  id: number; splitterId: number; ceoId: number; viaNumber: number;
  label: string | null; lossDb: number | null; notes: string | null;
};
type ViaAssociation = {
  id: number; ceoId: number;
  sourceType: "tube" | "splitter"; sourceViaId: number;
  targetType: "tube" | "splitter"; targetViaId: number;
  notes: string | null;
};

// ─── Cores ABNT NBR 14705 ────────────────────────────────────────────────────
const FIBER_VIA_COLORS: Record<number, { bg: string; text: string; border: string; label: string; hex: string }> = {
  1:  { bg: "bg-green-500/20",   text: "text-green-300",   border: "border-green-500/40",   label: "Verde",    hex: "#00B050" },
  2:  { bg: "bg-yellow-400/20",  text: "text-yellow-300",  border: "border-yellow-400/40",  label: "Amarelo",  hex: "#FFFF00" },
  3:  { bg: "bg-white/20",       text: "text-white",       border: "border-white/40",       label: "Branco",   hex: "#FFFFFF" },
  4:  { bg: "bg-blue-500/20",    text: "text-blue-300",    border: "border-blue-500/40",    label: "Azul",     hex: "#0070C0" },
  5:  { bg: "bg-red-500/20",     text: "text-red-300",     border: "border-red-500/40",     label: "Vermelho", hex: "#FF0000" },
  6:  { bg: "bg-violet-500/20",  text: "text-violet-300",  border: "border-violet-500/40",  label: "Violeta",  hex: "#7030A0" },
  7:  { bg: "bg-amber-700/20",   text: "text-amber-400",   border: "border-amber-700/40",   label: "Marrom",   hex: "#7B3F00" },
  8:  { bg: "bg-pink-500/20",    text: "text-pink-300",    border: "border-pink-500/40",    label: "Rosa",     hex: "#FF99CC" },
  9:  { bg: "bg-zinc-800/60",    text: "text-zinc-200",    border: "border-zinc-500/40",    label: "Preta",    hex: "#000000" },
  10: { bg: "bg-slate-500/20",   text: "text-slate-300",   border: "border-slate-500/40",   label: "Cinza",    hex: "#808080" },
  11: { bg: "bg-orange-500/20",  text: "text-orange-300",  border: "border-orange-500/40",  label: "Laranja",  hex: "#FF6600" },
  12: { bg: "bg-cyan-500/20",    text: "text-cyan-300",    border: "border-cyan-500/40",    label: "Aqua",     hex: "#00B0F0" },
};

function getSplitterViaColor(viaNumber: number): { bg: string; text: string; border: string } {
  if (viaNumber === 0) return { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/40" };
  const c = FIBER_VIA_COLORS[(viaNumber % 12) || 12];
  return { bg: c.bg, text: c.text, border: c.border };
}

// ─── Splitter ratios ──────────────────────────────────────────────────────────
const BALANCED_RATIOS = ["1:2", "1:4", "1:8", "1:16", "1:32"];
const UNBALANCED_RATIOS = ["1:2_90/10", "1:2_80/20", "1:2_70/30", "1:2_60/40", "1:2_50/50"];
function formatRatio(ratio: string): string {
  if (ratio.includes("_")) {
    const [base, pct] = ratio.split("_");
    return `${base} (${pct})`;
  }
  return ratio;
}

// ─── ViaCard ──────────────────────────────────────────────────────────────────
function ViaCard({
  via, tubes, allVias, fibers,
  onSetFusion, onClearFusion, onEditLabel, onSetFiber, onClearFiber,
}: {
  via: Via; tubes: Tube[]; allVias: Via[]; fibers: Fiber[];
  onSetFusion: (via: Via) => void; onClearFusion: (via: Via) => void;
  onEditLabel: (via: Via) => void; onSetFiber: (via: Via) => void;
  onClearFiber: (viaId: number) => void;
}) {
  const fused = via.fusedToViaId !== null || via.fusedToSplitterId !== null;
  const fusedTube = via.fusedToViaId ? tubes.find(t => t.id === via.fusedToTubeId) : null;
  const fusedVia = via.fusedToViaId ? allVias.find(v => v.id === via.fusedToViaId) : null;
  const fiber = via.fiberId ? fibers.find(f => f.id === via.fiberId) : null;
  const fiberColor = FIBER_VIA_COLORS[via.viaNumber] ?? null;

  return (
    <div className={cn(
      "relative rounded-lg border p-3 transition-all group",
      fused ? "border-cyan-500/40 bg-cyan-500/5" : "border-border/40 bg-card hover:border-border/70"
    )}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs font-bold w-7 h-7 rounded-md flex items-center justify-center border shrink-0",
            fused ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              : fiberColor ? cn(fiberColor.bg, fiberColor.text, fiberColor.border)
              : "bg-muted text-muted-foreground border-border/40"
          )}>
            {String(via.viaNumber).padStart(2, "0")}
          </span>
          {via.label && <span className="text-[10px] text-foreground/70 truncate max-w-[80px]">{via.label}</span>}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEditLabel(via)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar etiqueta"><Tag className="h-3 w-3" /></button>
          {fiber ? (
            <button onClick={() => onClearFiber(via.id)} className="h-5 w-5 rounded flex items-center justify-center text-emerald-400 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remover fibra"><XCircle className="h-3 w-3" /></button>
          ) : (
            <button onClick={() => onSetFiber(via)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors" title="Associar fibra"><Cable className="h-3 w-3" /></button>
          )}
          {fused ? (
            <button onClick={() => onClearFusion(via)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remover fusão"><Link2Off className="h-3 w-3" /></button>
          ) : (
            <button onClick={() => onSetFusion(via)} className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors" title="Identificar fusão"><Link2 className="h-3 w-3" /></button>
          )}

        </div>
      </div>
      {fiber && (
        <div className="text-[10px] text-emerald-300 bg-emerald-500/10 rounded px-2 py-1 border border-emerald-500/20 mb-1">
          <span className="font-medium">FIBRA</span><span className="text-emerald-200/70 mx-1">→</span><span className="truncate">{fiber.name}</span>
        </div>
      )}
      {via.fusedToSplitterId !== null ? (
        <div className="text-[10px] text-purple-300 bg-purple-500/10 rounded px-2 py-1 border border-purple-500/20">
          <span className="font-medium">FUSÃO</span><span className="text-purple-200/70 mx-1">→</span>
          <span>SPLITTER (VIA {via.fusedToSplitterViaId})</span>
        </div>
      ) : fused && fusedTube && fusedVia ? (
        <div className="text-[10px] text-cyan-300 bg-cyan-500/10 rounded px-2 py-1 border border-cyan-500/20">
          <span className="font-medium">FUSÃO</span><span className="text-cyan-200/70 mx-1">→</span>
          <span>VIA {String(fusedVia.viaNumber).padStart(2,"0")} · {fusedTube.identifier}</span>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground/40 italic">livre</div>
      )}

      {via.notes && <p className="text-[10px] text-muted-foreground/50 mt-1 truncate">{via.notes}</p>}
    </div>
  );
}

// ─── SplitterViaCard ──────────────────────────────────────────────────────────
function SplitterViaCard({
  via, splitter, associations, allVias, allSplitterVias, tubes,
  onAssociate, onClearAssociation,
}: {
  via: SplitterVia; splitter: Splitter; associations: ViaAssociation[];
  allVias: Via[]; allSplitterVias: SplitterVia[]; tubes: Tube[];
  onAssociate: (via: SplitterVia, splitter: Splitter) => void;
  onClearAssociation: (assocId: number) => void;
}) {
  const vc = getSplitterViaColor(via.viaNumber);
  const myAssocs = associations.filter(a =>
    (a.sourceType === "splitter" && a.sourceViaId === via.id) ||
    (a.targetType === "splitter" && a.targetViaId === via.id)
  );

  return (
    <div className={cn(
      "relative rounded-lg border p-3 transition-all group",
      myAssocs.length > 0 ? "border-cyan-500/40 bg-cyan-500/5" : "border-border/40 bg-card hover:border-border/70"
    )}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold w-7 h-7 rounded-md flex items-center justify-center border shrink-0", vc.bg, vc.text, vc.border)}>
            {String(via.viaNumber).padStart(2, "0")}
          </span>
          <div>
            <div className="text-[10px] font-medium text-foreground/80">{via.viaNumber === 0 ? "Entrada" : `Saída ${via.viaNumber}`}</div>
            {via.lossDb !== null && via.lossDb !== undefined && (
              <div className="text-[9px] text-amber-300/70">{via.viaNumber === 0 ? "—" : `~${via.lossDb} dB`}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => onAssociate(via, splitter)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-cyan-400 hover:bg-cyan-500/10 transition-colors border border-cyan-500/20" title="Identificar fusão">
            <Link2 className="h-2.5 w-2.5" /> fundir
          </button>
        </div>
      </div>
      {via.label && via.label !== "Entrada" && !via.label.startsWith("Saída") && (
        <div className="text-[10px] text-muted-foreground/70 truncate">{via.label}</div>
      )}
      {myAssocs.map(assoc => {
        const isSrc = assoc.sourceType === "splitter" && assoc.sourceViaId === via.id;
        const otherViaId = isSrc ? assoc.targetViaId : assoc.sourceViaId;
        const otherType = isSrc ? assoc.targetType : assoc.sourceType;
        let otherLabel = `Via #${otherViaId}`;
        if (otherType === "tube") {
          const ov = allVias.find(v => v.id === otherViaId);
          const ot = ov ? tubes.find(t => t.id === ov.tubeId) : null;
          if (ov && ot) otherLabel = `VIA ${String(ov.viaNumber).padStart(2,"0")} · ${ot.identifier}`;
        } else {
          const sv = allSplitterVias.find(v => v.id === otherViaId);
          if (sv) otherLabel = `VIA ${String(sv.viaNumber).padStart(2,"0")} · Splitter`;
        }
        return (
          <div key={assoc.id} className="text-[10px] text-cyan-300 bg-cyan-500/10 rounded px-2 py-1 border border-cyan-500/20 mt-1 flex items-center justify-between gap-1">
            <span><span className="font-medium">FUSÃO</span><span className="text-cyan-200/70 mx-1">→</span>{otherLabel}</span>
            <button onClick={() => onClearAssociation(assoc.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover fusão"><XCircle className="h-3 w-3" /></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── TubePanel ────────────────────────────────────────────────────────────────
function TubePanel({
  tube, tubes, ceoId, fibers, associations, allSplitterVias, splitters,
  onEditTube, onDeleteTube, isAdmin,
}: {
  tube: Tube; tubes: Tube[]; ceoId: number; fibers: Fiber[];
  associations: ViaAssociation[]; allSplitterVias: SplitterVia[]; splitters: Splitter[];
  onEditTube: (tube: Tube) => void; onDeleteTube: (tubeId: number) => void; isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [fusionDialog, setFusionDialog] = useState<Via | null>(null);
  const [assocDialog, setAssocDialog] = useState<Via | null>(null);
  const [assocTargetType, setAssocTargetType] = useState<"tube" | "splitter">("tube");
  const [fusionTubeId, setFusionTubeId] = useState("");
  const [fusionViaNumber, setFusionViaNumber] = useState("");
  const [clearFusionConfirmDialog, setClearFusionConfirmDialog] = useState<Via | null>(null);
  const [labelDialog, setLabelDialog] = useState<Via | null>(null);
  const [labelValue, setLabelValue] = useState("");
  const [labelNotes, setLabelNotes] = useState("");
  const [fiberDialog, setFiberDialog] = useState<Via | null>(null);
  const [fiberSearch, setFiberSearch] = useState("");
  const [selectedFiberId, setSelectedFiberId] = useState("");
  const [viaStatusFilter, setViaStatusFilter] = useState<"all" | "fused" | "free">("all");
  const [assocTargetTubeId, setAssocTargetTubeId] = useState("");
  const [assocTargetViaId, setAssocTargetViaId] = useState("");

  const { data: vias = [], isLoading } = trpc.ceoVias.byTube.useQuery({ tubeId: tube.id });
  const { data: allVias = [] } = trpc.ceoVias.byCeo.useQuery({ ceoId });
  const { data: allSplVias = [] } = trpc.ceoSplitterVias.byCeo.useQuery({ ceoId });

  // fusionTubeId can be "spl_<id>" for splitters or a numeric tube id
  const isFusionTargetSplitter = fusionTubeId.startsWith("spl_");
  const fusionTargetSplitterId = isFusionTargetSplitter ? parseInt(fusionTubeId.replace("spl_", "")) : null;
  const targetTubeVias = isFusionTargetSplitter ? [] : (allVias as Via[]).filter(v => v.tubeId === parseInt(fusionTubeId));
  const targetSplVias = isFusionTargetSplitter ? (allSplVias as SplitterVia[]).filter(v => v.splitterId === fusionTargetSplitterId) : [];
  const otherTubes = tubes.filter(t => t.id !== tube.id);

  const setFusionMutation = trpc.ceoVias.setFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão identificada!");
      utils.ceoVias.byTube.invalidate(); utils.ceoVias.byCeo.invalidate({ ceoId });
      setFusionDialog(null); setFusionTubeId(""); setFusionViaNumber("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const clearFusionMutation = trpc.ceoVias.clearFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão removida!");
      utils.ceoVias.byTube.invalidate(); utils.ceoVias.byCeo.invalidate({ ceoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const updateLabelMutation = trpc.ceoVias.updateLabel.useMutation({
    onSuccess: () => {
      toast.success("Etiqueta salva!");
      utils.ceoVias.byTube.invalidate(); utils.ceoVias.byCeo.invalidate({ ceoId });
      setLabelDialog(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const setFiberMutation = trpc.ceoVias.setFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra associada!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id }); utils.ceoVias.byCeo.invalidate({ ceoId });
      setFiberDialog(null); setSelectedFiberId(""); setFiberSearch("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const clearFiberMutation = trpc.ceoVias.clearFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra desassociada!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id }); utils.ceoVias.byCeo.invalidate({ ceoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const setFusionToSplitterMutation = trpc.ceoVias.setFusionToSplitter.useMutation({
    onSuccess: () => {
      toast.success("Fusão registrada!");
      utils.ceoVias.byTube.invalidate(); utils.ceoVias.byCeo.invalidate({ ceoId });
      setFusionDialog(null); setFusionTubeId(""); setFusionViaNumber("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const createAssocMutation = trpc.ceoViaAssociations.create.useMutation({
    onSuccess: () => {
      toast.success("Fusão registrada!");
      utils.ceoViaAssociations.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      utils.ceoVias.byTube.invalidate();
      setAssocDialog(null);
      setFusionDialog(null); setFusionTubeId(""); setFusionViaNumber("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteAssocMutation = trpc.ceoViaAssociations.delete.useMutation({
    onSuccess: () => {
      toast.success("Fusão removida!");
      utils.ceoViaAssociations.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      utils.ceoVias.byCeo.invalidate({ ceoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function handleSetFusion() {
    if (!fusionDialog || !fusionTubeId || !fusionViaNumber) return;
    if (isFusionTargetSplitter) {
      // Destino é um splitter: gravar fusão direta na via do tubo
      const targetSplVia = targetSplVias.find(v => v.id === parseInt(fusionViaNumber));
      if (!targetSplVia) { toast.error("Via de splitter não encontrada"); return; }
      setFusionToSplitterMutation.mutate({ viaId: fusionDialog.id, fusedToSplitterId: fusionTargetSplitterId, fusedToSplitterViaId: targetSplVia.id });
    } else {
      const targetVia = targetTubeVias.find(v => v.viaNumber === parseInt(fusionViaNumber));
      if (!targetVia) { toast.error("Via não encontrada"); return; }
      setFusionMutation.mutate({ viaId: fusionDialog.id, fusedToTubeId: parseInt(fusionTubeId), fusedToViaId: targetVia.id });
    }
  }

  const fusedCount = (vias as Via[]).filter(v => v.fusedToViaId !== null).length;
  const filteredFibers = fibers.filter(f =>
    fiberSearch === "" || f.name.toLowerCase().includes(fiberSearch.toLowerCase()) || (f.cableId ?? "").toLowerCase().includes(fiberSearch.toLowerCase())
  );
  const assocTargetTubeVias = (allVias as Via[]).filter(v => v.tubeId === parseInt(assocTargetTubeId));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center border",
            tube.type === "splitter" ? "bg-violet-500/10 border-violet-500/20" : "bg-blue-500/10 border-blue-500/20")}>
            <Layers className={cn("h-4 w-4", tube.type === "splitter" ? "text-violet-400" : "text-blue-400")} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{tube.identifier}</h3>
              {tube.color && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40">{tube.color}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{tube.totalVias} vias · {fusedCount} fusionada{fusedCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-20 rounded-full bg-muted overflow-hidden mr-2">
            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${tube.totalVias > 0 ? (fusedCount / tube.totalVias) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-muted-foreground mr-3">{tube.totalVias > 0 ? Math.round((fusedCount / tube.totalVias) * 100) : 0}%</span>
          {isAdmin && (
            <>
              <button onClick={() => onEditTube(tube)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/40" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => onDeleteTube(tube.id)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border/40" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(["all", "fused", "free"] as const).map(s => (
          <button key={s} onClick={() => setViaStatusFilter(s)} className={cn("text-[10px] px-2 py-1 rounded border transition-colors",
            viaStatusFilter === s ? "border-foreground/40 bg-muted text-foreground" : "border-border/30 text-muted-foreground hover:border-border/60")}>
            {s === "all" ? "Todas" : s === "fused" ? "Fusionadas" : "Livres"}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: tube.totalVias }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (() => {
        const filteredVias = (vias as Via[]).filter(v => {
          if (viaStatusFilter === "fused") return v.fusedToViaId !== null;
          if (viaStatusFilter === "free") return v.fusedToViaId === null;
          return true;
        });
        return (
          <>
            {filteredVias.length === 0 && <p className="text-xs text-muted-foreground/50 italic py-2">Nenhuma via encontrada.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
              {filteredVias.map(via => (
                <ViaCard key={via.id} via={via} tubes={tubes} allVias={allVias as Via[]} fibers={fibers}
                  onSetFusion={v => { setFusionDialog(v); setFusionTubeId(""); setFusionViaNumber(""); }}
                  onClearFusion={via => setClearFusionConfirmDialog(via)}
                  onEditLabel={v => { setLabelDialog(v); setLabelValue(v.label ?? ""); setLabelNotes(v.notes ?? ""); }}
                  onSetFiber={v => { setFiberDialog(v); setSelectedFiberId(v.fiberId ? String(v.fiberId) : ""); setFiberSearch(""); }}
                  onClearFiber={id => clearFiberMutation.mutate({ viaId: id })}
                />
              ))}
            </div>
          </>
        );
      })()}

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

      {/* Dialog: Fusão */}
      <Dialog open={fusionDialog !== null} onOpenChange={() => setFusionDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Identificar Fusão — VIA {fusionDialog?.viaNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tubo / Splitter de destino</Label>
              <Select value={fusionTubeId || "__none__"} onValueChange={v => { setFusionTubeId(v === "__none__" ? "" : v); setFusionViaNumber(""); }}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione o tubo ou splitter..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione...</SelectItem>
                  {otherTubes.map(t => <SelectItem key={t.id} value={String(t.id)}>○ {t.identifier} ({t.totalVias} vias)</SelectItem>)}
                  {splitters.map(s => <SelectItem key={`spl_${s.id}`} value={`spl_${s.id}`}>⊕ {s.identifier} ({s.ratio})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fusionTubeId && (
              <div className="space-y-1.5">
                <Label>Via de destino</Label>
                <Select value={fusionViaNumber || "__none__"} onValueChange={v => setFusionViaNumber(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione a via..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {isFusionTargetSplitter
                      ? targetSplVias.map(v => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.viaNumber === 0 ? "ENT (Entrada)" : `Saída ${String(v.viaNumber).padStart(2,"0")}`}{v.label ? ` — ${v.label}` : ""}
                          </SelectItem>
                        ))
                      : targetTubeVias.map(v => (
                          <SelectItem key={v.id} value={String(v.viaNumber)}>
                            VIA {String(v.viaNumber).padStart(2,"0")}{v.label ? ` — ${v.label}` : ""}{v.fusedToViaId !== null ? " (ocupada)" : ""}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFusionDialog(null)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSetFusion} disabled={!fusionTubeId || !fusionViaNumber || setFusionMutation.isPending}>
              {setFusionMutation.isPending ? "Salvando..." : "Confirmar Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Etiqueta */}
      <Dialog open={labelDialog !== null} onOpenChange={() => setLabelDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Etiqueta — VIA {labelDialog?.viaNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Input value={labelValue} onChange={e => setLabelValue(e.target.value)} placeholder="Ex: Cliente João..." className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={labelNotes} onChange={e => setLabelNotes(e.target.value)} placeholder="Notas adicionais..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelDialog(null)} className="border-border/50">Cancelar</Button>
            <Button onClick={() => labelDialog && updateLabelMutation.mutate({ id: labelDialog.id, label: labelValue || null, notes: labelNotes || null })} disabled={updateLabelMutation.isPending}>
              {updateLabelMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Fibra */}
      <Dialog open={fiberDialog !== null} onOpenChange={() => setFiberDialog(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>Associar Fibra — VIA {fiberDialog?.viaNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Buscar fibra</Label>
              <Input value={fiberSearch} onChange={e => setFiberSearch(e.target.value)} placeholder="Nome, cabo..." className="bg-background border-border/50" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 bg-background">
              {filteredFibers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma fibra encontrada</p>
              ) : filteredFibers.map(f => (
                <button key={f.id} onClick={() => setSelectedFiberId(String(f.id))} className={cn("w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-border/30 last:border-0",
                  selectedFiberId === String(f.id) ? "bg-emerald-500/10 text-emerald-300" : "hover:bg-muted text-foreground")}>
                  <div className="font-medium">{f.name}</div>
                  {f.cableId && <div className="text-xs text-muted-foreground mt-0.5">Cabo: {f.cableId}</div>}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFiberDialog(null)} className="border-border/50">Cancelar</Button>
            <Button onClick={() => fiberDialog && selectedFiberId && setFiberMutation.mutate({ viaId: fiberDialog.id, fiberId: parseInt(selectedFiberId) })}
              disabled={!selectedFiberId || setFiberMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {setFiberMutation.isPending ? "Associando..." : "Associar Fibra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

// ─── SplitterPanel ────────────────────────────────────────────────────────────
function SplitterPanel({
  splitter, ceoId, tubes, allVias, associations,
  onEditSplitter, onDeleteSplitter, isAdmin,
}: {
  splitter: Splitter; ceoId: number; tubes: Tube[]; allVias: Via[];
  associations: ViaAssociation[];
  onEditSplitter: (s: Splitter) => void; onDeleteSplitter: (id: number) => void; isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [assocDialog, setAssocDialog] = useState<SplitterVia | null>(null);
  const [assocSplitter, setAssocSplitter] = useState<Splitter | null>(null);
  const [assocTargetType, setAssocTargetType] = useState<"tube" | "splitter">("tube");
  const [assocTargetTubeId, setAssocTargetTubeId] = useState("");
  const [assocTargetViaId, setAssocTargetViaId] = useState("");

  const { data: splitterVias = [] } = trpc.ceoSplitterVias.bySplitter.useQuery({ splitterId: splitter.id });
  const { data: allSplVias = [] } = trpc.ceoSplitterVias.byCeo.useQuery({ ceoId });
  const { data: allViasCeo = [] } = trpc.ceoVias.byCeo.useQuery({ ceoId });

  const createAssocMutation = trpc.ceoViaAssociations.create.useMutation({
    onSuccess: () => {
      toast.success("Fusão registrada!");
      utils.ceoViaAssociations.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.bySplitter.invalidate({ splitterId: splitter.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      utils.ceoVias.byTube.invalidate();
      setAssocDialog(null);
      setAssocTargetTubeId(""); setAssocTargetViaId("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteAssocMutation = trpc.ceoViaAssociations.delete.useMutation({
    onSuccess: () => {
      toast.success("Fusão removida!");
      utils.ceoViaAssociations.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      utils.ceoSplitterVias.bySplitter.invalidate({ splitterId: splitter.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const assocTargetTubeVias = (allViasCeo as Via[]).filter(v => v.tubeId === parseInt(assocTargetTubeId));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center border bg-violet-500/10 border-violet-500/20">
            <GitBranch className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{splitter.identifier}</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/40 text-violet-300">{formatRatio(splitter.ratio)}</Badge>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", splitter.splitterType === "balanced" ? "border-blue-500/40 text-blue-300" : "border-amber-500/40 text-amber-300")}>
                {splitter.splitterType === "balanced" ? "Balanceado" : "Desbalanceado"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{(splitterVias as SplitterVia[]).length} vias (1 entrada + {Math.max(0, (splitterVias as SplitterVia[]).length - 1)} saídas)</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={() => onEditSplitter(splitter)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/40" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => onDeleteSplitter(splitter.id)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border/40" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
        {(splitterVias as SplitterVia[]).map(via => (
          <SplitterViaCard key={via.id} via={via} splitter={splitter}
            associations={associations} allVias={allVias} allSplitterVias={allSplVias as SplitterVia[]} tubes={tubes}
            onAssociate={(v, s) => { setAssocDialog(v); setAssocSplitter(s); setAssocTargetType("tube"); setAssocTargetTubeId(""); setAssocTargetViaId(""); }}
            onClearAssociation={id => deleteAssocMutation.mutate({ id })}
          />
        ))}
      </div>

      {/* Dialog: Associação de Via de Splitter */}
      <Dialog open={assocDialog !== null} onOpenChange={() => setAssocDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Identificar Fusão — VIA {assocDialog?.viaNumber === 0 ? "00 (Entrada)" : assocDialog?.viaNumber} de {assocSplitter?.identifier}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">Selecione o tubo ou splitter de destino para identificar a fusão desta via.</p>
            <div className="space-y-1.5">
              <Label>Tipo de destino</Label>
              <Select value={assocTargetType} onValueChange={v => { setAssocTargetType(v as any); setAssocTargetTubeId(""); setAssocTargetViaId(""); }}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tube">Tubo</SelectItem>
                  <SelectItem value="splitter">Splitter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {assocTargetType === "tube" && (
              <div className="space-y-1.5">
                <Label>Tubo de destino</Label>
                <Select value={assocTargetTubeId || "__none__"} onValueChange={v => { setAssocTargetTubeId(v === "__none__" ? "" : v); setAssocTargetViaId(""); }}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {tubes.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.identifier}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {assocTargetType === "tube" && assocTargetTubeId && (
              <div className="space-y-1.5">
                <Label>Via de destino</Label>
                <Select value={assocTargetViaId || "__none__"} onValueChange={v => setAssocTargetViaId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {assocTargetTubeVias.map(v => <SelectItem key={v.id} value={String(v.id)}>VIA {String(v.viaNumber).padStart(2,"0")}{v.label ? ` — ${v.label}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {assocTargetType === "splitter" && (
              <div className="space-y-1.5">
                <Label>Via de Splitter de destino</Label>
                <Select value={assocTargetViaId || "__none__"} onValueChange={v => setAssocTargetViaId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {(allSplVias as SplitterVia[]).filter(v => v.splitterId !== splitter.id).map(v => <SelectItem key={v.id} value={String(v.id)}>VIA {String(v.viaNumber).padStart(2,"0")} · Splitter #{v.splitterId}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssocDialog(null)} className="border-border/50">Cancelar</Button>
            <Button onClick={() => {
              if (!assocDialog || !assocTargetViaId) return;
              createAssocMutation.mutate({ ceoId, sourceType: "splitter", sourceViaId: assocDialog.id, targetType: assocTargetType, targetViaId: parseInt(assocTargetViaId) });
            }} disabled={!assocTargetViaId || createAssocMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              {createAssocMutation.isPending ? "Salvando..." : "Confirmar Fusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── BandejaPanel ─────────────────────────────────────────────────────────────
function BandejaPanel({
  bandeja, ceoId, tubes, allVias, splitters, associations,
  onEditBandeja, onDeleteBandeja, onAddTube, onEditTube, onDeleteTube,
  onAddSplitter, onEditSplitter, onDeleteSplitter, isAdmin,
}: {
  bandeja: Bandeja; ceoId: number; tubes: Tube[]; allVias: Via[];
  splitters: Splitter[]; associations: ViaAssociation[];
  onEditBandeja: (b: Bandeja) => void; onDeleteBandeja: (id: number) => void;
  onAddTube: (bandejaId: number) => void; onEditTube: (tube: Tube) => void; onDeleteTube: (id: number) => void;
  onAddSplitter: (bandejaId: number) => void; onEditSplitter: (s: Splitter) => void; onDeleteSplitter: (id: number) => void;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const { data: allSplitterVias = [] } = trpc.ceoSplitterVias.byCeo.useQuery({ ceoId });

  const bandejaTubes = tubes.filter(t => t.bandejaId === bandeja.id);
  const bandejaSplitters = splitters.filter(s => s.bandejaId === bandeja.id);
  const totalItems = bandejaTubes.length + bandejaSplitters.length;
  const bandejaVias = allVias.filter(v => bandejaTubes.some(t => t.id === v.tubeId));
  const fusedCount = bandejaVias.filter(v => v.fusedToViaId !== null).length;
  const totalVias = bandejaTubes.reduce((s, t) => s + t.totalVias, 0);

  const tabItems = [
    ...bandejaTubes.map(t => ({ id: `tube-${t.id}`, label: t.identifier, type: "tube" as const, item: t })),
    ...bandejaSplitters.map(s => ({ id: `splitter-${s.id}`, label: s.identifier, type: "splitter" as const, item: s })),
  ];

  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-lg" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-3">
            <button className="text-muted-foreground" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}>
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <LayoutGrid className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">Bandeja {bandeja.number}</span>
                {bandeja.label && <span className="text-xs text-muted-foreground">— {bandeja.label}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {bandejaTubes.length} tubo{bandejaTubes.length !== 1 ? "s" : ""}
                {bandejaSplitters.length > 0 && ` · ${bandejaSplitters.length} splitter${bandejaSplitters.length !== 1 ? "s" : ""}`}
                {totalVias > 0 && ` · ${fusedCount}/${totalVias} vias fusionadas`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10" onClick={() => onAddTube(bandeja.id)}>
                  <Plus className="h-3 w-3" /> Tubo
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10" onClick={() => onAddSplitter(bandeja.id)}>
                  <Plus className="h-3 w-3" /> Splitter
                </Button>
                <button onClick={() => onEditBandeja(bandeja)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/40" title="Editar bandeja"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => onDeleteBandeja(bandeja.id)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border/40" title="Remover bandeja"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
        </div>
        {expanded && (
          <div className="px-4 pb-4">
            {totalItems === 0 ? (
              <div className="py-8 text-center">
                <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Bandeja vazia</p>
                {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">Adicione tubos ou splitters usando os botões acima</p>}
              </div>
            ) : (
              <Tabs defaultValue={tabItems[0]?.id ?? ""}>
                <div className="border-b border-border/50 pb-0 mb-4">
                  <TabsList className="bg-transparent h-auto gap-1 flex-wrap">
                    {tabItems.map(item => (
                      <TabsTrigger key={item.id} value={item.id} className={cn(
                        "text-xs px-3 py-1.5 rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:bg-transparent",
                        item.type === "splitter"
                          ? "data-[state=active]:border-violet-400 data-[state=active]:text-violet-400"
                          : "data-[state=active]:border-blue-400 data-[state=active]:text-blue-400"
                      )}>
                        {item.type === "splitter" ? "⊕" : "○"} {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {tabItems.map(item => (
                  <TabsContent key={item.id} value={item.id} className="mt-0">
                    {item.type === "tube" ? (
                      <TubePanel tube={item.item as Tube} tubes={tubes} ceoId={ceoId} fibers={[]}
                        associations={associations} allSplitterVias={allSplitterVias as SplitterVia[]}
                        splitters={splitters}
                        onEditTube={onEditTube} onDeleteTube={onDeleteTube} isAdmin={isAdmin} />
                    ) : (
                      <SplitterPanel splitter={item.item as Splitter} ceoId={ceoId} tubes={tubes}
                        allVias={allVias} associations={associations}
                        onEditSplitter={onEditSplitter} onDeleteSplitter={onDeleteSplitter} isAdmin={isAdmin} />
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function CeoDetail() {
  const [, params] = useRoute("/ceo/:id");
  const [, setLocation] = useLocation();
  const ceoId = parseInt(params?.id ?? "0");

  const [mainTab, setMainTab] = useState<"bandejas" | "tubos">("bandejas");
  const [geoLoading, setGeoLoading] = useState(false);
  const [printFilterOpen, setPrintFilterOpen] = useState(false);
  const [selectedTubeIds, setSelectedTubeIds] = useState<Set<number>>(new Set());
  const [selectedSplitterPrintIds, setSelectedSplitterPrintIds] = useState<Set<number>>(new Set());

  // Estados de bandeja
  const [bandejaDialog, setBandejaDialog] = useState(false);
  const [editBandeja, setEditBandeja] = useState<Bandeja | null>(null);
  const [deleteBandejaId, setDeleteBandejaId] = useState<number | null>(null);
  const [bandejaForm, setBandejaForm] = useState({ number: "", label: "", notes: "" });

  // Estados de tubo
  const [tubeDialog, setTubeDialog] = useState(false);
  const [editTube, setEditTube] = useState<Tube | null>(null);
  const [deleteTubeId, setDeleteTubeId] = useState<number | null>(null);
  const [tubeBandejaId, setTubeBandejaId] = useState<number | null>(null);
  const [tubeForm, setTubeForm] = useState({ identifier: "", type: "tube" as "tube" | "splitter", totalVias: "12", color: "", notes: "" });

  // Estados de splitter
  const [splitterDialog, setSplitterDialog] = useState(false);
  const [editSplitter, setEditSplitter] = useState<Splitter | null>(null);
  const [deleteSplitterId, setDeleteSplitterId] = useState<number | null>(null);
  const [splitterBandejaId, setSplitterBandejaId] = useState<number | null>(null);
  const [splitterForm, setSplitterForm] = useState({ identifier: "", splitterType: "balanced" as "balanced" | "unbalanced", ratio: "1:8", notes: "" });

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: ceo, isLoading: ceoLoading } = trpc.ceos.byId.useQuery({ id: ceoId }, { enabled: ceoId > 0 });
  const { data: tubes = [], isLoading: tubesLoading } = trpc.ceoTubes.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: allVias = [] } = trpc.ceoVias.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: fibers = [] } = trpc.fibers.list.useQuery({});
  const { data: ceoMapEl } = trpc.ceos.mapElement.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: bandejas = [], isLoading: bandejasLoading } = trpc.ceoBandejas.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: splitters = [] } = trpc.ceoSplitters.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: associations = [] } = trpc.ceoViaAssociations.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: allSplitterViasMain = [] } = trpc.ceoSplitterVias.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });

  const updateCeoMutation = trpc.ceos.update.useMutation({
    onSuccess: () => {
      toast.success("CEO atualizado!");
      utils.ceos.byId.invalidate({ id: ceoId });
      utils.ceos.list.invalidate(); // sincroniza com o mapa
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const createBandejaMutation = trpc.ceoBandejas.create.useMutation({
    onSuccess: () => { toast.success("Bandeja adicionada!"); utils.ceoBandejas.byCeo.invalidate({ ceoId }); setBandejaDialog(false); setBandejaForm({ number: "", label: "", notes: "" }); },
    onError: e => toast.error("Erro: " + e.message),
  });
  const updateBandejaMutation = trpc.ceoBandejas.update.useMutation({
    onSuccess: () => { toast.success("Bandeja atualizada!"); utils.ceoBandejas.byCeo.invalidate({ ceoId }); setBandejaDialog(false); setEditBandeja(null); setBandejaForm({ number: "", label: "", notes: "" }); },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteBandejaMutation = trpc.ceoBandejas.delete.useMutation({
    onSuccess: () => {
      toast.success("Bandeja removida!");
      utils.ceoBandejas.byCeo.invalidate({ ceoId }); utils.ceoTubes.byCeo.invalidate({ ceoId }); utils.ceoSplitters.byCeo.invalidate({ ceoId });
      setDeleteBandejaId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const createTubeMutation = trpc.ceoTubes.create.useMutation({
    onSuccess: () => {
      toast.success("Tubo adicionado!"); utils.ceoTubes.byCeo.invalidate({ ceoId }); utils.ceoVias.byCeo.invalidate({ ceoId });
      setTubeDialog(false); setTubeForm({ identifier: "", type: "tube", totalVias: "12", color: "", notes: "" });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const updateTubeMutation = trpc.ceoTubes.update.useMutation({
    onSuccess: () => {
      toast.success("Tubo atualizado!"); utils.ceoTubes.byCeo.invalidate({ ceoId });
      setTubeDialog(false); setEditTube(null); setTubeForm({ identifier: "", type: "tube", totalVias: "12", color: "", notes: "" });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteTubeMutation = trpc.ceoTubes.delete.useMutation({
    onSuccess: () => {
      toast.success("Tubo removido!"); utils.ceoTubes.byCeo.invalidate({ ceoId }); utils.ceoVias.byCeo.invalidate({ ceoId });
      setDeleteTubeId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const createSplitterMutation = trpc.ceoSplitters.create.useMutation({
    onSuccess: () => {
      toast.success("Splitter adicionado!"); utils.ceoSplitters.byCeo.invalidate({ ceoId }); utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      setSplitterDialog(false); setSplitterForm({ identifier: "", splitterType: "balanced", ratio: "1:8", notes: "" });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const updateSplitterMutation = trpc.ceoSplitters.update.useMutation({
    onSuccess: () => {
      toast.success("Splitter atualizado!"); utils.ceoSplitters.byCeo.invalidate({ ceoId });
      setSplitterDialog(false); setEditSplitter(null); setSplitterForm({ identifier: "", splitterType: "balanced", ratio: "1:8", notes: "" });
    },
    onError: e => toast.error("Erro: " + e.message),
  });
  const deleteSplitterMutation = trpc.ceoSplitters.delete.useMutation({
    onSuccess: () => {
      toast.success("Splitter removido!"); utils.ceoSplitters.byCeo.invalidate({ ceoId }); utils.ceoSplitterVias.byCeo.invalidate({ ceoId });
      setDeleteSplitterId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function handleBandejaSubmit() {
    const num = parseInt(bandejaForm.number, 10);
    if (isNaN(num) || num < 1 || !Number.isFinite(num)) { toast.error("Número da bandeja inválido"); return; }
    if (editBandeja) {
      updateBandejaMutation.mutate({ id: editBandeja.id, number: num, label: bandejaForm.label || null, notes: bandejaForm.notes || null });
    } else {
      createBandejaMutation.mutate({ ceoId, number: num, label: bandejaForm.label || undefined, notes: bandejaForm.notes || undefined });
    }
  }
  function handleTubeSubmit() {
    if (editTube) {
      updateTubeMutation.mutate({ id: editTube.id, identifier: tubeForm.identifier, type: tubeForm.type, color: tubeForm.color || undefined, notes: tubeForm.notes || undefined });
    } else {
      createTubeMutation.mutate({ ceoId, bandejaId: tubeBandejaId ?? undefined, identifier: tubeForm.identifier, type: tubeForm.type, totalVias: parseInt(tubeForm.totalVias) || 12, color: tubeForm.color || undefined, notes: tubeForm.notes || undefined });
    }
  }
  function handleSplitterSubmit() {
    if (!splitterBandejaId) { toast.error("Selecione uma bandeja"); return; }
    if (editSplitter) {
      updateSplitterMutation.mutate({ id: editSplitter.id, identifier: splitterForm.identifier, notes: splitterForm.notes || null });
    } else {
      createSplitterMutation.mutate({
        ceoId, bandejaId: splitterBandejaId,
        identifier: splitterForm.identifier || `SPLITTER ${formatRatio(splitterForm.ratio)}`,
        splitterType: splitterForm.splitterType, ratio: splitterForm.ratio, notes: splitterForm.notes || undefined,
      });
    }
  }

  function openEditBandeja(b: Bandeja) {
    setEditBandeja(b); setBandejaForm({ number: String(b.number), label: b.label ?? "", notes: b.notes ?? "" }); setBandejaDialog(true);
  }
  function openAddTubeInBandeja(bandejaId: number) {
    setEditTube(null); setTubeForm({ identifier: "", type: "tube", totalVias: "12", color: "", notes: "" }); setTubeBandejaId(bandejaId); setTubeDialog(true);
  }
  function openEditTube(tube: Tube) {
    setEditTube(tube); setTubeForm({ identifier: tube.identifier, type: tube.type, totalVias: String(tube.totalVias), color: tube.color ?? "", notes: tube.notes ?? "" }); setTubeBandejaId(tube.bandejaId ?? null); setTubeDialog(true);
  }
  function openAddSplitterInBandeja(bandejaId: number) {
    setEditSplitter(null); setSplitterForm({ identifier: "", splitterType: "balanced", ratio: "1:8", notes: "" }); setSplitterBandejaId(bandejaId); setSplitterDialog(true);
  }
  function openEditSplitter(s: Splitter) {
    setEditSplitter(s); setSplitterForm({ identifier: s.identifier, splitterType: s.splitterType, ratio: s.ratio, notes: s.notes ?? "" }); setSplitterBandejaId(s.bandejaId); setSplitterDialog(true);
  }

  async function handleGetLocation() {
    if (!navigator.geolocation) { toast.error("Geolocalização não suportada"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude;
        let address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`);
          const data = await res.json();
          if (data?.display_name) address = data.display_name;
        } catch { /* ignora */ }
        updateCeoMutation.mutate({ id: ceoId, location: address });
        setGeoLoading(false); toast.success("Localização atualizada!");
      },
      () => { setGeoLoading(false); toast.error("Não foi possível obter a localização"); }
    );
  }

  function handleOpenPrintFilter() {
    setSelectedTubeIds(new Set((tubes as Tube[]).map(t => t.id)));
    setSelectedSplitterPrintIds(new Set((splitters as Splitter[]).map(s => s.id)));
    setPrintFilterOpen(true);
  }
  function handlePrint(printTubes: Tube[], printSplitterIds: Set<number>) {
    const allViasArr = allVias as Via[];
    const allTubesArr = tubes as Tube[];
    const allAssocs = associations as ViaAssociation[];
    const allSplVias = allSplitterViasMain as SplitterVia[];
    const allSplittersArr = splitters as Splitter[];
    const allBandejasArr = bandejas as Bandeja[];
    // Lookup maps
    const tubeById: Record<number, Tube> = {};
    for (const t of allTubesArr) tubeById[t.id] = t;
    const viaById: Record<number, Via> = {};
    for (const v of allViasArr) viaById[v.id] = v;
    const splitterById: Record<number, Splitter> = {};
    for (const s of allSplittersArr) splitterById[s.id] = s;
    const splViaById: Record<number, SplitterVia> = {};
    for (const sv of allSplVias) splViaById[sv.id] = sv;
    const viasByTube: Record<number, Via[]> = {};
    for (const v of allViasArr) { if (!viasByTube[v.tubeId]) viasByTube[v.tubeId] = []; viasByTube[v.tubeId].push(v); }
    for (const k of Object.keys(viasByTube)) viasByTube[Number(k)].sort((a, b) => a.viaNumber - b.viaNumber);
    // Associações por via (sourceViaId e targetViaId)
    const assocsByTubeVia: Record<string, ViaAssociation[]> = {}; // key: "tube_viaId"
    const assocsBySplVia: Record<string, ViaAssociation[]> = {}; // key: "splitter_viaId"
    for (const a of allAssocs) {
      const srcKey = `${a.sourceType}_${a.sourceViaId}`;
      const tgtKey = `${a.targetType}_${a.targetViaId}`;
      if (!assocsByTubeVia[srcKey]) assocsByTubeVia[srcKey] = [];
      assocsByTubeVia[srcKey].push(a);
      if (!assocsBySplVia[tgtKey]) assocsBySplVia[tgtKey] = [];
      assocsBySplVia[tgtKey].push(a);
    }
    function getAssocText(viaId: number, viaType: "tube" | "splitter"): string {
      const key = `${viaType}_${viaId}`;
      const found = [...(assocsByTubeVia[key] ?? []), ...(assocsBySplVia[key] ?? [])];
      if (found.length === 0) return "";
      return found.map(a => {
        // Determinar o outro lado da associação
        const isSource = a.sourceType === viaType && a.sourceViaId === viaId;
        const otherType = isSource ? a.targetType : a.sourceType;
        const otherViaId = isSource ? a.targetViaId : a.sourceViaId;
        if (otherType === "tube") {
          const ov = viaById[otherViaId];
          if (!ov) return "ASSOC (desconhecida)";
          const ot = tubeById[ov.tubeId];
          return `ASSOC &rarr; VIA ${String(ov.viaNumber).padStart(2,"0")} &middot; ${escHtml(ot?.identifier ?? "?")}` ;
        } else {
          const osv = splViaById[otherViaId];
          if (!osv) return "ASSOC (desconhecida)";
          const osp = splitterById[osv.splitterId];
          const svLabel = osv.viaNumber === 0 ? "ENTRADA" : `VIA ${String(osv.viaNumber).padStart(2,"00")}`;
          return `ASSOC &rarr; ${svLabel} &middot; ${escHtml(osp?.identifier ?? "Splitter")}`;
        }
      }).join("; ");
    }
    const totalVias = printTubes.reduce((s, t) => s + t.totalVias, 0);
    const fusedVias = allViasArr.filter(v => v.fusedToViaId !== null && printTubes.some(t => t.id === v.tubeId)).length;
    // Splitters seleccionados
    const printSplitterList = allSplittersArr.filter(s => printSplitterIds.has(s.id));
    const splitterViasMap: Record<number, SplitterVia[]> = {};
    for (const sv of allSplVias) {
      if (!splitterViasMap[sv.splitterId]) splitterViasMap[sv.splitterId] = [];
      splitterViasMap[sv.splitterId].push(sv);
    }
    const now = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const PRINT_VIA_COLORS: Record<number, { bg: string; text: string; border: string }> = {
      1: { bg: "#dcfce7", text: "#15803d", border: "#86efac" }, 2: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
      3: { bg: "#f9fafb", text: "#374151", border: "#d1d5db" }, 4: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
      5: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" }, 6: { bg: "#f3e8ff", text: "#7e22ce", border: "#d8b4fe" },
      7: { bg: "#fef3c7", text: "#78350f", border: "#fcd34d" }, 8: { bg: "#fce7f3", text: "#be185d", border: "#f9a8d4" },
      9: { bg: "#1f2937", text: "#f9fafb", border: "#374151" }, 10: { bg: "#f3f4f6", text: "#374151", border: "#9ca3af" },
      11: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" }, 12: { bg: "#cffafe", text: "#0e7490", border: "#67e8f9" },
    };
    function escHtml(s: string | null | undefined) { return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function renderTubeHtml(tube: Tube): string {
      const vias = viasByTube[tube.id] ?? [];
      const fused = vias.filter(v => v.fusedToViaId !== null).length;
      const assocCount = vias.filter(v => getAssocText(v.id, "tube") !== "").length;
      return `<div class="tube-section"><div class="tube-title">
        TUBO &mdash; ${escHtml(tube.identifier)}
        ${tube.color ? `<span style="font-size:8pt;margin-left:4mm;color:#6b7280;text-transform:uppercase">${escHtml(tube.color)}</span>` : ""}
        <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${tube.totalVias} vias &middot; ${fused} fundida${fused !== 1 ? "s" : ""} &middot; ${assocCount} assoc.</span>
      </div>
      <table><thead><tr><th style="width:8%">VIA</th><th style="width:18%">ETIQUETA</th><th style="width:12%">STATUS</th><th style="width:40%">FUNDIÇÃO / ASSOCIAÇÃO</th><th>OBSERVAÇÕES</th></tr></thead><tbody>
      ${Array.from({ length: tube.totalVias }, (_, i) => i + 1).map(i => {
        const via = vias.find(v => v.viaNumber === i);
        const vc = PRINT_VIA_COLORS[i];
        // Fusão
        const fusedVia = via?.fusedToViaId ? viaById[via.fusedToViaId] : null;
        const fusedTubeObj = fusedVia ? tubeById[fusedVia.tubeId] : null;
        // Associação
        const assocText = via ? getAssocText(via.id, "tube") : "";
        const hasFusion = via?.fusedToViaId != null;
        const hasAssoc = assocText !== "";
        const bg = hasFusion ? "#e0f2fe" : hasAssoc ? "#f0fdf4" : "#fff";
        const statusCell = hasFusion
          ? "<b style='color:#0891b2'>FUNDIDA</b>"
          : hasAssoc
            ? "<b style='color:#16a34a'>ASSOC.</b>"
            : "<span style='color:#9ca3af'>Livre</span>";
        let actionText = "&mdash;";
        if (hasFusion && fusedVia && fusedTubeObj) {
          actionText = `<span style='color:#0891b2;font-weight:600'>FUNDIÇÃO &rarr; VIA ${String(fusedVia.viaNumber).padStart(2,"00")} &middot; ${escHtml(fusedTubeObj.identifier)}</span>`;
        } else if (hasAssoc) {
          actionText = `<span style='color:#16a34a;font-weight:600'>${assocText}</span>`;
        }
        const viaCell = vc ? `<span style="background:${vc.bg};color:${vc.text};border:1px solid ${vc.border};padding:2px 7px;border-radius:3px;font-size:8pt;font-weight:700">${String(i).padStart(2,"00")}</span>` : `<b>${String(i).padStart(2,"00")}</b>`;
        return `<tr style="background:${bg}"><td style="text-align:center">${viaCell}</td><td>${escHtml(via?.label)}</td><td style="text-align:center">${statusCell}</td><td>${actionText}</td><td style="font-size:8pt;color:#6b7280">${escHtml(via?.notes)}</td></tr>`;
      }).join("")}
      </tbody></table></div>`;
    }
    function renderSplitterHtml(splitter: Splitter): string {
      const svias = (splitterViasMap[splitter.id] ?? []).sort((a, b) => a.viaNumber - b.viaNumber);
      const entrada = svias.find(v => v.viaNumber === 0);
      const saidas = svias.filter(v => v.viaNumber > 0);
      const typeLabel = splitter.splitterType === "balanced" ? "Balanceado" : "Desbalanceado";
      const ratioLabel = splitter.ratio.includes("_") ? splitter.ratio.replace("_", " (") + ")" : splitter.ratio;
      return `<div class="tube-section"><div class="tube-title splitter-title">
        &#8853; SPLITTER &mdash; ${escHtml(splitter.identifier)}
        <span style="font-weight:400;font-size:7.5pt;margin-left:4mm;color:#92400e">${typeLabel} &middot; ${ratioLabel}</span>
        <span style="font-weight:400;font-size:8pt;margin-left:6mm;color:#6b7280">${svias.length} vias (1 entrada + ${saidas.length} saídas)</span>
      </div>
      <table><thead><tr><th style="width:8%">VIA</th><th style="width:12%">TIPO</th><th style="width:16%">ETIQUETA</th><th style="width:12%">PERDA (dB)</th><th style="width:32%">ASSOCIAÇÃO</th><th>OBSERVAÇÕES</th></tr></thead><tbody>
      ${[...(entrada ? [entrada] : []), ...saidas].map(sv => {
        const isEntrada = sv.viaNumber === 0;
        const vc = isEntrada ? null : PRINT_VIA_COLORS[(sv.viaNumber % 12) || 12];
        const assocText = getAssocText(sv.id, "splitter");
        const hasAssoc = assocText !== "";
        const rowBg = isEntrada ? "#fefce8" : hasAssoc ? "#f0fdf4" : "#fff";
        const viaLabel = isEntrada ? "ENTRADA" : `SAÍDA ${sv.viaNumber}`;
        const viaNum = isEntrada ? "E" : String(sv.viaNumber).padStart(2,"00");
        const viaCell = vc ? `<span style="background:${vc.bg};color:${vc.text};border:1px solid ${vc.border};padding:2px 6px;border-radius:3px;font-size:8pt;font-weight:700">${viaNum}</span>` : `<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:2px 6px;border-radius:3px;font-size:8pt;font-weight:700">${viaNum}</span>`;
        const lossText = sv.lossDb != null ? `${sv.lossDb.toFixed(1)} dB` : "&mdash;";
        const assocCell = hasAssoc ? `<span style='color:#16a34a;font-weight:600'>${assocText}</span>` : "&mdash;";
        return `<tr style="background:${rowBg}"><td style="text-align:center">${viaCell}</td><td style="font-size:8pt;color:${isEntrada ? '#92400e' : '#374151'}">${viaLabel}</td><td>${escHtml(sv.label)}</td><td style="text-align:center;font-weight:600;color:#7c3aed">${lossText}</td><td>${assocCell}</td><td style="font-size:8pt;color:#6b7280">${escHtml(sv.notes)}</td></tr>`;
      }).join("")}
      </tbody></table></div>`;
    }
    // Organizar por bandeja
    function renderBandejaSection(bandeja: Bandeja | null): string {
      const bandTubes = bandeja
        ? printTubes.filter(t => t.bandejaId === bandeja.id)
        : printTubes.filter(t => !t.bandejaId);
      const bandSplitters = bandeja
        ? printSplitterList.filter(s => s.bandejaId === bandeja.id)
        : printSplitterList.filter(s => !s.bandejaId);
      if (bandTubes.length === 0 && bandSplitters.length === 0) return "";
      const header = bandeja
        ? `<div style="margin-top:8mm;margin-bottom:4mm;padding:4px 10px;background:#1a1a2e;color:white;font-size:10pt;font-weight:700;border-radius:3px">&#9632; BANDEJA ${bandeja.number}${bandeja.label ? ` &mdash; ${escHtml(bandeja.label)}` : ""}</div>`
        : (allBandejasArr.length > 0 ? `<div style="margin-top:8mm;margin-bottom:4mm;padding:4px 10px;background:#374151;color:white;font-size:10pt;font-weight:700;border-radius:3px">&#9632; SEM BANDEJA</div>` : "");
      const tubeHtml = bandTubes.map(t => renderTubeHtml(t)).join("");
      const splHtml = bandSplitters.length > 0
        ? `<div style="margin-top:4mm;border-top:1px dashed #7c3aed;padding-top:3mm"><div style="font-size:9pt;font-weight:700;color:#7c3aed;margin-bottom:3mm">SPLITTERS</div>${bandSplitters.map(s => renderSplitterHtml(s)).join("")}</div>`
        : "";
      return header + tubeHtml + splHtml;
    }
    // Gerar conteúdo organizado por bandeja
    const bandejasSorted = [...allBandejasArr].sort((a, b) => a.number - b.number);
    const allContent = [
      ...bandejasSorted.map(b => renderBandejaSection(b)),
      renderBandejaSection(null), // sem bandeja
    ].join("");
    const ceoName = escHtml(ceo?.name);
    const ceoLocation = ceo?.location ? `<div style="font-size:9pt;color:#6b7280;margin-top:1mm">${escHtml(ceo.location)}</div>` : "";
    const statusColor = ceo?.status === "active" ? "#059669" : "#d97706";
    const statusLabel = ceo?.status === "active" ? "Ativo" : ceo?.status === "maintenance" ? "Manutenção" : "Inativo";
    const statsHtml = [
      { l: "Tubos", v: printTubes.filter(t => t.type !== "splitter").length },
      { l: "Splitters", v: printSplitterList.length },
      { l: "Total de Vias", v: totalVias }, { l: "Vias Fusionadas", v: fusedVias },
      { l: "Vias Livres", v: totalVias - fusedVias },
      { l: "Ocupação", v: totalVias > 0 ? Math.round((fusedVias / totalVias) * 100) + "%" : "0%" },
    ].map(s => `<div class="stat"><div class="stat-val">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Mapa de Fusões — ${ceoName}</title>
    <style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; background: white; padding: 14mm 16mm; }
    h1 { font-size: 16pt; font-weight: 800; color: #1a1a2e; margin-bottom: 2mm; } h2 { font-size: 14pt; font-weight: 700; color: #0891b2; margin-bottom: 1mm; }
    .header { border-bottom: 2px solid #1a1a2e; padding-bottom: 6mm; margin-bottom: 6mm; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-right { text-align: right; font-size: 8pt; color: #6b7280; }
    .stats { display: flex; gap: 6mm; margin-bottom: 6mm; flex-wrap: wrap; }
    .stat { border: 1px solid #ddd; padding: 3mm 5mm; text-align: center; min-width: 22mm; }
    .stat-val { font-size: 14pt; font-weight: 700; color: #1a1a2e; } .stat-lbl { font-size: 7pt; color: #6b7280; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; font-size: 9pt; }
    th { background: #1a1a2e; color: white; padding: 4px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; border: 1px solid #333; }
    td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: middle; }
    .tube-section { margin-bottom: 8mm; page-break-inside: avoid; }
    .tube-title { font-size: 10pt; font-weight: 700; margin-bottom: 2mm; padding: 3px 8px; background: #e8f4f8; border-left: 4px solid #0891b2; }
    .splitter-title { background: #fef3c7; border-left-color: #f59e0b; }
    .footer { border-top: 1px solid #ddd; padding-top: 4mm; margin-top: 6mm; font-size: 7pt; color: #6b7280; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } @page { size: A4 portrait; margin: 14mm 16mm; } }</style>
    </head><body>
    <div class="header"><div><h1>MAPA DE FUSÕES — CEO</h1><h2>${ceoName}</h2>${ceoLocation}</div>
    <div class="header-right"><div style="font-weight:700;font-size:9pt;color:#1a1a2e;margin-bottom:1mm">FiberDoc</div><div>Gerado em: ${now}</div><div style="margin-top:1mm">Status: <b style="color:${statusColor}">${statusLabel}</b></div></div></div>
    <div class="stats">${statsHtml}</div>${allContent}
    <div class="footer"><span>FiberDoc — Sistema de Gestão de Infraestrutura de Rede Óptica</span><span>${ceoName} &middot; ${now}</span></div>
    </body></html>`;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { toast.error("Popup bloqueado pelo navegador."); return; }
    win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  }

  if (ceoLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 rounded-xl" /></div>;
  }
  if (!ceo) {
    return <div className="text-center py-16"><p className="text-muted-foreground">CEO não encontrada.</p><Button variant="link" onClick={() => setLocation("/ceo")} className="mt-2">Voltar</Button></div>;
  }

  const tubeList = tubes as Tube[];
  const bandejaList = bandejas as Bandeja[];
  const splitterList = splitters as Splitter[];
  const assocList = associations as ViaAssociation[];
  const fiberList = fibers as unknown as Fiber[];
  const tubesWithoutBandeja = tubeList.filter(t => !t.bandejaId);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/ceo")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Box className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">{ceo.name}</h1>
            {ceo.location && <p className="text-xs text-muted-foreground">{ceo.location}</p>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={handleGetLocation} disabled={geoLoading || updateCeoMutation.isPending}
              className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
              {geoLoading || updateCeoMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Obtendo...</> : <><LocateFixed className="h-4 w-4" /> Minha Localização</>}
            </Button>
          )}
          {ceoMapEl && (
            <Button variant="outline" onClick={() => setLocation(`/mapa?lat=${ceoMapEl.lat}&lng=${ceoMapEl.lng}&highlight=${ceoMapEl.id}`)} className="gap-2 border-border/50">
              <MapPin className="h-4 w-4" /> Ver no Mapa
            </Button>
          )}
          <Button variant="outline" onClick={handleOpenPrintFilter} className="gap-2 border-border/50">
            <Printer className="h-4 w-4" /> Imprimir Mapa
          </Button>
          {isAdmin && (
            <Button onClick={() => { setEditBandeja(null); setBandejaForm({ number: "", label: "", notes: "" }); setBandejaDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Adicionar Bandeja
            </Button>
          )}
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Bandejas", value: bandejaList.length, color: "text-amber-400" },
          { label: "Tubos", value: tubeList.filter(t => t.type === "tube").length, color: "text-blue-400" },
          { label: "Splitters", value: splitterList.length, color: "text-violet-400" },
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

      {/* Abas principais */}
      <div className="flex gap-2 border-b border-border/50">
        <button onClick={() => setMainTab("bandejas")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
          mainTab === "bandejas" ? "border-amber-400 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <LayoutGrid className="h-4 w-4 inline mr-1.5" />Bandejas ({bandejaList.length})
        </button>
        <button onClick={() => setMainTab("tubos")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
          mainTab === "tubos" ? "border-blue-400 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Layers className="h-4 w-4 inline mr-1.5" />Tubos / Splitters ({tubeList.length})
          {tubesWithoutBandeja.length > 0 && (
            <Badge variant="outline" className="ml-1.5 text-[9px] px-1 py-0 border-amber-500/40 text-amber-300">{tubesWithoutBandeja.length} sem bandeja</Badge>
          )}
        </button>
      </div>

      {/* Conteúdo: Bandejas */}
      {mainTab === "bandejas" && (
        <div className="space-y-4">
          {bandejasLoading ? <Skeleton className="h-32 rounded-xl" /> : bandejaList.length === 0 ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="py-16 text-center">
                <LayoutGrid className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground font-medium">Nenhuma bandeja cadastrada</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Clique em "Adicionar Bandeja" para organizar os tubos e splitters</p>
              </CardContent>
            </Card>
          ) : bandejaList.map(bandeja => (
            <BandejaPanel key={bandeja.id} bandeja={bandeja} ceoId={ceoId}
              tubes={tubeList} allVias={allVias as Via[]} splitters={splitterList} associations={assocList}
              onEditBandeja={openEditBandeja} onDeleteBandeja={id => setDeleteBandejaId(id)}
              onAddTube={openAddTubeInBandeja} onEditTube={openEditTube} onDeleteTube={id => setDeleteTubeId(id)}
              onAddSplitter={openAddSplitterInBandeja} onEditSplitter={openEditSplitter} onDeleteSplitter={id => setDeleteSplitterId(id)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Conteúdo: Tubos (aba legada) */}
      {mainTab === "tubos" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => { setEditTube(null); setTubeForm({ identifier: "", type: "tube", totalVias: "12", color: "", notes: "" }); setTubeBandejaId(null); setTubeDialog(true); }} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar Tubo (sem bandeja)
              </Button>
            </div>
          )}
          {tubesLoading ? <Skeleton className="h-64 rounded-xl" /> : tubesWithoutBandeja.length === 0 ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="py-16 text-center">
                <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground font-medium">Nenhum tubo sem bandeja cadastrado</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Use a aba Bandejas para organizar tubos e splitters</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card">
              <CardContent className="p-0">
                <Tabs defaultValue={String(tubesWithoutBandeja[0]?.id)}>
                  <div className="border-b border-border/50 px-4 pt-3 pb-0">
                    <TabsList className="bg-transparent h-auto gap-1 flex-wrap">
                      {tubesWithoutBandeja.map(tube => (
                        <TabsTrigger key={tube.id} value={String(tube.id)} className={cn(
                          "text-xs px-3 py-1.5 rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:text-primary",
                          tube.type === "splitter" ? "data-[state=active]:border-violet-400 data-[state=active]:text-violet-400" : ""
                        )}>
                          {tube.type === "splitter" ? "⊕" : "○"} {tube.identifier}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  {tubesWithoutBandeja.map(tube => (
                    <TabsContent key={tube.id} value={String(tube.id)} className="p-4 mt-0">
                      <TubePanel tube={tube} tubes={tubeList} ceoId={ceoId} fibers={fiberList}
                        associations={assocList} allSplitterVias={allSplitterViasMain as SplitterVia[]}
                        splitters={splitterList}
                        onEditTube={openEditTube} onDeleteTube={id => setDeleteTubeId(id)} isAdmin={isAdmin} />
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialog: Criar/Editar Bandeja */}
      <Dialog open={bandejaDialog} onOpenChange={setBandejaDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editBandeja ? "Editar Bandeja" : "Adicionar Bandeja"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Número da Bandeja *</Label>
                <Input type="number" min={1} step={1} value={bandejaForm.number} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setBandejaForm({ ...bandejaForm, number: v }); }} placeholder="Ex: 1" className="bg-background border-border/50" />
              </div>
              <div className="space-y-1.5">
                <Label>Etiqueta</Label>
                <Input value={bandejaForm.label} onChange={e => setBandejaForm({ ...bandejaForm, label: e.target.value })} placeholder="Ex: Entrada Principal" className="bg-background border-border/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={bandejaForm.notes} onChange={e => setBandejaForm({ ...bandejaForm, notes: e.target.value })} placeholder="Notas sobre esta bandeja..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBandejaDialog(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleBandejaSubmit} disabled={!bandejaForm.number || createBandejaMutation.isPending || updateBandejaMutation.isPending}>
              {createBandejaMutation.isPending || updateBandejaMutation.isPending ? "Salvando..." : editBandeja ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de bandeja */}
      <Dialog open={deleteBandejaId !== null} onOpenChange={() => setDeleteBandejaId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover Bandeja</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Os splitters desta bandeja serão removidos. Os tubos serão desvinculados mas não apagados. Deseja continuar?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBandejaId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteBandejaId && deleteBandejaMutation.mutate({ id: deleteBandejaId })} disabled={deleteBandejaMutation.isPending}>
              {deleteBandejaMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Criar/Editar Tubo */}
      <Dialog open={tubeDialog} onOpenChange={setTubeDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editTube ? "Editar Tubo/Splitter" : "Adicionar Tubo"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tubeForm.type} onValueChange={v => setTubeForm({ ...tubeForm, type: v as any })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tube">Tubo</SelectItem>
                    <SelectItem value="splitter">Splitter (legado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Identificação *</Label>
                <Input value={tubeForm.identifier} onChange={e => setTubeForm({ ...tubeForm, identifier: e.target.value })} placeholder="Ex: TUBO 1" className="bg-background border-border/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Quantidade de Vias *</Label>
                <Input type="number" min={1} max={256} value={tubeForm.totalVias} onChange={e => setTubeForm({ ...tubeForm, totalVias: e.target.value })} placeholder="Ex: 12" className="bg-background border-border/50" disabled={!!editTube} />
                {editTube && <p className="text-[10px] text-muted-foreground">Não pode ser alterado após criação.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Cor do Tubo</Label>
                <Input value={tubeForm.color} onChange={e => setTubeForm({ ...tubeForm, color: e.target.value })} placeholder="Ex: Azul, Verde..." className="bg-background border-border/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={tubeForm.notes} onChange={e => setTubeForm({ ...tubeForm, notes: e.target.value })} placeholder="Notas sobre este tubo..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTubeDialog(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleTubeSubmit} disabled={!tubeForm.identifier || createTubeMutation.isPending || updateTubeMutation.isPending}>
              {createTubeMutation.isPending || updateTubeMutation.isPending ? "Salvando..." : editTube ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de tubo */}
      <Dialog open={deleteTubeId !== null} onOpenChange={() => setDeleteTubeId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover Tubo/Splitter</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Todas as vias e fusões deste tubo serão removidas. Deseja continuar?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTubeId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTubeId && deleteTubeMutation.mutate({ id: deleteTubeId })} disabled={deleteTubeMutation.isPending}>
              {deleteTubeMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Criar/Editar Splitter */}
      <Dialog open={splitterDialog} onOpenChange={setSplitterDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editSplitter ? "Editar Splitter" : "Adicionar Splitter"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!editSplitter && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo de Splitter</Label>
                    <Select value={splitterForm.splitterType} onValueChange={v => setSplitterForm({ ...splitterForm, splitterType: v as any, ratio: v === "balanced" ? "1:8" : "1:2_90/10" })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">Balanceado</SelectItem>
                        <SelectItem value="unbalanced">Desbalanceado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Razão de Divisão</Label>
                    <Select value={splitterForm.ratio} onValueChange={v => setSplitterForm({ ...splitterForm, ratio: v })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(splitterForm.splitterType === "balanced" ? BALANCED_RATIOS : UNBALANCED_RATIOS).map(r => (
                          <SelectItem key={r} value={r}>{formatRatio(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Preview de perda dB */}
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Perda estimada por via:</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">VIA 00 (Entrada) — 0 dB</span>
                    {splitterForm.splitterType === "balanced" ? (() => {
                      const outputCount = parseInt(splitterForm.ratio.split(":")[1] ?? "2");
                      const lossMap: Record<string, number> = { "1:2": 3.5, "1:4": 7.2, "1:8": 10.5, "1:16": 13.5, "1:32": 17.0 };
                      const loss = lossMap[splitterForm.ratio] ?? 3.5;
                      return Array.from({ length: outputCount }, (_, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">VIA {String(i + 1).padStart(2, "0")} — ~{loss} dB</span>
                      ));
                    })() : (() => {
                      const match = splitterForm.ratio.match(/(\d+)\/(\d+)/);
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
            <div className="space-y-1.5">
              <Label>Identificação</Label>
              <Input value={splitterForm.identifier} onChange={e => setSplitterForm({ ...splitterForm, identifier: e.target.value })} placeholder={`Ex: SPLITTER ${formatRatio(splitterForm.ratio)} #1`} className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={splitterForm.notes} onChange={e => setSplitterForm({ ...splitterForm, notes: e.target.value })} placeholder="Notas sobre este splitter..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitterDialog(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSplitterSubmit} disabled={createSplitterMutation.isPending || updateSplitterMutation.isPending}>
              {createSplitterMutation.isPending || updateSplitterMutation.isPending ? "Salvando..." : editSplitter ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão de splitter */}
      <Dialog open={deleteSplitterId !== null} onOpenChange={() => setDeleteSplitterId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover Splitter</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Todas as vias e associações deste splitter serão removidas. Deseja continuar?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSplitterId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteSplitterId && deleteSplitterMutation.mutate({ id: deleteSplitterId })} disabled={deleteSplitterMutation.isPending}>
              {deleteSplitterMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Filtro de impressão */}
      <Dialog open={printFilterOpen} onOpenChange={setPrintFilterOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Printer className="h-4 w-4" /> Selecionar para Imprimir</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {/* Tubos */}
            {tubeList.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tubos ({selectedTubeIds.size}/{tubeList.length})</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedTubeIds(new Set(tubeList.map(t => t.id)))} className="text-xs text-cyan-400 hover:underline">Todos</button>
                    <span className="text-muted-foreground/40">|</span>
                    <button onClick={() => setSelectedTubeIds(new Set())} className="text-xs text-muted-foreground hover:underline">Nenhum</button>
                  </div>
                </div>
                {tubeList.map(tube => {
                  const checked = selectedTubeIds.has(tube.id);
                  return (
                    <label key={tube.id} className={cn("flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      checked ? "border-cyan-500/40 bg-cyan-500/5" : "border-border/40 hover:bg-muted/30")}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const next = new Set(selectedTubeIds);
                        if (checked) next.delete(tube.id); else next.add(tube.id);
                        setSelectedTubeIds(next);
                      }} className="accent-cyan-500" />
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{tube.identifier}</span>
                        {tube.color && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40 shrink-0">{tube.color}</Badge>}
                        <span className="text-xs text-muted-foreground shrink-0">{tube.totalVias} vias</span>
                      </div>
                    </label>
                  );
                })}
              </>
            )}
            {/* Splitters */}
            {splitterList.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-3 mb-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Splitters ({selectedSplitterPrintIds.size}/{splitterList.length})</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedSplitterPrintIds(new Set(splitterList.map(s => s.id)))} className="text-xs text-violet-400 hover:underline">Todos</button>
                    <span className="text-muted-foreground/40">|</span>
                    <button onClick={() => setSelectedSplitterPrintIds(new Set())} className="text-xs text-muted-foreground hover:underline">Nenhum</button>
                  </div>
                </div>
                {splitterList.map(sp => {
                  const checked = selectedSplitterPrintIds.has(sp.id);
                  return (
                    <label key={sp.id} className={cn("flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      checked ? "border-violet-500/40 bg-violet-500/5" : "border-border/40 hover:bg-muted/30")}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const next = new Set(selectedSplitterPrintIds);
                        if (checked) next.delete(sp.id); else next.add(sp.id);
                        setSelectedSplitterPrintIds(next);
                      }} className="accent-violet-500" />
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{sp.identifier}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/40 text-violet-400 shrink-0">{formatRatio(sp.ratio)}</Badge>
                      </div>
                    </label>
                  );
                })}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintFilterOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              disabled={selectedTubeIds.size === 0 && selectedSplitterPrintIds.size === 0}
              onClick={() => { setPrintFilterOpen(false); handlePrint(tubeList.filter(t => selectedTubeIds.has(t.id)), selectedSplitterPrintIds); }}
              className="gap-2"
            >
              <Printer className="h-4 w-4" /> Imprimir ({selectedTubeIds.size + selectedSplitterPrintIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Componente de impressão */}
      <CeoFusionPrint
        ceo={ceo as any}
        tubes={tubeList as any}
        allVias={allVias as any}
        bandejas={bandejaList as any}
        splitters={splitterList as any}
        allSplitterVias={allSplitterViasMain as any}
        associations={assocList as any}
      />
    </div>
  );
}
