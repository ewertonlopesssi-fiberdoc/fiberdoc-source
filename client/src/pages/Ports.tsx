import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, CircuitBoard, Trash2, Server, ArrowLeft, Layers, Zap, Pencil, X, Search,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useRole } from "@/hooks/useRole";

// ─── Constantes ───────────────────────────────────────────────────────────────
const PORT_TYPE_GROUPS = [
  {
    label: "Óptico — Conectores",
    items: [
      { value: "lc", label: "LC" },
      { value: "sc", label: "SC" },
      { value: "fc", label: "FC" },
      { value: "st", label: "ST" },
    ],
  },
  {
    label: "Óptico — Transceptores",
    items: [
      { value: "sfp",      label: "SFP (1G)" },
      { value: "sfp_plus", label: "SFP+ (10G)" },
      { value: "qsfp",     label: "QSFP+ (40G)" },
      { value: "qsfp28",   label: "QSFP28 (100G)" },
      { value: "qsfp_dd",  label: "QSFP-DD (400G)" },
      { value: "cfp",      label: "CFP (100G)" },
      { value: "cfp2",     label: "CFP2 (100G)" },
      { value: "cfp4",     label: "CFP4 (100G)" },
      { value: "dag",      label: "DAG / DAC" },
    ],
  },
  {
    label: "PON",
    items: [
      { value: "gpon",   label: "GPON" },
      { value: "xgspon", label: "XGS-PON" },
    ],
  },
  {
    label: "Elétrico",
    items: [{ value: "rj45", label: "RJ45" }],
  },
  {
    label: "Outro",
    items: [{ value: "other", label: "Outro" }],
  },
];

const PORT_TYPES_FLAT = PORT_TYPE_GROUPS.flatMap(g => g.items);

const PORT_SPEEDS = [
  { value: "",      label: "Não especificada" },
  { value: "1g",    label: "1G" },
  { value: "10g",   label: "10G" },
  { value: "25g",   label: "25G" },
  { value: "40g",   label: "40G" },
  { value: "100g",  label: "100G" },
  { value: "400g",  label: "400G" },
  { value: "other", label: "Outra" },
];

const PORT_STATUSES = [
  { value: "free",     label: "Livre" },
  { value: "occupied", label: "Ocupada" },
  { value: "reserved", label: "Reservada" },
  { value: "faulty",   label: "Com Defeito" },
];

const STATUS_COLORS: Record<string, string> = {
  free:     "border-emerald-400/30 bg-emerald-400/5 hover:bg-emerald-400/10",
  occupied: "border-blue-400/30 bg-blue-400/5 hover:bg-blue-400/10",
  reserved: "border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10",
  faulty:   "border-red-400/30 bg-red-400/5 hover:bg-red-400/10",
};

const DOT_COLORS: Record<string, string> = {
  free:     "bg-emerald-400",
  occupied: "bg-blue-400",
  reserved: "bg-amber-400",
  faulty:   "bg-red-400",
};

function getPortTypeLabel(type: string) {
  return PORT_TYPES_FLAT.find(t => t.value === type)?.label ?? type.toUpperCase();
}

function getStatusLabel(status: string) {
  return PORT_STATUSES.find(s => s.value === status)?.label ?? status;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type PortForm = {
  portNumber: string;
  label: string;
  type: string;
  speed: string;
  status: string;
  notes: string;
  slotId: string; // "" = sem slot
  sortOrder: string;
  connectedToEquipmentId: string; // "" = sem vínculo
  connectedToPortId: string;     // "" = sem vínculo
};

const defaultPortForm: PortForm = {
  portNumber: "", label: "", type: "lc", speed: "", status: "free", notes: "", slotId: "", sortOrder: "0",
  connectedToEquipmentId: "", connectedToPortId: "",
};

type SlotForm = {
  slotNumber: string;
  label: string;
  portType: string;
  speed: string;
  totalPorts: string;
  notes: string;
};

const defaultSlotForm: SlotForm = {
  slotNumber: "", label: "", portType: "lc", speed: "", totalPorts: "0", notes: "",
};

// ─── PortGrid ─────────────────────────────────────────────────────────────────
function PortGrid({
  ports,
  onEdit,
}: {
  ports: any[];
  onEdit: (port: any) => void;
}) {
  if (ports.length === 0) {
    return (
      <Card className="border-border/50 bg-card">
        <CardContent className="py-12 text-center">
          <CircuitBoard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma porta neste slot</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Crie portas individualmente ou em lote</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
        {ports.map(port => {
          const portSpeed = (port as any).speed as string | null;
          const isHighSpeed = portSpeed === "100g" || portSpeed === "400g" || portSpeed === "40g";
          const hasLink = !!(port as any).connectedToPortId;
          const connEqName = (port as any).connectedEquipmentName as string | null;
          const connPortNum = (port as any).connectedPortNumber as string | null;
          const connPortLabel = (port as any).connectedPortLabel as string | null;

          const portButton = (
            <button
              key={port.id}
              className={`relative group rounded-lg border p-2 text-center transition-all cursor-pointer ${STATUS_COLORS[port.status] ?? "border-border/30 bg-muted/5"} ${isHighSpeed ? "ring-1 ring-inset ring-violet-500/20" : ""} ${hasLink ? "ring-1 ring-inset ring-cyan-500/40" : ""}`}
              onClick={() => onEdit(port)}
            >
              <div className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${DOT_COLORS[port.status] ?? "bg-muted"}`} />
              {hasLink && (
                <div className="absolute bottom-1 right-1 text-cyan-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
              )}
              <p className="text-xs font-mono font-semibold text-foreground">{port.portNumber}</p>
              {port.label && <p className="text-xs text-muted-foreground truncate mt-0.5">{port.label}</p>}
              <p className="text-xs text-muted-foreground/60 mt-0.5">{getPortTypeLabel(port.type)}</p>
              {portSpeed && (
                <p className={`text-xs font-semibold mt-0.5 ${isHighSpeed ? "text-violet-300" : "text-muted-foreground/50"}`}>
                  {portSpeed.toUpperCase()}
                </p>
              )}
            </button>
          );

          if (!hasLink) return portButton;

          return (
            <Tooltip key={port.id}>
              <TooltipTrigger asChild>{portButton}</TooltipTrigger>
              <TooltipContent side="top" className="bg-popover border border-cyan-500/30 text-popover-foreground max-w-[200px]">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Vinculada a
                  </p>
                  {connEqName && <p className="text-xs font-medium text-foreground">{connEqName}</p>}
                  {connPortNum && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Porta {connPortNum}{connPortLabel ? ` — ${connPortLabel}` : ""}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function Ports() {
  const params = useParams<{ equipmentId: string }>();
  const equipmentId = parseInt(params.equipmentId ?? "0");
  const [, setLocation] = useLocation();

  // Dialogs de porta
  const [portDialogOpen, setPortDialogOpen] = useState(false);
  const [editPortId, setEditPortId] = useState<number | null>(null);
  const [portForm, setPortForm] = useState<PortForm>(defaultPortForm);
  const [deletePortId, setDeletePortId] = useState<number | null>(null);

  // Dialogs de slot
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [editSlotId, setEditSlotId] = useState<number | null>(null);
  const [slotForm, setSlotForm] = useState<SlotForm>(defaultSlotForm);
  const [deleteSlotId, setDeleteSlotId] = useState<number | null>(null);

  // Busca inline de portas
  const [portSearch, setPortSearch] = useState("");

  // Criação em lote
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("12");
  const [bulkType, setBulkType] = useState("lc");
  const [bulkSpeed, setBulkSpeed] = useState("");
  const [bulkSlotId, setBulkSlotId] = useState<string>(""); // "" = sem slot

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: equipment } = trpc.equipments.byId.useQuery(
    { id: equipmentId }, { enabled: equipmentId > 0 }
  );

  const { data: allPorts = [], isLoading: portsLoading } = trpc.ports.byEquipment.useQuery(
    { equipmentId }, { enabled: equipmentId > 0 }
  );

  const { data: slots = [], isLoading: slotsLoading } = trpc.slots.byEquipment.useQuery(
    { equipmentId }, { enabled: equipmentId > 0 }
  );

  // Para o seletor de vínculo de porta
  const { data: allEquipments = [] } = trpc.equipments.list.useQuery({});
  const connectedEquipmentId = portForm.connectedToEquipmentId ? parseInt(portForm.connectedToEquipmentId) : null;
  const { data: connectedEquipmentPorts = [] } = trpc.ports.byEquipment.useQuery(
    { equipmentId: connectedEquipmentId ?? 0 },
    { enabled: !!connectedEquipmentId && connectedEquipmentId !== equipmentId }
  );

  // ─── Mutations de Porta ───────────────────────────────────────────────────
  const createPortMutation = trpc.ports.create.useMutation({
    onSuccess: () => {
      toast.success("Porta criada!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setPortDialogOpen(false);
      setPortForm(defaultPortForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updatePortMutation = trpc.ports.update.useMutation({
    onSuccess: () => {
      toast.success("Porta atualizada!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      setPortDialogOpen(false);
      setEditPortId(null);
      setPortForm(defaultPortForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deletePortMutation = trpc.ports.delete.useMutation({
    onSuccess: () => {
      toast.success("Porta removida!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setDeletePortId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const bulkMutation = trpc.ports.bulkCreate.useMutation({
    onSuccess: () => {
      toast.success(`${bulkCount} portas criadas com sucesso!`);
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setBulkOpen(false);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  // ─── Mutations de Slot ────────────────────────────────────────────────────
  const createSlotMutation = trpc.slots.create.useMutation({
    onSuccess: () => {
      toast.success("Slot criado!");
      utils.slots.byEquipment.invalidate({ equipmentId });
      setSlotDialogOpen(false);
      setSlotForm(defaultSlotForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateSlotMutation = trpc.slots.update.useMutation({
    onSuccess: () => {
      toast.success("Slot atualizado!");
      utils.slots.byEquipment.invalidate({ equipmentId });
      setSlotDialogOpen(false);
      setEditSlotId(null);
      setSlotForm(defaultSlotForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deleteSlotMutation = trpc.slots.delete.useMutation({
    onSuccess: () => {
      toast.success("Slot removido!");
      utils.slots.byEquipment.invalidate({ equipmentId });
      utils.ports.byEquipment.invalidate({ equipmentId });
      setDeleteSlotId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleEditPort(port: any) {
    setEditPortId(port.id);
    setPortForm({
      portNumber: port.portNumber,
      label: port.label ?? "",
      type: port.type,
      speed: port.speed ?? "",
      status: port.status,
      notes: port.notes ?? "",
      slotId: port.slotId ? String(port.slotId) : "",
      sortOrder: String(port.sortOrder ?? 0),
      connectedToEquipmentId: port.connectedToEquipmentId ? String(port.connectedToEquipmentId) : "",
      connectedToPortId: port.connectedToPortId ? String(port.connectedToPortId) : "",
    });
    setPortDialogOpen(true);
  }

  function handleSubmitPort() {
    const speedVal = (portForm.speed && portForm.speed !== "__none__") ? portForm.speed : undefined;
    const slotIdVal = portForm.slotId ? parseInt(portForm.slotId) : undefined;
    const connEqId = portForm.connectedToEquipmentId ? parseInt(portForm.connectedToEquipmentId) : null;
    const connPortId = portForm.connectedToPortId ? parseInt(portForm.connectedToPortId) : null;
    if (editPortId) {
      updatePortMutation.mutate({
        id: editPortId,
        portNumber: portForm.portNumber || undefined,
        label: portForm.label || undefined,
        type: portForm.type as any,
        speed: speedVal as any,
        status: portForm.status as any,
        notes: portForm.notes || undefined,
        sortOrder: portForm.sortOrder !== "" ? parseInt(portForm.sortOrder) : 0,
        connectedToEquipmentId: connEqId,
        connectedToPortId: connPortId,
      } as any);
    } else {
      createPortMutation.mutate({
        equipmentId,
        portNumber: portForm.portNumber,
        label: portForm.label || undefined,
        type: portForm.type as any,
        speed: speedVal as any,
        status: portForm.status as any,
        notes: portForm.notes || undefined,
        slotId: slotIdVal,
        sortOrder: portForm.sortOrder !== "" ? parseInt(portForm.sortOrder) : 0,
        connectedToEquipmentId: connEqId,
        connectedToPortId: connPortId,
      } as any);
    }
  }

  function handleEditSlot(slot: any) {
    setEditSlotId(slot.id);
    setSlotForm({
      slotNumber: slot.slotNumber,
      label: slot.label ?? "",
      portType: slot.portType ?? "lc",
      speed: slot.speed ?? "",
      totalPorts: String(slot.totalPorts ?? 0),
      notes: slot.notes ?? "",
    });
    setSlotDialogOpen(true);
  }

  function handleSubmitSlot() {
    const speedVal = (slotForm.speed && slotForm.speed !== "__none__") ? slotForm.speed : undefined;
    if (editSlotId) {
      updateSlotMutation.mutate({
        id: editSlotId,
        slotNumber: slotForm.slotNumber,
        label: slotForm.label || undefined,
        portType: slotForm.portType as any,
        speed: speedVal as any,
        totalPorts: parseInt(slotForm.totalPorts) || 0,
        notes: slotForm.notes || undefined,
      });
    } else {
      createSlotMutation.mutate({
        equipmentId,
        slotNumber: slotForm.slotNumber,
        label: slotForm.label || undefined,
        portType: slotForm.portType as any,
        speed: speedVal as any,
        totalPorts: parseInt(slotForm.totalPorts) || 0,
        notes: slotForm.notes || undefined,
      });
    }
  }

  // ─── Seletor de equipamento ───────────────────────────────────────────────
  if (equipmentId === 0) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Portas</h1>
          <p className="text-sm text-muted-foreground mt-1">Selecione um equipamento para gerenciar suas portas</p>
        </div>
        <EquipmentSelector onSelect={id => setLocation(`/portas/${id}`)} />
      </div>
    );
  }

  // ─── Estatísticas ─────────────────────────────────────────────────────────
  const freeCount     = allPorts.filter(p => p.status === "free").length;
  const occupiedCount = allPorts.filter(p => p.status === "occupied").length;
  const reservedCount = allPorts.filter(p => p.status === "reserved").length;
  const faultyCount   = allPorts.filter(p => p.status === "faulty").length;

  // Portas sem slot
  const searchTerm = portSearch.trim().toLowerCase();
  const filteredPorts = searchTerm
    ? allPorts.filter(p =>
        String(p.portNumber).includes(searchTerm) ||
        (p.label ?? "").toLowerCase().includes(searchTerm) ||
        (p.type ?? "").toLowerCase().includes(searchTerm) ||
        (p.speed ?? "").toLowerCase().includes(searchTerm) ||
        (p.status ?? "").toLowerCase().includes(searchTerm)
      )
    : allPorts;
  const unslottedPorts = filteredPorts.filter(p => !(p as any).slotId);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/equipamentos")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {equipment?.name ?? "Equipamento"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestão de portas e slots · {allPorts.length} portas · {slots.length} slot{slots.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={portSearch}
              onChange={e => setPortSearch(e.target.value)}
              placeholder="Buscar porta..."
              className="pl-8 h-9 w-44 text-sm border-border/50 bg-background/50"
            />
            {portSearch && (
              <button
                onClick={() => setPortSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {isAdmin && (
            <Button variant="outline" onClick={() => { setEditSlotId(null); setSlotForm(defaultSlotForm); setSlotDialogOpen(true); }} className="gap-2 border-border/50">
              <Layers className="h-4 w-4" />
              Novo Slot
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2 border-border/50">
              <CircuitBoard className="h-4 w-4" />
              Criar em Lote
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => { setEditPortId(null); setPortForm(defaultPortForm); setPortDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Porta
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Livres",      count: freeCount,     cls: "text-emerald-400" },
          { label: "Ocupadas",    count: occupiedCount,  cls: "text-blue-400" },
          { label: "Reservadas",  count: reservedCount,  cls: "text-amber-400" },
          { label: "Com Defeito", count: faultyCount,    cls: "text-red-400" },
        ].map(stat => (
          <Card key={stat.label} className="border-border/50 bg-card">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.cls}`}>{stat.count}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Abas por slot */}
      {(portsLoading || slotsLoading) ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : slots.length === 0 ? (
        // Sem slots: exibe todas as portas diretamente
        <>
          <PortGrid ports={unslottedPorts} onEdit={handleEditPort} />
          {allPorts.length > 0 && <PortLegend />}
        </>
      ) : (
        // Com slots: abas
        <Tabs defaultValue="all">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <TabsList className="bg-muted/30 border border-border/30 h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="all" className="text-xs h-7 px-3">
                Todas ({allPorts.length})
              </TabsTrigger>
              {slots.map(slot => {
                const slotPorts = allPorts.filter(p => (p as any).slotId === slot.id);
                return (
                  <TabsTrigger key={slot.id} value={String(slot.id)} className="text-xs h-7 px-3 gap-1.5">
                    <span className="font-mono font-bold">Slot {slot.slotNumber}</span>
                    {slot.label && <span className="text-muted-foreground hidden sm:inline">— {slot.label}</span>}
                    {slot.speed && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-300 ml-1">
                        {slot.speed.toUpperCase()}
                      </Badge>
                    )}
                    <span className="text-muted-foreground/60">({slotPorts.length})</span>
                  </TabsTrigger>
                );
              })}
              {unslottedPorts.length > 0 && (
                <TabsTrigger value="unslotted" className="text-xs h-7 px-3">
                  Sem Slot ({unslottedPorts.length})
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Aba: Todas */}
          <TabsContent value="all" className="mt-0 space-y-6">
            {searchTerm && (
              <p className="text-xs text-muted-foreground">
                {filteredPorts.length} porta{filteredPorts.length !== 1 ? "s" : ""} encontrada{filteredPorts.length !== 1 ? "s" : ""} para "{portSearch}"
              </p>
            )}
            {slots.map(slot => {
              const slotPorts = filteredPorts.filter(p => (p as any).slotId === slot.id);
              if (searchTerm && slotPorts.length === 0) return null;
              return (
                <div key={slot.id}>
                  <SlotHeader slot={slot} onEdit={() => handleEditSlot(slot)} onDelete={() => setDeleteSlotId(slot.id)} isAdmin={isAdmin} />
                  <PortGrid ports={slotPorts} onEdit={handleEditPort} />
                </div>
              );
            })}
            {unslottedPorts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Portas sem slot</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                <PortGrid ports={unslottedPorts} onEdit={handleEditPort} />
              </div>
            )}
            {filteredPorts.length === 0 && searchTerm && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Search className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhuma porta encontrada para "{portSearch}"</p>
              </div>
            )}
            {allPorts.length > 0 && <PortLegend />}
          </TabsContent>

          {/* Abas individuais por slot */}
          {slots.map(slot => {
            const slotPorts = filteredPorts.filter(p => (p as any).slotId === slot.id);
            return (
              <TabsContent key={slot.id} value={String(slot.id)} className="mt-0 space-y-4">
                <SlotHeader slot={slot} onEdit={() => handleEditSlot(slot)} onDelete={() => setDeleteSlotId(slot.id)} isAdmin={isAdmin} />
                <PortGrid ports={slotPorts} onEdit={handleEditPort} />
                {slotPorts.length > 0 && <PortLegend />}
              </TabsContent>
            );
          })}

          {/* Aba: Sem Slot */}
          <TabsContent value="unslotted" className="mt-0 space-y-4">
            <PortGrid ports={unslottedPorts} onEdit={handleEditPort} />
            {unslottedPorts.length > 0 && <PortLegend />}
          </TabsContent>
        </Tabs>
      )}

      {/* ─── Dialog: Criar/Editar Porta ─────────────────────────────────────── */}
      <Dialog open={portDialogOpen} onOpenChange={setPortDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editPortId ? "Editar Porta" : "Nova Porta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Número da Porta *</Label>
              <Input
                value={portForm.portNumber}
                onChange={e => setPortForm({ ...portForm, portNumber: e.target.value })}
                placeholder="Ex: 01, GE1/0/1, Eth1"
                className="bg-background border-border/50 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Etiqueta / Descrição</Label>
              <Input
                value={portForm.label}
                onChange={e => setPortForm({ ...portForm, label: e.target.value })}
                placeholder="Ex: Uplink NOC, Backbone SP"
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Conector</Label>
                <Select value={portForm.type} onValueChange={v => setPortForm({ ...portForm, type: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORT_TYPE_GROUPS.map(group => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{group.label}</SelectLabel>
                        {group.items.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" /> Velocidade
                </Label>
                <Select value={portForm.speed || "__none__"} onValueChange={v => setPortForm({ ...portForm, speed: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não especificada" /></SelectTrigger>
                  <SelectContent>
                    {PORT_SPEEDS.map(s => (
                      <SelectItem key={s.value || "__none__"} value={s.value || "__none__"}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Slot */}
            {slots.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-blue-400" /> Slot
                </Label>
                <Select value={portForm.slotId || "__none__"} onValueChange={v => setPortForm({ ...portForm, slotId: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Sem slot" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem slot</SelectItem>
                    {slots.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Slot {s.slotNumber}{s.label ? ` — ${s.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={portForm.status} onValueChange={v => setPortForm({ ...portForm, status: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PORT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Posição na Grade
                <span className="text-xs text-muted-foreground font-normal">(menor número aparece primeiro)</span>
              </Label>
              <Input
                type="number"
                min="0"
                value={portForm.sortOrder}
                onChange={e => setPortForm({ ...portForm, sortOrder: e.target.value })}
                placeholder="0"
                className="bg-background border-border/50 font-mono"
              />
            </div>
            {/* Vínculo com porta de outro equipamento */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CircuitBoard className="h-3.5 w-3.5 text-cyan-400" /> Conectado a
                <span className="text-xs text-muted-foreground font-normal">(porta de outro equipamento)</span>
              </Label>
              <Select
                value={portForm.connectedToEquipmentId || "__none__"}
                onValueChange={v => setPortForm({ ...portForm, connectedToEquipmentId: v === "__none__" ? "" : v, connectedToPortId: "" })}
              >
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Nenhum equipamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum equipamento</SelectItem>
                  {allEquipments.filter((eq: any) => eq.id !== equipmentId).map((eq: any) => (
                    <SelectItem key={eq.id} value={String(eq.id)}>
                      {eq.name}{eq.rack ? ` — ${eq.rack}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {portForm.connectedToEquipmentId && (
                <Select
                  value={portForm.connectedToPortId || "__none__"}
                  onValueChange={v => setPortForm({ ...portForm, connectedToPortId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecione a porta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma porta</SelectItem>
                    {connectedEquipmentPorts.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        Porta {p.portNumber}{p.label ? ` — ${p.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={portForm.notes}
                onChange={e => setPortForm({ ...portForm, notes: e.target.value })}
                placeholder="Notas..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editPortId && (
              <Button variant="destructive" size="sm" onClick={() => { setDeletePortId(editPortId); setPortDialogOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setPortDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSubmitPort}
              disabled={(!editPortId && !portForm.portNumber) || updatePortMutation.isPending || createPortMutation.isPending}
            >
              {updatePortMutation.isPending || createPortMutation.isPending ? "Salvando..." : editPortId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Criar/Editar Slot ──────────────────────────────────────── */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editSlotId ? "Editar Slot" : "Novo Slot"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Identificador do Slot *</Label>
                <Input
                  value={slotForm.slotNumber}
                  onChange={e => setSlotForm({ ...slotForm, slotNumber: e.target.value })}
                  placeholder="Ex: A, B, 1, 2"
                  className="bg-background border-border/50 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Qtd. de Portas</Label>
                <Input
                  type="number"
                  min="0"
                  max="256"
                  value={slotForm.totalPorts}
                  onChange={e => setSlotForm({ ...slotForm, totalPorts: e.target.value })}
                  className="bg-background border-border/50"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição / Etiqueta</Label>
              <Input
                value={slotForm.label}
                onChange={e => setSlotForm({ ...slotForm, label: e.target.value })}
                placeholder="Ex: LC 12 portas, GPON 8 portas"
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Conector</Label>
                <Select value={slotForm.portType} onValueChange={v => setSlotForm({ ...slotForm, portType: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORT_TYPE_GROUPS.map(group => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{group.label}</SelectLabel>
                        {group.items.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" /> Velocidade
                </Label>
                <Select value={slotForm.speed || "__none__"} onValueChange={v => setSlotForm({ ...slotForm, speed: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não especificada" /></SelectTrigger>
                  <SelectContent>
                    {PORT_SPEEDS.map(s => (
                      <SelectItem key={s.value || "__none__"} value={s.value || "__none__"}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={slotForm.notes}
                onChange={e => setSlotForm({ ...slotForm, notes: e.target.value })}
                placeholder="Notas sobre este slot..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editSlotId && (
              <Button variant="destructive" size="sm" onClick={() => { setDeleteSlotId(editSlotId); setSlotDialogOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover Slot
              </Button>
            )}
            <Button variant="outline" onClick={() => setSlotDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSubmitSlot}
              disabled={!slotForm.slotNumber || createSlotMutation.isPending || updateSlotMutation.isPending}
            >
              {createSlotMutation.isPending || updateSlotMutation.isPending ? "Salvando..." : editSlotId ? "Salvar" : "Criar Slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Criar em Lote ──────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Criar Portas em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Slot de destino */}
            {slots.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-blue-400" /> Slot de Destino
                </Label>
                <Select value={bulkSlotId || "__none__"} onValueChange={v => setBulkSlotId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Sem slot (geral)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem slot (geral)</SelectItem>
                    {slots.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        Slot {s.slotNumber}{s.label ? ` — ${s.label}` : ""}{s.speed ? ` (${s.speed.toUpperCase()})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bulkSlotId && (() => {
                  const sl = slots.find(s => String(s.id) === bulkSlotId);
                  return sl ? (
                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 text-xs text-blue-300 flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Portas serão criadas no <strong>Slot {sl.slotNumber}</strong>
                        {sl.label ? ` (${sl.label})` : ""}
                        {sl.speed ? ` · ${sl.speed.toUpperCase()}` : ""}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Quantidade de Portas</Label>
              <Input
                type="number" min="1" max="256"
                value={bulkCount}
                onChange={e => setBulkCount(e.target.value)}
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Conector</Label>
                <Select value={bulkType} onValueChange={setBulkType}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORT_TYPE_GROUPS.map(group => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{group.label}</SelectLabel>
                        {group.items.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" /> Velocidade
                </Label>
                <Select value={bulkSpeed || "__none__"} onValueChange={v => setBulkSpeed(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não especificada" /></SelectTrigger>
                  <SelectContent>
                    {PORT_SPEEDS.map(s => (
                      <SelectItem key={s.value || "__none__"} value={s.value || "__none__"}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(bulkSpeed === "100g" || bulkSpeed === "40g" || bulkSpeed === "400g") && (
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 flex items-start gap-2">
                <Zap className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                <p className="text-xs text-violet-300">
                  <span className="font-semibold">Porta de alta velocidade ({bulkSpeed.toUpperCase()}).</span>
                  {" "}Certifique-se de que o equipamento suporta transceptores {bulkType.toUpperCase()} nesta velocidade.
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Serão criadas {bulkCount} portas numeradas sequencialmente (01, 02, ...) com status "Livre".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={() => bulkMutation.mutate({
                equipmentId,
                count: parseInt(bulkCount),
                type: bulkType as any,
                speed: bulkSpeed ? bulkSpeed as any : undefined,
                slotId: bulkSlotId ? parseInt(bulkSlotId) : undefined,
              })}
              disabled={!bulkCount || parseInt(bulkCount) < 1 || bulkMutation.isPending}
              className={bulkSpeed === "100g" || bulkSpeed === "400g" || bulkSpeed === "40g" ? "bg-violet-600 hover:bg-violet-700" : ""}
            >
              {bulkMutation.isPending ? "Criando..." : `Criar ${bulkCount} Portas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Confirmar exclusão de porta ────────────────────────────── */}
      <Dialog open={deletePortId !== null} onOpenChange={() => setDeletePortId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover esta porta?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePortId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deletePortId && deletePortMutation.mutate({ id: deletePortId })} disabled={deletePortMutation.isPending}>
              {deletePortMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Confirmar exclusão de slot ─────────────────────────────── */}
      <Dialog open={deleteSlotId !== null} onOpenChange={() => setDeleteSlotId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover Slot</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ao remover o slot, as portas associadas a ele serão mantidas mas ficarão sem slot. Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSlotId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteSlotId && deleteSlotMutation.mutate({ id: deleteSlotId })} disabled={deleteSlotMutation.isPending}>
              {deleteSlotMutation.isPending ? "Removendo..." : "Remover Slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SlotHeader ───────────────────────────────────────────────────────────────
function SlotHeader({ slot, onEdit, onDelete, isAdmin }: { slot: any; onEdit: () => void; onDelete: () => void; isAdmin: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/30">
          <Layers className="h-3.5 w-3.5 text-blue-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground font-mono">Slot {slot.slotNumber}</span>
            {slot.label && <span className="text-xs text-muted-foreground">— {slot.label}</span>}
            {slot.speed && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/40 text-violet-300">
                {slot.speed.toUpperCase()}
              </Badge>
            )}
            {slot.portType && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40 text-muted-foreground">
                {PORT_TYPES_FLAT.find(t => t.value === slot.portType)?.label ?? slot.portType.toUpperCase()}
              </Badge>
            )}
          </div>
          {slot.notes && <p className="text-xs text-muted-foreground/60">{slot.notes}</p>}
        </div>
      </div>
      <div className="flex-1 h-px bg-border/30" />
      {isAdmin && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── PortLegend ───────────────────────────────────────────────────────────────
function PortLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
      {[
        { color: "bg-emerald-400", label: "Livre" },
        { color: "bg-blue-400",    label: "Ocupada" },
        { color: "bg-amber-400",   label: "Reservada" },
        { color: "bg-red-400",     label: "Com Defeito" },
      ].map(l => (
        <div key={l.label} className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${l.color}`} />
          {l.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <div className="h-2 w-2 rounded border border-violet-500/40 bg-violet-500/10" />
        <span>Alta velocidade (40G/100G/400G)</span>
      </div>
      <span className="text-muted-foreground/50">· Clique em uma porta para editar</span>
    </div>
  );
}

// ─── EquipmentSelector ────────────────────────────────────────────────────────
function EquipmentSelector({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: equipments, isLoading } = trpc.equipments.list.useQuery({});

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {(equipments ?? []).map(eq => (
        <Card key={eq.id} className="border-border/50 bg-card card-hover cursor-pointer" onClick={() => onSelect(eq.id)}>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm text-foreground truncate">{eq.name}</h3>
              <p className="text-xs text-muted-foreground">{eq.totalPorts ?? 0} portas · {eq.type}</p>
            </div>
            <CircuitBoard className="h-4 w-4 text-muted-foreground/40 ml-auto shrink-0" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
