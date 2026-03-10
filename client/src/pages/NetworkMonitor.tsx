import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  Activity,
  Cpu,
  MemoryStick,
  Thermometer,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Settings,
  Signal,
  Network,
  Clock,
  Bell,
  BellOff,
  Plus,
  Server,
  Router,
  MonitorSpeaker,
  Layers,
  ChevronRight,
  Search,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useLocation } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "—";
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function alertTypeLabel(type: string): string {
  const map: Record<string, string> = {
    cpu_high: "CPU Alta",
    mem_high: "Memória Alta",
    temp_high: "Temperatura Alta",
    port_down: "Porta DOWN",
    port_up: "Porta UP",
    rx_power_low: "Sinal RX Baixo",
    rx_power_high: "Sinal RX Alto",
    tx_power_low: "Sinal TX Baixo",
    tx_power_high: "Sinal TX Alto",
    snmp_unreachable: "SNMP Inacessível",
    traffic_high: "Tráfego Alto",
  };
  return map[type] ?? type;
}

// Grupos de tipos de equipamento para organização visual
const EQUIPMENT_GROUPS: { label: string; types: string[]; icon: React.ReactNode; color: string }[] = [
  { label: "Switches", types: ["switch"], icon: <Layers className="h-4 w-4" />, color: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
  { label: "OLTs / GPON", types: ["olt"], icon: <Signal className="h-4 w-4" />, color: "text-green-400 border-green-500/30 bg-green-500/5" },
  { label: "Roteadores", types: ["router"], icon: <Router className="h-4 w-4" />, color: "text-purple-400 border-purple-500/30 bg-purple-500/5" },
  { label: "Servidores", types: ["server"], icon: <Server className="h-4 w-4" />, color: "text-orange-400 border-orange-500/30 bg-orange-500/5" },
  { label: "Outros", types: ["dgo", "splitter", "patch_panel", "amplifier", "other"], icon: <MonitorSpeaker className="h-4 w-4" />, color: "text-gray-400 border-gray-500/30 bg-gray-500/5" },
];

// ─── Teste de Conexão SNMP ──────────────────────────────────────────────────

function SnmpTestDialog({
  equipmentId,
  equipmentName,
  open,
  onClose,
}: {
  equipmentId: number;
  equipmentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const testConn = trpc.networkSnmp.testConnection.useMutation();

  function handleTest() {
    testConn.mutate({ equipmentId });
  }

  const result = testConn.data;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-cyan-400" />
            Teste SNMP — {equipmentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Botão de teste */}
          <Button
            onClick={handleTest}
            disabled={testConn.isPending}
            className="w-full"
            variant="outline"
          >
            {testConn.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> A testar conexão...</>
            ) : (
              <><FlaskConical className="h-4 w-4 mr-2" /> Testar Conexão SNMP</>
            )}
          </Button>

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg border p-4 space-y-3 ${
              result.ok
                ? "border-green-500/40 bg-green-500/5"
                : "border-red-500/40 bg-red-500/5"
            }`}>
              {/* Status */}
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                )}
                <span className={`font-semibold ${
                  result.ok ? "text-green-400" : "text-red-400"
                }`}>
                  {result.ok ? "Conexão bem-sucedida" : "Falha na conexão"}
                </span>
                {result.details?.rttMs !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {result.details.rttMs}ms
                  </span>
                )}
              </div>

              {/* Erro */}
              {!result.ok && result.error && (
                <p className="text-sm text-red-300 font-mono bg-red-950/30 rounded p-2">
                  {result.error}
                </p>
              )}

              {/* Detalhes do equipamento */}
              {result.details && (
                <div className="space-y-1.5 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Host</span>
                    <span className="font-mono text-xs">{result.details.host}:{result.details.port}</span>
                    <span className="text-muted-foreground">Versão SNMP</span>
                    <span className="font-mono text-xs uppercase">{result.details.version}</span>
                    {result.details.sysName && (
                      <>
                        <span className="text-muted-foreground">sysName</span>
                        <span className="font-mono text-xs truncate">{result.details.sysName}</span>
                      </>
                    )}
                    {result.details.uptimeStr && (
                      <>
                        <span className="text-muted-foreground">Uptime</span>
                        <span className="font-mono text-xs">{result.details.uptimeStr}</span>
                      </>
                    )}
                    {result.details.respondedAt && (
                      <>
                        <span className="text-muted-foreground">Testado em</span>
                        <span className="text-xs">{new Date(result.details.respondedAt).toLocaleTimeString()}</span>
                      </>
                    )}
                  </div>
                  {result.details.sysDescr && (
                    <div className="mt-2">
                      <p className="text-muted-foreground text-xs mb-1">sysDescr</p>
                      <p className="font-mono text-xs bg-muted/30 rounded p-2 break-all leading-relaxed">
                        {result.details.sysDescr}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Configuração SNMP ────────────────────────────────────────────

function SnmpConfigDialog({
  equipmentId,
  equipmentName,
  open,
  onClose,
}: {
  equipmentId: number;
  equipmentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: config, isLoading } = trpc.networkSnmp.getConfig.useQuery(
    { equipmentId },
    { enabled: open }
  );
  const utils = trpc.useUtils();

  const upsert = trpc.networkSnmp.upsertConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração SNMP salva!");
      utils.networkSnmp.getSummary.invalidate();
      utils.networkSnmp.getConfig.invalidate({ equipmentId });
      onClose();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const [form, setForm] = useState({
    enabled: false,
    snmpHost: "",
    snmpPort: 161,
    snmpVersion: "v2c" as "v1" | "v2c" | "v3",
    snmpCommunity: "public",
    snmpV3User: "",
    snmpV3AuthProto: "MD5" as "MD5" | "SHA",
    snmpV3AuthKey: "",
    snmpV3PrivProto: "DES" as "DES" | "AES",
    snmpV3PrivKey: "",
    pollInterval: 300,
    alertsEnabled: false,
    alertCpuMax: 90,
    alertMemMax: 90,
    alertTempMax: 70,
  });

  const [formLoaded, setFormLoaded] = useState(false);
  if (config && !formLoaded) {
    setFormLoaded(true);
    setForm({
      enabled: config.enabled ?? false,
      snmpHost: config.snmpHost ?? "",
      snmpPort: config.snmpPort ?? 161,
      snmpVersion: (config.snmpVersion as any) ?? "v2c",
      snmpCommunity: config.snmpCommunity ?? "public",
      snmpV3User: config.snmpV3User ?? "",
      snmpV3AuthProto: (config.snmpV3AuthProto as any) ?? "MD5",
      snmpV3AuthKey: config.snmpV3AuthKey ?? "",
      snmpV3PrivProto: (config.snmpV3PrivProto as any) ?? "DES",
      snmpV3PrivKey: config.snmpV3PrivKey ?? "",
      pollInterval: config.pollInterval ?? 300,
      alertsEnabled: config.alertsEnabled ?? false,
      alertCpuMax: config.alertCpuMax ?? 90,
      alertMemMax: config.alertMemMax ?? 90,
      alertTempMax: config.alertTempMax ?? 70,
    });
  }

  function handleClose() {
    setFormLoaded(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração SNMP — {equipmentName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Monitoramento SNMP ativo</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Host / IP de gerência</Label>
              <Input
                value={form.snmpHost}
                onChange={(e) => setForm((f) => ({ ...f, snmpHost: e.target.value }))}
                placeholder="192.168.1.1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Porta SNMP</Label>
                <Input
                  type="number"
                  value={form.snmpPort}
                  onChange={(e) => setForm((f) => ({ ...f, snmpPort: parseInt(e.target.value) || 161 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Versão SNMP</Label>
                <Select
                  value={form.snmpVersion}
                  onValueChange={(v) => setForm((f) => ({ ...f, snmpVersion: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="v1">SNMPv1</SelectItem>
                    <SelectItem value="v2c">SNMPv2c</SelectItem>
                    <SelectItem value="v3">SNMPv3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.snmpVersion !== "v3" ? (
              <div className="space-y-1.5">
                <Label>Community String</Label>
                <Input
                  value={form.snmpCommunity}
                  onChange={(e) => setForm((f) => ({ ...f, snmpCommunity: e.target.value }))}
                  placeholder="public"
                />
              </div>
            ) : (
              <div className="space-y-3 border rounded-lg p-3">
                <p className="text-sm font-medium">SNMPv3 — Credenciais</p>
                <div className="space-y-1.5">
                  <Label>Utilizador</Label>
                  <Input
                    value={form.snmpV3User}
                    onChange={(e) => setForm((f) => ({ ...f, snmpV3User: e.target.value }))}
                    placeholder="admin"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Auth Protocol</Label>
                    <Select value={form.snmpV3AuthProto} onValueChange={(v) => setForm((f) => ({ ...f, snmpV3AuthProto: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MD5">MD5</SelectItem>
                        <SelectItem value="SHA">SHA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auth Key</Label>
                    <Input type="password" value={form.snmpV3AuthKey} onChange={(e) => setForm((f) => ({ ...f, snmpV3AuthKey: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Priv Protocol</Label>
                    <Select value={form.snmpV3PrivProto} onValueChange={(v) => setForm((f) => ({ ...f, snmpV3PrivProto: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DES">DES</SelectItem>
                        <SelectItem value="AES">AES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priv Key</Label>
                    <Input type="password" value={form.snmpV3PrivKey} onChange={(e) => setForm((f) => ({ ...f, snmpV3PrivKey: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Intervalo de polling (segundos)</Label>
              <Input
                type="number"
                value={form.pollInterval}
                onChange={(e) => setForm((f) => ({ ...f, pollInterval: parseInt(e.target.value) || 300 }))}
                min={30}
                max={86400}
              />
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Alertas automáticos</Label>
                <Switch
                  checked={form.alertsEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, alertsEnabled: v }))}
                />
              </div>
              {form.alertsEnabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPU máx. (%)</Label>
                    <Input type="number" value={form.alertCpuMax} onChange={(e) => setForm((f) => ({ ...f, alertCpuMax: parseInt(e.target.value) || 90 }))} min={0} max={100} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Memória máx. (%)</Label>
                    <Input type="number" value={form.alertMemMax} onChange={(e) => setForm((f) => ({ ...f, alertMemMax: parseInt(e.target.value) || 90 }))} min={0} max={100} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Temp. máx. (°C)</Label>
                    <Input type="number" value={form.alertTempMax} onChange={(e) => setForm((f) => ({ ...f, alertTempMax: parseInt(e.target.value) || 70 }))} min={0} max={200} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            onClick={() => upsert.mutate({ equipmentId, ...form })}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adicionar equipamento ao monitoramento ───────────────────────────────────

function AddMonitoringDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const { data: allEquipments } = trpc.equipments.list.useQuery(
    {},
    { enabled: open }
  );
  const { data: monitored } = trpc.networkSnmp.getSummary.useQuery(undefined, { enabled: open });
  const monitoredIds = new Set(monitored?.map((r) => r.config.equipmentId) ?? []);
  const available = (Array.isArray(allEquipments) ? allEquipments : []).filter((e: any) => !monitoredIds.has(e.id));
  const utils = trpc.useUtils();

  const upsert = trpc.networkSnmp.upsertConfig.useMutation({
    onSuccess: () => {
      toast.success("Equipamento adicionado ao monitoramento!");
      utils.networkSnmp.getSummary.invalidate();
      onClose();
      setSelectedId("");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar ao Monitor de Rede</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Selecionar equipamento</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um equipamento..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name} ({e.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Após adicionar, configure o IP e credenciais SNMP clicando no ícone de configuração.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!selectedId || upsert.isPending}
            onClick={() => upsert.mutate({ equipmentId: parseInt(selectedId), enabled: true })}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card compacto de equipamento ────────────────────────────────────────────

function EquipmentRow({ row }: { row: any }) {
  const [, setLocation] = useLocation();
  const [configOpen, setConfigOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const utils = trpc.useUtils();

  const pollNow = trpc.networkSnmp.pollNow.useMutation({
    onSuccess: () => {
      toast.success("Poll executado!");
      utils.networkSnmp.getSummary.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const cfg = row.config;
  const eq = row.equipment;
  const hasError = !!cfg.lastPollError;
  const isUp = !hasError && cfg.lastPollAt;
  const lastPoll = cfg.lastPollAt ? new Date(cfg.lastPollAt) : null;
  const minutesAgo = lastPoll ? Math.floor((Date.now() - lastPoll.getTime()) / 60000) : null;

  return (
    <>
      <SnmpConfigDialog
        equipmentId={cfg.equipmentId}
        equipmentName={eq?.name ?? `Equipamento #${cfg.equipmentId}`}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
      />
      <SnmpTestDialog
        equipmentId={cfg.equipmentId}
        equipmentName={eq?.name ?? `Equipamento #${cfg.equipmentId}`}
        open={testOpen}
        onClose={() => setTestOpen(false)}
      />
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer hover:bg-muted/40 ${hasError ? "border-red-500/30 bg-red-500/5" : "border-border/40"}`}
        onClick={() => setLocation(`/monitor-rede/${cfg.equipmentId}`)}
      >
        {/* Status dot */}
        <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isUp ? "bg-green-500" : hasError ? "bg-red-500" : "bg-yellow-500"}`} />

        {/* Nome e IP */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{eq?.name ?? `Equipamento #${cfg.equipmentId}`}</p>
          <p className="text-xs text-muted-foreground truncate">{cfg.snmpHost ?? "IP não configurado"}</p>
        </div>

        {/* Métricas inline */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          {cfg.lastCpuPercent !== null && cfg.lastCpuPercent !== undefined && (
            <span className={cfg.lastCpuPercent > (cfg.alertCpuMax ?? 90) ? "text-red-400" : ""}>
              CPU {cfg.lastCpuPercent}%
            </span>
          )}
          {cfg.lastMemPercent !== null && cfg.lastMemPercent !== undefined && (
            <span className={cfg.lastMemPercent > (cfg.alertMemMax ?? 90) ? "text-red-400" : ""}>
              RAM {cfg.lastMemPercent}%
            </span>
          )}
          {cfg.lastTempCelsius !== null && cfg.lastTempCelsius !== undefined && (
            <span className={cfg.lastTempCelsius > (cfg.alertTempMax ?? 70) ? "text-red-400" : ""}>
              {cfg.lastTempCelsius}°C
            </span>
          )}
          {minutesAgo !== null && (
            <span className="hidden md:inline">{minutesAgo < 2 ? "agora" : `${minutesAgo}m atrás`}</span>
          )}
        </div>

        {/* Alertas */}
        {row.activeAlertCount > 0 && (
          <Badge variant="destructive" className="text-xs flex-shrink-0">
            {row.activeAlertCount}
          </Badge>
        )}

        {/* Ações */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTestOpen(true)}>
                  <FlaskConical className="h-3.5 w-3.5 text-cyan-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Testar Conexão SNMP</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfigOpen(true)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configurar SNMP</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => pollNow.mutate({ equipmentId: cfg.equipmentId })}
                  disabled={pollNow.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${pollNow.isPending ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Forçar poll</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </>
  );
}

// ─── Grupo de equipamentos ────────────────────────────────────────────────────

function EquipmentGroup({
  label,
  icon,
  color,
  rows,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  rows: any[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const alertCount = rows.reduce((acc, r) => acc + (r.activeAlertCount ?? 0), 0);
  const upCount = rows.filter((r) => !r.config.lastPollError && r.config.lastPollAt).length;

  return (
    <Card className={`border ${color}`}>
      <CardHeader className="pb-2 pt-3 px-4">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-2">
            <span className={color.split(" ")[0]}>{icon}</span>
            <CardTitle className="text-sm font-semibold">{label}</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              {rows.length} equip.
            </Badge>
            <span className="text-xs text-muted-foreground">
              {upCount}/{rows.length} UP
            </span>
          </div>
          <div className="flex items-center gap-2">
            {alertCount > 0 && (
              <Badge variant="destructive" className="text-xs">{alertCount} alerta{alertCount > 1 ? "s" : ""}</Badge>
            )}
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-90"}`} />
          </div>
        </button>
      </CardHeader>
      {!collapsed && (
        <CardContent className="px-4 pb-3 pt-0 space-y-1.5">
          {rows.map((row) => (
            <EquipmentRow key={row.config.equipmentId} row={row} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Painel de alertas globais ────────────────────────────────────────────────

function AlertsPanel() {
  const { data: alerts, isLoading } = trpc.networkSnmp.getAlerts.useQuery({ onlyActive: true, limit: 30 });
  const utils = trpc.useUtils();

  const resolve = trpc.networkSnmp.resolveAlert.useMutation({
    onSuccess: () => { utils.networkSnmp.getAlerts.invalidate(); utils.networkSnmp.getSummary.invalidate(); toast.success("Alerta resolvido"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!alerts?.length) return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
      <CheckCircle className="h-8 w-8 text-green-500" />
      <p className="text-sm">Nenhum alerta ativo</p>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {alerts.map((row) => (
        <div key={row.alert.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5">
          <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${row.alert.severity === "critical" ? "text-red-500" : "text-yellow-500"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{alertTypeLabel(row.alert.alertType)} — {row.equipmentName}</p>
            <p className="text-xs text-muted-foreground truncate">{row.alert.message}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs flex-shrink-0"
            onClick={() => resolve.mutate({ alertId: row.alert.id })}
            disabled={resolve.isPending}
          >
            Resolver
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NetworkMonitor() {
  const { isAdmin } = useRole();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: summary, isLoading } = trpc.networkSnmp.getSummary.useQuery();

  // Filtrar por busca
  const filtered = useMemo(() => {
    if (!summary) return [];
    if (!search.trim()) return summary;
    const q = search.toLowerCase();
    return summary.filter((r) =>
      r.equipment?.name?.toLowerCase().includes(q) ||
      r.config.snmpHost?.toLowerCase().includes(q)
    );
  }, [summary, search]);

  // Agrupar por tipo de equipamento
  const groups = useMemo(() => {
    return EQUIPMENT_GROUPS
      .map((g) => ({
        ...g,
        rows: filtered.filter((r) => g.types.includes(r.equipment?.type ?? "other")),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered]);

  const totalAlerts = summary?.reduce((acc, r) => acc + (r.activeAlertCount ?? 0), 0) ?? 0;
  const totalUp = summary?.filter((r) => !r.config.lastPollError && r.config.lastPollAt).length ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Monitor de Rede
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary?.length ?? 0} equipamentos monitorados · {totalUp} UP · {totalAlerts > 0 ? `${totalAlerts} alertas ativos` : "sem alertas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 h-8 w-48 text-sm"
              placeholder="Buscar equipamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          )}
        </div>
      </div>

      <AddMonitoringDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !summary?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Network className="h-10 w-10" />
            <p className="font-medium">Nenhum equipamento monitorado</p>
            <p className="text-sm text-center max-w-sm">
              Adicione equipamentos ao monitoramento SNMP para visualizar métricas de CPU, memória, temperatura e tráfego.
            </p>
            {isAdmin && (
              <Button onClick={() => setAddOpen(true)} className="mt-2 gap-1.5">
                <Plus className="h-4 w-4" />
                Adicionar equipamento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Coluna principal: grupos de equipamentos */}
          <div className="xl:col-span-2 space-y-3">
            {groups.length === 0 && search && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nenhum equipamento encontrado para "{search}"
              </div>
            )}
            {groups.map((g) => (
              <EquipmentGroup
                key={g.label}
                label={g.label}
                icon={g.icon}
                color={g.color}
                rows={g.rows}
              />
            ))}
          </div>

          {/* Coluna lateral: alertas */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Alertas Ativos
                  {totalAlerts > 0 && (
                    <Badge variant="destructive" className="text-xs">{totalAlerts}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <AlertsPanel />
              </CardContent>
            </Card>

            {/* Resumo rápido */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold">Resumo</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {EQUIPMENT_GROUPS.map((g) => {
                  const count = summary?.filter((r) => g.types.includes(r.equipment?.type ?? "other")).length ?? 0;
                  if (!count) return null;
                  return (
                    <div key={g.label} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className={g.color.split(" ")[0]}>{g.icon}</span>
                        {g.label}
                      </span>
                      <Badge variant="outline" className="text-xs">{count}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
