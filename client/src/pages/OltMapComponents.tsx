import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { X, Plus, Trash2, Signal, Loader2, Link2, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Diálogo de Criação de OLT no Mapa ────────────────────────────────────────
export function OltCreateDialog({
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
  const [txPower, setTxPower] = useState("5.0");
  const [attenuation, setAttenuation] = useState("0.35");
  const [fusionLoss, setFusionLoss] = useState("0.1");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const { data: equipmentsRaw = [] } = trpc.equipments.list.useQuery(
    { type: "olt", search: search || undefined },
    { enabled: open }
  );
  const equipments = equipmentsRaw as any[];

  const createMut = trpc.infraMap.createOltElement.useMutation({
    onSuccess: () => {
      toast.success("OLT adicionada ao mapa!");
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!equipmentId) { toast.error("Seleccione um equipamento OLT"); return; }
    createMut.mutate({
      equipmentId,
      lat,
      lng,
      defaultTxPowerDbm: parseFloat(txPower) || 5.0,
      fiberAttenuationDbPerKm: parseFloat(attenuation) || 0.35,
      fusionLossDb: parseFloat(fusionLoss) || 0.1,
      notes: notes || undefined,
    });
  };

  useEffect(() => {
    if (open) {
      setEquipmentId(null); setTxPower("5.0"); setAttenuation("0.35");
      setFusionLoss("0.1"); setNotes(""); setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Signal className="w-4 h-4 text-amber-400" />
            Adicionar OLT ao Mapa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            Posição: {lat.toFixed(6)}, {lng.toFixed(6)}
          </div>

          <div>
            <Label className="text-xs mb-1 block">Equipamento OLT *</Label>
            <Input
              placeholder="Buscar OLT cadastrada..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs mb-2"
            />
            <div className="max-h-40 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
              {equipments.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  {search ? "Nenhuma OLT encontrada" : "Nenhuma OLT cadastrada em Equipamentos"}
                </div>
              ) : equipments.map((eq: any) => (
                <button
                  key={eq.id}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                    equipmentId === eq.id ? "bg-amber-500/20 text-amber-300" : "hover:bg-muted/50 text-foreground"
                  )}
                  onClick={() => setEquipmentId(eq.id)}
                >
                  <span className="font-medium">{eq.name}</span>
                  {eq.model && <span className="text-muted-foreground ml-1">— {eq.model}</span>}
                  {eq.ip && <span className="text-muted-foreground ml-1 font-mono text-[10px]">{eq.ip}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Potência TX (dBm)</Label>
              <Input value={txPower} onChange={e => setTxPower(e.target.value)} className="h-8 text-xs" placeholder="5.0" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Atenuação (dB/km)</Label>
              <Input value={attenuation} onChange={e => setAttenuation(e.target.value)} className="h-8 text-xs" placeholder="0.35" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Perda fusão (dB)</Label>
              <Input value={fusionLoss} onChange={e => setFusionLoss(e.target.value)} className="h-8 text-xs" placeholder="0.1" />
            </div>
          </div>

          <div>
            <Label className="text-xs mb-1 block">Observações</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs" placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleCreate}
            disabled={!equipmentId || createMut.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Signal className="w-4 h-4 mr-1" />}
            Adicionar OLT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Painel de Detalhes OLT ───────────────────────────────────────────────────
export function OltDetailPanel({
  oltElementId,
  elements,
  ceos,
  onClose,
  onUpdated,
}: {
  oltElementId: number;
  elements: any[];
  ceos: any[];
  ctos?: any[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const utils = trpc.useUtils();

  // Carregar dados da OLT
  const { data: oltElRaw } = trpc.infraMap.oltElementById.useQuery({ id: oltElementId });
  const oltEl = oltElRaw as any;

  // Portas da OLT — carregadas via fetch directo ao montar o componente
  const [ports, setPorts] = useState<any[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);

  useEffect(() => {
    setPortsLoading(true);
    fetch(`/api/trpc/infraMap.portsByOltElement?input=${encodeURIComponent(JSON.stringify({ json: { oltElementId } }))}`)
      .then(r => r.json())
      .then(d => { setPorts(d?.result?.data?.json ?? []); })
      .catch(() => setPorts([]))
      .finally(() => setPortsLoading(false));
  }, [oltElementId]);

  // Vínculos de portas existentes
  const { data: portLinksRaw = [] } = trpc.infraMap.oltPortLinks.useQuery({ oltElementId });
  const portLinks = portLinksRaw as any[];

  // Estado do formulário de nova vinculação
  const [addingLink, setAddingLink] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [linkPortId, setLinkPortId] = useState<string>("");
  const [linkTxPower, setLinkTxPower] = useState("");
  const [linkCeoElementId, setLinkCeoElementId] = useState<number | null>(null);
  const [linkTubeId, setLinkTubeId] = useState<string>("");
  const [linkViaNumber, setLinkViaNumber] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [ceoSearch, setCeoSearch] = useState("");

  // Estado de edição de vínculo existente
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editTxPower, setEditTxPower] = useState("");
  const [editCeoElementId, setEditCeoElementId] = useState<number | null>(null);
  const [editTubeId, setEditTubeId] = useState<string>("");
  const [editViaNumber, setEditViaNumber] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editCeoSearch, setEditCeoSearch] = useState("");

  // Tubos do CEO seleccionado (form de criação)
  const [ceoTubes, setCeoTubes] = useState<any[]>([]);
  const [tubesLoading, setTubesLoading] = useState(false);

  // Tubos do CEO seleccionado (form de edição)
  const [editCeoTubes, setEditCeoTubes] = useState<any[]>([]);
  const [editTubesLoading, setEditTubesLoading] = useState(false);

  useEffect(() => {
    if (!linkCeoElementId) { setCeoTubes([]); return; }
    setTubesLoading(true);
    fetch(`/api/trpc/infraMap.tubesByElement?input=${encodeURIComponent(JSON.stringify({ json: { elementId: linkCeoElementId } }))}`)
      .then(r => r.json())
      .then(d => { setCeoTubes(d?.result?.data?.json ?? []); })
      .catch(() => setCeoTubes([]))
      .finally(() => setTubesLoading(false));
  }, [linkCeoElementId]);

  useEffect(() => {
    if (!editCeoElementId) { setEditCeoTubes([]); return; }
    setEditTubesLoading(true);
    fetch(`/api/trpc/infraMap.tubesByElement?input=${encodeURIComponent(JSON.stringify({ json: { elementId: editCeoElementId } }))}`)
      .then(r => r.json())
      .then(d => { setEditCeoTubes(d?.result?.data?.json ?? []); })
      .catch(() => setEditCeoTubes([]))
      .finally(() => setEditTubesLoading(false));
  }, [editCeoElementId]);

  // Número de vias do tubo seleccionado (criação)
  const selectedTube = ceoTubes.find((t: any) => t.id === parseInt(linkTubeId));
  const totalVias = selectedTube?.totalVias ?? 0;

  // Número de vias do tubo seleccionado (edição)
  const editSelectedTube = editCeoTubes.find((t: any) => t.id === parseInt(editTubeId));
  const editTotalVias = editSelectedTube?.totalVias ?? 0;

  const createLinkMut = trpc.infraMap.createOltPortLink.useMutation({
    onSuccess: () => {
      toast.success("Porta vinculada com sucesso!");
      utils.infraMap.oltPortLinks.invalidate({ oltElementId });
      setAddingLink(false);
      resetLinkForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLinkMut = trpc.infraMap.updateOltPortLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo actualizado!");
      utils.infraMap.oltPortLinks.invalidate({ oltElementId });
      setEditingLinkId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLinkMut = trpc.infraMap.deleteOltPortLink.useMutation({
    onSuccess: () => {
      toast.success("Vínculo removido");
      utils.infraMap.oltPortLinks.invalidate({ oltElementId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteOltMut = trpc.infraMap.deleteOltElement.useMutation({
    onSuccess: () => {
      toast.success("OLT removida do mapa");
      onUpdated();
      onClose();
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
    if (!portIdNum) { toast.error("Seleccione uma porta"); return; }
    if (!linkCeoElementId) { toast.error("Seleccione o CEO de saída"); return; }
    if (!tubeIdNum) { toast.error("Seleccione o tubo"); return; }
    if (!viaNum || viaNum < 1) { toast.error("Informe o número da via"); return; }
    createLinkMut.mutate({
      oltElementId,
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
    if (!editCeoElementId) { toast.error("Seleccione o CEO de saída"); return; }
    if (!tubeIdNum) { toast.error("Seleccione o tubo"); return; }
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

  // Helpers
  const getCeoName = (elementId: number) => {
    const el = elements.find(e => e.id === elementId);
    if (!el) return `Elemento #${elementId}`;
    const ref = ceos.find(c => c.id === el.referenceId);
    return ref?.name ?? `CEO-${el.referenceId}`;
  };

  const getPortLabel = (p: any) => {
    const slotPrefix = p.slotNumber ? `Slot ${p.slotNumber} / ` : "";
    const portName = p.label || p.portNumber || `Porta #${p.id}`;
    const type = p.type ? ` (${p.type.toUpperCase()})` : "";
    return `${slotPrefix}${portName}${type}`;
  };

  // Agrupar portas por slot para seleção
  const slots = Array.from(
    new Map(
      ports
        .filter(p => p.slotId)
        .map(p => [p.slotId, {
          id: p.slotId,
          slotNumber: p.slotNumber ?? String(p.slotId),
          slotLabel: p.slotLabel ?? null,
        }])
    ).values()
  ).sort((a, b) => String(a.slotNumber).localeCompare(String(b.slotNumber), undefined, { numeric: true }));
  const portsWithoutSlot = ports.filter(p => !p.slotId);
  const portsForSelectedSlot = selectedSlotId === "__no_slot__"
    ? portsWithoutSlot
    : selectedSlotId
      ? ports.filter(p => String(p.slotId) === selectedSlotId)
      : ports; // se não há slots, mostrar todas

  const hasSlots = slots.length > 0;

  const ceoElements = elements.filter(e => e.type === "ceo");
  const filteredCeos = ceoSearch
    ? ceoElements.filter(e => getCeoName(e.id).toLowerCase().includes(ceoSearch.toLowerCase()))
    : ceoElements;
  const filteredEditCeos = editCeoSearch
    ? ceoElements.filter(e => getCeoName(e.id).toLowerCase().includes(editCeoSearch.toLowerCase()))
    : ceoElements;

  // Tabela de perdas de splitters balanceados
  const balancedSplitters: [string, number][] = [
    ["1:2", 3.5], ["1:4", 7.0], ["1:8", 10.5], ["1:16", 13.5], ["1:32", 17.0], ["1:64", 20.5],
  ];

  // Exemplos de splitters desbalanceados comuns
  const unbalancedSplitters: [string, string, string][] = [
    ["5/95", "-0.5 / -13.0", "dB"],
    ["10/90", "-0.9 / -10.5", "dB"],
    ["20/80", "-1.5 / -7.0", "dB"],
    ["30/70", "-2.0 / -5.5", "dB"],
    ["50/50", "-3.5 / -3.5", "dB"],
  ];

  return (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: "none" }}>
      {/* Overlay */}
      <div className="absolute inset-0" style={{ pointerEvents: "auto" }} onClick={onClose} />
      {/* Painel */}
      <div
        className="absolute top-0 right-0 bottom-0 w-[440px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ pointerEvents: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-amber-500/10 flex-shrink-0">
          <Signal className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-400 text-sm truncate">
              {oltEl?.equipmentName ?? "OLT"}
            </div>
            {oltEl && (
              <div className="text-xs text-muted-foreground">
                TX: {oltEl.defaultTxPowerDbm ?? 5} dBm · Fibra: {oltEl.fiberAttenuationDbPerKm ?? 0.35} dB/km · Fusão: {oltEl.fusionLossDb ?? 0.1} dB
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* ── Portas PON Vinculadas ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Portas PON Vinculadas ({portLinks.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                onClick={() => { setAddingLink(v => !v); if (addingLink) resetLinkForm(); setEditingLinkId(null); }}
              >
                {addingLink ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {addingLink ? "Cancelar" : "Vincular porta"}
              </Button>
            </div>

            {/* Formulário de nova vinculação */}
            {addingLink && (
              <div className="bg-muted/30 border border-amber-500/20 rounded-lg p-3 space-y-3 mb-3">
                <p className="text-xs text-amber-400/80 font-medium">Nova vinculação de porta PON</p>

                {/* Seleção por Slot */}
                {portsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground h-7">
                    <Loader2 className="w-3 h-3 animate-spin" /> A carregar portas...
                  </div>
                ) : ports.length === 0 ? (
                  <div className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1.5 border border-border">
                    Nenhuma porta cadastrada para este equipamento
                  </div>
                ) : (
                  <>
                    {/* Filtro por Slot (só aparece se houver slots) */}
                    {hasSlots && (
                      <div>
                        <Label className="text-xs mb-1 block">Slot *</Label>
                        <Select value={selectedSlotId} onValueChange={v => { setSelectedSlotId(v); setLinkPortId(""); }}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Selecione o slot" />
                          </SelectTrigger>
                          <SelectContent className="z-[99999]">
                            {slots.map(s => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.slotLabel
                                  ? `Slot ${s.slotNumber} — ${s.slotLabel}`
                                  : `Slot ${s.slotNumber}`}
                              </SelectItem>
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
                      <Label className="text-xs mb-1 block">Porta PON *</Label>
                      <Select
                        value={linkPortId}
                        onValueChange={setLinkPortId}
                        disabled={hasSlots && !selectedSlotId}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder={hasSlots && !selectedSlotId ? "Selecione o slot primeiro" : "Selecione a porta"} />
                        </SelectTrigger>
                        <SelectContent className="z-[99999]">
                          {portsForSelectedSlot.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {`Porta ${p.portNumber}${p.label ? ` — ${p.label}` : ""}`}
                              {p.type ? ` (${p.type.toUpperCase()})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Potência TX override */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Potência TX desta porta (dBm) <span className="text-muted-foreground">— opcional</span>
                  </Label>
                  <Input
                    value={linkTxPower}
                    onChange={e => setLinkTxPower(e.target.value)}
                    className="h-7 text-xs"
                    placeholder={`Padrão: ${oltEl?.defaultTxPowerDbm ?? 5} dBm`}
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
                    onChange={e => { setCeoSearch(e.target.value); }}
                    className="h-7 text-xs mb-1"
                  />
                  <div className="max-h-28 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                    {filteredCeos.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-2 text-center">Nenhum CEO encontrado</div>
                    ) : filteredCeos.slice(0, 30).map((el: any) => (
                      <button
                        key={el.id}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                          linkCeoElementId === el.id ? "bg-amber-500/20 text-amber-300" : "hover:bg-muted/50 text-foreground"
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
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
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
                <span className="opacity-60">Clique em "Vincular porta" para associar uma porta PON a uma fibra.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {portLinks.map((link: any) => {
                  const txPower = link.txPowerDbm ?? oltEl?.defaultTxPowerDbm ?? 5;
                  const isEditing = editingLinkId === link.id;
                  return (
                    <div key={link.id} className={cn(
                      "border rounded-lg p-3 transition-colors",
                      isEditing ? "bg-amber-500/5 border-amber-500/30" : "bg-muted/20 border-border/50"
                    )}>
                      {isEditing ? (
                        /* ── Formulário de Edição ── */
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-amber-400">
                              Editar: {link.portName ?? link.portLabel ?? `Porta #${link.portId}`}
                            </span>
                            <button
                              onClick={() => setEditingLinkId(null)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Potência TX */}
                          <div>
                            <Label className="text-xs mb-1 block">Potência TX (dBm)</Label>
                            <Input
                              value={editTxPower}
                              onChange={e => setEditTxPower(e.target.value)}
                              className="h-7 text-xs"
                              placeholder={`Padrão: ${oltEl?.defaultTxPowerDbm ?? 5} dBm`}
                              type="number"
                              step="0.1"
                            />
                          </div>

                          {/* CEO */}
                          <div>
                            <Label className="text-xs mb-1 block">CEO de saída *</Label>
                            <Input
                              placeholder="Buscar CEO..."
                              value={editCeoSearch}
                              onChange={e => setEditCeoSearch(e.target.value)}
                              className="h-7 text-xs mb-1"
                            />
                            <div className="max-h-24 overflow-y-auto rounded border border-border bg-muted/20 space-y-0.5 p-1">
                              {filteredEditCeos.slice(0, 20).map((el: any) => (
                                <button
                                  key={el.id}
                                  className={cn(
                                    "w-full text-left px-2 py-1 rounded text-xs transition-colors",
                                    editCeoElementId === el.id ? "bg-amber-500/20 text-amber-300" : "hover:bg-muted/50 text-foreground"
                                  )}
                                  onClick={() => { setEditCeoElementId(el.id); setEditTubeId(""); setEditViaNumber(""); }}
                                >
                                  {getCeoName(el.id)}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Tubo */}
                          {editCeoElementId != null && (
                            <div>
                              <Label className="text-xs mb-1 block">Tubo *</Label>
                              {editTubesLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground h-7">
                                  <Loader2 className="w-3 h-3 animate-spin" /> A carregar...
                                </div>
                              ) : (
                                <Select value={editTubeId} onValueChange={v => { setEditTubeId(v); setEditViaNumber(""); }}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Selecione o tubo" />
                                  </SelectTrigger>
                                  <SelectContent className="z-[99999]">
                                    {editCeoTubes.map((t: any) => (
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
                          {editTubeId && editTotalVias > 0 && (
                            <div>
                              <Label className="text-xs mb-1 block">Via *</Label>
                              <Select value={editViaNumber} onValueChange={setEditViaNumber}>
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Selecione a via" />
                                </SelectTrigger>
                                <SelectContent className="z-[99999]">
                                  {Array.from({ length: editTotalVias }, (_, i) => i + 1).map(n => (
                                    <SelectItem key={n} value={String(n)}>Via {n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Observações */}
                          <div>
                            <Label className="text-xs mb-1 block">Observações</Label>
                            <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="h-7 text-xs" placeholder="Opcional" />
                          </div>

                          <Button
                            size="sm"
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={handleUpdateLink}
                            disabled={updateLinkMut.isPending}
                          >
                            {updateLinkMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                            Guardar alterações
                          </Button>
                        </div>
                      ) : (
                        /* ── Visualização do Vínculo ── */
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10 max-w-full">
                                <span className="truncate">{link.portName ?? link.portLabel ?? `Porta #${link.portId}`}</span>
                              </Badge>
                              <span className="text-xs font-semibold text-amber-300">{txPower > 0 ? "+" : ""}{txPower} dBm</span>
                            </div>
                            {/* Slot info (se disponível) */}
                            {link.slotNumber && (
                              <div className="text-[10px] text-muted-foreground/60 mb-0.5">
                                Slot {link.slotNumber}{link.slotLabel ? ` — ${link.slotLabel}` : ""}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              <span className="text-foreground/80">{link.ceoName ?? getCeoName(link.ceoElementId)}</span>
                              {" → "}
                              <span>{link.tubeIdentifier ?? `Tubo #${link.tubeId}`}</span>
                              {" · Via "}<span className="font-medium">{link.viaNumber}</span>
                            </div>
                            {link.notes && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{link.notes}</div>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { startEditing(link); setAddingLink(false); }}
                              className="text-muted-foreground hover:text-amber-400 transition-colors"
                              title="Editar vínculo"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteLinkMut.mutate({ id: link.id })}
                              className="text-red-400/60 hover:text-red-400 transition-colors"
                              title="Remover vínculo"
                            >
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

          {/* ── Tabela de Perdas de Referência ── */}
          <div className="bg-muted/20 border border-border/30 rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Perdas de referência</p>
            {/* Splitters balanceados */}
            <p className="text-[10px] text-muted-foreground/70 mb-1.5 font-medium">Splitters Balanceados</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              {balancedSplitters.map(([ratio, loss]) => (
                <div key={ratio} className="flex justify-between">
                  <span className="text-muted-foreground">Splitter {ratio}</span>
                  <span className="text-violet-400 font-medium">-{loss} dB</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fibra (por km)</span>
                <span className="text-blue-400 font-medium">-{oltEl?.fiberAttenuationDbPerKm ?? 0.35} dB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fusão</span>
                <span className="text-cyan-400 font-medium">-{oltEl?.fusionLossDb ?? 0.1} dB</span>
              </div>
            </div>
            {/* Splitters desbalanceados */}
            <p className="text-[10px] text-muted-foreground/70 mb-1.5 font-medium">Splitters Desbalanceados (típicos)</p>
            <div className="space-y-1 text-xs">
              <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground/60 font-medium mb-0.5">
                <span>Divisão</span><span className="text-center">Ramal 1</span><span className="text-center">Ramal 2</span>
              </div>
              {unbalancedSplitters.map(([ratio, losses]) => {
                const [l1, l2] = losses.split(" / ");
                return (
                  <div key={ratio} className="grid grid-cols-3 gap-1">
                    <span className="text-muted-foreground">{ratio}%</span>
                    <span className="text-orange-400 font-medium text-center">{l1} dB</span>
                    <span className="text-orange-300 font-medium text-center">{l2} dB</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-2">
              * Para splitters desbalanceados cadastrados com perda por via, o cálculo usa o valor real da via de saída.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={() => {
              if (confirm("Remover esta OLT do mapa?")) deleteOltMut.mutate({ id: oltElementId });
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
  );
}
