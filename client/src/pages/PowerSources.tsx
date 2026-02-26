import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Zap, Plus, Pencil, Trash2, Wifi, WifiOff, RefreshCw,
  Thermometer, Activity, Battery, Gauge, AlertTriangle, CheckCircle,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
const PS_TYPES = [
  { value: "rectifier", label: "Retificadora" },
  { value: "inverter", label: "Inversora" },
  { value: "ups", label: "No-Break (UPS)" },
  { value: "grid", label: "Rede Elétrica" },
  { value: "generator", label: "Gerador" },
  { value: "other", label: "Outro" },
];

const PS_TYPE_COLORS: Record<string, string> = {
  rectifier: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  inverter: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ups: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  grid: "bg-green-500/20 text-green-400 border-green-500/30",
  generator: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  other: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

// OIDs padrão Huawei ETP48100-B1
const HUAWEI_OIDS = {
  oidOutputVoltage: "1.3.6.1.4.1.2011.6.199.1.2.1.1.0",
  oidOutputCurrent: "1.3.6.1.4.1.2011.6.199.1.2.2.1.0",
  oidTemperature: "1.3.6.1.4.1.2011.6.199.1.3.1.1.0",
  oidAlarmStatus: "1.3.6.1.4.1.2011.6.199.1.1.1.1.0",
  oidBatteryLevel: "1.3.6.1.4.1.2011.6.199.1.4.1.1.0",
  oidLoadPercent: "1.3.6.1.4.1.2011.6.199.1.2.3.1.0",
};

// OIDs padrão JFA Inversora Senoidal 3000W 48E220S (220V)
// Manual: 48E220S RV01/RV02 | IP padrão: 192.168.1.130 | Community: public
// OIDs baseados na MIB privada JFA (Inversor_Snmp.mib - baixar da interface web do equipamento)
const JFA_INVERSOR_OIDS = {
  oidOutputVoltage: "1.3.6.1.4.1.37999.1.1.1.0",   // Tensão de saída AC (VAC)
  oidOutputCurrent: "1.3.6.1.4.1.37999.1.1.3.0",   // Corrente de entrada DC (A)
  oidTemperature:   "1.3.6.1.4.1.37999.1.1.5.0",   // Temperatura interna (°C)
  oidAlarmStatus:   "1.3.6.1.4.1.37999.1.1.6.0",   // Status do dispositivo (1=LIGADA)
  oidBatteryLevel:  "1.3.6.1.4.1.37999.1.1.4.0",   // Tensão banco de baterias (VDC)
  oidLoadPercent:   "1.3.6.1.4.1.37999.1.1.2.0",   // Potência de saída (W)
};

// OIDs padrão JFA Fonte Retificadora Gerenciável 48V
// Manual: Fonte Retificadora Nobreak JFA | IP padrão: 192.168.1.120 | Community: public
// OIDs baseados na MIB privada JFA (fonteg.mib - baixar da interface web do equipamento)
const JFA_RETIFICADORA_OIDS = {
  oidOutputVoltage: "1.3.6.1.4.1.37999.2.1.1.0",   // Tensão de saída DC (V)
  oidOutputCurrent: "1.3.6.1.4.1.37999.2.1.2.0",   // Corrente de saída (A)
  oidTemperature:   "1.3.6.1.4.1.37999.2.1.5.0",   // Temperatura interna (°C)
  oidAlarmStatus:   "1.3.6.1.4.1.37999.2.1.6.0",   // Status do sistema
  oidBatteryLevel:  "1.3.6.1.4.1.37999.2.1.4.0",   // Tensão da bateria (V)
  oidLoadPercent:   "1.3.6.1.4.1.37999.2.1.3.0",   // Tensão de rede AC (V)
};

const EMPTY_FORM = {
  name: "",
  type: "rectifier" as const,
  manufacturer: "",
  model: "",
  roomId: null as number | null,
  location: "",
  outputVoltage: "" as string,
  outputCurrentMax: "" as string,
  notes: "",
  snmpEnabled: false,
  snmpHost: "",
  snmpPort: "161",
  snmpVersion: "v2c" as "v1" | "v2c" | "v3",
  snmpCommunity: "public",
  snmpV3User: "",
  snmpV3AuthProto: "SHA" as "MD5" | "SHA",
  snmpV3AuthKey: "",
  snmpV3PrivProto: "AES" as "DES" | "AES",
  snmpV3PrivKey: "",
  oidOutputVoltage: "",
  oidOutputCurrent: "",
  oidTemperature: "",
  oidAlarmStatus: "",
  oidBatteryLevel: "",
  oidLoadPercent: "",
  snmpPollInterval: "300",
};

type FormState = typeof EMPTY_FORM;

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PowerSources() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: sources = [], refetch } = trpc.powerSources.list.useQuery();
  const { data: rooms = [] } = trpc.rooms.list.useQuery();

  const createMut = trpc.powerSources.create.useMutation({
    onSuccess: () => { refetch(); toast.success("Fonte criada com sucesso!"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.powerSources.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Fonte atualizada!"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.powerSources.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Fonte removida."); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });
  const pollMut = trpc.powerSources.pollNow.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data.success) toast.success("Coleta SNMP realizada com sucesso!");
      else toast.error(`Erro SNMP: ${(data as any).error ?? "Falha na coleta"}`);
    },
    onError: (e) => toast.error(`Erro SNMP: ${e.message}`),
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pollingId, setPollingId] = useState<number | null>(null);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(ps: any) {
    setEditId(ps.id);
    setForm({
      name: ps.name ?? "",
      type: ps.type ?? "rectifier",
      manufacturer: ps.manufacturer ?? "",
      model: ps.model ?? "",
      roomId: ps.roomId ?? null,
      location: ps.location ?? "",
      outputVoltage: ps.outputVoltage != null ? String(ps.outputVoltage) : "",
      outputCurrentMax: ps.outputCurrentMax != null ? String(ps.outputCurrentMax) : "",
      notes: ps.notes ?? "",
      snmpEnabled: ps.snmpEnabled ?? false,
      snmpHost: ps.snmpHost ?? "",
      snmpPort: String(ps.snmpPort ?? 161),
      snmpVersion: ps.snmpVersion ?? "v2c",
      snmpCommunity: ps.snmpCommunity ?? "public",
      snmpV3User: ps.snmpV3User ?? "",
      snmpV3AuthProto: ps.snmpV3AuthProto ?? "SHA",
      snmpV3AuthKey: ps.snmpV3AuthKey ?? "",
      snmpV3PrivProto: ps.snmpV3PrivProto ?? "AES",
      snmpV3PrivKey: ps.snmpV3PrivKey ?? "",
      oidOutputVoltage: ps.oidOutputVoltage ?? "",
      oidOutputCurrent: ps.oidOutputCurrent ?? "",
      oidTemperature: ps.oidTemperature ?? "",
      oidAlarmStatus: ps.oidAlarmStatus ?? "",
      oidBatteryLevel: ps.oidBatteryLevel ?? "",
      oidLoadPercent: ps.oidLoadPercent ?? "",
      snmpPollInterval: String(ps.snmpPollInterval ?? 300),
    });
    setShowForm(true);
  }

  function applyHuaweiOids() {
    setForm((f) => ({ ...f, ...HUAWEI_OIDS }));
    toast.info("OIDs Huawei ETP48100-B1 preenchidos");
  }

  function applyJfaInversorOids() {
    setForm((f) => ({ ...f, ...JFA_INVERSOR_OIDS }));
    toast.info("OIDs JFA Inversora 48E220S preenchidos");
  }

  function applyJfaRetificadoraOids() {
    setForm((f) => ({ ...f, ...JFA_RETIFICADORA_OIDS }));
    toast.info("OIDs JFA Retificadora 48V preenchidos");
  }

  function handleSave() {
    const payload: any = {
      name: form.name.trim(),
      type: form.type,
      manufacturer: form.manufacturer || undefined,
      model: form.model || undefined,
      roomId: form.roomId ?? undefined,
      location: form.location || undefined,
      outputVoltage: form.outputVoltage ? parseFloat(form.outputVoltage) : undefined,
      outputCurrentMax: form.outputCurrentMax ? parseFloat(form.outputCurrentMax) : undefined,
      notes: form.notes || undefined,
      snmpEnabled: form.snmpEnabled,
      snmpHost: form.snmpHost || undefined,
      snmpPort: parseInt(form.snmpPort) || 161,
      snmpVersion: form.snmpVersion,
      snmpCommunity: form.snmpCommunity || undefined,
      snmpV3User: form.snmpV3User || undefined,
      snmpV3AuthProto: form.snmpV3AuthProto || undefined,
      snmpV3AuthKey: form.snmpV3AuthKey || undefined,
      snmpV3PrivProto: form.snmpV3PrivProto || undefined,
      snmpV3PrivKey: form.snmpV3PrivKey || undefined,
      oidOutputVoltage: form.oidOutputVoltage || undefined,
      oidOutputCurrent: form.oidOutputCurrent || undefined,
      oidTemperature: form.oidTemperature || undefined,
      oidAlarmStatus: form.oidAlarmStatus || undefined,
      oidBatteryLevel: form.oidBatteryLevel || undefined,
      oidLoadPercent: form.oidLoadPercent || undefined,
      snmpPollInterval: parseInt(form.snmpPollInterval) || 300,
    };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  }

  const isBusy = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-400" />
            Fontes de Energia
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre retificadoras, no-breaks e inversoras. Configure coleta SNMP para monitoramento em tempo real.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
            <Plus className="h-4 w-4" /> Nova Fonte
          </Button>
        )}
      </div>

      {/* Cards */}
      {sources.length === 0 ? (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">Nenhuma fonte cadastrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Cadastre retificadoras, no-breaks e inversoras para vincular aos equipamentos.
            </p>
            {isAdmin && (
              <Button onClick={openCreate} className="mt-4 gap-2" variant="outline">
                <Plus className="h-4 w-4" /> Cadastrar primeira fonte
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sources.map((ps: any) => (
            <Card key={ps.id} className="bg-card border-border/50 hover:border-yellow-500/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold text-foreground truncate">{ps.name}</CardTitle>
                    {(ps.manufacturer || ps.model) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[ps.manufacturer, ps.model].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${PS_TYPE_COLORS[ps.type] ?? PS_TYPE_COLORS.other}`}>
                      {PS_TYPES.find((t) => t.value === ps.type)?.label ?? ps.type}
                    </Badge>
                    {ps.snmpEnabled ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                        <Wifi className="h-2.5 w-2.5 mr-0.5" /> SNMP
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Localização */}
                {(ps.location || ps.roomId) && (
                  <p className="text-xs text-muted-foreground">
                    📍 {ps.location ?? (rooms as any[]).find((r) => r.id === ps.roomId)?.name ?? ""}
                  </p>
                )}
                {/* Specs */}
                {(ps.outputVoltage != null || ps.outputCurrentMax != null) && (
                  <div className="flex gap-3 text-xs">
                    {ps.outputVoltage != null && (
                      <span className="text-muted-foreground">
                        <span className="text-foreground font-medium">{ps.outputVoltage}V</span> saída
                      </span>
                    )}
                    {ps.outputCurrentMax != null && (
                      <span className="text-muted-foreground">
                        <span className="text-foreground font-medium">{ps.outputCurrentMax}A</span> máx.
                      </span>
                    )}
                  </div>
                )}
                {/* Dados SNMP coletados */}
                {ps.snmpEnabled && ps.lastPollAt && (
                  <div className="bg-muted/30 rounded-lg p-2.5 border border-border/30 space-y-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                        Última coleta: {new Date(ps.lastPollAt).toLocaleString("pt-BR")}
                      </span>
                      {ps.lastPollError ? (
                        <AlertTriangle className="h-3 w-3 text-red-400" />
                      ) : (
                        <CheckCircle className="h-3 w-3 text-green-400" />
                      )}
                    </div>
                    {ps.lastPollError ? (
                      <p className="text-[11px] text-red-400">{ps.lastPollError}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1">
                        {ps.lastVoltage != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Activity className="h-3 w-3 text-blue-400" />
                            <span className="text-muted-foreground">Tensão:</span>
                            <span className="text-foreground font-medium">{ps.lastVoltage}V</span>
                          </div>
                        )}
                        {ps.lastCurrent != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Zap className="h-3 w-3 text-yellow-400" />
                            <span className="text-muted-foreground">Corrente:</span>
                            <span className="text-foreground font-medium">{ps.lastCurrent}A</span>
                          </div>
                        )}
                        {ps.lastTemperature != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Thermometer className="h-3 w-3 text-orange-400" />
                            <span className="text-muted-foreground">Temp:</span>
                            <span className="text-foreground font-medium">{ps.lastTemperature}°C</span>
                          </div>
                        )}
                        {ps.lastBatteryLevel != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Battery className="h-3 w-3 text-green-400" />
                            <span className="text-muted-foreground">Bateria:</span>
                            <span className="text-foreground font-medium">{ps.lastBatteryLevel}%</span>
                          </div>
                        )}
                        {ps.lastLoadPercent != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <Gauge className="h-3 w-3 text-purple-400" />
                            <span className="text-muted-foreground">Carga:</span>
                            <span className="text-foreground font-medium">{ps.lastLoadPercent}%</span>
                          </div>
                        )}
                        {ps.lastAlarmStatus != null && (
                          <div className="flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                            <span className="text-muted-foreground">Alarme:</span>
                            <span className="text-foreground font-medium">{ps.lastAlarmStatus}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {ps.snmpEnabled && !ps.lastPollAt && (
                  <p className="text-xs text-muted-foreground italic">Aguardando primeira coleta SNMP...</p>
                )}
                {/* Ações */}
                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    {ps.snmpEnabled && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs gap-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 flex-1"
                        disabled={pollingId === ps.id || pollMut.isPending}
                        onClick={() => {
                          setPollingId(ps.id);
                          pollMut.mutate({ id: ps.id }, { onSettled: () => setPollingId(null) });
                        }}
                      >
                        <RefreshCw className={`h-3 w-3 ${pollingId === ps.id ? "animate-spin" : ""}`} />
                        {pollingId === ps.id ? "Coletando..." : "Coletar agora"}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-border/50 hover:bg-muted/50"
                      onClick={() => openEdit(ps)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => setDeleteId(ps.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de criação/edição */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              {editId ? "Editar Fonte de Energia" : "Nova Fonte de Energia"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="geral" className="mt-2">
            <TabsList className="bg-muted/50 w-full">
              <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
              <TabsTrigger value="snmp" className="flex-1 gap-1">
                {form.snmpEnabled ? <Wifi className="h-3.5 w-3.5 text-cyan-400" /> : <WifiOff className="h-3.5 w-3.5" />}
                SNMP
              </TabsTrigger>
            </TabsList>

            {/* Aba Geral */}
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Nome da Fonte <span className="text-red-400">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Retificadora R1 - Huawei ETP48100" className="bg-background border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                    <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PS_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sala / Localização</Label>
                  <Select value={form.roomId ? String(form.roomId) : "__none__"}
                    onValueChange={(v) => setForm({ ...form, roomId: v === "__none__" ? null : parseInt(v) })}>
                    <SelectTrigger className="bg-background border-border/50"><SelectValue placeholder="Não informada" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não informada</SelectItem>
                      {(rooms as any[]).map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fabricante</Label>
                  <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder="Ex: Huawei, APC, Powerware" className="bg-background border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Modelo</Label>
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="Ex: ETP48100-B1, Smart-UPS 3000" className="bg-background border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Localização física</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Ex: Rack A1, Prateleira 3" className="bg-background border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tensão de saída (V)</Label>
                  <Input type="number" step="0.1" value={form.outputVoltage}
                    onChange={(e) => setForm({ ...form, outputVoltage: e.target.value })}
                    placeholder="Ex: 48" className="bg-background border-border/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Corrente máxima (A)</Label>
                  <Input type="number" step="0.1" value={form.outputCurrentMax}
                    onChange={(e) => setForm({ ...form, outputCurrentMax: e.target.value })}
                    placeholder="Ex: 100" className="bg-background border-border/50" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Informações adicionais sobre esta fonte..." rows={2}
                    className="bg-background border-border/50 resize-none" />
                </div>
              </div>
            </TabsContent>

            {/* Aba SNMP */}
            <TabsContent value="snmp" className="space-y-4 mt-4">
              {/* Toggle SNMP */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Habilitar coleta SNMP</p>
                  <p className="text-xs text-muted-foreground">Coleta automática de tensão, corrente, temperatura e alarmes</p>
                </div>
                <Switch checked={form.snmpEnabled} onCheckedChange={(v) => setForm({ ...form, snmpEnabled: v })} />
              </div>

              {form.snmpEnabled && (
                <div className="space-y-4">
                  {/* Conexão */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label>IP / Hostname de gerência</Label>
                      <Input value={form.snmpHost} onChange={(e) => setForm({ ...form, snmpHost: e.target.value })}
                        placeholder="192.168.1.100" className="bg-background border-border/50 font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Porta UDP</Label>
                      <Input type="number" value={form.snmpPort}
                        onChange={(e) => setForm({ ...form, snmpPort: e.target.value })}
                        placeholder="161" className="bg-background border-border/50 font-mono text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Versão SNMP</Label>
                      <Select value={form.snmpVersion} onValueChange={(v) => setForm({ ...form, snmpVersion: v as any })}>
                        <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="v1">SNMPv1</SelectItem>
                          <SelectItem value="v2c">SNMPv2c (recomendado)</SelectItem>
                          <SelectItem value="v3">SNMPv3 (mais seguro)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Intervalo de coleta (segundos)</Label>
                      <Input type="number" value={form.snmpPollInterval}
                        onChange={(e) => setForm({ ...form, snmpPollInterval: e.target.value })}
                        placeholder="300" className="bg-background border-border/50 font-mono text-xs" />
                    </div>
                  </div>

                  {/* v1/v2c */}
                  {(form.snmpVersion === "v1" || form.snmpVersion === "v2c") && (
                    <div className="space-y-1.5">
                      <Label>Community String</Label>
                      <Input value={form.snmpCommunity} onChange={(e) => setForm({ ...form, snmpCommunity: e.target.value })}
                        placeholder="public" className="bg-background border-border/50 font-mono text-xs" />
                    </div>
                  )}

                  {/* v3 */}
                  {form.snmpVersion === "v3" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1.5">
                        <Label>Usuário SNMPv3</Label>
                        <Input value={form.snmpV3User} onChange={(e) => setForm({ ...form, snmpV3User: e.target.value })}
                          placeholder="admin" className="bg-background border-border/50 font-mono text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Protocolo Auth</Label>
                        <Select value={form.snmpV3AuthProto} onValueChange={(v) => setForm({ ...form, snmpV3AuthProto: v as any })}>
                          <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SHA">SHA</SelectItem>
                            <SelectItem value="MD5">MD5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Chave Auth</Label>
                        <Input type="password" value={form.snmpV3AuthKey}
                          onChange={(e) => setForm({ ...form, snmpV3AuthKey: e.target.value })}
                          placeholder="Senha de autenticação" className="bg-background border-border/50 font-mono text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Protocolo Priv</Label>
                        <Select value={form.snmpV3PrivProto} onValueChange={(v) => setForm({ ...form, snmpV3PrivProto: v as any })}>
                          <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AES">AES</SelectItem>
                            <SelectItem value="DES">DES</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Chave Priv</Label>
                        <Input type="password" value={form.snmpV3PrivKey}
                          onChange={(e) => setForm({ ...form, snmpV3PrivKey: e.target.value })}
                          placeholder="Senha de privacidade" className="bg-background border-border/50 font-mono text-xs" />
                      </div>
                    </div>
                  )}

                  {/* OIDs */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">OIDs para coleta</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline"
                          className="h-7 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                          onClick={applyHuaweiOids}>
                          Huawei ETP48100
                        </Button>
                        <Button type="button" size="sm" variant="outline"
                          className="h-7 text-xs gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                          onClick={applyJfaInversorOids}>
                          JFA Inversora 48E220S
                        </Button>
                        <Button type="button" size="sm" variant="outline"
                          className="h-7 text-xs gap-1 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                          onClick={applyJfaRetificadoraOids}>
                          JFA Retificadora 48V
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco os OIDs que não deseja coletar. Use os botões acima para preencher automaticamente conforme o modelo do equipamento.
                      Os OIDs JFA são baseados na MIB privada do equipamento — confirme com <code className="font-mono">snmpwalk</code> se necessário.
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { key: "oidOutputVoltage", label: "Tensão de saída (V)" },
                        { key: "oidOutputCurrent", label: "Corrente de saída (A)" },
                        { key: "oidTemperature", label: "Temperatura (°C)" },
                        { key: "oidAlarmStatus", label: "Status de alarme" },
                        { key: "oidBatteryLevel", label: "Nível de bateria (%)" },
                        { key: "oidLoadPercent", label: "Carga (%)" },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-2">
                          <Label className="w-40 text-xs text-muted-foreground flex-shrink-0">{label}</Label>
                          <Input
                            value={(form as any)[key]}
                            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                            placeholder="1.3.6.1.4.1.xxx"
                            className="bg-background border-border/50 font-mono text-xs h-7"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isBusy || !form.name.trim()}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold">
              {isBusy ? "Salvando..." : editId ? "Salvar alterações" : "Criar fonte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fonte de energia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação desvincula a fonte de todos os equipamentos associados. Os dados de coleta SNMP serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
