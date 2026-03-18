import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  X, Trash2, Loader2, Link2, Unlink, Move, CheckCircle2,
  Server, Layers, Cable, Plug, ChevronDown, ChevronRight, Edit2, Check,
  Activity, Zap, AlertTriangle, Plus, Pencil, Signal,
} from "lucide-react";

// ─── Diálogo de Criação de DGO no Mapa ────────────────────────────────────────
export function DgoCreateDialog({
  open,
  onClose,
  lat,
  lng,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  onCreated: () => void;
}) {
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const { data: equipmentsRaw = [] } = trpc.equipments.list.useQuery(
    { type: "dgo", search: search || undefined },
    { enabled: open }
  );
  const equipments = equipmentsRaw as any[];

  const createMut = trpc.infraMap.createDgoElement.useMutation({
    onSuccess: () => {
      toast.success("DGO adicionado ao mapa!");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!equipmentId) { toast.error("Selecione um equipamento DGO"); return; }
    createMut.mutate({ equipmentId, lat, lng, notes: notes || undefined });
  };

  useEffect(() => {
    if (open) { setEquipmentId(null); setNotes(""); setSearch(""); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-4 h-4 text-orange-400" />
            Adicionar DGO ao Mapa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Equipamento DGO</label>
            <Input
              placeholder="Buscar DGO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mb-2"
            />
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {equipments.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">
                  Nenhum DGO encontrado. Cadastre em Equipamentos primeiro.
                </p>
              ) : (
                equipments.map((eq: any) => (
                  <div
                    key={eq.id}
                    className={`p-2.5 cursor-pointer hover:bg-accent text-sm border-b last:border-b-0 flex items-center justify-between ${equipmentId === eq.id ? "bg-orange-500/10 border-l-2 border-l-orange-500" : ""}`}
                    onClick={() => setEquipmentId(eq.id)}
                  >
                    <div>
                      <p className="font-medium">{eq.name}</p>
                      {eq.model && <p className="text-xs text-muted-foreground">{eq.model}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {eq.totalPorts ?? "?"} portas
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Observações (opcional)</label>
            <Input
              placeholder="Notas sobre este DGO..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleCreate}
            disabled={!equipmentId || createMut.isPending}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Adicionar ao Mapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini-formulário de vinculação de porta ────────────────────────────────────
function DgoPortLinkForm({
  dgoElementId,
  slotId,
  portNumber,
  existingLink,
  elements,
  onSaved,
  onCancel,
}: {
  dgoElementId: number;
  slotId: number;
  portNumber: number;
  existingLink: any | null;
  elements: any[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const utils = trpc.useUtils();
  const [ceoElementId, setCeoElementId] = useState<number | null>(existingLink?.ceoElementId ?? null);
  const [portId, setPortId] = useState<number | null>(existingLink?.portId ?? null);
  const [equipmentId, setEquipmentId] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>(existingLink?.notes ?? "");
  const [eqSearch, setEqSearch] = useState("");
  const [portSearch, setPortSearch] = useState("");

  // Buscar equipamentos (OLT, switch, etc.) para vincular a porta
  const { data: equipmentsRaw = [] } = trpc.equipments.list.useQuery(
    { search: eqSearch || undefined },
    { enabled: true }
  );
  const equipmentsList = (equipmentsRaw as any[]).filter((e: any) =>
    ["olt", "switch", "patch_panel", "other"].includes(e.type)
  );

  // Buscar portas do equipamento selecionado
  const { data: eqPorts = [] } = trpc.infraMap.portsByEquipmentForDgo.useQuery(
    { equipmentId: equipmentId ?? 0 },
    { enabled: !!equipmentId }
  );
  const eqPortsList = (eqPorts as any[]).filter((p: any) =>
    !portSearch || p.portNumber?.toLowerCase().includes(portSearch.toLowerCase()) ||
    p.label?.toLowerCase().includes(portSearch.toLowerCase()) ||
    p.slotLabel?.toLowerCase().includes(portSearch.toLowerCase())
  );

  // CEOs disponíveis no mapa
  const ceoElements = elements.filter((e: any) => e.type === "ceo");

  const upsertMut = trpc.infraMap.upsertDgoPortLink.useMutation({
    onSuccess: () => {
      toast.success("Porta vinculada!");
      utils.infraMap.dgoPortLinks.invalidate({ dgoElementId });
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.infraMap.deleteDgoPortLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo removido");
      utils.infraMap.dgoPortLinks.invalidate({ dgoElementId });
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    upsertMut.mutate({
      dgoElementId,
      slotId,
      portNumber,
      ceoElementId: ceoElementId ?? null,
      portId: portId ?? null,
      notes: notes || null,
    });
  };

  return (
    <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3 space-y-2.5 text-xs">
      <p className="font-semibold text-orange-300 flex items-center gap-1">
        <Plug className="w-3 h-3" />
        Porta {portNumber} — Configurar vínculo
      </p>

      {/* CEO de passagem */}
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">CEO de passagem (opcional)</label>
        <Select
          value={ceoElementId ? String(ceoElementId) : "none"}
          onValueChange={v => setCeoElementId(v === "none" ? null : Number(v))}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Nenhum CEO" />
          </SelectTrigger>
          <SelectContent className="z-[99999]">
            <SelectItem value="none">Nenhum CEO</SelectItem>
            {ceoElements.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name ?? c.label ?? `CEO #${c.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Equipamento conectado */}
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">Equipamento conectado (opcional)</label>
        <Input
          placeholder="Buscar OLT / switch..."
          value={eqSearch}
          onChange={e => { setEqSearch(e.target.value); setEquipmentId(null); setPortId(null); }}
          className="h-7 text-xs mb-1"
        />
        {!equipmentId && (
          <div className="border rounded max-h-28 overflow-y-auto">
            {equipmentsList.length === 0 ? (
              <p className="text-[10px] text-muted-foreground p-2 text-center">Nenhum equipamento</p>
            ) : (
              equipmentsList.slice(0, 20).map((eq: any) => (
                <div
                  key={eq.id}
                  className="px-2 py-1.5 cursor-pointer hover:bg-accent border-b last:border-b-0 flex items-center justify-between"
                  onClick={() => { setEquipmentId(eq.id); setPortId(null); setEqSearch(eq.name); }}
                >
                  <span className="font-medium">{eq.name}</span>
                  <span className="text-muted-foreground text-[10px]">{eq.type}</span>
                </div>
              ))
            )}
          </div>
        )}
        {equipmentId && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-orange-300">Selecionar porta:</span>
              <button className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={() => { setEquipmentId(null); setPortId(null); setEqSearch(""); }}>
                trocar equipamento
              </button>
            </div>
            <Input
              placeholder="Buscar porta..."
              value={portSearch}
              onChange={e => setPortSearch(e.target.value)}
              className="h-6 text-[10px]"
            />
            <div className="border rounded max-h-28 overflow-y-auto">
              {eqPortsList.length === 0 ? (
                <p className="text-[10px] text-muted-foreground p-2 text-center">Nenhuma porta encontrada</p>
              ) : (
                eqPortsList.slice(0, 30).map((p: any) => (
                  <div
                    key={p.id}
                    className={`px-2 py-1.5 cursor-pointer hover:bg-accent border-b last:border-b-0 flex items-center justify-between ${portId === p.id ? "bg-orange-500/10 border-l-2 border-l-orange-500" : ""}`}
                    onClick={() => setPortId(p.id)}
                  >
                    <div>
                      <span className="font-medium">Porta {p.portNumber}</span>
                      {p.label && <span className="text-muted-foreground ml-1">({p.label})</span>}
                      {p.slotLabel && <span className="text-muted-foreground ml-1">— {p.slotLabel}</span>}
                    </div>
                    {p.connectedToEquipmentName && (
                      <span className="text-[9px] text-emerald-400 ml-1">→ {p.connectedToEquipmentName}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Observações */}
      <Input
        placeholder="Observações (opcional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="h-7 text-xs"
      />

      {/* Botões */}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-orange-600 hover:bg-orange-700 h-7 text-xs"
          disabled={upsertMut.isPending}
          onClick={handleSave}
        >
          {upsertMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
          Salvar
        </Button>
        {existingLink && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            disabled={deleteMut.isPending}
            onClick={() => deleteMut.mutate({ id: existingLink.id })}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─── Painel de Balanço Óptico por Bandeja do DGO ─────────────────────────────
function DgoSlotOpticalBalance({
  dgoElementId,
  slotId,
  portNumber,
  txPowerDbm,
  equipmentName,
}: {
  dgoElementId: number;
  slotId: number;
  portNumber: number;
  txPowerDbm: number;
  equipmentName: string | null;
}) {
  const { data, isLoading, error } = trpc.infraMap.dgoPortOpticalBalance.useQuery(
    { dgoElementId, slotId, portNumber },
    { enabled: txPowerDbm != null }
  );
  const result = data as any;

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Calculando balanço óptico...
      </div>
    );
  }

  if (!result || error) {
    const msg = result?.warnings?.[0] ?? (error as any)?.message ?? "Balanço não disponível";
    return (
      <div className="flex items-start gap-1.5 text-[10px] text-amber-400/70 py-1">
        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
        <span>{msg}</span>
      </div>
    );
  }

  const quality = result.signalQuality as string;
  const qualityColor = quality === "excellent" ? "text-emerald-400" : quality === "good" ? "text-cyan-400" : quality === "weak" ? "text-amber-400" : "text-red-400";
  const qualityLabel = quality === "excellent" ? "Excelente" : quality === "good" ? "Bom" : quality === "weak" ? "Fraco" : "Sem sinal";

  return (
    <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Activity className="w-3 h-3 text-cyan-400" />
        <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wide">Balanço Óptico Estimado</span>
        {equipmentName && (
          <span className="text-[9px] text-muted-foreground ml-auto truncate max-w-[100px]">{equipmentName}</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="bg-muted/30 rounded p-1 text-center">
          <p className="text-[8px] text-muted-foreground">TX</p>
          <p className="text-[10px] font-mono font-semibold text-cyan-300">
            {result.txPowerDbm > 0 ? "+" : ""}{Number(result.txPowerDbm).toFixed(1)}
          </p>
        </div>
        <div className="bg-muted/30 rounded p-1 text-center">
          <p className="text-[8px] text-muted-foreground">Perda</p>
          <p className="text-[10px] font-mono font-semibold text-amber-300">
            -{Number(result.totalLossDb ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="bg-muted/30 rounded p-1 text-center">
          <p className="text-[8px] text-muted-foreground">RX Est.</p>
          <p className={`text-[10px] font-mono font-semibold ${qualityColor}`}>
            {result.rxPowerDbm != null ? `${Number(result.rxPowerDbm) > 0 ? "+" : ""}${Number(result.rxPowerDbm).toFixed(1)}` : "—"}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground">
          {Number(result.distanceKm ?? 0).toFixed(3)} km
          {result.splitterLossDb > 0 && <span className="ml-1">· splitter -{Number(result.splitterLossDb).toFixed(1)} dB</span>}
        </span>
        <span className={qualityColor}>{qualityLabel}</span>
      </div>
      {result.warnings?.length > 0 && (
        <div className="text-[9px] text-amber-400/70 flex items-start gap-1">
          <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0 mt-0.5" />
          <span>{result.warnings[0]}</span>
        </div>
      )}
    </div>
  );
}

// ─── Painel de Vínculo Porta→CEO→Tubo→Via do DGO ─────────────────────────────
export function DgoPortFiberLinkPanel({
  dgoElementId,
  equipmentId,
  dgoEquipmentName,
  onClose,
}: {
  dgoElementId: number;
  equipmentId: number | null;
  dgoEquipmentName: string | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: portLinksRaw = [] } = trpc.infraMap.dgoPortFiberLinks.useQuery({ dgoElementId });
  const portLinks = portLinksRaw as any[];
  const { data: portsRaw = [] } = trpc.ports.byEquipment.useQuery(
    { equipmentId: equipmentId! },
    { enabled: !!equipmentId }
  );
  const ports = portsRaw as any[];
  const { data: elementsRaw = [] } = trpc.infraMap.elements.useQuery(undefined);
  const elements = elementsRaw as any[];
  const { data: ceosRaw = [] } = trpc.ceos.list.useQuery({});
  const ceos = ceosRaw as any[];

  // Estados do formulário de criação
  const [addingLink, setAddingLink] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [linkPortId, setLinkPortId] = useState("");
  const [linkTxPower, setLinkTxPower] = useState("");
  const [linkCeoElementId, setLinkCeoElementId] = useState<number | null>(null);
  const [linkTubeId, setLinkTubeId] = useState("");
  const [linkViaNumber, setLinkViaNumber] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [ceoSearch, setCeoSearch] = useState("");
  const [ceoTubes, setCeoTubes] = useState<any[]>([]);
  const [tubesLoading, setTubesLoading] = useState(false);

  // Estados do formulário de edição
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editTxPower, setEditTxPower] = useState("");
  const [editCeoElementId, setEditCeoElementId] = useState<number | null>(null);
  const [editTubeId, setEditTubeId] = useState("");
  const [editViaNumber, setEditViaNumber] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCeoSearch, setEditCeoSearch] = useState("");
  const [editCeoTubes, setEditCeoTubes] = useState<any[]>([]);
  const [editTubesLoading, setEditTubesLoading] = useState(false);

  // Carregar tubos do CEO selecionado (criação)
  useEffect(() => {
    if (!linkCeoElementId) { setCeoTubes([]); return; }
    setTubesLoading(true);
    fetch(`/api/trpc/infraMap.tubesByElement?input=${encodeURIComponent(JSON.stringify({ json: { elementId: linkCeoElementId } }))}`)
      .then(r => r.json())
      .then(d => { setCeoTubes(d?.result?.data?.json ?? []); })
      .catch(() => setCeoTubes([]))
      .finally(() => setTubesLoading(false));
  }, [linkCeoElementId]);

  // Carregar tubos do CEO selecionado (edição)
  useEffect(() => {
    if (!editCeoElementId) { setEditCeoTubes([]); return; }
    setEditTubesLoading(true);
    fetch(`/api/trpc/infraMap.tubesByElement?input=${encodeURIComponent(JSON.stringify({ json: { elementId: editCeoElementId } }))}`)
      .then(r => r.json())
      .then(d => { setEditCeoTubes(d?.result?.data?.json ?? []); })
      .catch(() => setEditCeoTubes([]))
      .finally(() => setEditTubesLoading(false));
  }, [editCeoElementId]);

  const selectedTube = ceoTubes.find((t: any) => t.id === parseInt(linkTubeId));
  const totalVias = selectedTube?.totalVias ?? 0;
  const editSelectedTube = editCeoTubes.find((t: any) => t.id === parseInt(editTubeId));
  const editTotalVias = editSelectedTube?.totalVias ?? 0;

  const createLinkMut = trpc.infraMap.createDgoPortFiberLink.useMutation({
    onSuccess: () => {
      toast.success("Porta vinculada com sucesso!");
      utils.infraMap.dgoPortFiberLinks.invalidate({ dgoElementId });
      setAddingLink(false);
      resetLinkForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLinkMut = trpc.infraMap.updateDgoPortFiberLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo actualizado!");
      utils.infraMap.dgoPortFiberLinks.invalidate({ dgoElementId });
      setEditingLinkId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLinkMut = trpc.infraMap.deleteDgoPortFiberLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo removido");
      utils.infraMap.dgoPortFiberLinks.invalidate({ dgoElementId });
    },
    onError: (e) => toast.error(e.message),
  });

  const resetLinkForm = () => {
    setSelectedSlotId(""); setLinkPortId(""); setLinkTxPower("");
    setLinkCeoElementId(null); setLinkTubeId(""); setLinkViaNumber("");
    setLinkNotes(""); setCeoSearch("");
  };

  const handleCreateLink = () => {
    const portIdNum = parseInt(linkPortId);
    const tubeIdNum = parseInt(linkTubeId);
    const viaNum = parseInt(linkViaNumber);
    if (!portIdNum) { toast.error("Selecione uma porta"); return; }
    if (!linkCeoElementId) { toast.error("Selecione o CEO de saída"); return; }
    if (!tubeIdNum) { toast.error("Selecione o tubo"); return; }
    if (!viaNum || viaNum < 1) { toast.error("Informe o número da via"); return; }
    createLinkMut.mutate({
      dgoElementId,
      portId: portIdNum,
      txPowerDbm: linkTxPower ? parseFloat(linkTxPower) : null,
      ceoElementId: linkCeoElementId,
      tubeId: tubeIdNum,
      viaNumber: viaNum,
      notes: linkNotes || undefined,
    });
  };

  const startEditing = (link: any) => {
    setEditingLinkId(link.id);
    setEditTxPower(link.txPowerDbm != null ? String(link.txPowerDbm) : "");
    setEditCeoElementId(link.ceoElementId);
    setEditTubeId(String(link.tubeId));
    setEditViaNumber(String(link.viaNumber));
    setEditNotes(link.notes ?? "");
    setEditCeoSearch("");
  };

  const handleUpdateLink = () => {
    if (!editingLinkId) return;
    const tubeIdNum = parseInt(editTubeId);
    const viaNum = parseInt(editViaNumber);
    if (!editCeoElementId) { toast.error("Selecione o CEO de saída"); return; }
    if (!tubeIdNum) { toast.error("Selecione o tubo"); return; }
    if (!viaNum || viaNum < 1) { toast.error("Informe o número da via"); return; }
    updateLinkMut.mutate({
      id: editingLinkId,
      txPowerDbm: editTxPower ? parseFloat(editTxPower) : null,
      ceoElementId: editCeoElementId,
      tubeId: tubeIdNum,
      viaNumber: viaNum,
      notes: editNotes || null,
    });
  };

  const getCeoName = (elementId: number) => {
    const el = elements.find((e: any) => e.id === elementId);
    if (!el) return `Elemento #${elementId}`;
    const ref = ceos.find((c: any) => c.id === el.referenceId);
    return ref?.name ?? `CEO-${el.referenceId}`;
  };

  const ceoElements = elements.filter((e: any) => e.type === "ceo");
  const filteredCeos = ceoSearch
    ? ceoElements.filter((e: any) => getCeoName(e.id).toLowerCase().includes(ceoSearch.toLowerCase()))
    : ceoElements;
  const filteredEditCeos = editCeoSearch
    ? ceoElements.filter((e: any) => getCeoName(e.id).toLowerCase().includes(editCeoSearch.toLowerCase()))
    : ceoElements;

  // Agrupar portas por slot
  const slots = Array.from(
    new Map(
      ports.filter((p: any) => p.slotId)
        .map((p: any) => [p.slotId, { id: p.slotId, slotNumber: p.slotNumber ?? String(p.slotId), slotLabel: p.slotLabel ?? null }])
    ).values()
  ).sort((a: any, b: any) => String(a.slotNumber).localeCompare(String(b.slotNumber), undefined, { numeric: true }));
  const portsWithoutSlot = ports.filter((p: any) => !p.slotId);
  const portsForSelectedSlot = selectedSlotId === "__no_slot__"
    ? portsWithoutSlot
    : selectedSlotId
      ? ports.filter((p: any) => String(p.slotId) === selectedSlotId)
      : ports;
  const hasSlots = slots.length > 0;

  return (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: "none" }}>
      <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onClick={onClose} />
      <div
        className="absolute top-0 right-0 bottom-0 w-[440px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ pointerEvents: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-cyan-500/10 flex-shrink-0">
          <Signal className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-cyan-400 text-sm truncate">
              {dgoEquipmentName ?? "DGO"} — Vínculos de Fibra
            </div>
            <div className="text-xs text-muted-foreground">
              Vincule portas do DGO a tubos de CEO para o balanço óptico
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Portas Vinculadas ({portLinks.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                onClick={() => { setAddingLink(v => !v); if (addingLink) resetLinkForm(); setEditingLinkId(null); }}
              >
                {addingLink ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {addingLink ? "Cancelar" : "Vincular porta"}
              </Button>
            </div>

            {/* Formulário de nova vinculação */}
            {addingLink && (
              <div className="bg-muted/30 border border-cyan-500/20 rounded-lg p-3 space-y-3 mb-3">
                <p className="text-xs text-cyan-400/80 font-medium">Nova vinculação de porta ao CEO</p>

                {/* Slot */}
                {hasSlots && (
                  <div>
                    <Label className="text-xs mb-1 block">Slot *</Label>
                    <Select value={selectedSlotId} onValueChange={v => { setSelectedSlotId(v); setLinkPortId(""); }}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Selecione o slot" />
                      </SelectTrigger>
                      <SelectContent className="z-[99999]">
                        {(slots as any[]).map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.slotNumber}</SelectItem>
                        ))}
                        {portsWithoutSlot.length > 0 && (
                          <SelectItem value="__no_slot__">Sem slot ({portsWithoutSlot.length} portas)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Porta */}
                <div>
                  <Label className="text-xs mb-1 block">Porta *</Label>
                  <Select value={linkPortId} onValueChange={setLinkPortId} disabled={hasSlots && !selectedSlotId}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={hasSlots && !selectedSlotId ? "Selecione o slot primeiro" : "Selecione a porta"} />
                    </SelectTrigger>
                    <SelectContent className="z-[99999]">
                      {(portsForSelectedSlot as any[]).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {`Porta ${p.portNumber}${p.label ? ` — ${p.label}` : ""}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Potência TX override */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Potência TX desta porta (dBm) <span className="text-muted-foreground">— opcional</span>
                  </Label>
                  <Input
                    value={linkTxPower}
                    onChange={e => setLinkTxPower(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Vazio = usa potência do equipamento"
                    type="number"
                    step="0.1"
                  />
                </div>

                {/* CEO de saída */}
                <div>
                  <Label className="text-xs mb-1 block">CEO de saída (1º elemento da cadeia) *</Label>
                  <Input
                    placeholder="Buscar CEO..."
                    value={ceoSearch}
                    onChange={e => setCeoSearch(e.target.value)}
                    className="h-7 text-xs mb-1"
                  />
                  <div className="max-h-28 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                    {filteredCeos.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2 text-center">Nenhum CEO encontrado</div>
                    ) : (filteredCeos as any[]).slice(0, 30).map((el: any) => (
                      <button
                        key={el.id}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                          linkCeoElementId === el.id ? "bg-cyan-500/20 text-cyan-300" : "hover:bg-muted/50 text-foreground"
                        )}
                        onClick={() => { setLinkCeoElementId(el.id); setLinkTubeId(""); setLinkViaNumber(""); }}
                      >
                        {getCeoName(el.id)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tubo */}
                {linkCeoElementId != null && (
                  <div>
                    <Label className="text-xs mb-1 block">Tubo de saída *</Label>
                    {tubesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground h-7">
                        <Loader2 className="w-3 h-3 animate-spin" /> A carregar tubos...
                      </div>
                    ) : ceoTubes.length === 0 ? (
                      <div className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1.5 border border-border">
                        Nenhum tubo cadastrado neste CEO
                      </div>
                    ) : (
                      <Select value={linkTubeId} onValueChange={v => { setLinkTubeId(v); setLinkViaNumber(""); }}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Selecione o tubo" />
                        </SelectTrigger>
                        <SelectContent className="z-[99999]">
                          {ceoTubes.map((t: any) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.identifier} ({t.totalVias} vias)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* Via */}
                {linkTubeId && totalVias > 0 && (
                  <div>
                    <Label className="text-xs mb-1 block">Número da via (fibra) *</Label>
                    <Select value={linkViaNumber} onValueChange={setLinkViaNumber}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Selecione a via" />
                      </SelectTrigger>
                      <SelectContent className="z-[99999]">
                        {Array.from({ length: totalVias }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>Via {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label className="text-xs mb-1 block">Observações</Label>
                  <Input value={linkNotes} onChange={e => setLinkNotes(e.target.value)} className="h-7 text-xs" placeholder="Opcional" />
                </div>

                <Button
                  size="sm"
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
                  onClick={handleCreateLink}
                  disabled={createLinkMut.isPending}
                >
                  {createLinkMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                  Confirmar vinculação
                </Button>
              </div>
            )}

            {/* Lista de vínculos existentes */}
            {portLinks.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4 bg-muted/20 rounded-lg border border-border/50">
                Nenhuma porta vinculada ainda.<br />
                <span className="opacity-60">Clique em "Vincular porta" para associar uma porta a uma fibra de CEO.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {portLinks.map((link: any) => {
                  const isEditing = editingLinkId === link.id;
                  return (
                    <div key={link.id} className={cn(
                      "border rounded-lg p-3 transition-colors",
                      isEditing ? "bg-cyan-500/5 border-cyan-500/30" : "bg-muted/20 border-border/50"
                    )}>
                      {isEditing ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-cyan-400">
                              Editar: {link.portName ?? link.portLabel ?? `Porta #${link.portId}`}
                            </span>
                            <button onClick={() => setEditingLinkId(null)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">Potência TX (dBm)</Label>
                            <Input value={editTxPower} onChange={e => setEditTxPower(e.target.value)} className="h-7 text-xs" placeholder="Vazio = usa potência do equipamento" type="number" step="0.1" />
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">CEO de saída *</Label>
                            <Input placeholder="Buscar CEO..." value={editCeoSearch} onChange={e => setEditCeoSearch(e.target.value)} className="h-7 text-xs mb-1" />
                            <div className="max-h-24 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                              {(filteredEditCeos as any[]).slice(0, 20).map((el: any) => (
                                <button
                                  key={el.id}
                                  className={cn(
                                    "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                                    editCeoElementId === el.id ? "bg-cyan-500/20 text-cyan-300" : "hover:bg-muted/50 text-foreground"
                                  )}
                                  onClick={() => { setEditCeoElementId(el.id); setEditTubeId(""); setEditViaNumber(""); }}
                                >
                                  {getCeoName(el.id)}
                                </button>
                              ))}
                            </div>
                          </div>
                          {editCeoElementId != null && (
                            <div>
                              <Label className="text-xs mb-1 block">Tubo *</Label>
                              {editTubesLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground h-7"><Loader2 className="w-3 h-3 animate-spin" /> A carregar...</div>
                              ) : (
                                <Select value={editTubeId} onValueChange={v => { setEditTubeId(v); setEditViaNumber(""); }}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione o tubo" /></SelectTrigger>
                                  <SelectContent className="z-[99999]">
                                    {editCeoTubes.map((t: any) => (
                                      <SelectItem key={t.id} value={String(t.id)}>{t.identifier} ({t.totalVias} vias)</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}
                          {editTubeId && editTotalVias > 0 && (
                            <div>
                              <Label className="text-xs mb-1 block">Via *</Label>
                              <Select value={editViaNumber} onValueChange={setEditViaNumber}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione a via" /></SelectTrigger>
                                <SelectContent className="z-[99999]">
                                  {Array.from({ length: editTotalVias }, (_, i) => i + 1).map(n => (
                                    <SelectItem key={n} value={String(n)}>Via {n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs mb-1 block">Observações</Label>
                            <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="h-7 text-xs" placeholder="Opcional" />
                          </div>
                          <Button size="sm" className="w-full bg-cyan-600 hover:bg-cyan-700 text-white" onClick={handleUpdateLink} disabled={updateLinkMut.isPending}>
                            {updateLinkMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                            Guardar alterações
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] border-cyan-500/40 text-cyan-400 bg-cyan-500/10 max-w-full">
                                <span className="truncate">{link.portName ?? link.portLabel ?? `Porta #${link.portId}`}</span>
                              </Badge>
                              {link.txPowerDbm != null && (
                                <span className="text-xs font-semibold text-cyan-300">{link.txPowerDbm > 0 ? "+" : ""}{link.txPowerDbm} dBm</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-foreground/80">{link.ceoName ?? getCeoName(link.ceoElementId)}</span>
                              {" → "}
                              <span>{link.tubeIdentifier ?? `Tubo #${link.tubeId}`}</span>
                              {" · Via "}<span className="font-medium">{link.viaNumber}</span>
                            </div>
                            {link.notes && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{link.notes}</div>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => { startEditing(link); setAddingLink(false); }} className="text-muted-foreground hover:text-cyan-400 transition-colors" title="Editar vínculo">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteLinkMut.mutate({ id: link.id })} className="text-red-400/60 hover:text-red-400 transition-colors" title="Remover vínculo">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Detalhes do DGO ────────────────────────────────────────────────
export function DgoDetailPanel({
  dgoElementId,
  onClose,
  mapGroups,
  isMoving,
  pendingMovePos,
  onToggleMove,
  onSaveMove,
  pendingFiberLinkRouteId,
  onFiberLinkRouteConsumed,
}: {
  dgoElementId: number;
  onClose: () => void;
  mapGroups: any[];
  isMoving?: boolean;
  pendingMovePos?: { lat: number; lng: number } | null;
  onToggleMove?: () => void;
  onSaveMove?: () => void;
  pendingFiberLinkRouteId?: number | null;
  onFiberLinkRouteConsumed?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: dgoEl, isLoading } = trpc.infraMap.dgoElementById.useQuery({ id: dgoElementId }, { enabled: !!dgoElementId });
  const { data: slots = [] } = trpc.infraMap.slotsByDgoElement.useQuery({ dgoElementId }, { enabled: !!dgoElementId });
  const { data: links = [] } = trpc.infraMap.dgoSlotLinks.useQuery({ dgoElementId }, { enabled: !!dgoElementId });
  const { data: portLinks = [] } = trpc.infraMap.dgoPortLinks.useQuery({ dgoElementId }, { enabled: !!dgoElementId });
  const { data: routes = [] } = trpc.infraMap.routes.useQuery(undefined, { enabled: !!dgoElementId });
  const { data: elements = [] } = trpc.infraMap.elements.useQuery(undefined, { enabled: !!dgoElementId });
  // Portas do equipamento DGO com dados de conexão (etiqueta, equipamento conectado, etc.)
  const equipmentId = (dgoEl as any)?.equipmentId ?? null;
  const { data: equipmentPorts = [] } = trpc.infraMap.portsByEquipmentForDgo.useQuery(
    { equipmentId: equipmentId! },
    { enabled: !!equipmentId }
  );

  // Estado de vinculação de cabo (bandeja)
  const [linkingSlotId, setLinkingSlotId] = useState<number | null>(null);
  const [linkSide, setLinkSide] = useState<"in" | "out">("in");
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [routeSearch, setRouteSearch] = useState("");

  // Estado de vinculação de porta
  const [editingPort, setEditingPort] = useState<{ slotId: number; portNumber: number } | null>(null);

  // Estado de expansão de bandejas
  const [expandedSlots, setExpandedSlots] = useState<Set<number>>(new Set());

  // Estado do painel de vínculos de fibra (porta→CEO→tubo→via)
  const [showFiberLinks, setShowFiberLinks] = useState(false);

  // Pré-selecionar traçado quando arrastado para cima do ícone DGO
  useEffect(() => {
    if (pendingFiberLinkRouteId != null) {
      // Expandir a primeira bandeja e pré-selecionar o traçado no formulário de vínculo de cabo
      const slotsArr = slots as any[];
      if (slotsArr.length > 0) {
        const firstSlot = slotsArr[0];
        setExpandedSlots(new Set([firstSlot.id]));
        setLinkingSlotId(firstSlot.id);
        setSelectedRouteId(pendingFiberLinkRouteId);
      }
      onFiberLinkRouteConsumed?.();
    }
  }, [pendingFiberLinkRouteId]);

  const addDgoToGroupMut = trpc.mapGroups.addDgo.useMutation({ onSuccess: () => utils.infraMap.dgoElements.invalidate() });
  const removeDgoFromGroupMut = trpc.mapGroups.removeDgo.useMutation({ onSuccess: () => utils.infraMap.dgoElements.invalidate() });

  const deleteDgoMut = trpc.infraMap.deleteDgoElement.useMutation({
    onSuccess: () => { toast.success("DGO removido do mapa"); onClose(); utils.infraMap.dgoElements.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const createLinkMut = trpc.infraMap.createDgoSlotLink.useMutation({
    onSuccess: () => {
      toast.success("Cabo vinculado à bandeja!");
      setLinkingSlotId(null);
      setSelectedRouteId(null);
      utils.infraMap.dgoSlotLinks.invalidate({ dgoElementId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLinkMut = trpc.infraMap.deleteDgoSlotLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo removido");
      utils.infraMap.dgoSlotLinks.invalidate({ dgoElementId });
    },
    onError: (e) => toast.error(e.message),
  });

  const dgoEl_ = dgoEl as any;
  const slotsArr = slots as any[];
  const linksArr = links as any[];
  const portLinksArr = portLinks as any[];
  const equipmentPortsArr = equipmentPorts as any[];
  const routesArr = (routes as any[]).filter(r =>
    !routeSearch || r.name?.toLowerCase().includes(routeSearch.toLowerCase())
  );
  const elementsArr = elements as any[];

  const getSlotLinks = (slotId: number) => linksArr.filter(l => l.slotId === slotId);
  const getPortLink = (slotId: number, portNumber: number) =>
    portLinksArr.find(pl => pl.slotId === slotId && pl.portNumber === portNumber) ?? null;

  // Buscar dados da porta do cadastro de equipamento pelo slotId e número da porta
  // As portas são ordenadas por sortOrder/portNumber dentro do slot
  const getEquipmentPortData = (slotId: number, portNumber: number) => {
    // Filtrar portas do slot e ordenar por sortOrder/portNumber
    const slotPorts = equipmentPortsArr
      .filter((p: any) => p.slotId === slotId)
      .sort((a: any, b: any) => {
        const sA = Number(a.portNumber) || 0;
        const sB = Number(b.portNumber) || 0;
        return sA - sB;
      });
    // portNumber é 1-based, pegar o item na posição portNumber-1
    return slotPorts[portNumber - 1] ?? null;
  };

  const toggleSlotExpanded = (slotId: number) => {
    setExpandedSlots(prev => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="bg-card rounded-lg p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
          <span className="text-sm">Carregando DGO...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-end pointer-events-none">
      <div
        className="pointer-events-auto bg-card border border-border rounded-l-xl shadow-2xl flex flex-col"
        style={{ width: 400, maxHeight: "92vh", height: "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Server className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">{dgoEl_?.equipmentName ?? "DGO"}</h3>
              <p className="text-xs text-muted-foreground">{dgoEl_?.model ?? "Distribuidor Geral Óptico"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0 grid grid-cols-2 gap-2">
          <div className="bg-muted/40 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Status</p>
            <Badge
              variant="outline"
              className={`text-xs ${dgoEl_?.equipmentStatus === "active" ? "border-emerald-500/50 text-emerald-400" : dgoEl_?.equipmentStatus === "maintenance" ? "border-amber-500/50 text-amber-400" : "border-red-500/50 text-red-400"}`}
            >
              {dgoEl_?.equipmentStatus === "active" ? "Ativo" : dgoEl_?.equipmentStatus === "maintenance" ? "Manutenção" : "Inativo"}
            </Badge>
          </div>
          <div className="bg-muted/40 rounded-lg p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Total Portas</p>
            <p className="text-sm font-semibold text-orange-400">
              {(() => {
                // Somar portas de todos os slots (totalPorts por slot)
                const sumSlots = slotsArr.reduce((acc: number, s: any) => acc + (s.totalPorts || 0), 0);
                const total = sumSlots > 0 ? sumSlots : (dgoEl_?.totalPorts || 0);
                return total > 0 ? total : "—";
              })()}
            </p>
          </div>
          {dgoEl_?.ipAddress && (
            <div className="col-span-2 bg-muted/40 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">IP</p>
              <p className="text-xs font-mono">{dgoEl_.ipAddress}</p>
            </div>
          )}
        </div>

        {/* Bandejas */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Bandejas ({slotsArr.length})
            </p>
          </div>

          {slotsArr.length === 0 ? (
            <div className="text-center py-6">
              <Layers className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma bandeja cadastrada</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Cadastre bandejas no equipamento DGO</p>
            </div>
          ) : (
            slotsArr.map((slot: any) => {
              const slotLinks = getSlotLinks(slot.id);
              const totalVias = slot.totalPorts || 12;
              const isLinking = linkingSlotId === slot.id;
              const isExpanded = expandedSlots.has(slot.id);

              // Contar portas com vínculo nesta bandeja
              const linkedPortCount = portLinksArr.filter(pl =>
                pl.slotId === slot.id && (pl.ceoElementId || pl.portId)
              ).length;

              // Verificar se alguma porta desta bandeja tem equipamento com txPowerDbm
              const slotPortsWithTxPower = equipmentPortsArr
                .filter((p: any) => p.slotId === slot.id && p.connectedToEquipmentTxPowerDbm != null);
              const hasTxPower = slotPortsWithTxPower.length > 0;
              // Pegar a primeira potência TX disponível para exibir no cabeçalho
              const firstTxPower = hasTxPower
                ? Number(slotPortsWithTxPower[0].connectedToEquipmentTxPowerDbm)
                : null;

              return (
                <div key={slot.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Cabeçalho da bandeja */}
                  <div
                    className="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer select-none"
                    onClick={() => toggleSlotExpanded(slot.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-orange-500/20 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-orange-400">{slot.slotNumber}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{slot.label ?? `Bandeja ${slot.slotNumber}`}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {totalVias} portas
                          {linkedPortCount > 0 && (
                            <span className="text-orange-400 ml-1">· {linkedPortCount} vinculada{linkedPortCount > 1 ? "s" : ""}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {firstTxPower !== null && (
                        <Badge variant="outline" className="text-[9px] border-cyan-500/40 text-cyan-300 font-mono">
                          {firstTxPower > 0 ? "+" : ""}{firstTxPower.toFixed(1)} dBm
                        </Badge>
                      )}
                      {slotLinks.length > 0 && (
                        <Badge variant="outline" className="text-[9px] border-cyan-500/40 text-cyan-400">
                          <Cable className="w-2.5 h-2.5 mr-0.5" />
                          {slotLinks.length} cabo{slotLinks.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </div>
                  </div>

                  {/* Conteúdo expandido */}
                  {isExpanded && (
                    <>
                      {/* Cabos vinculados à bandeja */}
                      {slotLinks.length > 0 && (
                        <div className="px-3 py-2 border-b border-border space-y-2 bg-muted/10">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cabos da bandeja</p>
                          {slotLinks.map((link: any) => (
                            <div key={link.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Cable className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                  <span className="font-medium">{link.routeName ?? `Cabo #${link.routeId}`}</span>
                                  {link.fiberCount && (
                                    <span className="text-muted-foreground text-[9px]">{link.fiberCount}FO</span>
                                  )}
                                  <Badge variant="outline" className={`text-[9px] ${link.side === "in" ? "border-blue-500/40 text-blue-400" : "border-emerald-500/40 text-emerald-400"}`}>
                                    {link.side === "in" ? "Entrada" : "Saída"}
                                  </Badge>
                                </div>
                                <button
                                  className="text-red-400 hover:text-red-300 p-0.5 flex-shrink-0"
                                  onClick={() => deleteLinkMut.mutate({ id: link.id })}
                                >
                                  <Unlink className="w-3 h-3" />
                                </button>
                              </div>
                              {/* Tubo detectado automaticamente do cabo */}
                              {link.autoTubeIdentifier && (
                                <div className="flex items-center gap-1.5 ml-4.5 pl-0.5">
                                  <div
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/20"
                                    style={{ background: link.autoTubeColor ?? "#a78bfa" }}
                                  />
                                  <span className="text-[10px] font-medium text-violet-300">
                                    {link.autoTubeIdentifier}
                                  </span>
                                  {link.autoTubeElementName && (
                                    <span className="text-[10px] text-muted-foreground">
                                      → {link.autoTubeElementType === "ceo" ? "CEO" : "CTO"} {link.autoTubeElementName}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!link.autoTubeIdentifier && link.routeId && (
                                <p className="text-[9px] text-muted-foreground/50 ml-4.5 italic">
                                  Tubo não vinculado ao cabo
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulário de vinculação de cabo */}
                      <div className="px-3 py-2 border-b border-border">
                        <button
                          className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                          onClick={() => {
                            setLinkingSlotId(isLinking ? null : slot.id);
                            setSelectedRouteId(null);
                            setRouteSearch("");
                          }}
                        >
                          <Link2 className="w-3 h-3" />
                          {isLinking ? "Cancelar" : "Vincular cabo à bandeja"}
                        </button>
                        {isLinking && (
                          <div className="mt-2 space-y-2">
                            <div className="flex gap-2">
                              <Select value={linkSide} onValueChange={(v: "in" | "out") => setLinkSide(v)}>
                                <SelectTrigger className="h-7 text-xs w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[99999]">
                                  <SelectItem value="in">Entrada</SelectItem>
                                  <SelectItem value="out">Saída</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              placeholder="Buscar cabo..."
                              value={routeSearch}
                              onChange={e => setRouteSearch(e.target.value)}
                              className="h-7 text-xs"
                            />
                            <div className="border rounded max-h-28 overflow-y-auto">
                              {routesArr.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-2 text-center">Nenhum cabo encontrado</p>
                              ) : (
                                routesArr.slice(0, 30).map((r: any) => (
                                  <div
                                    key={r.id}
                                    className={`px-2 py-1.5 cursor-pointer hover:bg-accent text-xs border-b last:border-b-0 flex items-center justify-between ${selectedRouteId === r.id ? "bg-orange-500/10 border-l-2 border-l-orange-500" : ""}`}
                                    onClick={() => setSelectedRouteId(r.id)}
                                  >
                                    <span className="font-medium">{r.name ?? `Cabo #${r.id}`}</span>
                                    {r.cableType && <span className="text-muted-foreground">{r.cableType}</span>}
                                  </div>
                                ))
                              )}
                            </div>
                            <Button
                              size="sm"
                              className="w-full bg-orange-600 hover:bg-orange-700 h-7 text-xs"
                              disabled={!selectedRouteId || createLinkMut.isPending}
                              onClick={() => {
                                if (!selectedRouteId) return;
                                createLinkMut.mutate({
                                  dgoElementId,
                                  slotId: slot.id,
                                  routeId: selectedRouteId,
                                  side: linkSide,
                                });
                              }}
                            >
                              {createLinkMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                              Confirmar vínculo
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Grade de portas com rastreabilidade */}
                      <div className="px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                          Portas

                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {Array.from({ length: totalVias }, (_, i) => {
                            const portNum = i + 1;
                            const portLink = getPortLink(slot.id, portNum);
                            const eqPort = getEquipmentPortData(slot.id, portNum);
                            const isEditing = editingPort?.slotId === slot.id && editingPort?.portNumber === portNum;
                            const hasCeo = !!portLink?.ceoElementId;
                            const hasPortLink = !!portLink?.portId;
                            const hasEqPort = !!eqPort;
                            const hasConnection = hasEqPort && (!!eqPort.connectedToEquipmentName || !!eqPort.label);
                            const hasAny = hasCeo || hasPortLink || hasConnection;

                            return (
                              <div key={portNum} className="space-y-1">
                                <button
                                  className={`w-full text-left px-2 py-1.5 rounded border text-[10px] transition-colors ${
                                    isEditing
                                      ? "border-orange-500 bg-orange-500/10"
                                      : hasConnection
                                        ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
                                        : hasEqPort
                                          ? "border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10"
                                          : "border-border bg-muted/20 hover:bg-muted/40"
                                  }`}
                                  onClick={() => setEditingPort(
                                    isEditing ? null : { slotId: slot.id, portNumber: portNum }
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={`font-bold flex-shrink-0 ${
                                      hasConnection ? "text-emerald-400" : hasEqPort ? "text-blue-400" : "text-muted-foreground"
                                    }`}>
                                      {eqPort?.portNumber ? `P${eqPort.portNumber}` : `P${portNum}`}
                                    </span>
                                    {eqPort?.label && (
                                      <span className="text-muted-foreground truncate text-[9px] flex-1">{eqPort.label}</span>
                                    )}
                                    {hasConnection
                                      ? <Edit2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                                      : hasEqPort
                                        ? <Plug className="w-2.5 h-2.5 text-blue-400/60 flex-shrink-0" />
                                        : <Plug className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
                                    }
                                  </div>
                                  {/* Conexão do cadastro de equipamento (automática) */}
                                  {eqPort?.connectedToEquipmentName && (
                                    <p className="text-emerald-400 truncate mt-0.5 leading-tight">
                                      {eqPort.connectedToEquipmentName}
                                      {eqPort.connectedToSlotLabel && (
                                        <span className="text-yellow-400/80"> {eqPort.connectedToSlotLabel}</span>
                                      )}
                                      {eqPort.connectedToPortNumber && (
                                        <span className="text-cyan-400"> P{eqPort.connectedToPortNumber}</span>
                                      )}
                                    </p>
                                  )}
                                  {/* Potência TX do equipamento conectado (ou override por porta) */}
                                  {eqPort?.connectedToEquipmentTxPowerDbm != null && (
                                    <p className="text-cyan-300 leading-tight mt-0.5 flex items-center gap-1">
                                      <span className="text-[8px] text-cyan-500">TX</span>
                                      <span className="font-mono font-semibold">
                                        {Number(eqPort.connectedToEquipmentTxPowerDbm) > 0 ? "+" : ""}{Number(eqPort.connectedToEquipmentTxPowerDbm).toFixed(1)} dBm
                                      </span>
                                      {/* Indicador de override por porta */}
                                      {eqPort?.portTxPowerDbm != null && (
                                        <span className="text-[8px] text-amber-400 font-semibold" title="Potência TX definida diretamente nesta porta (override)">*P</span>
                                      )}
                                    </p>
                                  )}
                                  {/* CEO de passagem (manual) */}
                                  {hasCeo && (
                                    <p className="text-violet-400 truncate leading-tight">
                                      ▸ {portLink.ceoName ?? `CEO #${portLink.ceoElementId}`}
                                    </p>
                                  )}
                                </button>
                                {isEditing && (
                                  <DgoPortLinkForm
                                    dgoElementId={dgoElementId}
                                    slotId={slot.id}
                                    portNumber={portNum}
                                    existingLink={portLink}
                                    elements={elementsArr}
                                    onSaved={() => setEditingPort(null)}
                                    onCancel={() => setEditingPort(null)}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Seletor de Grupo */}
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          <div className="text-xs text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Atribuir a pasta
          </div>
          <Select
            value={(() => {
              const g = mapGroups.find((g: any) => (g.dgos ?? []).some((d: any) => d.dgoId === dgoElementId));
              return g ? String(g.id) : "none";
            })()}
            onValueChange={(val) => {
              const curGroup = mapGroups.find((g: any) => (g.dgos ?? []).some((d: any) => d.dgoId === dgoElementId));
              if (curGroup) removeDgoFromGroupMut.mutate({ groupId: curGroup.id, dgoId: dgoElementId });
              if (val !== "none") addDgoToGroupMut.mutate({ groupId: Number(val), dgoId: dgoElementId });
            }}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sem pasta" /></SelectTrigger>
            <SelectContent className="z-[99999]">
              <SelectItem value="none">Sem pasta</SelectItem>
              {mapGroups.map((g: any) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  <span className="flex items-center gap-1.5">
                    <span style={{ background: g.color ?? "#f97316", width: 8, height: 8, borderRadius: "50%", display: "inline-block" }} />
                    {g.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 space-y-2 flex-shrink-0">
          {onToggleMove && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className={`flex-1 gap-1.5 ${isMoving ? "bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30" : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"}`}
                onClick={onToggleMove}
              >
                <Move className="w-3.5 h-3.5" />
                {isMoving ? "Cancelar mover" : "Mover"}
              </Button>
              {pendingMovePos && onSaveMove && (
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={onSaveMove}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Salvar posição
                </Button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => setShowFiberLinks(true)}
            >
              <Signal className="w-3.5 h-3.5" /> Vínculos de Fibra
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => {
                if (confirm("Remover este DGO do mapa? Os vínculos de cabo serão removidos.")) {
                  deleteDgoMut.mutate({ id: dgoElementId });
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover do mapa
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>

      {/* Painel de Vínculos de Fibra (porta→CEO→tubo→via) */}
      {showFiberLinks && (
        <DgoPortFiberLinkPanel
          dgoElementId={dgoElementId}
          equipmentId={equipmentId}
          dgoEquipmentName={dgoEl_?.equipmentName ?? null}
          onClose={() => setShowFiberLinks(false)}
        />
      )}
    </div>
  );
}
