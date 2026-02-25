import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Cable,
  CircuitBoard,
  GitBranch,
  Server,
  Wifi,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  switch: "Switch",
  olt: "OLT",
  dgo: "DGO",
  splitter: "Splitter",
  router: "Roteador",
  server: "Servidor",
  patch_panel: "Patch Panel",
  amplifier: "Amplificador",
  other: "Outro",
};

const HISTORY_ACTION_LABELS: Record<string, string> = {
  created: "Criado",
  updated: "Atualizado",
  deleted: "Removido",
  maintenance: "Manutenção",
  repaired: "Reparado",
  inspected: "Inspecionado",
};

const HISTORY_ENTITY_LABELS: Record<string, string> = {
  equipment: "Equipamento",
  fiber: "Fibra",
  port: "Porta",
  connection: "Conexão",
  room: "Sala",
};

const CHART_COLORS = [
  "oklch(0.65 0.18 210)",
  "oklch(0.60 0.18 145)",
  "oklch(0.75 0.18 75)",
  "oklch(0.65 0.18 290)",
  "oklch(0.70 0.18 195)",
  "oklch(0.60 0.20 15)",
  "oklch(0.65 0.18 30)",
  "oklch(0.55 0.18 240)",
];

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  color = "primary",
  onClick,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  subtitle?: string;
  color?: "primary" | "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const colorClasses = {
    primary: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    success: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    warning: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    danger: "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <Card
      className={`card-hover border-border/50 bg-card ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const portOccupancyData = [
    { name: "Livres", value: stats?.freePorts ?? 0, color: "oklch(0.60 0.18 145)" },
    { name: "Ocupadas", value: stats?.occupiedPorts ?? 0, color: "oklch(0.65 0.18 210)" },
    { name: "Outras", value: (stats?.totalPorts ?? 0) - (stats?.freePorts ?? 0) - (stats?.occupiedPorts ?? 0), color: "oklch(0.75 0.18 75)" },
  ].filter((d) => d.value > 0);

  const equipByTypeData = (stats?.equipmentByType ?? []).map((e, i) => ({
    name: EQUIPMENT_TYPE_LABELS[e.type] ?? e.type,
    value: e.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const portOccupancyRate = stats?.totalPorts
    ? Math.round((stats.occupiedPorts / stats.totalPorts) * 100)
    : 0;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão geral da infraestrutura de rede óptica
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400">Sistema Ativo</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Equipamentos"
          value={stats?.totalEquipments ?? 0}
          icon={Server}
          subtitle={`${stats?.activeEquipments ?? 0} ativos`}
          color="primary"
          onClick={() => setLocation("/equipamentos")}
        />
        <StatCard
          title="Fibras Ópticas"
          value={stats?.totalFibers ?? 0}
          icon={Cable}
          subtitle={`${stats?.activeFibers ?? 0} ativas`}
          color="success"
          onClick={() => setLocation("/fibras")}
        />
        <StatCard
          title="Portas"
          value={stats?.totalPorts ?? 0}
          icon={CircuitBoard}
          subtitle={`${portOccupancyRate}% de ocupação`}
          color={portOccupancyRate > 80 ? "danger" : portOccupancyRate > 60 ? "warning" : "primary"}
        />
        <StatCard
          title="Conexões"
          value={stats?.totalConnections ?? 0}
          icon={GitBranch}
          subtitle="conexões ativas"
          color="success"
          onClick={() => setLocation("/conexoes")}
        />
        <StatCard
          title="Portas Livres"
          value={stats?.freePorts ?? 0}
          icon={CheckCircle}
          subtitle="disponíveis"
          color="success"
        />
        <StatCard
          title="Portas Ocupadas"
          value={stats?.occupiedPorts ?? 0}
          icon={Activity}
          subtitle="em uso"
          color="primary"
        />
        <StatCard
          title="Salas / Locais"
          value={stats?.totalRooms ?? 0}
          icon={Wifi}
          subtitle="localizações"
          color="warning"
          onClick={() => setLocation("/salas")}
        />
        <StatCard
          title="Taxa de Ocupação"
          value={`${portOccupancyRate}%`}
          icon={TrendingUp}
          subtitle="das portas"
          color={portOccupancyRate > 80 ? "danger" : "primary"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equipment by Type */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Equipamentos por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {equipByTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={equipByTypeData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0.02 240)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.55 0.02 240)" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }}
                    cursor={{ fill: "oklch(0.65 0.18 210 / 0.1)" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {equipByTypeData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhum equipamento cadastrado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Port Occupancy Pie */}
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Ocupação de Portas</CardTitle>
          </CardHeader>
          <CardContent>
            {portOccupancyData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="60%" height={220}>
                  <PieChart>
                    <Pie
                      data={portOccupancyData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {portOccupancyData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "oklch(0.13 0.018 240)", border: "1px solid oklch(0.22 0.02 240)", borderRadius: "8px", color: "oklch(0.95 0.01 240)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3">
                  {portOccupancyData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <div>
                        <p className="text-xs font-medium text-foreground">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">{entry.value} portas</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma porta cadastrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent History */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Atividade Recente</CardTitle>
            <button
              onClick={() => setLocation("/historico")}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Ver tudo
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {(stats?.recentHistory ?? []).length > 0 ? (
            <div className="space-y-3">
              {stats?.recentHistory.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs h-4 px-1.5 border-border/50">
                        {HISTORY_ENTITY_LABELS[item.entityType] ?? item.entityType}
                      </Badge>
                      <Badge variant="outline" className="text-xs h-4 px-1.5 border-border/50">
                        {HISTORY_ACTION_LABELS[item.action] ?? item.action}
                      </Badge>
                      {item.performedBy && (
                        <span className="text-xs text-muted-foreground">por {item.performedBy}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nenhuma atividade registrada ainda
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
