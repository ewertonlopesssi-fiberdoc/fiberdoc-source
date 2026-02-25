import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, GitBranch, Edit, Trash2, ArrowRight, Plug } from "lucide-react";

const CONNECTION_TYPES = [
  { value: "direct", label: "Direta" },
  { value: "spliced", label: "Emendada" },
  { value: "patch", label: "Patch Cord" },
  { value: "cross_connect", label: "Cross Connect" },
];

const CONNECTION_STATUSES = [
  { value: "active", label: "Ativa" },
  { value: "inactive", label: "Inativa" },
  { value: "testing", label: "Em Teste" },
];

function getStatusClass(status: string) {
  const map: Record<string, string> = {
    active: "status-active",
    inactive: "status-inactive",
    testing: "status-reserved",
  };
  return map[status] ?? "status-inactive";
}

function getStatusLabel(status: string) {
  return CONNECTION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

type ConnForm = {
  name: string;
  sourceEquipmentId: string;
  sourcePortId: string;
  targetEquipmentId: string;
  targetPortId: string;
  fiberId: string;
  type: string;
  status: string;
  notes: string;
};

const defaultForm: ConnForm = {
  name: "",
  sourceEquipmentId: "",
  sourcePortId: "",
  targetEquipmentId: "",
  targetPortId: "",
  fiberId: "",
  type: "direct",
  status: "active",
  notes: "",
};

export default function Connections() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ConnForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: connections, isLoading } = trpc.connections.list.useQuery();
  const { data: equipments } = trpc.equipments.list.useQuery({});
  const { data: fibers } = trpc.fibers.list.useQuery({});

  const sourcePorts = trpc.ports.byEquipment.useQuery(
    { equipmentId: parseInt(form.sourceEquipmentId) },
    { enabled: !!form.sourceEquipmentId }
  );
  const targetPorts = trpc.ports.byEquipment.useQuery(
    { equipmentId: parseInt(form.targetEquipmentId) },
    { enabled: !!form.targetEquipmentId }
  );

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => {
      toast.success("Conexão criada!");
      utils.connections.list.invalidate();
      utils.ports.byEquipment.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.connections.update.useMutation({
    onSuccess: () => {
      toast.success("Conexão atualizada!");
      utils.connections.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => {
      toast.success("Conexão removida!");
      utils.connections.list.invalidate();
      utils.ports.byEquipment.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const equipmentMap = new Map((equipments ?? []).map((e) => [e.id, e]));

  function handleSubmit() {
    if (editId) {
      updateMutation.mutate({
        id: editId,
        name: form.name || undefined,
        status: form.status as any,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        name: form.name || undefined,
        sourcePortId: parseInt(form.sourcePortId),
        targetPortId: parseInt(form.targetPortId),
        fiberId: form.fiberId ? parseInt(form.fiberId) : undefined,
        type: form.type as any,
        status: form.status as any,
        notes: form.notes || undefined,
      });
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Conexões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mapeamento de conexões entre portas e equipamentos
          </p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Conexão
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (connections ?? []).length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <GitBranch className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhuma conexão cadastrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Crie conexões entre portas de equipamentos</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(connections ?? []).map((conn) => {
            return (
              <Card key={conn.id} className="border-border/50 bg-card card-hover">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Plug className="h-4 w-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {conn.name && <p className="text-sm font-medium text-foreground mb-1">{conn.name}</p>}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground/80">
                          Porta #{conn.sourcePortId}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground/80">
                          Porta #{conn.targetPortId}
                        </span>
                        <Badge variant="outline" className="text-xs border-border/50">
                          {CONNECTION_TYPES.find((t) => t.value === conn.type)?.label ?? conn.type}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-xs border ${getStatusClass(conn.status)}`}>
                        {getStatusLabel(conn.status)}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        setEditId(conn.id);
                        setForm({ ...defaultForm, name: conn.name ?? "", status: conn.status, notes: conn.notes ?? "", type: conn.type });
                        setDialogOpen(true);
                      }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(conn.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {conn.notes && (
                    <p className="text-xs text-muted-foreground mt-2 ml-13 pl-13">{conn.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Conexão" : "Nova Conexão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome / Descrição</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Uplink NOC → DGO-01" className="bg-background border-border/50" />
            </div>

            {!editId && (
              <>
                <div className="flex items-center gap-2 my-2">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Origem</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Equipamento de Origem</Label>
                    <Select value={form.sourceEquipmentId || "none"} onValueChange={(v) => setForm({ ...form, sourceEquipmentId: v === "none" ? "" : v, sourcePortId: "" })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar</SelectItem>
                        {(equipments ?? []).map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Porta de Origem *</Label>
                    <Select value={form.sourcePortId || "none"} onValueChange={(v) => setForm({ ...form, sourcePortId: v === "none" ? "" : v })} disabled={!form.sourceEquipmentId}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar</SelectItem>
                        {(sourcePorts.data ?? []).filter((p) => p.status === "free").map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>Porta {p.portNumber}{p.label ? ` - ${p.label}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 my-2">
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Destino</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Equipamento de Destino</Label>
                    <Select value={form.targetEquipmentId || "none"} onValueChange={(v) => setForm({ ...form, targetEquipmentId: v === "none" ? "" : v, targetPortId: "" })}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar</SelectItem>
                        {(equipments ?? []).map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Porta de Destino *</Label>
                    <Select value={form.targetPortId || "none"} onValueChange={(v) => setForm({ ...form, targetPortId: v === "none" ? "" : v })} disabled={!form.targetEquipmentId}>
                      <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar</SelectItem>
                        {(targetPorts.data ?? []).filter((p) => p.status === "free").map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>Porta {p.portNumber}{p.label ? ` - ${p.label}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Fibra Associada (opcional)</Label>
                  <Select value={form.fiberId || "none"} onValueChange={(v) => setForm({ ...form, fiberId: v === "none" ? "" : v })}>
                    <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Selecionar fibra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {(fibers ?? []).map((f) => <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONNECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONNECTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={(!editId && (!form.sourcePortId || !form.targetPortId)) || isSubmitting}
            >
              {isSubmitting ? "Salvando..." : editId ? "Salvar" : "Criar Conexão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Remover esta conexão irá liberar as portas associadas.</p>
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
