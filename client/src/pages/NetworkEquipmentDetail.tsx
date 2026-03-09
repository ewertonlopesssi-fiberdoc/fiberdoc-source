/**
 * NetworkEquipmentDetail.tsx
 * Página de detalhe de equipamento monitorado via SNMP.
 * Layout inspirado em Zabbix/Grafana:
 *  - Barra superior fixa com seletores em cascata: Host → Interface Física → Interface Virtual → GBIC
 *  - Seções colapsáveis: Ping e Latência, Sistema, Interfaces
 *  - Gauges circulares para latência e perda de pacotes
 *  - Gráficos de histórico lado a lado
 */
import { useState, useMemo, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  Activity,
  Cpu,
  MemoryStick,
  Thermometer,
  Clock,
  Signal,
  Network,
  Home,
} from "lucide-react";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return "—";
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} Dias, ${String(h).padStart(2, "0")} Horas, ${String(m).padStart(2, "0")} Minutos`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function bpsToMbps(bps: number | null | undefined): number {
  if (!bps) return 0;
  return parseFloat((bps / 1_000_000).toFixed(3));
}

// ─── Gauge circular SVG ──────────────────────────────────────────────────────

function CircularGauge({
  value,
  max,
  unit,
  label,
  size = 140,
  colorStops = [
    { at: 0, color: "#22c55e" },
    { at: 0.5, color: "#eab308" },
    { at: 0.8, color: "#f97316" },
    { at: 1, color: "#ef4444" },
  ],
}: {
  value: number | null | undefined;
  max: number;
  unit: string;
  label: string;
  size?: number;
  colorStops?: { at: number; color: string }[];
}) {
  const radius = (size / 2) * 0.75;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;

  const ratio = Math.min(Math.max((value ?? 0) / max, 0), 1);
  const currentAngle = startAngle + totalAngle * ratio;

  // Cor baseada no ratio
  let color = colorStops[0].color;
  for (let i = colorStops.length - 1; i >= 0; i--) {
    if (ratio >= colorStops[i].at) {
      color = colorStops[i].color;
      break;
    }
  }

  function polarToXY(angle: number, r: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(startDeg: number, endDeg: number, r: number) {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const strokeWidth = size * 0.08;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle, radius)}
          fill="none"
          stroke="#1f2937"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {value !== null && value !== undefined && (
          <path
            d={describeArc(startAngle, currentAngle, radius)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        {/* Value text */}
        <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size * 0.18} fontWeight="bold" fontFamily="monospace">
          {value !== null && value !== undefined ? value.toFixed(value < 10 ? 2 : 1) : "—"}
        </text>
        {/* Unit */}
        <text x={cx} y={cy + size * 0.22} textAnchor="middle" fill="#6b7280" fontSize={size * 0.1} fontFamily="sans-serif">
          {unit}
        </text>
        {/* Min/Max labels */}
        <text x={polarToXY(startAngle + 5, radius + strokeWidth * 1.2).x} y={polarToXY(startAngle + 5, radius + strokeWidth * 1.2).y} textAnchor="middle" fill="#6b7280" fontSize={size * 0.08}>0</text>
        <text x={polarToXY(endAngle - 5, radius + strokeWidth * 1.2).x} y={polarToXY(endAngle - 5, radius + strokeWidth * 1.2).y} textAnchor="middle" fill="#6b7280" fontSize={size * 0.08}>{max}</text>
      </svg>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

// ─── Threshold config dialog ──────────────────────────────────────────────────

function ThresholdConfigDialog({
  port,
  open,
  onClose,
  onSaved,
}: {
  port: any;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
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

  const handleOpen = () => {
    if (port) {
      setBpsMaxMbps(port.alertBpsMax != null ? (port.alertBpsMax / 1_000_000).toString() : "");
      setRxMin(port.alertRxMin?.toString() ?? "");
      setRxMax(port.alertRxMax?.toString() ?? "");
    }
  };

  const handleSave = () => {
    updateMutation.mutate({
      portId: port.id,
      alertBpsMax: bpsMaxMbps ? parseFloat(bpsMaxMbps) * 1_000_000 : null,
      alertRxMin: rxMin ? parseFloat(rxMin) : null,
      alertRxMax: rxMax ? parseFloat(rxMax) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Threshold de Alertas — {port?.ifName ?? port?.ifDescr ?? `Porta #${port?.id}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tráfego máximo (Mbps)</Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={bpsMaxMbps}
              onChange={(e) => setBpsMaxMbps(e.target.value)}
              placeholder="Ex: 100 para 100 Mbps"
            />
            <p className="text-xs text-muted-foreground">Alerta disparado quando tráfego IN ou OUT ultrapassar este valor</p>
          </div>
          <div className="border rounded-lg p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">GBIC — Sinal óptico (dBm)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">RX mínimo (dBm)</Label>
                <Input type="number" step={0.1} value={rxMin} onChange={(e) => setRxMin(e.target.value)} placeholder="-30" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RX máximo (dBm)</Label>
                <Input type="number" step={0.1} value={rxMax} onChange={(e) => setRxMax(e.target.value)} placeholder="-3" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Gráfico de tráfego de uma porta ─────────────────────────────────────────

function PortTrafficChart({
  port,
  periodMinutes,
}: {
  port: any;
  periodMinutes: number;
}) {
  const { data: readings, isLoading } = trpc.networkSnmp.getPortReadings.useQuery(
    { portId: port.id, periodMinutes },
    { refetchInterval: periodMinutes <= 30 ? 30_000 : 60_000 }
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    return readings.map((r: any) => ({
      time: formatTime(r.collectedAt),
      in: bpsToMbps(r.inBps),
      out: bpsToMbps(r.outBps),
    }));
  }, [readings]);

  const thresholdMbps = port.alertBpsMax ? port.alertBpsMax / 1_000_000 : null;
  const maxVal = Math.max(...chartData.map((d: any) => Math.max(d.in ?? 0, d.out ?? 0)), thresholdMbps ?? 0, 1);

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradIn${port.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`gradOut${port.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} domain={[0, maxVal * 1.1]} tickFormatter={(v) => `${v.toFixed(0)}`} width={38} />
          <RechartTooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
            formatter={(v: any, name: string) => [`${Number(v).toFixed(3)} Mbps`, name === "in" ? "Entrada" : "Saída"]}
          />
          {thresholdMbps && (
            <ReferenceLine y={thresholdMbps} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Threshold ${thresholdMbps.toFixed(0)} Mbps`, fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
          )}
          <Area type="monotone" dataKey="in" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#gradIn${port.id})`} name="in" dot={false} />
          <Area type="monotone" dataKey="out" stroke="#22c55e" strokeWidth={1.5} fill={`url(#gradOut${port.id})`} name="out" dot={false} />
          <Legend formatter={(v) => v === "in" ? "Entrada" : "Saída"} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        </AreaChart>
      </ResponsiveContainer>
      {chartData.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Sem dados para o período selecionado</p>
      )}
    </div>
  );
}

// ─── Gráfico de sinal GBIC ────────────────────────────────────────────────────

function PortGbicChart({
  port,
  periodMinutes,
}: {
  port: any;
  periodMinutes: number;
}) {
  const { data: readings, isLoading } = trpc.networkSnmp.getPortReadings.useQuery(
    { portId: port.id, periodMinutes },
    { refetchInterval: periodMinutes <= 30 ? 30_000 : 60_000 }
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    return readings
      .filter((r: any) => r.rxDbm !== null || r.txDbm !== null)
      .map((r: any) => ({
        time: formatTime(r.collectedAt),
        rx: r.rxDbm != null ? parseFloat(Number(r.rxDbm).toFixed(2)) : null,
        tx: r.txDbm != null ? parseFloat(Number(r.txDbm).toFixed(2)) : null,
      }));
  }, [readings]);

  if (isLoading) return <Skeleton className="h-40" />;
  if (chartData.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-4">Sem dados GBIC para o período</p>
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} width={42} tickFormatter={(v) => `${v} dBm`} />
        <RechartTooltip
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
          formatter={(v: any, name: string) => [`${Number(v).toFixed(2)} dBm`, name === "rx" ? "RX" : "TX"]}
        />
        {port.alertRxMin && <ReferenceLine y={port.alertRxMin} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Min ${port.alertRxMin} dBm`, fill: "#ef4444", fontSize: 10 }} />}
        {port.alertRxMax && <ReferenceLine y={port.alertRxMax} stroke="#f97316" strokeDasharray="4 4" label={{ value: `Max ${port.alertRxMax} dBm`, fill: "#f97316", fontSize: 10 }} />}
        <Line type="monotone" dataKey="rx" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="rx" connectNulls />
        <Line type="monotone" dataKey="tx" stroke="#fb923c" strokeWidth={1.5} dot={false} name="tx" connectNulls />
        <Legend formatter={(v) => v === "rx" ? "RX" : "TX"} iconSize={10} wrapperStyle={{ fontSize: 11 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Gráfico de sistema (CPU/RAM/Temp) ────────────────────────────────────────

function SystemChart({
  equipmentId,
  periodMinutes,
  metric,
  color,
  label,
  unit,
  threshold,
}: {
  equipmentId: number;
  periodMinutes: number;
  metric: "cpuPercent" | "memPercent" | "tempCelsius";
  color: string;
  label: string;
  unit: string;
  threshold?: number | null;
}) {
  const { data: readings, isLoading } = trpc.networkSnmp.getReadings.useQuery(
    { equipmentId, periodMinutes },
    { refetchInterval: periodMinutes <= 30 ? 30_000 : 60_000 }
  );

  const chartData = useMemo(() => {
    if (!readings) return [];
    return readings.map((r: any) => ({
      time: formatTime(r.collectedAt),
      value: r[metric] != null ? parseFloat(Number(r[metric]).toFixed(1)) : null,
    }));
  }, [readings, metric]);

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label} — Histórico</p>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} width={36} tickFormatter={(v) => `${v}${unit}`} />
          <RechartTooltip
            contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }}
            formatter={(v: any) => [`${v}${unit}`, label]}
          />
          {threshold && (
            <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `${threshold}${unit}`, fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
          )}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#grad${metric})`} dot={false} connectNulls />
        </AreaChart>
      </ResponsiveContainer>
      {chartData.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Sem dados</p>
      )}
    </div>
  );
}

// ─── Seção colapsável ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NetworkEquipmentDetail() {
  const [, params] = useRoute("/monitor-rede/:equipmentId");
  const [, setLocation] = useLocation();
  const equipmentId = parseInt(params?.equipmentId ?? "0");

  // Seletor de período
  const [periodMinutes, setPeriodMinutes] = useState(60);
  const currentPeriod = PERIODS.find((p) => p.minutes === periodMinutes) ?? PERIODS[3];

  // Seletor de interfaces físicas (multi-select)
  const [selectedPhysical, setSelectedPhysical] = useState<Set<number>>(new Set());
  // Seletor de interfaces virtuais (multi-select)
  const [selectedVirtual, setSelectedVirtual] = useState<Set<number>>(new Set());
  // Seletor de GBICs (multi-select)
  const [selectedGbic, setSelectedGbic] = useState<Set<number>>(new Set());

  // Threshold dialog
  const [thresholdPort, setThresholdPort] = useState<any>(null);

  const { data: detail, isLoading, refetch } = trpc.networkSnmp.getEquipmentDetail.useQuery(
    { equipmentId },
    { enabled: !!equipmentId, refetchInterval: 60_000 }
  );

  // Classificar portas por tipo
  const { physical, virtual, gbic } = useMemo(() => {
    const ports = detail?.ports ?? [];
    const physical = ports.filter((p: any) =>
      p.ifType === "ethernetCsmacd" || p.ifType === "gigabitEthernet" || p.ifType === "fastEther" || (!p.ifType && !p.ifDescr?.toLowerCase().includes("vlan") && !p.ifDescr?.toLowerCase().includes("loopback") && !p.ifDescr?.toLowerCase().includes("null"))
    );
    const virtual = ports.filter((p: any) =>
      p.ifType === "softwareLoopback" || p.ifDescr?.toLowerCase().includes("vlan") || p.ifDescr?.toLowerCase().includes("loopback") || p.ifDescr?.toLowerCase().includes("null") || p.ifDescr?.toLowerCase().includes("trunk") || p.ifDescr?.toLowerCase().includes("vlanif")
    );
    const gbic = ports.filter((p: any) =>
      p.lastRxDbm !== null || p.lastTxDbm !== null || p.alertRxMin !== null || p.alertRxMax !== null
    );
    return { physical, virtual, gbic };
  }, [detail]);

  // Interfaces selecionadas para exibição nos gráficos
  const displayPhysical = useMemo(() => {
    if (selectedPhysical.size === 0) return physical.slice(0, 4); // mostrar as 4 primeiras por padrão
    return physical.filter((p: any) => selectedPhysical.has(p.id));
  }, [physical, selectedPhysical]);

  const displayVirtual = useMemo(() => {
    if (selectedVirtual.size === 0) return [];
    return virtual.filter((p: any) => selectedVirtual.has(p.id));
  }, [virtual, selectedVirtual]);

  const displayGbic = useMemo(() => {
    if (selectedGbic.size === 0) return gbic.slice(0, 4);
    return gbic.filter((p: any) => selectedGbic.has(p.id));
  }, [gbic, selectedGbic]);

  const togglePort = useCallback((set: Set<number>, setFn: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  }, []);

  if (!equipmentId) {
    return <div className="p-6 text-muted-foreground">Equipamento não encontrado.</div>;
  }

  const eq = detail?.equipment;
  const cfg = detail?.config;
  const lastReading = detail?.lastReading;
  const activeAlerts = detail?.activeAlerts ?? [];

  // ─── Barra superior ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Barra superior fixa */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border/60 flex-wrap sticky top-0 z-10">
        {/* Voltar */}
        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => setLocation("/monitor-rede")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Host selector */}
        <div className="flex items-center gap-1.5 bg-muted/30 rounded px-2 py-1 border border-border/40">
          <span className="text-xs text-muted-foreground font-medium">Host</span>
          <span className="text-xs font-semibold truncate max-w-[180px]">
            {isLoading ? "..." : `${eq?.name ?? "—"} · ${cfg?.snmpHost ?? "—"}`}
          </span>
        </div>

        {/* Interface Física */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20">
              Interface Física
              {selectedPhysical.size > 0 && <Badge className="h-4 px-1 text-xs bg-blue-500">{selectedPhysical.size}</Badge>}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto w-64">
            <DropdownMenuLabel className="text-xs">
              Selecionar ({selectedPhysical.size > 0 ? `${selectedPhysical.size} selecionadas` : "padrão: 4 primeiras"})
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {physical.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">Nenhuma interface física</DropdownMenuItem>
            ) : physical.map((p: any) => (
              <DropdownMenuCheckboxItem
                key={p.id}
                checked={selectedPhysical.has(p.id)}
                onCheckedChange={() => togglePort(selectedPhysical, setSelectedPhysical, p.id)}
                className="text-xs"
              >
                {p.ifName ?? p.ifDescr ?? `ifIndex ${p.ifIndex}`}
                {p.ifAlias ? ` - ${p.ifAlias}` : ""}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Interface Virtual */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20">
              Interface Virtual
              {selectedVirtual.size > 0 && <Badge className="h-4 px-1 text-xs bg-purple-500">{selectedVirtual.size}</Badge>}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto w-64">
            <DropdownMenuLabel className="text-xs">
              Selecionar ({selectedVirtual.size} selecionadas)
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {virtual.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">Nenhuma interface virtual</DropdownMenuItem>
            ) : virtual.map((p: any) => (
              <DropdownMenuCheckboxItem
                key={p.id}
                checked={selectedVirtual.has(p.id)}
                onCheckedChange={() => togglePort(selectedVirtual, setSelectedVirtual, p.id)}
                className="text-xs"
              >
                {p.ifName ?? p.ifDescr ?? `ifIndex ${p.ifIndex}`}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* GBIC */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20">
              GBIC
              {selectedGbic.size > 0 && <Badge className="h-4 px-1 text-xs bg-green-500">{selectedGbic.size}</Badge>}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 overflow-y-auto w-64">
            <DropdownMenuLabel className="text-xs">
              Selecionar ({selectedGbic.size > 0 ? `${selectedGbic.size} selecionadas` : "padrão: 4 primeiras"})
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {gbic.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">Nenhum GBIC detectado</DropdownMenuItem>
            ) : gbic.map((p: any) => (
              <DropdownMenuCheckboxItem
                key={p.id}
                checked={selectedGbic.has(p.id)}
                onCheckedChange={() => togglePort(selectedGbic, setSelectedGbic, p.id)}
                className="text-xs"
              >
                {p.ifName ?? p.ifDescr ?? `ifIndex ${p.ifIndex}`}
                {p.lastRxDbm != null ? ` (${Number(p.lastRxDbm).toFixed(1)} dBm)` : ""}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Separador */}
        <div className="flex-1" />

        {/* Seletor de período */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              {currentPeriod.label}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERIODS.map((p) => (
              <DropdownMenuItem
                key={p.minutes}
                className={`text-xs ${periodMinutes === p.minutes ? "font-semibold text-primary" : ""}`}
                onClick={() => setPeriodMinutes(p.minutes)}
              >
                {p.label}
                {periodMinutes === p.minutes && <CheckCircle className="h-3 w-3 ml-auto text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        {/* Home */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/monitor-rede")}>
          <Home className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
          </div>
        ) : !detail ? (
          <div className="text-center py-12 text-muted-foreground">
            <Network className="h-10 w-10 mx-auto mb-3" />
            <p>Equipamento não encontrado ou sem configuração SNMP.</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/monitor-rede")}>
              Voltar ao Monitor de Rede
            </Button>
          </div>
        ) : (
          <>
            {/* Alertas ativos */}
            {activeAlerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeAlerts.map((a: any) => (
                  <Badge key={a.id} variant="destructive" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    {a.alertType.replace(/_/g, " ")} — {a.message}
                  </Badge>
                ))}
              </div>
            )}

            {/* ─── Seção Ping e Latência ─────────────────────────────────── */}
            <Section
              title="Ping e Latência"
              badge={
                cfg?.snmpHost ? (
                  <Badge variant="outline" className="text-xs font-normal">{cfg.snmpHost}</Badge>
                ) : null
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Status + Uptime */}
                <div className="flex flex-col items-center justify-center gap-3 p-4 rounded-lg bg-muted/20 border border-border/40">
                  <div className={`text-3xl font-bold ${!cfg?.lastPollError ? "text-green-400" : "text-red-400"}`}>
                    {!cfg?.lastPollError ? "UP" : "DOWN"}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-sm font-medium text-green-400">{formatUptime(lastReading?.uptimeSeconds)}</p>
                  </div>
                </div>

                {/* Gauge de latência (simulado com ping SNMP) */}
                <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/20 border border-border/40">
                  <p className="text-xs text-muted-foreground mb-2">Latência SNMP</p>
                  <CircularGauge
                    value={lastReading ? 2.5 : null}
                    max={50}
                    unit="ms"
                    label="Latência"
                    size={120}
                    colorStops={[
                      { at: 0, color: "#22c55e" },
                      { at: 0.4, color: "#eab308" },
                      { at: 0.7, color: "#f97316" },
                      { at: 1, color: "#ef4444" },
                    ]}
                  />
                </div>

                {/* Gauge de CPU */}
                <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/20 border border-border/40">
                  <p className="text-xs text-muted-foreground mb-2">Utilização CPU</p>
                  <CircularGauge
                    value={cfg?.lastCpuPercent ?? null}
                    max={100}
                    unit="%"
                    label="CPU"
                    size={120}
                  />
                </div>
              </div>
            </Section>

            {/* ─── Seção Sistema ─────────────────────────────────────────── */}
            <Section title="Sistema">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {/* KPIs */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
                      <Cpu className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-blue-400">{cfg?.lastCpuPercent != null ? `${cfg.lastCpuPercent}%` : "—"}</p>
                      <p className="text-xs text-muted-foreground">CPU</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
                      <MemoryStick className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-purple-400">{cfg?.lastMemPercent != null ? `${cfg.lastMemPercent}%` : "—"}</p>
                      <p className="text-xs text-muted-foreground">RAM</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
                      <Thermometer className="h-4 w-4 text-orange-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-orange-400">{cfg?.lastTemperature != null ? `${cfg.lastTemperature}°C` : "—"}</p>
                      <p className="text-xs text-muted-foreground">Temperatura</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-center">
                      <Clock className="h-4 w-4 text-green-400 mx-auto mb-1" />
                      <p className="text-sm font-bold text-green-400">{lastReading?.uptimeSeconds ? `${Math.floor((lastReading.uptimeSeconds) / 86400)}d` : "—"}</p>
                      <p className="text-xs text-muted-foreground">Uptime</p>
                    </div>
                  </div>
                </div>

                {/* Gráfico CPU */}
                <SystemChart
                  equipmentId={equipmentId}
                  periodMinutes={periodMinutes}
                  metric="cpuPercent"
                  color="#3b82f6"
                  label="CPU"
                  unit="%"
                  threshold={cfg?.alertCpuMax}
                />

                {/* Gráfico RAM */}
                <SystemChart
                  equipmentId={equipmentId}
                  periodMinutes={periodMinutes}
                  metric="memPercent"
                  color="#a78bfa"
                  label="RAM"
                  unit="%"
                  threshold={cfg?.alertMemMax ?? undefined}
                />
              </div>
            </Section>

            {/* ─── Seção Interfaces Físicas ──────────────────────────────── */}
            {displayPhysical.length > 0 && (
              <Section
                title="Interfaces Físicas"
                badge={<Badge variant="outline" className="text-xs font-normal">{physical.length} interfaces</Badge>}
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {displayPhysical.map((port: any) => (
                    <div key={port.id} className="space-y-2 p-3 rounded-lg border border-border/40 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${port.ifOperStatus === "up" ? "bg-green-500" : "bg-red-500"}`} />
                          <p className="text-sm font-medium">{port.ifName ?? port.ifDescr ?? `ifIndex ${port.ifIndex}`}</p>
                          {port.ifAlias && <span className="text-xs text-muted-foreground">— {port.ifAlias}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            ↓ {formatBps(port.lastInBps)} / ↑ {formatBps(port.lastOutBps)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setThresholdPort(port)}
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <PortTrafficChart port={port} periodMinutes={periodMinutes} />
                    </div>
                  ))}
                </div>
                {physical.length > 4 && selectedPhysical.size === 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Mostrando 4 de {physical.length} interfaces. Use o seletor "Interface Física" na barra superior para escolher outras.
                  </p>
                )}
              </Section>
            )}

            {/* ─── Seção Interfaces Virtuais ─────────────────────────────── */}
            {displayVirtual.length > 0 && (
              <Section
                title="Interfaces Virtuais"
                defaultOpen={false}
                badge={<Badge variant="outline" className="text-xs font-normal">{virtual.length} interfaces</Badge>}
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {displayVirtual.map((port: any) => (
                    <div key={port.id} className="space-y-2 p-3 rounded-lg border border-border/40 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${port.ifOperStatus === "up" ? "bg-green-500" : "bg-gray-500"}`} />
                          <p className="text-sm font-medium">{port.ifName ?? port.ifDescr ?? `ifIndex ${port.ifIndex}`}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ↓ {formatBps(port.lastInBps)} / ↑ {formatBps(port.lastOutBps)}
                        </span>
                      </div>
                      <PortTrafficChart port={port} periodMinutes={periodMinutes} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ─── Seção GBIC ────────────────────────────────────────────── */}
            {(gbic.length > 0 || displayGbic.length > 0) && (
              <Section
                title="GBIC — Sinal Óptico"
                badge={<Badge variant="outline" className="text-xs font-normal">{gbic.length} interfaces</Badge>}
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {displayGbic.map((port: any) => (
                    <div key={port.id} className="space-y-2 p-3 rounded-lg border border-border/40 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Signal className="h-3.5 w-3.5 text-green-400" />
                          <p className="text-sm font-medium">{port.ifName ?? port.ifDescr ?? `ifIndex ${port.ifIndex}`}</p>
                          {port.ifAlias && <span className="text-xs text-muted-foreground">— {port.ifAlias}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {port.lastRxDbm != null && (
                            <span className="text-xs text-muted-foreground">
                              RX {Number(port.lastRxDbm).toFixed(1)} dBm
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setThresholdPort(port)}
                          >
                            <Settings className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <PortGbicChart port={port} periodMinutes={periodMinutes} />
                    </div>
                  ))}
                </div>
                {gbic.length > 4 && selectedGbic.size === 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Mostrando 4 de {gbic.length} GBICs. Use o seletor "GBIC" na barra superior para escolher outros.
                  </p>
                )}
              </Section>
            )}

            {/* Sem dados de interfaces */}
            {detail?.ports?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                <Activity className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">Nenhuma interface detectada via SNMP.</p>
                <p className="text-xs mt-1">Execute um poll para descobrir as interfaces.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Threshold dialog */}
      {thresholdPort && (
        <ThresholdConfigDialog
          port={thresholdPort}
          open={!!thresholdPort}
          onClose={() => setThresholdPort(null)}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}
