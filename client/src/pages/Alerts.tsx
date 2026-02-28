import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bell, BellOff, CheckCircle, AlertTriangle, Thermometer, Zap,
  BatteryLow, Activity, WifiOff, RefreshCw, Clock, User, Radio,
  Settings, Save, Eye, EyeOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ALERT_TYPE_LABEL: Record<string, string> = {
  temp_high:        "Temperatura alta",
  voltage_low:      "Tensão de saída baixa",
  voltage_high:     "Tensão de saída alta",
  battery_low:      "Bateria baixa",
  battery_high:     "Bateria alta",
  current_high:     "Corrente alta",
  load_high:        "Carga alta",
  ac_fail:          "Falta de tensão AC",
  snmp_unreachable: "Equipamento inacessível via SNMP",
};

const ALERT_TYPE_UNIT: Record<string, string> = {
  temp_high:    "°C",
  voltage_low:  "V",
  voltage_high: "V",
  battery_low:  "V",
  battery_high: "V",
  current_high: "A",
  load_high:    "%",
  ac_fail:      "",
  snmp_unreachable: "",
};

const ALERT_TYPE_ICON: Record<string, React.ReactNode> = {
  temp_high:        <Thermometer className="h-4 w-4 text-orange-400" />,
  voltage_low:      <Zap className="h-4 w-4 text-blue-400" />,
  voltage_high:     <Zap className="h-4 w-4 text-yellow-400" />,
  battery_low:      <BatteryLow className="h-4 w-4 text-red-400" />,
  battery_high:     <BatteryLow className="h-4 w-4 text-yellow-400" />,
  current_high:     <Activity className="h-4 w-4 text-yellow-400" />,
  load_high:        <Activity className="h-4 w-4 text-orange-400" />,
  ac_fail:          <AlertTriangle className="h-4 w-4 text-red-400" />,
  snmp_unreachable: <WifiOff className="h-4 w-4 text-gray-400" />,
};

function severityBadge(severity: string) {
  if (severity === "critical")
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Crítico</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Aviso</Badge>;
}

function statusBadge(status: string) {
  if (status === "active")
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Ativo</Badge>;
  if (status === "acknowledged")
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">Reconhecido</Badge>;
  return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Resolvido</Badge>;
}

function formatDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ─── Componente de card de alerta ─────────────────────────────────────────────
function AlertCard({
  alert,
  isAdmin,
  onAck,
  onResolve,
}: {
  alert: any;
  isAdmin: boolean;
  onAck: (id: number) => void;
  onResolve: (id: number) => void;
}) {
  const unit = ALERT_TYPE_UNIT[alert.alertType] ?? "";
  const icon = ALERT_TYPE_ICON[alert.alertType] ?? <Bell className="h-4 w-4" />;
  const label = ALERT_TYPE_LABEL[alert.alertType] ?? alert.alertType;

  return (
    <Card className={`border-border/50 bg-card/80 ${alert.status === "active" ? "border-l-4 border-l-red-500" : alert.status === "acknowledged" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex-shrink-0">{icon}</div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">{label}</span>
                {severityBadge(alert.severity)}
                {statusBadge(alert.status)}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {alert.powerSourceName ?? `Fonte #${alert.powerSourceId}`}
                {alert.powerSourceLocation && (
                  <span className="text-muted-foreground/60"> — {alert.powerSourceLocation}</span>
                )}
              </p>
              {alert.message && (
                <p className="text-xs text-muted-foreground">{alert.message}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground/70 flex-wrap">
                {alert.currentValue != null && (
                  <span>Valor: <strong className="text-foreground">{alert.currentValue}{unit}</strong></span>
                )}
                {alert.thresholdValue != null && (
                  <span>Limite: <strong className="text-foreground">{alert.thresholdValue}{unit}</strong></span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatDate(alert.triggeredAt)}
                </span>
                {alert.acknowledgedBy && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> Reconhecido por {alert.acknowledgedBy}
                  </span>
                )}
                {alert.resolvedAt && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-400" /> Resolvido em {formatDate(alert.resolvedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {isAdmin && alert.status !== "resolved" && (
            <div className="flex gap-2 flex-shrink-0">
              {alert.status === "active" && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  onClick={() => onAck(alert.id)}
                >
                  <Bell className="h-3 w-3" /> Reconhecer
                </Button>
              )}
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={() => onResolve(alert.id)}
              >
                <CheckCircle className="h-3 w-3" /> Resolver
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Card de alerta de CTO ───────────────────────────────────────────────────
function CtoAlertCard({
  alert,
  isAdmin,
  onAck,
  onResolve,
}: {
  alert: any;
  isAdmin: boolean;
  onAck: (id: number) => void;
  onResolve: (id: number) => void;
}) {
  const isCritical = alert.severity === "critical";
  const isResolved = !!alert.resolvedAt;
  const isAcked = !!alert.acknowledgedAt && !isResolved;
  const borderColor = isResolved ? "border-l-green-500" : isAcked ? "border-l-blue-500" : isCritical ? "border-l-red-500" : "border-l-yellow-500";
  return (
    <Card className={`border-border/50 bg-card/80 border-l-4 ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Radio className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isCritical ? "text-red-400" : "text-yellow-400"}`} />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">{alert.ctoName}</span>
                {isCritical
                  ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Crítico</Badge>
                  : <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Aviso</Badge>}
                {isResolved
                  ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Resolvido</Badge>
                  : isAcked
                  ? <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">Reconhecido</Badge>
                  : <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Ativo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{alert.message}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground/70 flex-wrap">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(alert.createdAt)}</span>
                {alert.acknowledgedBy && <span className="flex items-center gap-1"><User className="h-3 w-3" />Reconhecido por {alert.acknowledgedBy}</span>}
              </div>
            </div>
          </div>
          {isAdmin && !isResolved && (
            <div className="flex gap-2 flex-shrink-0">
              {!isAcked && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAck(alert.id)}>
                  <Eye className="h-3 w-3" /> Reconhecer
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-400 border-green-500/30" onClick={() => onResolve(alert.id)}>
                <CheckCircle className="h-3 w-3" /> Resolver
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Alerts() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: activeAlerts = [], refetch: refetchActive, isLoading: loadingActive } =
    trpc.alerts.list.useQuery({ onlyActive: true, limit: 100 });

  const { data: allAlerts = [], refetch: refetchAll, isLoading: loadingAll } =
    trpc.alerts.list.useQuery({ limit: 200 });

  const { data: activeCount = 0 } = trpc.alerts.activeCount.useQuery();

  // ─── Alertas de CTOs ────────────────────────────────────────────────────────
  const { data: ctoActiveAlerts = [], refetch: refetchCtoActive } =
    trpc.ctoAlerts.list.useQuery({ onlyActive: true, limit: 100 });
  const { data: ctoAllAlerts = [], refetch: refetchCtoAll } =
    trpc.ctoAlerts.list.useQuery({ limit: 200 });
  const { data: ctoActiveCount = 0, refetch: refetchCtoCount } = trpc.ctoAlerts.activeCount.useQuery();
  const { data: ctoConfig, refetch: refetchCtoConfig } = trpc.ctoAlerts.getConfig.useQuery();

  const [ctoConfigForm, setCtoConfigForm] = useState({
    enabled: false,
    warningThreshold: 80,
    criticalThreshold: 90,
    checkIntervalMinutes: 60,
  });
  const [ctoConfigInit, setCtoConfigInit] = useState(false);
  if (ctoConfig && !ctoConfigInit) {
    setCtoConfigForm({
      enabled: ctoConfig.enabled ?? false,
      warningThreshold: ctoConfig.warningThreshold ?? 80,
      criticalThreshold: ctoConfig.criticalThreshold ?? 90,
      checkIntervalMinutes: ctoConfig.checkIntervalMinutes ?? 60,
    });
    setCtoConfigInit(true);
  }

  const ctoAckMut = trpc.ctoAlerts.acknowledge.useMutation({
    onSuccess: () => { refetchCtoActive(); refetchCtoAll(); refetchCtoCount(); toast.success("Alerta de CTO reconhecido."); },
    onError: (e) => toast.error(e.message),
  });
  const ctoResolveMut = trpc.ctoAlerts.resolve.useMutation({
    onSuccess: () => { refetchCtoActive(); refetchCtoAll(); refetchCtoCount(); toast.success("Alerta de CTO resolvido."); },
    onError: (e) => toast.error(e.message),
  });
  const ctoSaveConfigMut = trpc.ctoAlerts.saveConfig.useMutation({
    onSuccess: () => { refetchCtoConfig(); toast.success("Configuração de alertas de CTO salva!"); },
    onError: (e) => toast.error(e.message),
  });
  const ctoCheckMut = trpc.ctoAlerts.check.useMutation({
    onSuccess: (d) => { refetchCtoActive(); refetchCtoCount(); toast.success(`Verificação concluída. ${d.created} novo(s) alerta(s) criado(s).`); },
    onError: (e) => toast.error(e.message),
  });

  const [ctoResolveConfirmId, setCtoResolveConfirmId] = useState<number | null>(null);
  const ctoHistoryAlerts = ctoAllAlerts.filter((a: any) => !!a.resolvedAt);

  const ackMut = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => { refetchActive(); refetchAll(); toast.success("Alerta reconhecido."); },
    onError: (e) => toast.error(e.message),
  });
  const resolveMut = trpc.alerts.resolve.useMutation({
    onSuccess: () => { refetchActive(); refetchAll(); toast.success("Alerta marcado como resolvido."); },
    onError: (e) => toast.error(e.message),
  });

  const [resolveConfirmId, setResolveConfirmId] = useState<number | null>(null);

  const historyAlerts = allAlerts.filter((a: any) => a.status !== "active");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-orange-400" />
            Alertas SNMP
            {activeCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-1">{activeCount}</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de thresholds das fontes de energia. Notificações enviadas via Telegram.
          </p>
        </div>
        <Button
          variant="outline" size="sm"
          className="gap-2"
          onClick={() => { refetchActive(); refetchAll(); }}
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="ativos">
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1">
          <TabsTrigger value="ativos" className="gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            SNMP Ativos
            {activeCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-1 h-4 min-w-4 px-1">{activeCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1">
            <Clock className="h-3.5 w-3.5" />
            SNMP Histórico
          </TabsTrigger>
          <TabsTrigger value="cto-ativos" className="gap-1">
            <Radio className="h-3.5 w-3.5" />
            CTOs Ativos
            {ctoActiveCount > 0 && (
              <Badge className="bg-orange-500 text-white text-xs ml-1 h-4 min-w-4 px-1">{ctoActiveCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cto-historico" className="gap-1">
            <Clock className="h-3.5 w-3.5" />
            CTOs Histórico
          </TabsTrigger>
          <TabsTrigger value="cto-config" className="gap-1">
            <Settings className="h-3.5 w-3.5" />
            Config CTOs
          </TabsTrigger>
        </TabsList>

        {/* Alertas ativos */}
        <TabsContent value="ativos" className="mt-4 space-y-3">
          {loadingActive ? (
            <div className="text-center py-12 text-muted-foreground">Carregando alertas...</div>
          ) : activeAlerts.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BellOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum alerta ativo</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Todos os equipamentos estão operando dentro dos limites configurados.
                </p>
              </CardContent>
            </Card>
          ) : (
            activeAlerts.map((alert: any) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isAdmin={isAdmin}
                onAck={(id) => ackMut.mutate({ id })}
                onResolve={(id) => setResolveConfirmId(id)}
              />
            ))
          )}
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="historico" className="mt-4 space-y-3">
          {loadingAll ? (
            <div className="text-center py-12 text-muted-foreground">Carregando histórico...</div>
          ) : historyAlerts.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum alerta no histórico</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Alertas reconhecidos e resolvidos aparecerão aqui.
                </p>
              </CardContent>
            </Card>
          ) : (
            historyAlerts.map((alert: any) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isAdmin={isAdmin}
                onAck={(id) => ackMut.mutate({ id })}
                onResolve={(id) => setResolveConfirmId(id)}
              />
            ))
          )}
        </TabsContent>

        {/* CTOs Ativos */}
        <TabsContent value="cto-ativos" className="mt-4 space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => ctoCheckMut.mutate()} disabled={ctoCheckMut.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${ctoCheckMut.isPending ? 'animate-spin' : ''}`} />
                Verificar agora
              </Button>
            </div>
          )}
          {ctoActiveAlerts.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BellOff className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum alerta ativo de CTO</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Todas as CTOs estão com ocupação dentro dos limites configurados.
                </p>
                <Link href="/cto" className="mt-4">
                  <Button size="sm" variant="outline" className="gap-2">
                    <Radio className="h-3.5 w-3.5" /> Ver CTOs
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            ctoActiveAlerts.map((alert: any) => (
              <CtoAlertCard
                key={alert.id}
                alert={alert}
                isAdmin={isAdmin}
                onAck={(id) => ctoAckMut.mutate({ id })}
                onResolve={(id) => setCtoResolveConfirmId(id)}
              />
            ))
          )}
        </TabsContent>

        {/* CTOs Histórico */}
        <TabsContent value="cto-historico" className="mt-4 space-y-3">
          {ctoHistoryAlerts.length === 0 ? (
            <Card className="border-dashed border-border/50 bg-card/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">Nenhum alerta de CTO no histórico</p>
              </CardContent>
            </Card>
          ) : (
            ctoHistoryAlerts.map((alert: any) => (
              <CtoAlertCard
                key={alert.id}
                alert={alert}
                isAdmin={isAdmin}
                onAck={(id) => ctoAckMut.mutate({ id })}
                onResolve={(id) => setCtoResolveConfirmId(id)}
              />
            ))
          )}
        </TabsContent>

        {/* Config CTOs */}
        <TabsContent value="cto-config" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Configuração de Alertas de CTOs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Alertas de ocupação ativados</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Gerar alertas quando CTOs ultrapassarem os thresholds</p>
                </div>
                <Switch
                  checked={ctoConfigForm.enabled}
                  onCheckedChange={(v) => setCtoConfigForm(f => ({ ...f, enabled: v }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Threshold de aviso (%)</Label>
                  <Input
                    type="number" min={1} max={100}
                    value={ctoConfigForm.warningThreshold}
                    onChange={(e) => setCtoConfigForm(f => ({ ...f, warningThreshold: parseInt(e.target.value) || 80 }))}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Alerta amarelo acima deste valor</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Threshold crítico (%)</Label>
                  <Input
                    type="number" min={1} max={100}
                    value={ctoConfigForm.criticalThreshold}
                    onChange={(e) => setCtoConfigForm(f => ({ ...f, criticalThreshold: parseInt(e.target.value) || 90 }))}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Alerta vermelho acima deste valor</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo de verificação (min)</Label>
                  <Input
                    type="number" min={1} max={1440}
                    value={ctoConfigForm.checkIntervalMinutes}
                    onChange={(e) => setCtoConfigForm(f => ({ ...f, checkIntervalMinutes: parseInt(e.target.value) || 60 }))}
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Frequência de verificação automática</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm" className="gap-2"
                  onClick={() => ctoSaveConfigMut.mutate(ctoConfigForm)}
                  disabled={ctoSaveConfigMut.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  {ctoSaveConfigMut.isPending ? "Salvando..." : "Salvar configuração"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmação de resolução de CTO */}
      <AlertDialog open={!!ctoResolveConfirmId} onOpenChange={() => setCtoResolveConfirmId(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Resolver alerta de CTO?</AlertDialogTitle>
            <AlertDialogDescription>
              O alerta será fechado. Se a ocupação continuar alta, um novo alerta será gerado na próxima verificação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (ctoResolveConfirmId) ctoResolveMut.mutate({ id: ctoResolveConfirmId });
                setCtoResolveConfirmId(null);
              }}
            >
              Resolver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de resolução */}
      <AlertDialog open={!!resolveConfirmId} onOpenChange={() => setResolveConfirmId(null)}>
        <AlertDialogContent className="bg-card border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar alerta como resolvido?</AlertDialogTitle>
            <AlertDialogDescription>
              O alerta será fechado manualmente. Se o problema persistir, um novo alerta será gerado na próxima coleta SNMP.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (resolveConfirmId) resolveMut.mutate({ id: resolveConfirmId });
                setResolveConfirmId(null);
              }}
            >
              Marcar como resolvido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
