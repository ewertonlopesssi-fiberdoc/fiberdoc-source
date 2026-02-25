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
  ipAddress: string;
  macAddress: string;
  totalPorts: string;
  notes: string;
  status: string;
  autoCreatePorts: boolean;
  portType: string;
  imageUrl: string;
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
  ipAddress: "",
  macAddress: "",
  totalPorts: "",
  notes: "",
  status: "active",
  autoCreatePorts: false,
  portType: "lc",
  imageUrl: "",
};

export default function Equipments() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EquipmentForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();

  const { data: equipments, isLoading } = trpc.equipments.list.useQuery({
    search: search || undefined,
    type: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  });

  const { data: rooms } = trpc.rooms.list.useQuery();

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
      ipAddress: eq.ipAddress ?? "",
      macAddress: eq.macAddress ?? "",
      totalPorts: eq.totalPorts?.toString() ?? "",
      notes: eq.notes ?? "",
      status: eq.status,
      autoCreatePorts: false,
      portType: "lc",
      imageUrl: (eq as any).imageUrl ?? "",
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
      ipAddress: form.ipAddress || undefined,
      macAddress: form.macAddress || undefined,
      totalPorts: form.totalPorts ? parseInt(form.totalPorts) : undefined,
      notes: form.notes || undefined,
      status: form.status as any,
      autoCreatePorts: form.autoCreatePorts,
      portType: form.portType as any,
      imageUrl: form.imageUrl || undefined,
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
        <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Equipamento
        </Button>
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
                        {[eq.roomName, eq.rack && `Rack ${eq.rack}`, eq.rackPosition && `U${eq.rackPosition}`].filter(Boolean).join(" · ")}
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(eq)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(eq.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
            <div className="space-y-1.5">
              <Label>Posição no Rack (U)</Label>
              <Input value={form.rackPosition} onChange={(e) => setForm({ ...form, rackPosition: e.target.value })} placeholder="Ex: 12" className="bg-background border-border/50" />
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
            <div className="col-span-2 space-y-1.5">
              <Label>URL da Imagem do Equipamento</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://exemplo.com/imagem-switch.png"
                  className="bg-background border-border/50 font-mono text-xs"
                />
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="preview"
                    className="w-10 h-10 object-contain rounded border border-border/50 bg-zinc-900 flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Cole a URL de uma imagem do equipamento. Ela aparecerá na topologia de racks.</p>
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
