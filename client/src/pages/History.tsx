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
import { Plus, History as HistoryIcon, Clock, Wrench, CheckCircle, AlertCircle, Trash2, Edit, Eye, RefreshCw } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ENTITY_TYPES = [
  { value: "equipment", label: "Equipamento" },
  { value: "fiber", label: "Fibra" },
  { value: "port", label: "Porta" },
  { value: "connection", label: "Conexão" },
  { value: "room", label: "Sala" },
];

const ACTION_TYPES = [
  { value: "created", label: "Criado", icon: Plus, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  { value: "updated", label: "Atualizado", icon: Edit, color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  { value: "deleted", label: "Removido", icon: Trash2, color: "text-red-400 bg-red-400/10 border-red-400/20" },
  { value: "maintenance", label: "Manutenção", icon: Wrench, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  { value: "repaired", label: "Reparado", icon: CheckCircle, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  { value: "inspected", label: "Inspecionado", icon: Eye, color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
];

function getActionInfo(action: string) {
  return ACTION_TYPES.find((a) => a.value === action) ?? {
    value: action,
    label: action,
    icon: RefreshCw,
    color: "text-muted-foreground bg-muted/50 border-border/50",
  };
}

function getEntityLabel(type: string) {
  return ENTITY_TYPES.find((e) => e.value === type)?.label ?? type;
}

type HistoryForm = {
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  performedBy: string;
};

const defaultForm: HistoryForm = {
  entityType: "equipment",
  entityId: "",
  action: "maintenance",
  description: "",
  performedBy: "",
};

export default function History() {
  const [filterEntity, setFilterEntity] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<HistoryForm>(defaultForm);

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: history, isLoading } = trpc.history.list.useQuery({
    entityType: filterEntity !== "all" ? filterEntity : undefined,
    limit: 100,
  });

  const createMutation = trpc.history.create.useMutation({
    onSuccess: () => {
      toast.success("Registro de manutenção adicionado!");
      utils.history.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function handleSubmit() {
    createMutation.mutate({
      entityType: form.entityType as any,
      entityId: parseInt(form.entityId) || 0,
      action: form.action as any,
      description: form.description,
      performedBy: form.performedBy || undefined,
    });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Histórico de Manutenções</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro completo de alterações e manutenções da infraestrutura
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Registrar Manutenção
          </Button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-48 bg-card border-border/50">
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (history ?? []).length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <HistoryIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhum registro encontrado</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              O histórico de alterações aparecerá aqui automaticamente
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border/40" />

          <div className="space-y-3">
            {(history ?? []).map((item) => {
              const actionInfo = getActionInfo(item.action);
              const ActionIcon = actionInfo.icon;
              return (
                <div key={item.id} className="flex gap-4 relative">
                  {/* Timeline dot */}
                  <div className={`h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 z-10 ${actionInfo.color}`}>
                    <ActionIcon className="h-4 w-4" />
                  </div>

                  <Card className="flex-1 border-border/50 bg-card">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{item.description}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-xs h-5 px-1.5 border ${actionInfo.color}`}>
                              {actionInfo.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs h-5 px-1.5 border-border/50 text-muted-foreground">
                              {getEntityLabel(item.entityType)} #{item.entityId}
                            </Badge>
                            {item.performedBy && (
                              <span className="text-xs text-muted-foreground">por {item.performedBy}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                            {format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Maintenance Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Registrar Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Entidade</Label>
                <Select value={form.entityType} onValueChange={(v) => setForm({ ...form, entityType: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ID da Entidade</Label>
                <Input type="number" value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} placeholder="Ex: 1" className="bg-background border-border/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Ação</Label>
              <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descreva o que foi feito..."
                className="bg-background border-border/50 resize-none"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Realizado por</Label>
              <Input value={form.performedBy} onChange={(e) => setForm({ ...form, performedBy: e.target.value })} placeholder="Nome do técnico" className="bg-background border-border/50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.description || createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
