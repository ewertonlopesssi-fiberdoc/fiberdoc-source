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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CircuitBoard, Trash2, Server, ArrowLeft, Layers, Zap } from "lucide-react";
import { useLocation, useParams } from "wouter";

// ─── Port Types (grouped) ─────────────────────────────────────────────────────
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
      { value: "sfp", label: "SFP (1G)" },
      { value: "sfp_plus", label: "SFP+ (10G)" },
      { value: "qsfp", label: "QSFP+ (40G)" },
      { value: "qsfp28", label: "QSFP28 (100G)" },
      { value: "qsfp_dd", label: "QSFP-DD (400G)" },
      { value: "cfp", label: "CFP (100G)" },
      { value: "cfp2", label: "CFP2 (100G)" },
      { value: "cfp4", label: "CFP4 (100G)" },
      { value: "dag", label: "DAG / DAC" },
    ],
  },
  {
    label: "PON",
    items: [
      { value: "gpon", label: "GPON" },
      { value: "xgspon", label: "XGS-PON" },
    ],
  },
  {
    label: "Elétrico",
    items: [
      { value: "rj45", label: "RJ45" },
    ],
  },
  {
    label: "Outro",
    items: [
      { value: "other", label: "Outro" },
    ],
  },
];

// Flat list for display/lookup
const PORT_TYPES_FLAT = PORT_TYPE_GROUPS.flatMap((g) => g.items);

const PORT_SPEEDS = [
  { value: "", label: "Não especificada" },
  { value: "1g", label: "1G" },
  { value: "10g", label: "10G" },
  { value: "25g", label: "25G" },
  { value: "40g", label: "40G" },
  { value: "100g", label: "100G" },
  { value: "400g", label: "400G" },
  { value: "other", label: "Outra" },
];

const PORT_STATUSES = [
  { value: "free", label: "Livre" },
  { value: "occupied", label: "Ocupada" },
  { value: "reserved", label: "Reservada" },
  { value: "faulty", label: "Com Defeito" },
];

// Speed badge styling
const SPEED_BADGE: Record<string, string> = {
  "100g": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "400g": "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  "40g":  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "25g":  "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "10g":  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "1g":   "bg-muted/30 text-muted-foreground border-border/40",
  "other": "bg-muted/30 text-muted-foreground border-border/40",
};

function getPortTypeLabel(type: string) {
  return PORT_TYPES_FLAT.find((t) => t.value === type)?.label ?? type.toUpperCase();
}

function getStatusLabel(status: string) {
  return PORT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

type PortForm = {
  portNumber: string;
  label: string;
  type: string;
  speed: string;
  status: string;
  notes: string;
};

const defaultForm: PortForm = {
  portNumber: "",
  label: "",
  type: "lc",
  speed: "",
  status: "free",
  notes: "",
};

export default function Ports() {
  const params = useParams<{ equipmentId: string }>();
  const equipmentId = parseInt(params.equipmentId ?? "0");
  const [, setLocation] = useLocation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PortForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("24");
  const [bulkType, setBulkType] = useState("lc");
  const [bulkSpeed, setBulkSpeed] = useState("");

  const utils = trpc.useUtils();

  const { data: equipment } = trpc.equipments.byId.useQuery(
    { id: equipmentId },
    { enabled: equipmentId > 0 }
  );

  const { data: ports, isLoading } = trpc.ports.byEquipment.useQuery(
    { equipmentId },
    { enabled: equipmentId > 0 }
  );

  const createMutation = trpc.ports.create.useMutation({
    onSuccess: () => {
      toast.success("Porta criada!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const bulkMutation = trpc.ports.bulkCreate.useMutation({
    onSuccess: () => {
      toast.success(`${bulkCount} portas criadas com sucesso!`);
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setBulkOpen(false);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.ports.update.useMutation({
    onSuccess: () => {
      toast.success("Porta atualizada!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.ports.delete.useMutation({
    onSuccess: () => {
      toast.success("Porta removida!");
      utils.ports.byEquipment.invalidate({ equipmentId });
      utils.dashboard.stats.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function handleEdit(port: NonNullable<typeof ports>[0]) {
    setEditId(port.id);
    setForm({
      portNumber: port.portNumber,
      label: port.label ?? "",
      type: port.type,
      speed: (port as any).speed ?? "",
      status: port.status,
      notes: port.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const speedVal = form.speed || undefined;
    if (editId) {
      updateMutation.mutate({
        id: editId,
        label: form.label || undefined,
        type: form.type as any,
        speed: speedVal as any,
        status: form.status as any,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        equipmentId,
        portNumber: form.portNumber,
        label: form.label || undefined,
        type: form.type as any,
        speed: speedVal as any,
        status: form.status as any,
        notes: form.notes || undefined,
      });
    }
  }

  if (equipmentId === 0) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Portas</h1>
          <p className="text-sm text-muted-foreground mt-1">Selecione um equipamento para gerenciar suas portas</p>
        </div>
        <EquipmentSelector onSelect={(id) => setLocation(`/portas/${id}`)} />
      </div>
    );
  }

  const freeCount = (ports ?? []).filter((p) => p.status === "free").length;
  const occupiedCount = (ports ?? []).filter((p) => p.status === "occupied").length;
  const reservedCount = (ports ?? []).filter((p) => p.status === "reserved").length;
  const faultyCount = (ports ?? []).filter((p) => p.status === "faulty").length;

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
            Gestão de portas · {(ports ?? []).length} portas cadastradas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2 border-border/50">
            <Layers className="h-4 w-4" />
            Criar em Lote
          </Button>
          <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Porta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Livres", count: freeCount, cls: "text-emerald-400" },
          { label: "Ocupadas", count: occupiedCount, cls: "text-blue-400" },
          { label: "Reservadas", count: reservedCount, cls: "text-amber-400" },
          { label: "Com Defeito", count: faultyCount, cls: "text-red-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${stat.cls}`}>{stat.count}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Port Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : (ports ?? []).length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <CircuitBoard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhuma porta cadastrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Crie portas individualmente ou em lote</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {(ports ?? []).map((port) => {
            const statusColors: Record<string, string> = {
              free: "border-emerald-400/30 bg-emerald-400/5 hover:bg-emerald-400/10",
              occupied: "border-blue-400/30 bg-blue-400/5 hover:bg-blue-400/10",
              reserved: "border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10",
              faulty: "border-red-400/30 bg-red-400/5 hover:bg-red-400/10",
            };
            const dotColors: Record<string, string> = {
              free: "bg-emerald-400",
              occupied: "bg-blue-400",
              reserved: "bg-amber-400",
              faulty: "bg-red-400",
            };
            const portSpeed = (port as any).speed as string | null;
            const isHighSpeed = portSpeed === "100g" || portSpeed === "400g" || portSpeed === "40g";
            return (
              <button
                key={port.id}
                className={`relative group rounded-lg border p-2 text-center transition-all cursor-pointer ${statusColors[port.status] ?? "border-border/30 bg-muted/5"} ${isHighSpeed ? "ring-1 ring-inset ring-violet-500/20" : ""}`}
                onClick={() => handleEdit(port)}
                title={`Porta ${port.portNumber}${port.label ? ` - ${port.label}` : ""} · ${getPortTypeLabel(port.type)}${portSpeed ? ` · ${portSpeed.toUpperCase()}` : ""} · ${getStatusLabel(port.status)}`}
              >
                <div className={`absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${dotColors[port.status] ?? "bg-muted"}`} />
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
          })}
        </div>
      )}

      {/* Legend */}
      {(ports ?? []).length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {[
            { color: "bg-emerald-400", label: "Livre" },
            { color: "bg-blue-400", label: "Ocupada" },
            { color: "bg-amber-400", label: "Reservada" },
            { color: "bg-red-400", label: "Com Defeito" },
          ].map((l) => (
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
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Porta" : "Nova Porta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editId && (
              <div className="space-y-1.5">
                <Label>Número da Porta *</Label>
                <Input
                  value={form.portNumber}
                  onChange={(e) => setForm({ ...form, portNumber: e.target.value })}
                  placeholder="Ex: 01, GE1/0/1, Eth1"
                  className="bg-background border-border/50 font-mono"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Etiqueta / Descrição</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: Uplink NOC, Backbone SP"
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Conector</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORT_TYPE_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{group.label}</SelectLabel>
                        {group.items.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" />
                  Velocidade
                </Label>
                <Select value={form.speed} onValueChange={(v) => setForm({ ...form, speed: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não especificada" /></SelectTrigger>
                  <SelectContent>
                    {PORT_SPEEDS.map((s) => (
                      <SelectItem key={s.value || "__none__"} value={s.value || "__none__"}>
                        {s.label}
                        {(s.value === "100g" || s.value === "400g" || s.value === "40g") && (
                          <span className="ml-2 text-xs text-violet-400">Alta velocidade</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PORT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editId && (
              <Button variant="destructive" size="sm" onClick={() => { setDeleteId(editId); setDialogOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={(!editId && !form.portNumber) || updateMutation.isPending || createMutation.isPending}
            >
              {updateMutation.isPending || createMutation.isPending ? "Salvando..." : editId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Criar Portas em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Quantidade de Portas</Label>
              <Input
                type="number"
                min="1"
                max="256"
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Conector</Label>
                <Select value={bulkType} onValueChange={setBulkType}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PORT_TYPE_GROUPS.map((group) => (
                      <SelectGroup key={group.label}>
                        <SelectLabel className="text-xs text-muted-foreground px-2 py-1">{group.label}</SelectLabel>
                        {group.items.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-violet-400" />
                  Velocidade
                </Label>
                <Select value={bulkSpeed} onValueChange={setBulkSpeed}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não especificada" /></SelectTrigger>
                  <SelectContent>
                    {PORT_SPEEDS.map((s) => (
                      <SelectItem key={s.value || "__none__"} value={s.value || "__none__"}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* High-speed info banner */}
            {(bulkSpeed === "100g" || bulkSpeed === "40g" || bulkSpeed === "400g") && (
              <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 flex items-start gap-2">
                <Zap className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                <div className="text-xs text-violet-300">
                  <span className="font-semibold">Porta de alta velocidade ({bulkSpeed.toUpperCase()}).</span>
                  {" "}Certifique-se de que o equipamento suporta transceptores {bulkType.toUpperCase()} nesta velocidade.
                </div>
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
                speed: (bulkSpeed && bulkSpeed !== "__none__") ? bulkSpeed as any : undefined,
              })}
              disabled={!bulkCount || parseInt(bulkCount) < 1 || bulkMutation.isPending}
              className={bulkSpeed === "100g" || bulkSpeed === "400g" || bulkSpeed === "40g" ? "bg-violet-600 hover:bg-violet-700" : ""}
            >
              {bulkMutation.isPending ? "Criando..." : `Criar ${bulkCount} Portas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover esta porta?</p>
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

function EquipmentSelector({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: equipments, isLoading } = trpc.equipments.list.useQuery({});

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {(equipments ?? []).map((eq) => (
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
