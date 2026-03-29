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
import { Plus, History as HistoryIcon, Clock, Wrench, CheckCircle, AlertCircle, Trash2, Edit, Eye, RefreshCw, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ENTITY_TYPES = [
  { value: "equipment", label: "Equipamento" },
  { value: "fiber", label: "Fibra" },
  { value: "port", label: "Porta" },
  { value: "connection", label: "Conexão" },
  { value: "room", label: "Sala" },
  { value: "ceo", label: "CEO" },
  { value: "cto", label: "CTO" },
  { value: "cable", label: "Cabo/Rota" },
];

const ACTION_TYPES = [
  { value: "created", label: "Criado", icon: Plus, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  { value: "updated", label: "Atualizado", icon: Edit, color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  { value: "deleted", label: "Removido", icon: Trash2, color: "text-red-400 bg-red-400/10 border-red-400/20" },
  { value: "maintenance", label: "Manutenção", icon: Wrench, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  { value: "repaired", label: "Reparado", icon: CheckCircle, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  { value: "inspected", label: "Inspecionado", icon: Eye, color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
];

// Mapeamento de nomes de campos para labels legíveis
const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  location: "Localização",
  address: "Endereço",
  roomId: "Sala (ID)",
  notes: "Notas",
  status: "Status",
  capacity: "Capacidade",
  usedPorts: "Portas usadas",
  lat: "Latitude",
  lng: "Longitude",
  type: "Tipo",
  model: "Modelo",
  manufacturer: "Fabricante",
  serialNumber: "Número de série",
  rack: "Rack",
  rackPosition: "Posição no rack",
  rackUnits: "Unidades de rack",
  ipAddress: "Endereço IP",
  macAddress: "Endereço MAC",
  totalPorts: "Total de portas",
  powerType: "Tipo de energia",
  powerSource: "Fonte de energia",
  voltage: "Tensão",
  powerConsumptionW: "Consumo (W)",
  txPowerDbm: "Potência TX (dBm)",
  vlan: "VLAN",
  interfaceIp: "IP da interface",
  serviceDescription: "Descrição do serviço",
  sshUser: "Usuário SSH",
  sshPort: "Porta SSH",
  description: "Descrição",
  floor: "Andar",
  city: "Cidade",
  state: "Estado",
  fiberCount: "Qtd. fibras",
  cableType: "Tipo de cabo",
  color: "Cor",
  fromElementId: "Elemento origem (ID)",
  toElementId: "Elemento destino (ID)",
};

// Campos a ignorar no diff (IDs internos, timestamps, etc.)
const IGNORE_FIELDS = new Set(["id", "createdAt", "updatedAt", "imageUrl", "sshPasswordEnc", "path"]);

function formatFieldValue(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (val instanceof Date) return format(val, "dd/MM/yyyy HH:mm", { locale: ptBR });
  return String(val);
}

function computeDiff(before: Record<string, any>, after: Record<string, any>) {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: { field: string; label: string; before: string; after: string }[] = [];
  for (const key of allKeys) {
    if (IGNORE_FIELDS.has(key)) continue;
    const bv = before[key];
    const av = after[key];
    // Comparar como string para evitar diferenças de tipo
    if (String(bv ?? "") !== String(av ?? "")) {
      changes.push({
        field: key,
        label: FIELD_LABELS[key] ?? key,
        before: formatFieldValue(bv),
        after: formatFieldValue(av),
      });
    }
  }
  return changes;
}

function HistoryDiffView({ previousState, newState, action, description, entityType, entityId, performedBy }: {
  previousState?: string | null;
  newState?: string | null;
  action: string;
  description?: string;
  entityType?: string;
  entityId?: number;
  performedBy?: string | null;
}) {
  let before: Record<string, any> | null = null;
  let after: Record<string, any> | null = null;

  try { if (previousState) before = JSON.parse(previousState); } catch {}
  try { if (newState) after = JSON.parse(newState); } catch {}

  if (!before && !after) {
    // Registro antigo sem snapshot — exibir informações básicas disponíveis
    return (
      <div className="space-y-2">
        <p className="text-xs text-amber-400/80 italic mb-2">Este registro foi criado antes da versão 5.96.16 e não possui snapshot de dados detalhado.</p>
        <div className="rounded-lg border border-border overflow-hidden">
          {description && (
            <div className="flex items-start gap-2 px-3 py-2 text-xs border-b border-border last:border-0">
              <span className="text-muted-foreground w-28 shrink-0">Descrição</span>
              <span className="text-foreground">{description}</span>
            </div>
          )}
          {entityType && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border last:border-0">
              <span className="text-muted-foreground w-28 shrink-0">Entidade</span>
              <span className="text-foreground">{getEntityLabel(entityType)} #{entityId}</span>
            </div>
          )}
          {performedBy && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border last:border-0">
              <span className="text-muted-foreground w-28 shrink-0">Realizado por</span>
              <span className="text-foreground">{performedBy}</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="text-muted-foreground w-28 shrink-0">Ação</span>
            <span className="text-foreground">{getActionInfo(action).label}</span>
          </div>
        </div>
      </div>
    );
  }

  if (action === "created" && after) {
    const fields = Object.entries(after).filter(([k]) => !IGNORE_FIELDS.has(k) && after![k] != null && after![k] !== "");
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-emerald-400 mb-2">Dados do registro criado:</p>
        <div className="rounded-lg border border-border overflow-hidden">
          {fields.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0">
              <span className="text-muted-foreground w-36 shrink-0">{FIELD_LABELS[key] ?? key}</span>
              <span className="text-emerald-400 font-medium">{formatFieldValue(val)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (action === "deleted" && before) {
    const fields = Object.entries(before).filter(([k]) => !IGNORE_FIELDS.has(k) && before![k] != null && before![k] !== "");
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-red-400 mb-2">Dados do registro removido:</p>
        <div className="rounded-lg border border-border overflow-hidden">
          {fields.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0">
              <span className="text-muted-foreground w-36 shrink-0">{FIELD_LABELS[key] ?? key}</span>
              <span className="text-red-400 font-medium line-through">{formatFieldValue(val)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (action === "updated" && before && after) {
    const changes = computeDiff(before, after);
    if (changes.length === 0) {
      return <p className="text-xs text-muted-foreground italic">Nenhuma alteração de campo detectada (pode ser uma atualização de traçado ou dados internos).</p>;
    }
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-blue-400 mb-2">{changes.length} campo{changes.length !== 1 ? "s" : ""} alterado{changes.length !== 1 ? "s" : ""}:</p>
        <div className="rounded-lg border border-border overflow-hidden">
          {changes.map((c) => (
            <div key={c.field} className="px-3 py-2 text-xs border-b border-border last:border-0">
              <div className="text-muted-foreground font-medium mb-1">{c.label}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-red-500/10 border border-red-500/20 text-red-400 rounded px-2 py-0.5 font-mono">{c.before}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded px-2 py-0.5 font-mono">{c.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground italic">Detalhes não disponíveis para este tipo de ação.</p>;
}

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
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

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

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  // Mostrar "Ver detalhes" em todos os registros
  function hasDetails(_item: any) {
    return true;
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
              const expanded = expandedIds.has(item.id);
              const hasDiff = hasDetails(item);
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
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground/50">
                            {format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                          {hasDiff && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 mt-0.5"
                            >
                              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detalhes expandidos */}
                      {expanded && hasDiff && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <HistoryDiffView
                            previousState={item.previousState}
                            newState={item.newState}
                            action={item.action}
                            description={item.description}
                            entityType={item.entityType}
                            entityId={item.entityId}
                            performedBy={item.performedBy}
                          />
                        </div>
                      )}
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
