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
  ArrowLeft, Plus, Radio, Layers, Pencil, Trash2, Link2, Link2Off, Tag, Printer, Cable, XCircle, MapPin, LocateFixed, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Tube = {
  id: number; ctoId: number; type: "tube" | "splitter";
  identifier: string; totalVias: number; color: string | null; notes: string | null;
};
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
  via, tubes, allVias, fibers,
  onSetFusion, onClearFusion, onEditLabel, onSetFiber, onClearFiber,
}: {
  via: Via;
  tubes: Tube[];
  allVias: Via[];
  fibers: Fiber[];
  onSetFusion: (via: Via) => void;
  onClearFusion: (viaId: number) => void;
  onEditLabel: (via: Via) => void;
  onSetFiber: (via: Via) => void;
  onClearFiber: (viaId: number) => void;
}) {
  const fused = via.fusedToViaId !== null;
  const fusedTube = fused ? tubes.find(t => t.id === via.fusedToTubeId) : null;
  const fusedVia = fused ? allVias.find(v => v.id === via.fusedToViaId) : null;
  const fiber = via.fiberId ? (fibers as Fiber[]).find(f => f.id === via.fiberId) : null;
  const fiberColor = FIBER_VIA_COLORS[via.viaNumber] ?? null;

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
            title={fiberColor ? fiberColor.label : undefined}
          >
            {via.viaNumber}
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
          {/* Associar fibra */}
          {fiber ? (
            <button
              onClick={() => onClearFiber(via.id)}
              className="h-5 w-5 rounded flex items-center justify-center text-emerald-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Remover fibra associada"
            >
              <XCircle className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={() => onSetFiber(via)}
              className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="Associar fibra óptica"
            >
              <Cable className="h-3 w-3" />
            </button>
          )}
          {/* Fusão */}
          {fused ? (
            <button
              onClick={() => onClearFusion(via.id)}
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
          <span>VIA {fusedVia.viaNumber} do {fusedTube.identifier}</span>
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

  const { data: vias = [], isLoading } = trpc.ctoVias.byTube.useQuery({ tubeId: tube.id });
  const { data: allVias = [] } = trpc.ctoVias.byCto.useQuery({ ctoId });

  const targetTubeVias = (allVias as Via[]).filter(v => v.tubeId === parseInt(fusionTubeId));

  const setFusionMutation = trpc.ctoVias.setFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão identificada!");
      utils.ctoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ctoVias.byCto.invalidate({ ctoId });
      // Sincronização bidirecional: invalidar todas as queries de ctoVias (inclui o mapa)
      utils.ctoVias.byTube.invalidate();
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
      // Sincronização bidirecional: invalidar todas as queries de ctoVias (inclui o mapa)
      utils.ctoVias.byTube.invalidate();
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

  function handleSetFusion() {
    if (!fusionDialog || !fusionTubeId || !fusionViaNumber) return;
    const targetVia = targetTubeVias.find(v => v.viaNumber === parseInt(fusionViaNumber));
    if (!targetVia) { toast.error("Via não encontrada"); return; }
    setFusionMutation.mutate({
      viaId: fusionDialog.id,
      fusedToTubeId: parseInt(fusionTubeId),
      fusedToViaId: targetVia.id,
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

  const fusedCount = (vias as Via[]).filter(v => v.fusedToViaId !== null).length;
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
              {tube.totalVias} vias · {fusedCount} fusionada{fusedCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="h-2 w-20 rounded-full bg-muted overflow-hidden mr-2">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${tube.totalVias > 0 ? (fusedCount / tube.totalVias) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground mr-3">
            {tube.totalVias > 0 ? Math.round((fusedCount / tube.totalVias) * 100) : 0}%
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
                  onSetFusion={v => { setFusionDialog(v); setFusionTubeId(""); setFusionViaNumber(""); }}
                  onClearFusion={id => clearFusionMutation.mutate({ viaId: id })}
                  onEditLabel={openLabelDialog}
                  onSetFiber={openFiberDialog}
                  onClearFiber={id => clearFiberMutation.mutate({ viaId: id })}
                />
              ))}
            </div>
          </>
        );
      })()}

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
  });
  const [printFilterOpen, setPrintFilterOpen] = useState(false);
  const [selectedTubeIds, setSelectedTubeIds] = useState<Set<number>>(new Set());
  const [geoLoading, setGeoLoading] = useState(false);

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();
  const { data: cto, isLoading: ctoLoading } = trpc.ctos.byId.useQuery({ id: ctoId }, { enabled: ctoId > 0 });
  const { data: tubes = [], isLoading: tubesLoading } = trpc.ctoTubes.byCto.useQuery({ ctoId }, { enabled: ctoId > 0 });
  const { data: allVias = [] } = trpc.ctoVias.byCto.useQuery({ ctoId }, { enabled: ctoId > 0 });
  const { data: fibers = [] } = trpc.fibers.list.useQuery({});
  const { data: ctoMapEl } = trpc.ctos.mapElement.useQuery({ ctoId }, { enabled: ctoId > 0 });

  const updateCtoMutation = trpc.ctos.update.useMutation({
    onSuccess: () => {
      toast.success("Localização da CTO atualizada!");
      utils.ctos.byId.invalidate({ id: ctoId });
      utils.ctos.list.invalidate();
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
      setTubeDialog(false);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateTubeMutation = trpc.ctoTubes.update.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter atualizado!");
      utils.ctoTubes.byCto.invalidate({ ctoId });
      setTubeDialog(false);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deleteTubeMutation = trpc.ctoTubes.delete.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter removido!");
      utils.ctoTubes.byCto.invalidate({ ctoId });
      utils.ctoVias.byCto.invalidate({ ctoId });
      setDeleteTubeId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function resetTubeForm() {
    setTubeForm({ identifier: "", type: "tube", totalVias: "8", color: "", notes: "" });
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
    });
    setTubeDialog(true);
  }

  function handleTubeSubmit() {
    if (!tubeForm.identifier) return;
    if (editTube) {
      updateTubeMutation.mutate({
        id: editTube.id,
            identifier: tubeForm.identifier,
        type: tubeForm.type,
        color: tubeForm.color || undefined,
        notes: tubeForm.notes || undefined,
      });
    } else {
      createTubeMutation.mutate({
        ctoId,
        identifier: tubeForm.identifier,
        type: tubeForm.type,
        totalVias: parseInt(tubeForm.totalVias) || 8,
        color: tubeForm.color || undefined,
        notes: tubeForm.notes || undefined,
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
                  placeholder={tubeForm.type === "splitter" ? "Ex: SPLITTER 1*8" : "Ex: TUBO 1"}
                  className="bg-background border-border/50"
                />
              </div>
            </div>
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
