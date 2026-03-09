import { useState } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ChevronDown,
  ChevronRight,
  Signal,
  Network,
  Clock,
  Bell,
  BellOff,
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

function getStatusColor(status: string | null | undefined): string {
  if (status === "up") return "text-green-500";
  if (status === "down") return "text-red-500";
  return "text-yellow-500";
}

function getMetricColor(value: number | null | undefined, max: number | null | undefined): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  if (max && value > max) return "text-red-500";
  if (max && value > max * 0.8) return "text-yellow-500";
  return "text-green-500";
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

// ─── Componente de configuração SNMP ─────────────────────────────────────────

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

  // Preencher form quando config carregar
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                    <Select
                      value={form.snmpV3AuthProto}
                      onValueChange={(v) => setForm((f) => ({ ...f, snmpV3AuthProto: v as any }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MD5">MD5</SelectItem>
                        <SelectItem value="SHA">SHA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auth Key</Label>
                    <Input
                      type="password"
                      value={form.snmpV3AuthKey}
                      onChange={(e) => setForm((f) => ({ ...f, snmpV3AuthKey: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Priv Protocol</Label>
                    <Select
                      value={form.snmpV3PrivProto}
                      onValueChange={(v) => setForm((f) => ({ ...f, snmpV3PrivProto: v as any }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DES">DES</SelectItem>
                        <SelectItem value="AES">AES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priv Key</Label>
                    <Input
                      type="password"
                      value={form.snmpV3PrivKey}
                      onChange={(e) => setForm((f) => ({ ...f, snmpV3PrivKey: e.target.value }))}
                    />
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
                <Label>Alertas habilitados</Label>
                <Switch
                  checked={form.alertsEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, alertsEnabled: v }))}
                />
              </div>
              {form.alertsEnabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPU máx (%)</Label>
                    <Input
                      type="number"
                      value={form.alertCpuMax}
                      onChange={(e) => setForm((f) => ({ ...f, alertCpuMax: parseFloat(e.target.value) || 90 }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Memória máx (%)</Label>
                    <Input
                      type="number"
                      value={form.alertMemMax}
                      onChange={(e) => setForm((f) => ({ ...f, alertMemMax: parseFloat(e.target.value) || 90 }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Temp. máx (°C)</Label>
                    <Input
                      type="number"
                      value={form.alertTempMax}
                      onChange={(e) => setForm((f) => ({ ...f, alertTempMax: parseFloat(e.target.value) || 70 }))}
                    />
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

// ─── Painel de portas de um equipamento ──────────────────────────────────────

function PortsPanel({ equipmentId }: { equipmentId: number }) {
  const { data: ports, isLoading } = trpc.networkSnmp.getPorts.useQuery({ equipmentId });

  if (isLoading) return <Skeleton className="h-32" />;
  if (!ports || ports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma porta descoberta. Execute um poll para descobrir as interfaces.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Interface</TableHead>
            <TableHead>Alias</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Velocidade</TableHead>
            <TableHead>RX</TableHead>
            <TableHead>TX</TableHead>
            <TableHead>GBIC RX</TableHead>
            <TableHead>GBIC TX</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ports.map((port) => (
            <TableRow key={port.id}>
              <TableCell className="font-mono text-sm">{port.ifName ?? `if${port.ifIndex}`}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{port.ifAlias ?? "—"}</TableCell>
              <TableCell>
                <span className={`flex items-center gap-1 text-xs font-medium ${getStatusColor(port.ifOperStatus)}`}>
                  {port.ifOperStatus === "up" ? (
                    <Wifi className="h-3 w-3" />
                  ) : (
                    <WifiOff className="h-3 w-3" />
                  )}
                  {port.ifOperStatus ?? "—"}
                </span>
              </TableCell>
              <TableCell className="text-xs">
                {port.ifSpeed ? formatBps(port.ifSpeed) : "—"}
              </TableCell>
              <TableCell className="text-xs font-mono text-blue-400">
                {formatBps(port.lastInBps)}
              </TableCell>
              <TableCell className="text-xs font-mono text-green-400">
                {formatBps(port.lastOutBps)}
              </TableCell>
              <TableCell className="text-xs font-mono">
                {port.gbicEnabled && port.lastRxPowerDbm !== null
                  ? <span className={port.lastRxPowerDbm < -25 ? "text-red-400" : "text-cyan-400"}>
                      {port.lastRxPowerDbm?.toFixed(2)} dBm
                    </span>
                  : "—"}
              </TableCell>
              <TableCell className="text-xs font-mono">
                {port.gbicEnabled && port.lastTxPowerDbm !== null
                  ? <span className="text-purple-400">{port.lastTxPowerDbm?.toFixed(2)} dBm</span>
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Card de equipamento monitorado ──────────────────────────────────────────

function EquipmentMonitorCard({ row }: { row: any }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const pollNow = trpc.networkSnmp.pollNow.useMutation({
    onSuccess: () => {
      toast.success("Poll executado!");
      utils.networkSnmp.getSummary.invalidate();
      utils.networkSnmp.getPorts.invalidate({ equipmentId: row.config.equipmentId });
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const cfg = row.config;
  const eq = row.equipment;
  const hasError = !!cfg.lastPollError;
  const lastPoll = cfg.lastPollAt ? new Date(cfg.lastPollAt) : null;

  return (
    <Card className={`border-border/50 ${hasError ? "border-red-500/30" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-left"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="font-semibold text-sm">{eq?.name ?? `Equipamento #${cfg.equipmentId}`}</p>
                <p className="text-xs text-muted-foreground">
                  {eq?.manufacturer} {eq?.type} · {cfg.snmpHost}
                </p>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {row.activeAlertCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {row.activeAlertCount} alerta{row.activeAlertCount > 1 ? "s" : ""}
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-primary"
                    onClick={() => setLocation(`/monitor-rede/${cfg.equipmentId}`)}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    Gráficos
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver gráficos e histórico</TooltipContent>
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
                <TooltipContent>Forçar poll agora</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Métricas principais */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <Cpu className="h-4 w-4 text-muted-foreground mb-1" />
            <span className={`text-lg font-bold ${getMetricColor(cfg.lastCpuPercent, cfg.alertCpuMax)}`}>
              {cfg.lastCpuPercent !== null ? `${cfg.lastCpuPercent}%` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">CPU</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <MemoryStick className="h-4 w-4 text-muted-foreground mb-1" />
            <span className={`text-lg font-bold ${getMetricColor(cfg.lastMemPercent, cfg.alertMemMax)}`}>
              {cfg.lastMemPercent !== null ? `${cfg.lastMemPercent}%` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Memória</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <Thermometer className="h-4 w-4 text-muted-foreground mb-1" />
            <span className={`text-lg font-bold ${getMetricColor(cfg.lastTemperature, cfg.alertTempMax)}`}>
              {cfg.lastTemperature !== null ? `${cfg.lastTemperature}°C` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">Temp.</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
            <Clock className="h-4 w-4 text-muted-foreground mb-1" />
            <span className="text-sm font-bold text-foreground">
              {formatUptime(cfg.lastUptimeSeconds)}
            </span>
            <span className="text-xs text-muted-foreground">Uptime</span>
          </div>
        </div>

        {/* Status e último poll */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {hasError ? (
            <span className="text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {cfg.lastPollError?.slice(0, 60)}
            </span>
          ) : (
            <span className="text-green-500 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              OK
            </span>
          )}
          <span>
            {lastPoll ? `Último poll: ${lastPoll.toLocaleTimeString()}` : "Nunca coletado"}
          </span>
        </div>

        {/* Portas expandidas */}
        {expanded && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Interfaces SNMP</p>
            <PortsPanel equipmentId={cfg.equipmentId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Painel de alertas ────────────────────────────────────────────────────────

function AlertsPanel() {
  const utils = trpc.useUtils();
  const { data: alerts, isLoading } = trpc.networkSnmp.getAlerts.useQuery({
    onlyActive: true,
    limit: 100,
  });

  const ack = trpc.networkSnmp.acknowledgeAlert.useMutation({
    onSuccess: () => { utils.networkSnmp.getAlerts.invalidate(); toast.success("Alerta reconhecido"); },
  });
  const resolve = trpc.networkSnmp.resolveAlert.useMutation({
    onSuccess: () => { utils.networkSnmp.getAlerts.invalidate(); utils.networkSnmp.getSummary.invalidate(); toast.success("Alerta resolvido"); },
  });

  if (isLoading) return <Skeleton className="h-48" />;
  if (!alerts || alerts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500/50" />
        <p className="font-medium">Nenhum alerta ativo</p>
        <p className="text-sm">Todos os equipamentos estão a funcionar normalmente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((row) => (
        <div
          key={row.alert.id}
          className={`flex items-start justify-between p-3 rounded-lg border ${
            row.alert.severity === "critical"
              ? "border-red-500/30 bg-red-500/5"
              : "border-yellow-500/30 bg-yellow-500/5"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={`h-4 w-4 mt-0.5 ${
                row.alert.severity === "critical" ? "text-red-500" : "text-yellow-500"
              }`}
            />
            <div>
              <p className="text-sm font-medium">
                {alertTypeLabel(row.alert.alertType)} — {row.equipmentName}
              </p>
              <p className="text-xs text-muted-foreground">{row.alert.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(row.alert.createdAt).toLocaleString()}
                {row.alert.acknowledgedAt && (
                  <span className="ml-2 text-blue-400">
                    · Reconhecido por {row.alert.acknowledgedBy}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {!row.alert.acknowledgedAt && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => ack.mutate({ alertId: row.alert.id })}
              >
                Reconhecer
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-green-500"
              onClick={() => resolve.mutate({ alertId: row.alert.id })}
            >
              Resolver
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Seletor de equipamento para adicionar monitoramento ──────────────────────

function AddMonitoringDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const { data: equipments } = trpc.equipments.list.useQuery({ status: "active" });

  if (configOpen && selectedId) {
    return (
      <SnmpConfigDialog
        equipmentId={selectedId}
        equipmentName={equipments?.find((e) => e.id === selectedId)?.name ?? ""}
        open={configOpen}
        onClose={() => { setConfigOpen(false); onClose(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar Monitoramento SNMP</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Selecionar equipamento</Label>
          <Select
            value={selectedId?.toString() ?? ""}
            onValueChange={(v) => setSelectedId(parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolher equipamento..." />
            </SelectTrigger>
            <SelectContent>
              {(equipments ?? []).map((eq) => (
                <SelectItem key={eq.id} value={eq.id.toString()}>
                  {eq.name} {eq.ipAddress ? `(${eq.ipAddress})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!selectedId}
            onClick={() => { if (selectedId) setConfigOpen(true); }}
          >
            Configurar SNMP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NetworkMonitor() {
  const [addOpen, setAddOpen] = useState(false);
  const [configEquipmentId, setConfigEquipmentId] = useState<number | null>(null);
  const [configEquipmentName, setConfigEquipmentName] = useState("");
  const { isAdmin } = useRole();

  const { data: summary, isLoading, refetch } = trpc.networkSnmp.getSummary.useQuery(undefined, {
    refetchInterval: 30_000, // atualizar a cada 30s
  });

  const totalAlerts = (summary ?? []).reduce((acc, r) => acc + r.activeAlertCount, 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Monitor de Rede</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento SNMP de switches, roteadores, OLTs e outros equipamentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="gap-1">
              <Bell className="h-3 w-3" />
              {totalAlerts} alerta{totalAlerts > 1 ? "s" : ""}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
          {isAdmin && (
            <Button onClick={() => setAddOpen(true)} className="gap-1.5">
              <Network className="h-4 w-4" />
              Adicionar Monitoramento
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="equipment">
        <TabsList>
          <TabsTrigger value="equipment" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Equipamentos
            {(summary?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {summary?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alertas
            {totalAlerts > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs">
                {totalAlerts}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipment" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : !summary || summary.length === 0 ? (
            <Card className="border-border/50 border-dashed">
              <CardContent className="py-16 text-center">
                <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="font-medium text-muted-foreground mb-1">Nenhum equipamento monitorado</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Adicione equipamentos para monitorar CPU, memória, temperatura e tráfego de portas via SNMP.
                </p>
                {isAdmin && (
                  <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-1.5">
                    <Network className="h-4 w-4" />
                    Adicionar Monitoramento
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {summary.map((row) => (
                <div key={row.config.equipmentId} className="relative group">
                  <EquipmentMonitorCard row={row} />
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        setConfigEquipmentId(row.config.equipmentId);
                        setConfigEquipmentName(row.equipment?.name ?? "");
                      }}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertsPanel />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddMonitoringDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {configEquipmentId && (
        <SnmpConfigDialog
          equipmentId={configEquipmentId}
          equipmentName={configEquipmentName}
          open={!!configEquipmentId}
          onClose={() => setConfigEquipmentId(null)}
        />
      )}
    </div>
  );
}
