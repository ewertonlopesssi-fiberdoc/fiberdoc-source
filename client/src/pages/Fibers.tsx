import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Search, Cable, Edit, Trash2, ArrowRight, Filter, Ruler, Zap } from "lucide-react";
import { useRole } from "@/hooks/useRole";

const FIBER_TYPES = [
  { value: "single_mode", label: "Monomodo (SM)" },
  { value: "multi_mode", label: "Multimodo (MM)" },
  { value: "armored", label: "Armada" },
  { value: "aerial", label: "Aérea" },
  { value: "underground", label: "Subterrânea" },
];

const FIBER_COLORS = [
  { value: "blue", label: "Azul", hex: "#3b82f6" },
  { value: "orange", label: "Laranja", hex: "#f97316" },
  { value: "green", label: "Verde", hex: "#22c55e" },
  { value: "brown", label: "Marrom", hex: "#92400e" },
  { value: "slate", label: "Cinza", hex: "#64748b" },
  { value: "white", label: "Branco", hex: "#e2e8f0" },
  { value: "red", label: "Vermelho", hex: "#ef4444" },
  { value: "black", label: "Preto", hex: "#1e293b" },
  { value: "yellow", label: "Amarelo", hex: "#eab308" },
  { value: "violet", label: "Violeta", hex: "#8b5cf6" },
  { value: "rose", label: "Rosa", hex: "#f43f5e" },
  { value: "aqua", label: "Aqua", hex: "#06b6d4" },
];

const FIBER_STATUSES = [
  { value: "active", label: "Ativa" },
  { value: "inactive", label: "Inativa" },
  { value: "reserved", label: "Reservada" },
  { value: "faulty", label: "Com Defeito" },
];

function getStatusClass(status: string) {
  const map: Record<string, string> = {
    active: "status-active",
    inactive: "status-inactive",
    reserved: "status-reserved",
    faulty: "status-faulty",
  };
  return map[status] ?? "status-inactive";
}

function getStatusLabel(status: string) {
  return FIBER_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function getFiberColor(color: string | null | undefined) {
  return FIBER_COLORS.find((c) => c.value === color);
}

type FiberForm = {
  name: string;
  originEquipmentId: string;
  originPortId: string;
  destinationEquipmentId: string;
  destinationPortId: string;
  color: string;
  type: string;
  lengthMeters: string;
  cableId: string;
  tubeColor: string;
  attenuation: string;
  status: string;
  notes: string;
};

const defaultForm: FiberForm = {
  name: "",
  originEquipmentId: "",
  originPortId: "",
  destinationEquipmentId: "",
  destinationPortId: "",
  color: "blue",
  type: "single_mode",
  lengthMeters: "",
  cableId: "",
  tubeColor: "",
  attenuation: "",
  status: "active",
  notes: "",
};

export default function Fibers() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FiberForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: fibers, isLoading } = trpc.fibers.list.useQuery({
    search: search || undefined,
    type: filterType !== "all" ? filterType : undefined,
    status: filterStatus !== "all" ? filterStatus : undefined,
  });

  const { data: equipments } = trpc.equipments.list.useQuery({});

  const selectedOriginPorts = trpc.ports.byEquipment.useQuery(
    { equipmentId: parseInt(form.originEquipmentId) },
    { enabled: !!form.originEquipmentId }
  );

  const selectedDestPorts = trpc.ports.byEquipment.useQuery(
    { equipmentId: parseInt(form.destinationEquipmentId) },
    { enabled: !!form.destinationEquipmentId }
  );

  const createMutation = trpc.fibers.create.useMutation({
    onSuccess: () => {
      toast.success("Fibra cadastrada com sucesso!");
      utils.fibers.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.fibers.update.useMutation({
    onSuccess: () => {
      toast.success("Fibra atualizada!");
      utils.fibers.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.fibers.delete.useMutation({
    onSuccess: () => {
      toast.success("Fibra removida!");
      utils.fibers.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function handleEdit(fiber: NonNullable<typeof fibers>[0]) {
    setEditId(fiber.id);
    setForm({
      name: fiber.name,
      originEquipmentId: fiber.originEquipmentId?.toString() ?? "",
      originPortId: fiber.originPortId?.toString() ?? "",
      destinationEquipmentId: fiber.destinationEquipmentId?.toString() ?? "",
      destinationPortId: fiber.destinationPortId?.toString() ?? "",
      color: fiber.color ?? "blue",
      type: fiber.type,
      lengthMeters: fiber.lengthMeters?.toString() ?? "",
      cableId: fiber.cableId ?? "",
      tubeColor: fiber.tubeColor ?? "",
      attenuation: fiber.attenuation?.toString() ?? "",
      status: fiber.status,
      notes: fiber.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      originEquipmentId: form.originEquipmentId ? parseInt(form.originEquipmentId) : undefined,
      originPortId: form.originPortId ? parseInt(form.originPortId) : undefined,
      destinationEquipmentId: form.destinationEquipmentId ? parseInt(form.destinationEquipmentId) : undefined,
      destinationPortId: form.destinationPortId ? parseInt(form.destinationPortId) : undefined,
      color: form.color as any,
      type: form.type as any,
      lengthMeters: form.lengthMeters ? parseFloat(form.lengthMeters) : undefined,
      cableId: form.cableId || undefined,
      tubeColor: form.tubeColor || undefined,
      attenuation: form.attenuation ? parseFloat(form.attenuation) : undefined,
      status: form.status as any,
      notes: form.notes || undefined,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Fibras Ópticas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro e rastreamento de fibras ópticas da infraestrutura
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Fibra
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou ID do cabo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border/50"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 bg-card border-border/50">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {FIBER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-card border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {FIBER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : (fibers ?? []).length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <Cable className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhuma fibra encontrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {search ? "Tente ajustar os filtros" : "Cadastre a primeira fibra óptica"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(fibers ?? []).map((fiber) => {
            const colorInfo = getFiberColor(fiber.color);
            return (
              <Card key={fiber.id} className="border-border/50 bg-card card-hover">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-9 w-9 rounded-lg border flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: colorInfo ? `${colorInfo.hex}20` : "oklch(0.65 0.18 210 / 0.1)",
                          borderColor: colorInfo ? `${colorInfo.hex}40` : "oklch(0.65 0.18 210 / 0.2)",
                        }}
                      >
                        <Cable className="h-4.5 w-4.5" style={{ color: colorInfo?.hex ?? "oklch(0.65 0.18 210)" }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-foreground truncate">{fiber.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {FIBER_TYPES.find((t) => t.value === fiber.type)?.label ?? fiber.type}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs border ${getStatusClass(fiber.status)}`}>
                      {getStatusLabel(fiber.status)}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {colorInfo && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-3 w-3 rounded-full border shrink-0" style={{ backgroundColor: colorInfo.hex, borderColor: `${colorInfo.hex}80` }} />
                        <span>{colorInfo.label}</span>
                        {fiber.tubeColor && <span className="text-muted-foreground/60">· Tubo: {fiber.tubeColor}</span>}
                      </div>
                    )}
                    {fiber.cableId && (
                      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <span className="text-primary/60">ID</span>
                        <span>{fiber.cableId}</span>
                      </div>
                    )}
                    {fiber.lengthMeters != null && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Ruler className="h-3 w-3 shrink-0" />
                        <span>{fiber.lengthMeters >= 1000 ? `${(fiber.lengthMeters / 1000).toFixed(2)} km` : `${fiber.lengthMeters} m`}</span>
                      </div>
                    )}
                    {fiber.attenuation != null && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3 shrink-0" />
                        <span>Atenuação: {fiber.attenuation} dB</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => handleEdit(fiber)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(fiber.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Fibra" : "Nova Fibra Óptica"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Fibra NOC-01 para DGO-03" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIBER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIBER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor da Fibra</Label>
              <Select value={form.color} onValueChange={(v) => setForm({ ...form, color: v })}>
                <SelectTrigger className="bg-background border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: getFiberColor(form.color)?.hex ?? "#3b82f6" }} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {FIBER_COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ID do Cabo</Label>
              <Input value={form.cableId} onChange={(e) => setForm({ ...form, cableId: e.target.value })} placeholder="Ex: CB-001" className="bg-background border-border/50 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Comprimento (metros)</Label>
              <Input type="number" value={form.lengthMeters} onChange={(e) => setForm({ ...form, lengthMeters: e.target.value })} placeholder="Ex: 150" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Atenuação (dB)</Label>
              <Input type="number" step="0.1" value={form.attenuation} onChange={(e) => setForm({ ...form, attenuation: e.target.value })} placeholder="Ex: 0.35" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor do Tubo</Label>
              <Input value={form.tubeColor} onChange={(e) => setForm({ ...form, tubeColor: e.target.value })} placeholder="Ex: Vermelho" className="bg-background border-border/50" />
            </div>

            {/* Origin */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Origem</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento de Origem</Label>
              <Select value={form.originEquipmentId || "none"} onValueChange={(v) => setForm({ ...form, originEquipmentId: v === "none" ? "" : v, originPortId: "" })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(equipments ?? []).map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Porta de Origem</Label>
              <Select value={form.originPortId || "none"} onValueChange={(v) => setForm({ ...form, originPortId: v === "none" ? "" : v })} disabled={!form.originEquipmentId}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar porta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(selectedOriginPorts.data ?? []).map((p) => <SelectItem key={p.id} value={p.id.toString()}>Porta {p.portNumber}{p.label ? ` - ${p.label}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Destination */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Destino</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Equipamento de Destino</Label>
              <Select value={form.destinationEquipmentId || "none"} onValueChange={(v) => setForm({ ...form, destinationEquipmentId: v === "none" ? "" : v, destinationPortId: "" })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(equipments ?? []).map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Porta de Destino</Label>
              <Select value={form.destinationPortId || "none"} onValueChange={(v) => setForm({ ...form, destinationPortId: v === "none" ? "" : v })} disabled={!form.destinationEquipmentId}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar porta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {(selectedDestPorts.data ?? []).map((p) => <SelectItem key={p.id} value={p.id.toString()}>Porta {p.portNumber}{p.label ? ` - ${p.label}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas adicionais..." className="bg-background border-border/50 resize-none" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isSubmitting}>
              {isSubmitting ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover esta fibra?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
