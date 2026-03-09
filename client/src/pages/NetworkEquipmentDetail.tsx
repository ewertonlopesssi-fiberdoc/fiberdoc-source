/**
 * NetworkEquipmentDetail.tsx
 * Página de detalhe de um equipamento monitorado via SNMP.
 * Exibe gráficos de tráfego por porta, sinal GBIC, CPU, memória e temperatura.
 * Permite configurar threshold de tráfego por porta.
 */
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Activity,
  Cpu,
  MemoryStick,
  Thermometer,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  Signal,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { toast } from "sonner";

// ─── Períodos disponíveis ─────────────────────────────────────────────────────
const PERIODS = [
  { label: "Últimos 5 min", minutes: 5 },
  { label: "Últimos 15 min", minutes: 15 },
  { label: "Últimos 30 min", minutes: 30 },
  { label: "Última 1 hora", minutes: 60 },
  { label: "Últimas 3 horas", minutes: 180 },
  { label: "Últimas 6 horas", minutes: 360 },
  { label: "Últimas 12 horas", minutes: 720 },
  { label: "Últimas 24 horas", minutes: 1440 },
  { label: "Últimos 2 dias", minutes: 2880 },
  { label: "Últimos 7 dias", minutes: 10080 },
  { label: "Últimos 30 dias", minutes: 43200 },
];

// ─── Utilitários ──────────────────────────────────────────────────────────────
function formatBps(bps: number | null | undefined): string {
  if (bps == null) return "—";
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.length > 0 ? parts.join(" ") : "< 1m";
}

function formatTime(date: Date | string | null | undefined, periodMinutes: number): string {
  if (!date) return "";
  const d = new Date(date);
  if (periodMinutes <= 60) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (periodMinutes <= 1440) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function bpsToMbps(bps: number | null | undefined): number | null {
  if (bps == null) return null;
  return parseFloat((bps / 1_000_000).toFixed(3));
}

function getStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "up": return "text-emerald-400";
    case "down": return "text-red-400";
    case "testing": return "text-yellow-400";
    default: return "text-muted-foreground";
  }
}

function getAlertSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "warning": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function getAlertTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cpu_high: "CPU Alta",
    mem_high: "Memória Alta",
    temp_high: "Temperatura Alta",
    port_down: "Porta Down",
    port_up: "Porta Up",
    rx_power_low: "Sinal RX Baixo",
    rx_power_high: "Sinal RX Alto",
    tx_power_low: "Sinal TX Baixo",
    tx_power_high: "Sinal TX Alto",
    snmp_unreachable: "SNMP Inacessível",
    traffic_high: "Tráfego Alto",
  };
  return labels[type] ?? type;
}

// ─── Componente de Gráfico de Tráfego por Porta ───────────────────────────────
function PortTrafficChart({
  port,
  periodMinutes,
  onConfigThreshold,
}: {
  port: any;
  periodMinutes: number;
  onConfigThreshold: (port: any) => void;
}) {
  const { data: readings, isLoading } = trpc.networkSnmp.getPortReadings.useQuery(
    { portId: port.id, periodMinutes },
    { refetchInterval: periodMinutes <= 30 ? 30_000 : 60_000 }
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    return readings.map((r) => ({
      time: formatTime(r.collectedAt, periodMinutes),
      inMbps: bpsToMbps(r.inBps),
      outMbps: bpsToMbps(r.outBps),
      rxDbm: r.rxPowerDbm ?? null,
      txDbm: r.txPowerDbm ?? null,
      gbicTemp: r.gbicTemp ?? null,
    }));
  }, [readings, periodMinutes]);

  const thresholdMbps = port.alertBpsMax != null ? port.alertBpsMax / 1_000_000 : null;
  const hasGbic = port.gbicEnabled || chartData.some((d) => d.rxDbm != null || d.txDbm != null);
  const hasTraffic = chartData.some((d) => d.inMbps != null || d.outMbps != null);

  const isUp = port.ifOperStatus === "up";

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isUp ? (
              <Wifi className={`h-4 w-4 ${getStatusColor(port.ifOperStatus)}`} />
            ) : (
              <WifiOff className={`h-4 w-4 ${getStatusColor(port.ifOperStatus)}`} />
            )}
            <CardTitle className="text-sm font-medium">
              {port.ifName || `ifIndex ${port.ifIndex}`}
              {port.ifAlias && (
                <span className="text-muted-foreground font-normal ml-2 text-xs">
                  — {port.ifAlias}
                </span>
              )}
            </CardTitle>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${getStatusColor(port.ifOperStatus)} border-current/30`}
            >
              {port.ifOperStatus ?? "unknown"}
            </Badge>
            {port.ifSpeed && (
              <span className="text-[10px] text-muted-foreground">
                {formatBps(port.ifSpeed)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {thresholdMbps != null && (
              <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-400/30 bg-orange-400/10">
                Limite: {thresholdMbps.toFixed(1)} Mbps
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => onConfigThreshold(port)}
            >
              <Settings className="h-3 w-3" />
              Threshold
            </Button>
          </div>
        </div>
        {/* Valores atuais */}
        <div className="flex gap-4 text-xs text-muted-foreground mt-1">
          <span>
            <span className="text-blue-400 font-medium">↓ {formatBps(port.lastInBps)}</span>
          </span>
          <span>
            <span className="text-emerald-400 font-medium">↑ {formatBps(port.lastOutBps)}</span>
          </span>
          {port.lastRxPowerDbm != null && (
            <span>
              <span className="text-purple-400 font-medium">RX {port.lastRxPowerDbm.toFixed(2)} dBm</span>
            </span>
          )}
          {port.lastTxPowerDbm != null && (
            <span>
              <span className="text-pink-400 font-medium">TX {port.lastTxPowerDbm.toFixed(2)} dBm</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !hasTraffic && !hasGbic ? (
          <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">
            Sem dados de tráfego para o período selecionado
          </div>
        ) : (
          <div className="space-y-3">
            {/* Gráfico de Tráfego */}
            {hasTraffic && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                  Tráfego (Mbps)
                </p>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`inGrad-${port.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id={`outGrad-${port.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      interval="preserveStartEnd"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      formatter={(value: any, name: string) => [
                        `${value} Mbps`,
                        name === "inMbps" ? "Entrada" : "Saída",
                      ]}
                    />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>
                          {value === "inMbps" ? "Entrada" : "Saída"}
                        </span>
                      )}
                    />
                    {thresholdMbps != null && (
                      <ReferenceLine
                        y={thresholdMbps}
                        stroke="#f97316"
                        strokeDasharray="4 2"
                        strokeWidth={1.5}
                        label={{
                          value: `Limite ${thresholdMbps.toFixed(1)}M`,
                          position: "insideTopRight",
                          fontSize: 9,
                          fill: "#f97316",
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="inMbps"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      fill={`url(#inGrad-${port.id})`}
                      dot={false}
                      connectNulls
                    />
                    <Area
                      type="monotone"
                      dataKey="outMbps"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      fill={`url(#outGrad-${port.id})`}
                      dot={false}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráfico de Sinal GBIC */}
            {hasGbic && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                  Sinal Óptico GBIC (dBm)
                </p>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      interval="preserveStartEnd"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                      formatter={(value: any, name: string) => [
                        `${value} dBm`,
                        name === "rxDbm" ? "RX" : "TX",
                      ]}
                    />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>
                          {value === "rxDbm" ? "RX" : "TX"}
                        </span>
                      )}
                    />
                    {port.alertRxMin != null && (
                      <ReferenceLine
                        y={port.alertRxMin}
                        stroke="#ef4444"
                        strokeDasharray="4 2"
                        strokeWidth={1}
                        label={{ value: `Min ${port.alertRxMin}`, position: "insideBottomRight", fontSize: 9, fill: "#ef4444" }}
                      />
                    )}
                    {port.alertRxMax != null && (
                      <ReferenceLine
                        y={port.alertRxMax}
                        stroke="#f97316"
                        strokeDasharray="4 2"
                        strokeWidth={1}
                        label={{ value: `Max ${port.alertRxMax}`, position: "insideTopRight", fontSize: 9, fill: "#f97316" }}
                      />
                    )}
                    <Line type="monotone" dataKey="rxDbm" stroke="#a855f7" strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="txDbm" stroke="#ec4899" strokeWidth={1.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Componente de Gráfico de Sistema (CPU/Memória/Temperatura) ───────────────
function SystemMetricsChart({
  equipmentId,
  periodMinutes,
}: {
  equipmentId: number;
  periodMinutes: number;
}) {
  const { data: readings, isLoading } = trpc.networkSnmp.getReadings.useQuery(
    { equipmentId, periodMinutes },
    { refetchInterval: periodMinutes <= 30 ? 30_000 : 60_000 }
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    return readings.map((r) => ({
      time: formatTime(r.collectedAt, periodMinutes),
      cpu: r.cpuPercent ?? null,
      mem: r.memPercent ?? null,
      temp: r.temperature ?? null,
    }));
  }, [readings, periodMinutes]);

  const hasData = chartData.some((d) => d.cpu != null || d.mem != null || d.temp != null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!hasData) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
        Sem dados de sistema para o período selecionado
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* CPU + Memória */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
          CPU / Memória (%)
        </p>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickLine={false} axisLine={false} width={30} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" }}
              formatter={(value: any, name: string) => [`${value}%`, name === "cpu" ? "CPU" : "Memória"]}
            />
            <Legend formatter={(value) => <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>{value === "cpu" ? "CPU" : "Memória"}</span>} />
            <ReferenceLine y={80} stroke="rgba(249,115,22,0.4)" strokeDasharray="3 2" strokeWidth={1} />
            <Area type="monotone" dataKey="cpu" stroke="#f59e0b" strokeWidth={1.5} fill="url(#cpuGrad)" dot={false} connectNulls />
            <Area type="monotone" dataKey="mem" stroke="#6366f1" strokeWidth={1.5} fill="url(#memGrad)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Temperatura */}
      {chartData.some((d) => d.temp != null) && (
        <div>
          <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
            Temperatura (°C)
          </p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} interval="preserveStartEnd" tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} tickLine={false} axisLine={false} width={30} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" }}
                formatter={(value: any) => [`${value}°C`, "Temperatura"]}
              />
              <ReferenceLine y={60} stroke="rgba(249,115,22,0.4)" strokeDasharray="3 2" strokeWidth={1} />
              <Line type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Dialog de Configuração de Threshold ─────────────────────────────────────
function ThresholdConfigDialog({
  port,
  open,
  onClose,
  onSaved,
}: {
  port: any | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // toast importado de sonner
  const [bpsMaxMbps, setBpsMaxMbps] = useState<string>("");
  const [rxMin, setRxMin] = useState<string>("");
  const [rxMax, setRxMax] = useState<string>("");

  const updateMutation = trpc.networkSnmp.updatePortAlerts.useMutation({
    onSuccess: () => {
      toast.success("Threshold salvo", { description: "Configuração de alertas atualizada com sucesso." });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error("Erro ao salvar", { description: e.message }),
  });

  // Preencher campos quando o dialog abre
  const handleOpen = () => {
    if (port) {
      setBpsMaxMbps(port.alertBpsMax != null ? (port.alertBpsMax / 1_000_000).toString() : "");
      setRxMin(port.alertRxMin?.toString() ?? "");
      setRxMax(port.alertRxMax?.toString() ?? "");
    }
  };

  const handleSave = () => {
    if (!port) return;
    const bpsMax = bpsMaxMbps.trim() !== "" ? parseFloat(bpsMaxMbps) * 1_000_000 : null;
    const rxMinVal = rxMin.trim() !== "" ? parseFloat(rxMin) : null;
    const rxMaxVal = rxMax.trim() !== "" ? parseFloat(rxMax) : null;
    updateMutation.mutate({
      portId: port.id,
      alertBpsMax: bpsMax,
      alertRxMin: rxMinVal,
      alertRxMax: rxMaxVal,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) handleOpen();
        else onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Threshold — {port?.ifName || `ifIndex ${port?.ifIndex}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Threshold de Tráfego */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-orange-400" />
              Tráfego máximo (Mbps)
            </Label>
            <Input
              type="number"
              min="0"
              step="0.1"
              placeholder="Ex: 100 (deixe vazio para desativar)"
              value={bpsMaxMbps}
              onChange={(e) => setBpsMaxMbps(e.target.value)}
              className="bg-background border-border/50"
            />
            <p className="text-[11px] text-muted-foreground">
              Alerta será criado quando o tráfego ultrapassar este valor.
            </p>
          </div>

          {/* Threshold de Sinal GBIC */}
          {port?.gbicEnabled && (
            <>
              <div className="border-t border-border/30 pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Signal className="h-3.5 w-3.5 text-purple-400" />
                  Sinal GBIC / Óptico (dBm)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">RX mínimo (dBm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: -25"
                      value={rxMin}
                      onChange={(e) => setRxMin(e.target.value)}
                      className="bg-background border-border/50 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">RX máximo (dBm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: -3"
                      value={rxMax}
                      onChange={(e) => setRxMax(e.target.value)}
                      className="bg-background border-border/50 text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Alerta quando o sinal RX estiver fora do intervalo configurado.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border/50">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function NetworkEquipmentDetail() {
  const params = useParams<{ equipmentId: string }>();
  const equipmentId = parseInt(params.equipmentId ?? "0", 10);
  const [, setLocation] = useLocation();
  const [periodMinutes, setPeriodMinutes] = useState(60);
  const [thresholdPort, setThresholdPort] = useState<any | null>(null);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: detail, isLoading, refetch } = trpc.networkSnmp.getEquipmentDetail.useQuery(
    { equipmentId },
    { refetchInterval: 60_000, enabled: equipmentId > 0 }
  );

  const pollNowMutation = trpc.networkSnmp.pollNow.useMutation({
    onSuccess: () => {
      refetch();
      utils.networkSnmp.getPorts.invalidate({ equipmentId });
    },
  });

  const resolveAlertMutation = trpc.networkSnmp.resolveAlert.useMutation({
    onSuccess: () => refetch(),
  });

  if (!equipmentId || isNaN(equipmentId)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        ID de equipamento inválido.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Equipamento não encontrado ou sem monitoramento SNMP configurado.
      </div>
    );
  }

  const { equipment, config, ports, lastReading, activeAlerts } = detail;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/monitor-rede")}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Monitor de Rede
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{equipment.name}</h1>
            {config?.enabled && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10 text-xs">
                SNMP Ativo
              </Badge>
            )}
            {activeAlerts.length > 0 && (
              <Badge variant="outline" className="text-red-400 border-red-400/30 bg-red-400/10 text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                {activeAlerts.length} alerta{activeAlerts.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {equipment.manufacturer && `${equipment.manufacturer} · `}
            {equipment.ipAddress && `IP: ${equipment.ipAddress} · `}
            {config?.snmpHost && config.snmpHost !== equipment.ipAddress && `SNMP: ${config.snmpHost}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de Período */}
          <Select value={String(periodMinutes)} onValueChange={(v) => setPeriodMinutes(parseInt(v))}>
            <SelectTrigger className="w-44 bg-card border-border/50 text-sm gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.minutes} value={String(p.minutes)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-border/50"
            onClick={() => pollNowMutation.mutate({ equipmentId })}
            disabled={pollNowMutation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pollNowMutation.isPending ? "animate-spin" : ""}`} />
            Poll
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs text-muted-foreground">CPU</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {lastReading?.cpuPercent != null ? `${lastReading.cpuPercent.toFixed(0)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MemoryStick className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs text-muted-foreground">Memória</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {lastReading?.memPercent != null ? `${lastReading.memPercent.toFixed(0)}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Thermometer className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs text-muted-foreground">Temperatura</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {lastReading?.temperature != null ? `${lastReading.temperature.toFixed(0)}°C` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs text-muted-foreground">Uptime</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatUptime(lastReading?.uptimeSeconds)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Portas / Sistema / Alertas */}
      <Tabs defaultValue="ports">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="ports" className="text-xs gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            Portas ({ports.length})
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Sistema
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alertas {activeAlerts.length > 0 && `(${activeAlerts.length})`}
          </TabsTrigger>
        </TabsList>

        {/* Aba: Portas */}
        <TabsContent value="ports" className="mt-4">
          {ports.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Nenhuma porta descoberta via SNMP. Clique em "Poll" para forçar uma varredura.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {ports.map((port) => (
                <PortTrafficChart
                  key={port.id}
                  port={port}
                  periodMinutes={periodMinutes}
                  onConfigThreshold={(p) => {
                    setThresholdPort(p);
                    setThresholdOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Aba: Sistema */}
        <TabsContent value="system" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Métricas de Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SystemMetricsChart equipmentId={equipmentId} periodMinutes={periodMinutes} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Alertas */}
        <TabsContent value="alerts" className="mt-4">
          {activeAlerts.length === 0 ? (
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Nenhum alerta ativo para este equipamento.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <Card key={alert.id} className={`border ${getAlertSeverityColor(alert.severity)}`}>
                  <CardContent className="p-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${getAlertSeverityColor(alert.severity)}`}
                        >
                          {alert.severity}
                        </Badge>
                        <span className="text-xs font-medium">{getAlertTypeLabel(alert.alertType)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(alert.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => resolveAlertMutation.mutate({ alertId: alert.id })}
                      disabled={resolveAlertMutation.isPending}
                    >
                      Resolver
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de Threshold */}
      <ThresholdConfigDialog
        port={thresholdPort}
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        onSaved={() => {
          utils.networkSnmp.getPorts.invalidate({ equipmentId });
          utils.networkSnmp.getEquipmentDetail.invalidate({ equipmentId });
        }}
      />
    </div>
  );
}
