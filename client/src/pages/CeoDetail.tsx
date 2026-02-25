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
} from "lucide-react";
import { CeoFusionPrint } from "@/components/CeoFusionPrint";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Tube = {
  id: number; ceoId: number; type: "tube" | "splitter";
  identifier: string; totalVias: number; color: string | null; notes: string | null;
};
type Via = {
  id: number; tubeId: number; ceoId: number; viaNumber: number;
  label: string | null; fusedToViaId: number | null; fusedToTubeId: number | null;
  fiberId: number | null; notes: string | null;
};
type Fiber = {
  id: number; name: string;
  originEquipmentId: number | null; destinationEquipmentId: number | null;
  color: string | null; type: string | null;
  cableId: string | null; notes: string | null;
};

// ─── Componente: Card de Via ──────────────────────────────────────────────────
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
          <span className={cn(
            "text-xs font-bold w-7 h-7 rounded-md flex items-center justify-center border shrink-0",
            fused
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              : "bg-muted text-muted-foreground border-border/40"
          )}>
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
  tube, tubes, ceoId, fibers,
  onEditTube, onDeleteTube,
}: {
  tube: Tube;
  tubes: Tube[];
  ceoId: number;
  fibers: Fiber[];
  onEditTube: (tube: Tube) => void;
  onDeleteTube: (tubeId: number) => void;
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

  const { data: vias = [], isLoading } = trpc.ceoVias.byTube.useQuery({ tubeId: tube.id });
  const { data: allVias = [] } = trpc.ceoVias.byCeo.useQuery({ ceoId });

  const targetTubeVias = (allVias as Via[]).filter(v => v.tubeId === parseInt(fusionTubeId));

  const setFusionMutation = trpc.ceoVias.setFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão identificada!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      setFusionDialog(null);
      setFusionTubeId("");
      setFusionViaNumber("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const clearFusionMutation = trpc.ceoVias.clearFusion.useMutation({
    onSuccess: () => {
      toast.success("Fusão removida!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateLabelMutation = trpc.ceoVias.updateLabel.useMutation({
    onSuccess: () => {
      toast.success("Etiqueta salva!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id });
      setLabelDialog(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const setFiberMutation = trpc.ceoVias.setFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra associada!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      setFiberDialog(null);
      setSelectedFiberId("");
      setFiberSearch("");
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const clearFiberMutation = trpc.ceoVias.clearFiber.useMutation({
    onSuccess: () => {
      toast.success("Fibra desassociada!");
      utils.ceoVias.byTube.invalidate({ tubeId: tube.id });
      utils.ceoVias.byCeo.invalidate({ ceoId });
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
              : "bg-blue-500/10 border-blue-500/20"
          )}>
            <Layers className={cn("h-4 w-4", tube.type === "splitter" ? "text-violet-400" : "text-blue-400")} />
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

        {/* Botões editar/excluir — aparecem apenas neste tubo */}
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
          <button
            onClick={() => onEditTube(tube)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border/40"
            title={`Editar ${tube.identifier}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteTube(tube.id)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border/40"
            title={`Remover ${tube.identifier}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Grid de vias */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {Array.from({ length: tube.totalVias }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
          {(vias as Via[]).map(via => (
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
      )}

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
              onClick={() => labelDialog && updateLabelMutation.mutate({ id: labelDialog.id, label: labelValue || null, notes: labelNotes || null })}
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
          {(f.originEquipmentId || f.destinationEquipmentId) && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {f.cableId ? `Cabo: ${f.cableId}` : `ID ${f.id}`}
            </div>
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
export default function CeoDetail() {
  const [, params] = useRoute("/ceo/:id");
  const [, setLocation] = useLocation();
  const ceoId = parseInt(params?.id ?? "0");

  const [tubeDialog, setTubeDialog] = useState(false);
  const [editTube, setEditTube] = useState<Tube | null>(null);
  const [deleteTubeId, setDeleteTubeId] = useState<number | null>(null);
  const [tubeForm, setTubeForm] = useState({
    identifier: "", type: "tube" as "tube" | "splitter",
    totalVias: "12", color: "", notes: "",
  });

  const utils = trpc.useUtils();
  const { data: ceo, isLoading: ceoLoading } = trpc.ceos.byId.useQuery({ id: ceoId }, { enabled: ceoId > 0 });
  const { data: tubes = [], isLoading: tubesLoading } = trpc.ceoTubes.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: allVias = [] } = trpc.ceoVias.byCeo.useQuery({ ceoId }, { enabled: ceoId > 0 });
  const { data: fibers = [] } = trpc.fibers.list.useQuery({});

  function handlePrint() {
    window.print();
  }

  const createTubeMutation = trpc.ceoTubes.create.useMutation({
    onSuccess: () => {
      toast.success("Tubo/Splitter adicionado!");
      utils.ceoTubes.byCeo.invalidate({ ceoId });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      setTubeDialog(false);
      resetTubeForm();
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateTubeMutation = trpc.ceoTubes.update.useMutation({
    onSuccess: () => {
      toast.success("Tubo atualizado!");
      utils.ceoTubes.byCeo.invalidate({ ceoId });
      setTubeDialog(false);
      setEditTube(null);
      resetTubeForm();
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deleteTubeMutation = trpc.ceoTubes.delete.useMutation({
    onSuccess: () => {
      toast.success("Tubo removido!");
      utils.ceoTubes.byCeo.invalidate({ ceoId });
      utils.ceoVias.byCeo.invalidate({ ceoId });
      setDeleteTubeId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function resetTubeForm() {
    setTubeForm({ identifier: "", type: "tube", totalVias: "12", color: "", notes: "" });
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
        ceoId,
        identifier: tubeForm.identifier,
        type: tubeForm.type,
        totalVias: parseInt(tubeForm.totalVias) || 12,
        color: tubeForm.color || undefined,
        notes: tubeForm.notes || undefined,
      });
    }
  }

  if (ceoLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!ceo) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">CEO não encontrada.</p>
        <Button variant="link" onClick={() => setLocation("/ceo")} className="mt-2">Voltar</Button>
      </div>
    );
  }

  const tubeList = tubes as Tube[];
  const fiberList = (fibers as unknown) as Fiber[];

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
            {ceo.location && (
              <p className="text-xs text-muted-foreground">{ceo.location}</p>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            className="gap-2 border-border/50"
            title="Imprimir mapa de fusões"
          >
            <Printer className="h-4 w-4" />
            Imprimir Mapa
          </Button>
          <Button
            onClick={() => { setEditTube(null); resetTubeForm(); setTubeDialog(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar Tubo / Splitter
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Tubos", value: tubeList.filter(t => t.type === "tube").length, color: "text-blue-400" },
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
              {/* Apenas as abas de navegação — sem botões aqui */}
              <div className="border-b border-border/50 px-4 pt-3 pb-0">
                <TabsList className="bg-transparent h-auto gap-1 flex-wrap">
                  {tubeList.map(tube => (
                    <TabsTrigger
                      key={tube.id}
                      value={String(tube.id)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary",
                        tube.type === "splitter" ? "data-[state=active]:border-violet-400 data-[state=active]:text-violet-400" : ""
                      )}
                    >
                      {tube.type === "splitter" ? "⊕" : "○"} {tube.identifier}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {/* Cada aba tem seu próprio TubePanel com os botões editar/excluir */}
              {tubeList.map(tube => (
                <TabsContent key={tube.id} value={String(tube.id)} className="p-4 mt-0">
                  <TubePanel
                    tube={tube}
                    tubes={tubeList}
                    ceoId={ceoId}
                    fibers={fiberList}
                    onEditTube={openEditTube}
                    onDeleteTube={id => setDeleteTubeId(id)}
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
                  placeholder="Ex: 12"
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

      {/* Componente de impressão — invisível na tela, visível apenas ao imprimir */}
      <CeoFusionPrint
        ceo={ceo as any}
        tubes={tubeList as any}
        allVias={allVias as any}
      />
    </div>
  );
}
