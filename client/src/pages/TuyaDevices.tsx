import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Cpu, Plus, Pencil, Trash2, RefreshCw, Thermometer, Droplets,
  Wind, Zap, Wifi, WifiOff, HelpCircle, Bell, ExternalLink, ChevronRight
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Tipos ────────────────────────────────────────────────────────────────────

const DEVICE_TYPES = [
  { value: "temperature_humidity", label: "Temperatura e Umidade" },
  { value: "temperature", label: "Temperatura" },
  { value: "humidity", label: "Umidade" },
  { value: "co2", label: "CO₂ / Qualidade do Ar" },
  { value: "smoke", label: "Fumaça" },
  { value: "motion", label: "Presença / Movimento" },
  { value: "door", label: "Porta / Janela" },
  { value: "power_meter", label: "Medidor de Energia" },
  { value: "other", label: "Outro" },
];

const REGIONS = [
  { value: "us", label: "América (us)" },
  { value: "eu", label: "Europa (eu)" },
  { value: "cn", label: "China (cn)" },
  { value: "in", label: "Índia (in)" },
];

type DeviceForm = {
  name: string;
  deviceId: string;
  type: string;
  tuyaAccountId: string;
  roomId: string;
  notes: string;
  pollInterval: string;
  alertsEnabled: boolean;
  alertTempMax: string;
  alertTempMin: string;
  alertHumidityMax: string;
  alertHumidityMin: string;
  alertCo2Max: string;
  alertPowerMax: string;
};

const EMPTY_FORM: DeviceForm = {
  name: "",
  deviceId: "",
  type: "temperature_humidity",
  tuyaAccountId: "",
  roomId: "",
  notes: "",
  pollInterval: "300",
  alertsEnabled: false,
  alertTempMax: "",
  alertTempMin: "",
  alertHumidityMax: "",
  alertHumidityMin: "",
  alertCo2Max: "",
  alertPowerMax: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "online") return <Badge className="bg-green-600 text-white">Online</Badge>;
  if (status === "offline") return <Badge variant="destructive">Offline</Badge>;
  return <Badge variant="secondary">Desconhecido</Badge>;
}

function statusIcon(status: string) {
  if (status === "online") return <Wifi className="w-4 h-4 text-green-500" />;
  if (status === "offline") return <WifiOff className="w-4 h-4 text-red-500" />;
  return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
}

function deviceTypeLabel(type: string) {
  return DEVICE_TYPES.find((t) => t.value === type)?.label ?? type;
}

function formatValue(val: number | null | undefined, unit: string) {
  if (val == null) return "—";
  return `${val.toFixed(1)} ${unit}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TuyaDevices() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: devices = [], refetch } = trpc.tuyaDevices.list.useQuery();
  const { data: accounts = [] } = trpc.tuyaAccounts.list.useQuery();
  const { data: rooms = [] } = trpc.rooms.list.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM);
  const [tab, setTab] = useState("geral");
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [historyDeviceId, setHistoryDeviceId] = useState<number | null>(null);
  const [historyHours, setHistoryHours] = useState(24);
  const { data: readings = [] } = trpc.tuyaDevices.readings.useQuery(
    { id: historyDeviceId!, hours: historyHours },
    { enabled: historyDeviceId !== null, refetchInterval: 60_000 }
  );
  const historyDevice = useMemo(() => devices.find((d) => d.id === historyDeviceId), [devices, historyDeviceId]);
  const chartData = useMemo(() => readings.map((r) => ({
    time: new Date(r.collectedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    temp: r.temperature !== null ? Number(r.temperature) : undefined,
    hum: r.humidity !== null ? Number(r.humidity) : undefined,
    co2: r.co2 !== null ? Number(r.co2) : undefined,
    power: r.power !== null ? Number(r.power) : undefined,
  })), [readings]);

  const utils = trpc.useUtils();

  const createMut = trpc.tuyaDevices.create.useMutation({
    onSuccess: () => { utils.tuyaDevices.list.invalidate(); setOpen(false); toast.success("Dispositivo cadastrado!"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.tuyaDevices.update.useMutation({
    onSuccess: () => { utils.tuyaDevices.list.invalidate(); setOpen(false); toast.success("Dispositivo atualizado!"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.tuyaDevices.delete.useMutation({
    onSuccess: () => { utils.tuyaDevices.list.invalidate(); toast.success("Dispositivo removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const pollMut = trpc.tuyaDevices.pollNow.useMutation({
    onSuccess: () => { utils.tuyaDevices.list.invalidate(); setPollingId(null); toast.success("Coleta realizada!"); },
    onError: (e) => { setPollingId(null); toast.error(e.message); },
  });

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setTab("geral");
    setOpen(true);
  }

  function openEdit(d: typeof devices[0]) {
    setEditId(d.id);
    setForm({
      name: d.name,
      deviceId: d.deviceId,
      type: d.type,
      tuyaAccountId: d.tuyaAccountId ? String(d.tuyaAccountId) : "",
      roomId: d.roomId ? String(d.roomId) : "",
      notes: d.notes ?? "",
      pollInterval: String(d.pollInterval),
      alertsEnabled: d.alertsEnabled,
      alertTempMax: d.alertTempMax != null ? String(d.alertTempMax) : "",
      alertTempMin: d.alertTempMin != null ? String(d.alertTempMin) : "",
      alertHumidityMax: d.alertHumidityMax != null ? String(d.alertHumidityMax) : "",
      alertHumidityMin: d.alertHumidityMin != null ? String(d.alertHumidityMin) : "",
      alertCo2Max: d.alertCo2Max != null ? String(d.alertCo2Max) : "",
      alertPowerMax: d.alertPowerMax != null ? String(d.alertPowerMax) : "",
    });
    setTab("geral");
    setOpen(true);
  }

  function handleSave() {
    const payload = {
      name: form.name.trim(),
      deviceId: form.deviceId.trim(),
      type: form.type as any,
      tuyaAccountId: form.tuyaAccountId ? Number(form.tuyaAccountId) : undefined,
      roomId: form.roomId ? Number(form.roomId) : undefined,
      notes: form.notes || undefined,
      pollInterval: Number(form.pollInterval) || 300,
      alertsEnabled: form.alertsEnabled,
      alertTempMax: form.alertTempMax ? Number(form.alertTempMax) : undefined,
      alertTempMin: form.alertTempMin ? Number(form.alertTempMin) : undefined,
      alertHumidityMax: form.alertHumidityMax ? Number(form.alertHumidityMax) : undefined,
      alertHumidityMin: form.alertHumidityMin ? Number(form.alertHumidityMin) : undefined,
      alertCo2Max: form.alertCo2Max ? Number(form.alertCo2Max) : undefined,
      alertPowerMax: form.alertPowerMax ? Number(form.alertPowerMax) : undefined,
    };
    if (!payload.name || !payload.deviceId) {
      toast.error("Preencha nome e Device ID");
      return;
    }
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload as any);
  }

  function handlePollNow(id: number) {
    setPollingId(id);
    pollMut.mutate({ id });
  }

  const f = (k: keyof DeviceForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className="w-6 h-6 text-primary" />
              Sensores Tuya IoT
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Monitoramento de sensores via Tuya Cloud API
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            {isAdmin && (
              <Button onClick={openCreate} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Novo Sensor
              </Button>
            )}
          </div>
        </div>

        {/* Aviso se não há contas configuradas */}
        {accounts.length === 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="py-4 flex items-center gap-3">
              <Bell className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-500">Nenhuma conta Tuya configurada</p>
                <p className="text-xs text-muted-foreground">
                  Configure as credenciais da API Tuya em{" "}
                  <a href="/sistema" className="underline text-primary">Sistema → Contas Tuya</a>{" "}
                  para ativar o monitoramento.
                </p>
              </div>
              <a href="/sistema">
                <Button variant="outline" size="sm" className="shrink-0">
                  Configurar <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </a>
            </CardContent>
          </Card>
        )}

        {/* Grid de dispositivos */}
        {devices.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Cpu className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Nenhum sensor cadastrado</p>
              <p className="text-sm mt-1">Clique em "Novo Sensor" para adicionar um dispositivo Tuya.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((d) => {
              const account = accounts.find((a) => a.id === d.tuyaAccountId);
              return (
                <Card key={d.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {statusIcon(d.status)}
                        <CardTitle className="text-base truncate">{d.name}</CardTitle>
                      </div>
                      {statusBadge(d.status)}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">{deviceTypeLabel(d.type)}</Badge>
                      {account && (
                        <Badge variant="secondary" className="text-xs">{account.name}</Badge>
                      )}
                      {d.alertsEnabled && (
                        <Badge className="text-xs bg-orange-600 text-white">
                          <Bell className="w-3 h-3 mr-1" /> Alertas ativos
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Valores coletados */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(d.type === "temperature_humidity" || d.type === "temperature") && (
                        <div className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1.5">
                          <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                          <span className="font-medium">{formatValue(d.lastTemperature, "°C")}</span>
                        </div>
                      )}
                      {(d.type === "temperature_humidity" || d.type === "humidity") && (
                        <div className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1.5">
                          <Droplets className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-medium">{formatValue(d.lastHumidity, "%")}</span>
                        </div>
                      )}
                      {d.type === "co2" && (
                        <div className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1.5">
                          <Wind className="w-3.5 h-3.5 text-green-400" />
                          <span className="font-medium">{d.lastCo2 != null ? `${d.lastCo2} ppm` : "—"}</span>
                        </div>
                      )}
                      {d.type === "power_meter" && (
                        <div className="flex items-center gap-1.5 bg-muted/40 rounded px-2 py-1.5">
                          <Zap className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="font-medium">{formatValue(d.lastPower, "W")}</span>
                        </div>
                      )}
                    </div>

                    {/* Device ID e última coleta */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Device ID: <span className="font-mono">{d.deviceId}</span></p>
                      {d.lastPolledAt && (
                        <p>Última coleta: {new Date(d.lastPolledAt).toLocaleString("pt-BR")}</p>
                      )}
                      {d.lastPollError && (
                        <p className="text-red-400 truncate" title={d.lastPollError}>
                          ⚠ {d.lastPollError}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    {isAdmin && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handlePollNow(d.id)}
                          disabled={pollingId === d.id}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${pollingId === d.id ? "animate-spin" : ""}`} />
                          {pollingId === d.id ? "Coletando..." : "Coletar agora"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setHistoryDeviceId(d.id)} title="Ver histórico">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Remover "${d.name}"?`)) deleteMut.mutate({ id: d.id });
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de cadastro/edição */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Sensor Tuya" : "Novo Sensor Tuya"}</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
              <TabsTrigger value="alertas" className="flex-1">
                <Bell className="w-3.5 h-3.5 mr-1" /> Alertas
              </TabsTrigger>
            </TabsList>

            {/* ─── Aba Geral ─── */}
            <TabsContent value="geral" className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <Label>Nome do sensor *</Label>
                  <Input placeholder="Ex: Sensor Sala de Servidores" value={form.name} onChange={f("name")} />
                </div>
                <div className="space-y-1">
                  <Label>Device ID *</Label>
                  <Input
                    placeholder="Ex: bf1234567890abcdef"
                    value={form.deviceId}
                    onChange={f("deviceId")}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Encontre no app Smart Life → Dispositivo → Editar → ID do dispositivo
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Tipo de sensor</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Conta Tuya */}
              <div className="space-y-1">
                <Label>Conta Tuya</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.tuyaAccountId || "__global__"}
                    onValueChange={(v) => setForm((p) => ({ ...p, tuyaAccountId: v === "__global__" ? "" : v }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar conta..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__global__">
                        🌐 Configuração global (Sistema → Tuya IoT)
                      </SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} — {REGIONS.find((r) => r.value === a.region)?.label ?? a.region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <a href="/sistema" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="icon" title="Gerenciar contas Tuya">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se não selecionar uma conta específica, usará as credenciais globais configuradas em Sistema.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Sala / Local</Label>
                  <Select
                    value={form.roomId || "__none__"}
                    onValueChange={(v) => setForm((p) => ({ ...p, roomId: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar sala..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Nenhuma —</SelectItem>
                      {rooms.map((r: any) => (
                        <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Intervalo de coleta (segundos)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={86400}
                    value={form.pollInterval}
                    onChange={f("pollInterval")}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo: 30s | Padrão: 300s (5 min)</p>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Localização física, observações de instalação..."
                  value={form.notes}
                  onChange={f("notes")}
                  rows={2}
                />
              </div>
            </TabsContent>

            {/* ─── Aba Alertas ─── */}
            <TabsContent value="alertas" className="space-y-4 pt-2">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <Switch
                  checked={form.alertsEnabled}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, alertsEnabled: v }))}
                />
                <div>
                  <p className="text-sm font-medium">Habilitar alertas para este sensor</p>
                  <p className="text-xs text-muted-foreground">
                    Notificações via Telegram quando os valores ultrapassarem os limites
                  </p>
                </div>
              </div>

              {form.alertsEnabled && (
                <div className="space-y-4">
                  {/* Temperatura */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Thermometer className="w-4 h-4 text-orange-400" /> Temperatura (°C)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Mínimo (alerta abaixo de)</Label>
                        <Input type="number" placeholder="Ex: 10" value={form.alertTempMin} onChange={f("alertTempMin")} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Máximo (alerta acima de)</Label>
                        <Input type="number" placeholder="Ex: 35" value={form.alertTempMax} onChange={f("alertTempMax")} />
                      </div>
                    </div>
                  </div>

                  {/* Umidade */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Droplets className="w-4 h-4 text-blue-400" /> Umidade (%)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Mínimo (alerta abaixo de)</Label>
                        <Input type="number" placeholder="Ex: 30" value={form.alertHumidityMin} onChange={f("alertHumidityMin")} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Máximo (alerta acima de)</Label>
                        <Input type="number" placeholder="Ex: 80" value={form.alertHumidityMax} onChange={f("alertHumidityMax")} />
                      </div>
                    </div>
                  </div>

                  {/* CO₂ */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Wind className="w-4 h-4 text-green-400" /> CO₂ (ppm)
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">Máximo (alerta acima de)</Label>
                      <Input type="number" placeholder="Ex: 1000" value={form.alertCo2Max} onChange={f("alertCo2Max")} />
                    </div>
                  </div>

                  {/* Potência */}
                  <div className="p-3 border rounded-lg space-y-3">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-yellow-400" /> Potência (W)
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">Máximo (alerta acima de)</Label>
                      <Input type="number" placeholder="Ex: 500" value={form.alertPowerMax} onChange={f("alertPowerMax")} />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "Salvar alterações" : "Cadastrar sensor"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de histórico de leituras */}
      <Dialog open={historyDeviceId !== null} onOpenChange={(o) => !o && setHistoryDeviceId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {historyDevice?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Período:</span>
            {[6, 12, 24, 48, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHistoryHours(h)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  historyHours === h
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {h < 24 ? `${h}h` : h === 168 ? "7d" : `${h / 24}d`}
              </button>
            ))}
          </div>
          {chartData.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
              Nenhuma leitura registrada no período selecionado
            </div>
          ) : (
            <div className="space-y-6">
              {chartData.some((d) => d.temp !== undefined) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Temperatura (°C)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs><linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.65 0.18 30)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.65 0.18 30)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} />
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }} />
                      <Area type="monotone" dataKey="temp" name="Temperatura" stroke="oklch(0.65 0.18 30)" fill="url(#tempGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {chartData.some((d) => d.hum !== undefined) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Umidade (%)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs><linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.65 0.18 210)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.65 0.18 210)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} />
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }} />
                      <Area type="monotone" dataKey="hum" name="Umidade" stroke="oklch(0.65 0.18 210)" fill="url(#humGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {chartData.some((d) => d.co2 !== undefined) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">CO₂ (ppm)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs><linearGradient id="co2Grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.60 0.18 145)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.60 0.18 145)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} />
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }} />
                      <Area type="monotone" dataKey="co2" name="CO₂" stroke="oklch(0.60 0.18 145)" fill="url(#co2Grad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {chartData.some((d) => d.power !== undefined) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Potência (W)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <defs><linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="oklch(0.75 0.18 75)" stopOpacity={0.3} /><stop offset="95%" stopColor="oklch(0.75 0.18 75)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.02 240)" }} />
                      <Tooltip contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }} />
                      <Area type="monotone" dataKey="power" name="Potência" stroke="oklch(0.75 0.18 75)" fill="url(#powerGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-right">{readings.length} leituras no período</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
