import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Server,
  Edit,
  Trash2,
  CircuitBoard,
  MapPin,
  Cpu,
  Filter,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { useRole } from "@/hooks/useRole";
import { Zap, Globe, FileDown } from "lucide-react";
import EquipmentQRCode from "@/components/EquipmentQRCode";

const POWER_TYPES = [
  { value: "ac", label: "AC (Corrente Alternada)" },
  { value: "dc", label: "DC (Corrente Contínua)" },
];

const POWER_SOURCES = [
  { value: "rectifier", label: "Retificadora" },
  { value: "inverter", label: "Inversora" },
  { value: "ups", label: "No-Break (UPS)" },
  { value: "grid", label: "Rede Elétrica" },
  { value: "other", label: "Outro" },
];

const EQUIPMENT_TYPES = [
  { value: "switch", label: "Switch" },
  { value: "olt", label: "OLT" },
  { value: "dgo", label: "DGO" },
  { value: "splitter", label: "Splitter" },
  { value: "router", label: "Roteador" },
  { value: "server", label: "Servidor" },
  { value: "patch_panel", label: "Patch Panel" },
  { value: "amplifier", label: "Amplificador" },
  { value: "other", label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "maintenance", label: "Manutenção" },
];

const PORT_TYPES = [
  { value: "lc", label: "LC" },
  { value: "sc", label: "SC" },
  { value: "fc", label: "FC" },
  { value: "st", label: "ST" },
  { value: "rj45", label: "RJ45" },
  { value: "sfp", label: "SFP" },
  { value: "sfp_plus", label: "SFP+" },
  { value: "qsfp", label: "QSFP" },
  { value: "gpon", label: "GPON" },
  { value: "xgspon", label: "XGS-PON" },
  { value: "other", label: "Outro" },
];

function getStatusClass(status: string) {
  const map: Record<string, string> = {
    active: "status-active",
    inactive: "status-inactive",
    maintenance: "status-maintenance",
  };
  return map[status] ?? "status-inactive";
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    maintenance: "Manutenção",
  };
  return map[status] ?? status;
}

function getTypeLabel(type: string) {
  return EQUIPMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

type EquipmentForm = {
  name: string;
  type: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  roomId: string;
  rack: string;
  rackPosition: string;
  rackUnits: string;
  ipAddress: string;
  macAddress: string;
  totalPorts: string;
  notes: string;
  status: string;
  autoCreatePorts: boolean;
  portType: string;
  imageUrl: string;
  powerType: string;
  powerSource: string;
  powerSourceLabel: string;
  powerSourceId: string;  // FK para fonte cadastrada
  voltage: string;
  powerConsumptionW: string;
  // Campos de rede
  vlan: string;
  interfaceIp: string;
  ipBlockId: string;
  serviceDescription: string;
  // Campos SSH
  sshUser: string;
  sshPassword: string;
  sshPort: string;
};

const defaultForm: EquipmentForm = {
  name: "",
  type: "switch",
  model: "",
  manufacturer: "",
  serialNumber: "",
  roomId: "",
  rack: "",
  rackPosition: "",
  rackUnits: "1",
  ipAddress: "",
  macAddress: "",
  totalPorts: "",
  notes: "",
  status: "active",
  autoCreatePorts: false,
  portType: "lc",
  imageUrl: "",
  powerType: "",
  powerSource: "",
  powerSourceLabel: "",
  powerSourceId: "",
  voltage: "",
  powerConsumptionW: "",
  vlan: "",
  interfaceIp: "",
  ipBlockId: "",
  serviceDescription: "",
  sshUser: "",
  sshPassword: "",
  sshPort: "22",
};

// ─── Formulário de Interface de Rede ────────────────────────────────────────
function IfaceForm({ initial, equipmentId: _eqId, onSave, onClose }: {
  initial?: any;
  equipmentId: number;
  onSave: (data: any) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    vlan: initial?.vlan ? String(initial.vlan) : "",
    ipAddress: initial?.ipAddress ?? "",
    macAddress: initial?.macAddress ?? "",
    serviceDescription: initial?.serviceDescription ?? "",
    isPrimary: initial?.isPrimary ?? false,
    notes: initial?.notes ?? "",
    ipBlockId: initial?.ipBlockId ? String(initial.ipBlockId) : "__none__",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  // Buscar lista de blocos IP para o seletor
  const { data: ipBlocks = [] } = trpc.ipDoc.listBlocks.useQuery({});

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      vlan: form.vlan ? parseInt(form.vlan) : null,
      ipAddress: form.ipAddress || null,
      macAddress: form.macAddress || null,
      serviceDescription: form.serviceDescription || null,
      isPrimary: form.isPrimary,
      notes: form.notes || null,
      ipBlockId: (form.ipBlockId && form.ipBlockId !== "__none__") ? parseInt(form.ipBlockId) : null,
    });
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome da Interface *</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)}
          placeholder="Ex: eth0, GigabitEthernet0/1, Vlan100" className="font-mono" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>VLAN ID</Label>
          <Input type="number" min={1} max={4094} value={form.vlan}
            onChange={(e) => set("vlan", e.target.value)} placeholder="Ex: 100" />
        </div>
        <div className="space-y-1.5">
          <Label>IP / Máscara</Label>
          <Input value={form.ipAddress} onChange={(e) => set("ipAddress", e.target.value)}
            placeholder="Ex: 10.0.0.1/24" className="font-mono text-xs" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Endereço MAC</Label>
        <Input value={form.macAddress} onChange={(e) => set("macAddress", e.target.value)}
          placeholder="Ex: AA:BB:CC:DD:EE:FF" className="font-mono text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição do Serviço</Label>
        <Input value={form.serviceDescription} onChange={(e) => set("serviceDescription", e.target.value)}
          placeholder="Ex: Core MPLS, Gerência, Clientes FTTH" />
      </div>
      <div className="space-y-1.5">
        <Label>Bloco IP (IP DOC)</Label>
        <Select value={form.ipBlockId} onValueChange={(v) => set("ipBlockId", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar bloco IP..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhum</SelectItem>
            {ipBlocks.map((b: any) => (
              <SelectItem key={b.id} value={String(b.id)}>
                <span className="font-mono text-xs">{b.cidr}</span>
                <span className="ml-2 text-muted-foreground">{b.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.ipBlockId && form.ipBlockId !== "__none__" && (
          <p className="text-xs text-muted-foreground">
            Bloco vinculado — o IP desta interface será associado ao bloco selecionado no IP DOC.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isPrimary" checked={form.isPrimary}
          onChange={(e) => set("isPrimary", e.target.checked)} className="h-4 w-4 accent-primary" />
        <Label htmlFor="isPrimary" className="cursor-pointer text-sm">Interface principal (gerência)</Label>
      </div>
      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="Notas sobre esta interface..." rows={2} className="resize-none" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!form.name.trim()}>
          {initial ? "Salvar Alterações" : "Adicionar Interface"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function Equipments() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [ipSearch, setIpSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EquipmentForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showIfaceForm, setShowIfaceForm] = useState(false);
  const [editingIface, setEditingIface] = useState<any>(null);
  const [, setLocation] = useLocation();
  const { isAdmin } = useRole();

  const utils = trpc.useUtils();

  const { data: equipments, isLoading } = trpc.equipments.list.useQuery({
    search: search || undefined,
    type: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
    ipSearch: ipSearch || undefined,
  });

  const { data: rooms } = trpc.rooms.list.useQuery();
  const { data: powerSources = [] } = trpc.powerSources.list.useQuery();
  const uploadImageMut = trpc.equipments.uploadImage.useMutation({
    onSuccess: (data) => setForm((f) => ({ ...f, imageUrl: data.url })),
    onError: (e) => toast.error("Erro no upload: " + e.message),
  });
  const { data: interfaces, refetch: refetchInterfaces } = trpc.ipDoc.interfaces.byEquipment.useQuery(
    { equipmentId: editId! },
    { enabled: !!editId }
  );

  const createIface = trpc.ipDoc.interfaces.create.useMutation({
    onSuccess: () => { refetchInterfaces(); toast.success("Interface adicionada!"); setShowIfaceForm(false); setEditingIface(null); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateIface = trpc.ipDoc.interfaces.update.useMutation({
    onSuccess: () => { refetchInterfaces(); toast.success("Interface atualizada!"); setShowIfaceForm(false); setEditingIface(null); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteIface = trpc.ipDoc.interfaces.delete.useMutation({
    onSuccess: () => { refetchInterfaces(); toast.success("Interface removida!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const createMutation = trpc.equipments.create.useMutation({
    onSuccess: () => {
      toast.success("Equipamento cadastrado com sucesso!");
      utils.equipments.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro ao cadastrar: " + e.message),
  });

  const updateMutation = trpc.equipments.update.useMutation({
    onSuccess: () => {
      toast.success("Equipamento atualizado!");
      utils.equipments.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.equipments.delete.useMutation({
    onSuccess: () => {
      toast.success("Equipamento removido!");
      utils.equipments.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });

  function handleEdit(eq: NonNullable<typeof equipments>[0]) {
    setEditId(eq.id);
    setForm({
      name: eq.name,
      type: eq.type,
      model: eq.model ?? "",
      manufacturer: eq.manufacturer ?? "",
      serialNumber: eq.serialNumber ?? "",
      roomId: eq.roomId?.toString() ?? "",
      rack: eq.rack ?? "",
      rackPosition: eq.rackPosition ?? "",
      rackUnits: (eq as any).rackUnits?.toString() ?? "1",
      ipAddress: eq.ipAddress ?? "",
      macAddress: eq.macAddress ?? "",
      totalPorts: eq.totalPorts?.toString() ?? "",
      notes: eq.notes ?? "",
      status: eq.status,
      autoCreatePorts: false,
      portType: "lc",
      imageUrl: (eq as any).imageUrl ?? "",
      powerType: (eq as any).powerType ?? "",
      powerSource: (eq as any).powerSource ?? "",
      powerSourceLabel: (eq as any).powerSourceLabel ?? "",
      powerSourceId: (eq as any).powerSourceId?.toString() ?? "",
      voltage: (eq as any).voltage?.toString() ?? "",
      powerConsumptionW: (eq as any).powerConsumptionW?.toString() ?? "",
      vlan: (eq as any).vlan?.toString() ?? "",
      interfaceIp: (eq as any).interfaceIp ?? "",
      ipBlockId: (eq as any).ipBlockId?.toString() ?? "",
      serviceDescription: (eq as any).serviceDescription ?? "",
      sshUser: (eq as any).sshUser ?? "",
      sshPassword: "",  // nunca pré-preencher a password
      sshPort: (eq as any).sshPort?.toString() ?? "22",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      type: form.type as any,
      model: form.model || undefined,
      manufacturer: form.manufacturer || undefined,
      serialNumber: form.serialNumber || undefined,
      roomId: form.roomId ? parseInt(form.roomId) : undefined,
      rack: form.rack || undefined,
      rackPosition: form.rackPosition || undefined,
      rackUnits: form.rackUnits ? parseInt(form.rackUnits) : 1,
      ipAddress: form.ipAddress || undefined,
      macAddress: form.macAddress || undefined,
      totalPorts: form.totalPorts ? parseInt(form.totalPorts) : undefined,
      notes: form.notes || undefined,
      status: form.status as any,
      autoCreatePorts: form.autoCreatePorts,
      portType: form.portType as any,
      imageUrl: form.imageUrl || undefined,
      powerType: form.powerType as any || undefined,
      powerSource: form.powerSource as any || undefined,
      powerSourceLabel: form.powerSourceLabel || undefined,
      powerSourceId: form.powerSourceId ? parseInt(form.powerSourceId) : undefined,
      voltage: form.voltage ? parseFloat(form.voltage) : undefined,
      powerConsumptionW: form.powerConsumptionW ? parseFloat(form.powerConsumptionW) : undefined,
      vlan: form.vlan ? parseInt(form.vlan) : undefined,
      interfaceIp: form.interfaceIp || undefined,
      ipBlockId: form.ipBlockId ? parseInt(form.ipBlockId) : undefined,
      serviceDescription: form.serviceDescription || undefined,
      sshUser: form.sshUser || undefined,
      sshPassword: form.sshPassword || undefined,
      sshPort: form.sshPort ? parseInt(form.sshPort) : undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Equipamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie switches, OLTs, DGOs e demais equipamentos de rede
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const a = document.createElement("a");
              a.href = "/api/equipment-report-pdf";
              a.download = `FiberDoc_Equipamentos_${new Date().toISOString().slice(0,10)}.pdf`;
              a.click();
            }}
          >
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
          {isAdmin && (
            <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Equipamento
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, modelo ou fabricante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border/50"
          />
        </div>
        <div className="relative flex-1 min-w-48">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por IP, VLAN ou serviço..."
            value={ipSearch}
            onChange={(e) => setIpSearch(e.target.value)}
            className="pl-9 bg-card border-border/50 font-mono text-sm"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 bg-card border-border/50">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {EQUIPMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-card border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Equipment Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (equipments ?? []).length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <Server className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhum equipamento encontrado</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {search ? "Tente ajustar os filtros de busca" : "Cadastre o primeiro equipamento"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(equipments ?? []).map((eq) => (
            <Card key={eq.id} className="border-border/50 bg-card card-hover group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Server className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{eq.name}</h3>
                      <p className="text-xs text-muted-foreground">{getTypeLabel(eq.type)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs border ${getStatusClass(eq.status)}`}>
                    {getStatusLabel(eq.status)}
                  </Badge>
                </div>

                <div className="space-y-1.5 mb-4">
                  {eq.model && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Cpu className="h-3 w-3 shrink-0" />
                      <span className="truncate">{eq.manufacturer ? `${eq.manufacturer} ${eq.model}` : eq.model}</span>
                    </div>
                  )}
                  {(eq.roomName || eq.rack) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {[eq.roomName, eq.rack && `Rack ${eq.rack}`, eq.rackPosition && `U${eq.rackPosition}`, (eq as any).rackUnits && (eq as any).rackUnits > 1 ? `${(eq as any).rackUnits}U` : null].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  )}
                  {eq.totalPorts != null && eq.totalPorts > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CircuitBoard className="h-3 w-3 shrink-0" />
                      <span>{eq.totalPorts} portas</span>
                    </div>
                  )}
                  {eq.ipAddress && (
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                      <span className="text-primary/60">IP</span>
                      <span>{eq.ipAddress}</span>
                    </div>
                  )}
                  {((eq as any).powerType || (eq as any).powerSource) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3 shrink-0 text-yellow-400" />
                      <span className="truncate">
                        {(eq as any).powerType === "dc" ? "DC" : (eq as any).powerType === "ac" ? "AC" : ""}
                        {(eq as any).powerType && (eq as any).powerSource ? " · " : ""}
                        {POWER_SOURCES.find((p) => p.value === (eq as any).powerSource)?.label ?? ""}
                        {(eq as any).powerSourceLabel ? ` (${(eq as any).powerSourceLabel})` : ""}
                        {(eq as any).voltage ? ` · ${(eq as any).voltage}V` : ""}
                        {(eq as any).powerConsumptionW ? ` · ${(eq as any).powerConsumptionW}W` : ""}
                      </span>
                    </div>
                  )}
                  {((eq as any).vlan || (eq as any).interfaceIp) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3 shrink-0 text-blue-400" />
                      <span className="font-mono truncate">
                        {(eq as any).vlan ? `VLAN ${(eq as any).vlan}` : ""}
                        {(eq as any).vlan && (eq as any).interfaceIp ? " · " : ""}
                        {(eq as any).interfaceIp ?? ""}
                      </span>
                    </div>
                  )}
                  {(eq as any).serviceDescription && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-blue-400/60 shrink-0">Serv</span>
                      <span className="truncate italic">{(eq as any).serviceDescription}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 flex-1"
                    onClick={() => setLocation(`/portas/${eq.id}`)}
                  >
                    <CircuitBoard className="h-3 w-3" />
                    Portas
                    <ChevronRight className="h-3 w-3 ml-auto" />
                  </Button>
                  <EquipmentQRCode
                    compact
                    equipmentId={eq.id}
                    equipmentName={eq.name}
                    equipmentType={eq.type}
                    roomName={(eq as any).roomName}
                  />
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(eq)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(eq.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Switch Core 01" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fabricante</Label>
              <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Ex: Huawei, Cisco, Datacom" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Ex: S5735-L48T4X-A" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Número de Série</Label>
              <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="S/N" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Sala / Local</Label>
              <Select value={form.roomId || "none"} onValueChange={(v) => setForm({ ...form, roomId: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar sala" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem sala</SelectItem>
                  {(rooms ?? []).map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rack</Label>
              <Input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} placeholder="Ex: Rack-01" className="bg-background border-border/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Posição no Rack (U)</Label>
                <Input value={form.rackPosition} onChange={(e) => setForm({ ...form, rackPosition: e.target.value })} placeholder="Ex: 12" className="bg-background border-border/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  Altura
                  <span className="text-xs font-mono text-primary">U</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={form.rackUnits}
                  onChange={(e) => setForm({ ...form, rackUnits: e.target.value })}
                  placeholder="Ex: 1"
                  className="bg-background border-border/50"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Endereço IP</Label>
              <Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="Ex: 192.168.1.1" className="bg-background border-border/50 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço MAC</Label>
              <Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} placeholder="Ex: AA:BB:CC:DD:EE:FF" className="bg-background border-border/50 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Total de Portas</Label>
              <Input type="number" value={form.totalPorts} onChange={(e) => setForm({ ...form, totalPorts: e.target.value })} placeholder="Ex: 48" className="bg-background border-border/50" />
            </div>
            {!editId && (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de Porta (para criação automática)</Label>
                  <Select value={form.portType} onValueChange={(v) => setForm({ ...form, portType: v })}>
                    <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PORT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoCreatePorts"
                    checked={form.autoCreatePorts}
                    onChange={(e) => setForm({ ...form, autoCreatePorts: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor="autoCreatePorts" className="cursor-pointer text-sm">
                    Criar portas automaticamente (baseado no total de portas)
                  </Label>
                </div>
              </>
            )}
            {/* Energia */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-3 mt-1">
                <Zap className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-foreground">Alimentação Elétrica</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Energia</Label>
              <Select value={form.powerType || "none"} onValueChange={(v) => setForm({ ...form, powerType: v === "none" ? "" : v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não informado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {POWER_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center justify-between">
                <span>Fonte de Alimentação Cadastrada</span>
                <a href="/fontes-energia" target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-yellow-400 hover:text-yellow-300 underline">
                  + Cadastrar nova fonte
                </a>
              </Label>
              <Select
                value={form.powerSourceId || "__none__"}
                onValueChange={(v) => setForm({ ...form, powerSourceId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue placeholder="Selecionar fonte cadastrada..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {(powerSources as any[]).map((ps) => (
                    <SelectItem key={ps.id} value={String(ps.id)}>
                      {ps.name}{ps.manufacturer ? ` — ${ps.manufacturer}` : ""}{ps.model ? ` ${ps.model}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Vincule a uma fonte cadastrada para monitoramento SNMP. Cadastre fontes em{" "}
                <a href="/fontes-energia" target="_blank" className="text-yellow-400 hover:underline">Fontes de Energia</a>.
              </p>
            </div>

            {/* Tensão e Consumo */}
            <div className="space-y-1.5">
              <Label>Tensão de Operação (V)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.voltage}
                onChange={(e) => setForm({ ...form, voltage: e.target.value })}
                placeholder="Ex: 220 ou 48"
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Consumo Elétrico (W)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.powerConsumptionW}
                onChange={(e) => setForm({ ...form, powerConsumptionW: e.target.value })}
                placeholder="Ex: 150"
                className="bg-background border-border/50"
              />
            </div>

            {/* Imagem do Equipamento — Upload */}
            <div className="col-span-2 space-y-1.5">
              <Label>Imagem do Equipamento</Label>
              <div className="flex gap-3 items-start">
                {/* Área de upload */}
                <label
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors min-h-[80px] ${
                    uploadImageMut.isPending
                      ? "border-yellow-500/50 bg-yellow-500/5"
                      : "border-border/50 hover:border-yellow-500/40 hover:bg-yellow-500/5"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadImageMut.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Imagem muito grande. Máximo 5 MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const base64 = (ev.target?.result as string).split(",")[1];
                        uploadImageMut.mutate({ base64, mimeType: file.type, fileName: file.name });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  {uploadImageMut.isPending ? (
                    <span className="text-xs text-yellow-400 animate-pulse">Enviando...</span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-muted-foreground/50 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-muted-foreground">Clique para enviar imagem</span>
                      <span className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP — máx. 5 MB</span>
                    </>
                  )}
                </label>
                {/* Preview */}
                {form.imageUrl && (
                  <div className="relative flex-shrink-0">
                    <img
                      src={form.imageUrl}
                      alt="preview"
                      className="w-20 h-20 object-contain rounded-lg border border-border/50 bg-zinc-900"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">A imagem aparecerá na topologia de racks e no detalhe do equipamento.</p>
            </div>
            {/* Rede — Múltiplas Interfaces */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-3 mt-1">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-foreground">Interfaces de Rede</span>
                  {editId && interfaces && interfaces.length > 0 && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{interfaces.length}</span>
                  )}
                </div>
                {editId && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    onClick={() => setShowIfaceForm(true)}>
                    <Plus className="h-3 w-3" /> Adicionar Interface
                  </Button>
                )}
              </div>
              {!editId && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                  Salve o equipamento primeiro para adicionar múltiplas interfaces de rede.
                </p>
              )}
              {editId && interfaces && interfaces.length > 0 && (
                <div className="space-y-2">
                  {interfaces.map((iface: any) => (
                    <div key={iface.id} className="flex items-start justify-between bg-muted/30 rounded p-2.5 border border-border/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-medium text-foreground">{iface.name}</span>
                          {iface.isPrimary && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Principal</span>}
                          {iface.vlan && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">VLAN {iface.vlan}</span>}
                        </div>
                        {iface.ipAddress && <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{iface.ipAddress}</p>}
                        {iface.serviceDescription && <p className="text-[11px] text-muted-foreground mt-0.5">{iface.serviceDescription}</p>}
                      </div>
                      <div className="flex gap-1 ml-2 flex-shrink-0">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingIface(iface); setShowIfaceForm(true); }}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteIface.mutate({ id: iface.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {editId && (!interfaces || interfaces.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhuma interface cadastrada. Clique em "Adicionar Interface" para criar.</p>
              )}
            </div>

            {/* SSH */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-3 mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-sm font-medium text-foreground">Acesso SSH</span>
                <span className="text-xs text-muted-foreground">(opcional — usado pelo SSH Commander)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Utilizador SSH</Label>
              <Input
                value={form.sshUser}
                onChange={(e) => setForm({ ...form, sshUser: e.target.value })}
                placeholder="Ex: admin"
                className="bg-background border-border/50 font-mono"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Porta SSH</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={form.sshPort}
                onChange={(e) => setForm({ ...form, sshPort: e.target.value })}
                placeholder="22"
                className="bg-background border-border/50 font-mono"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="flex items-center gap-2">
                Password SSH
                {editId && <span className="text-[10px] text-muted-foreground font-normal">(deixe em branco para manter a actual)</span>}
              </Label>
              <Input
                type="password"
                value={form.sshPassword}
                onChange={(e) => setForm({ ...form, sshPassword: e.target.value })}
                placeholder={editId ? "•••••••• (manter actual)" : "Password SSH"}
                className="bg-background border-border/50"
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground">Guardada encriptada (AES-256). Não é possível recuperar o valor original.</p>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionais sobre o equipamento..." className="bg-background border-border/50 resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isSubmitting}>
              {isSubmitting ? "Salvando..." : editId ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Interface de Rede */}
      <Dialog open={showIfaceForm} onOpenChange={(open) => { setShowIfaceForm(open); if (!open) setEditingIface(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIface ? "Editar Interface" : "Adicionar Interface de Rede"}</DialogTitle>
          </DialogHeader>
          <IfaceForm
            initial={editingIface}
            equipmentId={editId!}
            onSave={(data) => {
              if (editingIface) updateIface.mutate({ id: editingIface.id, ...data });
              else createIface.mutate({ equipmentId: editId!, ...data });
            }}
            onClose={() => { setShowIfaceForm(false); setEditingIface(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover este equipamento? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border/50">Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
