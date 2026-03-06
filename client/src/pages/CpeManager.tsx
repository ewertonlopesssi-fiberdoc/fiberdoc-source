import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Cpu, Wifi, RefreshCw, Power, Settings, Search,
  Signal, Activity, AlertTriangle, CheckCircle, XCircle,
  Router, Eye, EyeOff, Save, TestTube, Info,
  ChevronRight, Zap, User, Lock, Globe,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface CpeDevice {
  id: string;
  manufacturer: string;
  modelName: string;
  softwareVersion: string | null;
  macAddress: string | null;
  wanIp: string | null;
  ssid24: string | null;
  rxPower: number | null;
  uptime: number | null;
  lastInform: number | null;
  isOnline: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatUptime(seconds: number | null): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatLastInform(ts: number | null): string {
  if (!ts) return "Nunca";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Agora mesmo";
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

function getRxPowerColor(dbm: number | null): string {
  if (dbm === null) return "text-slate-400";
  if (dbm >= -20) return "text-green-400";
  if (dbm >= -25) return "text-yellow-400";
  if (dbm >= -27) return "text-orange-400";
  return "text-red-400";
}

function getRxPowerLabel(dbm: number | null): string {
  if (dbm === null) return "—";
  if (dbm >= -20) return "Excelente";
  if (dbm >= -25) return "Bom";
  if (dbm >= -27) return "Fraco";
  return "Crítico";
}

// ─── Componente de Configuração GenieACS ─────────────────────────────────────
function GenieACSConfig({ onClose }: { onClose: () => void }) {
  const { data: config } = trpc.genieacs.getConfig.useQuery();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const saveConfig = trpc.genieacs.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const testConn = trpc.genieacs.testConnection.useMutation({
    onSuccess: (r: { success: boolean; message: string }) => {
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Preencher com dados actuais quando carregados
  if (config && !url) {
    setUrl(config.url);
    setUsername(config.username);
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300">
          <p className="font-medium mb-1">Como configurar:</p>
          <p>1. Execute o script <code className="bg-slate-700 px-1 rounded">install-genieacs.sh</code> no servidor</p>
          <p>2. URL padrão: <code className="bg-slate-700 px-1 rounded">http://127.0.0.1:7557</code> (mesmo servidor)</p>
          <p>3. Deixe utilizador/senha em branco se não configurou autenticação no GenieACS</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-slate-300 text-sm">URL da API GenieACS (NBI)</Label>
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="http://127.0.0.1:7557"
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Utilizador (opcional)</Label>
          <Input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
            className="mt-1 bg-slate-700 border-slate-600 text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Senha (opcional)</Label>
          <div className="relative mt-1">
            <Input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={config?.hasPassword ? "••••••••" : "Sem senha configurada"}
              className="bg-slate-700 border-slate-600 text-white pr-10"
            />
            <button
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => testConn.mutate()}
          disabled={testConn.isPending || !url}
          className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
        >
          <TestTube className="w-4 h-4 mr-2" />
          {testConn.isPending ? "Testando..." : "Testar Conexão"}
        </Button>
        <Button
          onClick={() => saveConfig.mutate({ url, username, password })}
          disabled={saveConfig.isPending || !url}
          className="bg-emerald-600 hover:bg-emerald-700 ml-auto"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveConfig.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ─── Painel de Detalhes da ONT ────────────────────────────────────────────────
function DevicePanel({ deviceId }: { deviceId: string }) {
  const [activeTab, setActiveTab] = useState("info");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPass, setWifiPass] = useState("");
  const [wifiBand, setWifiBand] = useState<"2.4" | "5" | "both">("2.4");
  const [pingHost, setPingHost] = useState("8.8.8.8");
  const [pingResult, setPingResult] = useState<any>(null);
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Configuração automática SGP
  const [pppoeLogin, setPppoeLogin] = useState("");
  const [pppoePassword, setPppoePassword] = useState("");
  const [showPppoePass, setShowPppoePass] = useState(false);
  const [wifiSsid2, setWifiSsid2] = useState("");
  const [wifiPassword2, setWifiPassword2] = useState("");
  const [wifiSsid5, setWifiSsid5] = useState("");
  const [wifiPassword5, setWifiPassword5] = useState("");
  const [showWifiPass2, setShowWifiPass2] = useState(false);
  const [showWifiPass5, setShowWifiPass5] = useState(false);
  const [configurePppoe, setConfigurePppoe] = useState(true);
  const [configureWifi, setConfigureWifi] = useState(true);
  const [useGenieacs, setUseGenieacs] = useState(true);
  const [configResult, setConfigResult] = useState<{ success: boolean; results: string[]; errors: string[] } | null>(null);
  const [sgpFilled, setSgpFilled] = useState(false);

  const { data: device, isLoading, refetch } = trpc.genieacs.getDevice.useQuery(
    { deviceId },
    { refetchInterval: 30000 }
  );

  const setWifi = trpc.genieacs.setWifi.useMutation({
    onSuccess: (r) => { toast.success(r.message); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reboot = trpc.genieacs.reboot.useMutation({
    onSuccess: (r) => { toast.success(r.message); setShowRebootConfirm(false); },
    onError: (e) => toast.error(e.message),
  });

  const factoryReset = trpc.genieacs.factoryReset.useMutation({
    onSuccess: (r) => { toast.success(r.message); setShowResetConfirm(false); },
    onError: (e) => toast.error(e.message),
  });

  const ping = trpc.genieacs.ping.useMutation({
    onSuccess: (r: any) => { setPingResult(r); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const refresh = trpc.genieacs.refreshDevice.useMutation({
    onSuccess: () => { toast.success("Actualização solicitada"); setTimeout(() => refetch(), 5000); },
    onError: (e) => toast.error(e.message),
  });

  // Buscar dados SGP
  const { data: sgpData, isLoading: sgpLoading } = (trpc as any).genieacs.getOnuFromSgp.useQuery(
    { deviceId },
    { retry: false, refetchOnWindowFocus: false,
      onSuccess: (d: any) => {
        if (d?.found && d?.data && !sgpFilled) {
          setSgpFilled(true);
          if (d.data.pppoeLogin) setPppoeLogin(d.data.pppoeLogin);
          if (d.data.wifiSsid) setWifiSsid2(d.data.wifiSsid);
          if (d.data.wifiSsid5) setWifiSsid5(d.data.wifiSsid5);
        }
      }
    }
  );

  const configureOntMut = (trpc as any).genieacs.configureOnt.useMutation({
    onSuccess: (r: any) => {
      setConfigResult(r);
      if (r.success) {
        toast.success(`ONT configurada! (${r.results.length} acções)`);
      } else {
        toast.error(`Configuração parcial: ${r.errors.join("; ")}`);
      }
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <XCircle className="w-10 h-10 mb-2" />
        <p>Dispositivo não encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header do dispositivo */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${device.isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="font-semibold text-white">{device.id}</span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{device.manufacturer} {device.modelName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh.mutate({ deviceId })}
          disabled={refresh.isPending}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${refresh.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-700/50 w-full">
          <TabsTrigger value="info" className="flex-1 text-xs">Info</TabsTrigger>
          <TabsTrigger value="configure" className="flex-1 text-xs flex items-center gap-1">
            <Zap className="w-3 h-3" />Config
          </TabsTrigger>
          <TabsTrigger value="wifi" className="flex-1 text-xs">Wi-Fi</TabsTrigger>
          <TabsTrigger value="ping" className="flex-1 text-xs">Ping</TabsTrigger>
          <TabsTrigger value="actions" className="flex-1 text-xs">Acções</TabsTrigger>
        </TabsList>

        {/* Aba Info */}
        <TabsContent value="info" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Sinal Óptico</div>
              <div className={`text-lg font-bold ${getRxPowerColor(device.rxPower)}`}>
                {device.rxPower !== null ? `${device.rxPower.toFixed(2)} dBm` : "—"}
              </div>
              <div className={`text-xs ${getRxPowerColor(device.rxPower)}`}>
                {getRxPowerLabel(device.rxPower)}
              </div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Uptime</div>
              <div className="text-lg font-bold text-white">{formatUptime(device.uptime)}</div>
              <div className="text-xs text-slate-400">Online</div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {[
              { label: "IP WAN", value: device.wanIp },
              { label: "MAC", value: device.macAddress },
              { label: "SSID 2.4GHz", value: device.ssid24 },
              { label: "SSID 5GHz", value: (device as any).ssid5 },
              { label: "Firmware", value: device.softwareVersion },
              { label: "Último Inform", value: formatLastInform(device.lastInform) },
            ].map(({ label, value }) => value ? (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">{label}</span>
                <span className="text-white font-mono text-xs">{value}</span>
              </div>
            ) : null)}
          </div>

          {/* Dispositivos conectados */}
          {(device as any).connectedDevices?.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2 font-medium">
                Dispositivos Wi-Fi Conectados ({(device as any).connectedDevices.length})
              </div>
              <div className="space-y-1">
                {(device as any).connectedDevices.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-slate-700/20 rounded px-2 py-1.5">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span className="font-mono text-slate-300">{d.mac}</span>
                    {d.signal && <span className="text-slate-500 ml-auto">{d.signal} dBm</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Aba Configuração Automática */}
        <TabsContent value="configure" className="space-y-3 mt-3">
          {/* Banner SGP */}
          {sgpLoading ? (
            <div className="bg-slate-700/30 rounded-lg p-3 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-400">Buscando dados no SGP...</span>
            </div>
          ) : (sgpData as any)?.found ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div className="text-xs text-green-300 space-y-0.5">
                <p className="font-medium">ONU encontrada no SGP</p>
                {(sgpData as any).data?.pppoeLogin && <p>Login PPPoE: <span className="font-mono">{(sgpData as any).data.pppoeLogin}</span></p>}
                {(sgpData as any).data?.address && <p>Endereço: {(sgpData as any).data.address}</p>}
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300">
                <p className="font-medium">ONU não encontrada no SGP</p>
                <p>Preencha os campos manualmente</p>
              </div>
            </div>
          )}

          {/* Toggle de opções */}
          <div className="flex gap-2">
            <button
              onClick={() => setConfigurePppoe(!configurePppoe)}
              className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                configurePppoe ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-700 border-slate-600 text-slate-400"
              }`}
            >
              <Globe className="w-3 h-3" /> PPPoE
            </button>
            <button
              onClick={() => setConfigureWifi(!configureWifi)}
              className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                configureWifi ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-700 border-slate-600 text-slate-400"
              }`}
            >
              <Wifi className="w-3 h-3" /> Wi-Fi
            </button>
            <button
              onClick={() => setUseGenieacs(!useGenieacs)}
              title={useGenieacs ? "Via TR-069 (GenieACS)" : "Via API SGP"}
              className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                useGenieacs ? "bg-emerald-700 border-emerald-600 text-white" : "bg-purple-700 border-purple-600 text-white"
              }`}
            >
              {useGenieacs ? "TR-069" : "SGP API"}
            </button>
          </div>

          {/* Campos PPPoE */}
          {configurePppoe && (
            <div className="space-y-2 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs font-medium text-slate-300 mb-2">
                <Globe className="w-3 h-3 text-blue-400" /> PPPoE WAN
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Login PPPoE</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <Input
                    value={pppoeLogin}
                    onChange={e => setPppoeLogin(e.target.value)}
                    placeholder="usuario@provedor.com.br"
                    className="pl-8 bg-slate-700 border-slate-600 text-white text-sm h-8"
                  />
                </div>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Senha PPPoE</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <Input
                    type={showPppoePass ? "text" : "password"}
                    value={pppoePassword}
                    onChange={e => setPppoePassword(e.target.value)}
                    placeholder="Senha PPPoE"
                    className="pl-8 pr-8 bg-slate-700 border-slate-600 text-white text-sm h-8"
                  />
                  <button onClick={() => setShowPppoePass(!showPppoePass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPppoePass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Campos Wi-Fi */}
          {configureWifi && (
            <div className="space-y-2 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs font-medium text-slate-300 mb-2">
                <Wifi className="w-3 h-3 text-emerald-400" /> Wi-Fi
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-slate-400 text-xs">SSID 2.4GHz</Label>
                  <Input value={wifiSsid2} onChange={e => setWifiSsid2(e.target.value)} placeholder="Nome da rede" className="mt-1 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Senha 2.4GHz</Label>
                  <div className="relative mt-1">
                    <Input type={showWifiPass2 ? "text" : "password"} value={wifiPassword2} onChange={e => setWifiPassword2(e.target.value)} placeholder="Senha Wi-Fi" className="pr-7 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                    <button onClick={() => setShowWifiPass2(!showWifiPass2)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                      {showWifiPass2 ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">SSID 5GHz</Label>
                  <Input value={wifiSsid5} onChange={e => setWifiSsid5(e.target.value)} placeholder="Nome 5GHz" className="mt-1 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                </div>
                <div>
                  <Label className="text-slate-400 text-xs">Senha 5GHz</Label>
                  <div className="relative mt-1">
                    <Input type={showWifiPass5 ? "text" : "password"} value={wifiPassword5} onChange={e => setWifiPassword5(e.target.value)} placeholder="Senha 5GHz" className="pr-7 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                    <button onClick={() => setShowWifiPass5(!showWifiPass5)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                      {showWifiPass5 ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resultado */}
          {configResult && (
            <div className={`rounded-lg p-3 space-y-1 text-xs ${
              configResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-amber-500/10 border border-amber-500/20"
            }`}>
              {configResult.results.map((r, i) => (
                <div key={i} className="flex items-center gap-1 text-green-300">
                  <CheckCircle className="w-3 h-3 shrink-0" /> {r}
                </div>
              ))}
              {configResult.errors.map((e, i) => (
                <div key={i} className="flex items-center gap-1 text-red-300">
                  <XCircle className="w-3 h-3 shrink-0" /> {e}
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={() => {
              setConfigResult(null);
              configureOntMut.mutate({
                deviceId,
                pppoeLogin: pppoeLogin || undefined,
                pppoePassword: pppoePassword || undefined,
                wifiSsid: wifiSsid2 || undefined,
                wifiPassword: wifiPassword2 || undefined,
                wifiSsid5: wifiSsid5 || undefined,
                wifiPassword5: wifiPassword5 || undefined,
                configurePppoe,
                configureWifi,
                useGenieacs,
              });
            }}
            disabled={configureOntMut.isPending || (!configurePppoe && !configureWifi)}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            {configureOntMut.isPending ? "Configurando..." : "Configurar ONT"}
          </Button>
        </TabsContent>

        {/* Aba Wi-Fi */}
        <TabsContent value="wifi" className="space-y-3 mt-3">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              A alteração do Wi-Fi é aplicada imediatamente na ONT. Os clientes conectados serão desconectados.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-slate-300 text-sm">Novo SSID (nome da rede)</Label>
              <Input
                value={wifiSsid}
                onChange={e => setWifiSsid(e.target.value)}
                placeholder={device.ssid24 || "Nome da rede Wi-Fi"}
                className="mt-1 bg-slate-700 border-slate-600 text-white"
                maxLength={32}
              />
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Nova Senha</Label>
              <div className="relative mt-1">
                <Input
                  type={showWifiPass ? "text" : "password"}
                  value={wifiPass}
                  onChange={e => setWifiPass(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="bg-slate-700 border-slate-600 text-white pr-10"
                  minLength={8}
                  maxLength={63}
                />
                <button
                  onClick={() => setShowWifiPass(!showWifiPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showWifiPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-slate-300 text-sm">Banda</Label>
              <div className="flex gap-2 mt-1">
                {(["2.4", "5", "both"] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setWifiBand(b)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                      wifiBand === b
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-slate-700 border-slate-600 text-slate-400 hover:text-white"
                    }`}
                  >
                    {b === "both" ? "Ambas" : `${b} GHz`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={() => setWifi.mutate({ deviceId, ssid: wifiSsid || undefined, password: wifiPass || undefined, band: wifiBand })}
            disabled={setWifi.isPending || (!wifiSsid && !wifiPass)}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            <Wifi className="w-4 h-4 mr-2" />
            {setWifi.isPending ? "Enviando..." : "Aplicar Configuração Wi-Fi"}
          </Button>
        </TabsContent>

        {/* Aba Ping */}
        <TabsContent value="ping" className="space-y-3 mt-3">
          <p className="text-xs text-slate-400">
            Executa um teste de ping a partir da ONT para verificar conectividade.
          </p>
          <div className="flex gap-2">
            <Input
              value={pingHost}
              onChange={e => setPingHost(e.target.value)}
              placeholder="8.8.8.8"
              className="bg-slate-700 border-slate-600 text-white"
            />
            <Button
              onClick={() => { setPingResult(null); ping.mutate({ deviceId, host: pingHost }); }}
              disabled={ping.isPending}
              className="bg-blue-600 hover:bg-blue-700 shrink-0"
            >
              {ping.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            </Button>
          </div>

          {pingResult && (
            <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                {pingResult.successCount > 0
                  ? <CheckCircle className="w-4 h-4 text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />
                }
                <span className="text-sm font-medium text-white">
                  {pingResult.host} — {pingResult.message || `${pingResult.successCount}/${(pingResult.successCount || 0) + (pingResult.failureCount || 0)} pacotes`}
                </span>
              </div>
              {pingResult.avgResponseTime !== undefined && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="text-slate-400">Mín</div>
                    <div className="text-white font-mono">{pingResult.minResponseTime}ms</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400">Méd</div>
                    <div className="text-white font-mono">{pingResult.avgResponseTime}ms</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400">Máx</div>
                    <div className="text-white font-mono">{pingResult.maxResponseTime}ms</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Aba Acções */}
        <TabsContent value="actions" className="space-y-3 mt-3">
          <div className="space-y-2">
            <button
              onClick={() => setShowRebootConfirm(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-left"
            >
              <Power className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-sm font-medium text-amber-300">Reiniciar ONT</div>
                <div className="text-xs text-slate-400">A ONT ficará offline por ~60 segundos</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-left"
            >
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <div className="text-sm font-medium text-red-300">Reset de Fábrica</div>
                <div className="text-xs text-slate-400">Apaga todas as configurações da ONT</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
            </button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmação Reboot */}
      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <Power className="w-6 h-6 text-amber-400" />
              <h3 className="font-semibold text-white">Confirmar Reinicialização</h3>
            </div>
            <p className="text-sm text-slate-300">
              A ONT <span className="text-white font-mono">{deviceId}</span> será reiniciada.
              O cliente ficará sem internet por aproximadamente 60 segundos.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowRebootConfirm(false)} className="flex-1 border-slate-600">
                Cancelar
              </Button>
              <Button
                onClick={() => reboot.mutate({ deviceId })}
                disabled={reboot.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {reboot.isPending ? "Enviando..." : "Reiniciar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação Factory Reset */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-red-500/30 rounded-xl p-5 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="font-semibold text-white">Reset de Fábrica</h3>
            </div>
            <p className="text-sm text-slate-300">
              <strong className="text-red-400">Atenção:</strong> Esta acção apaga todas as configurações da ONT
              <span className="text-white font-mono"> {deviceId}</span>. O cliente perderá a conexão e precisará de reconfiguração.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowResetConfirm(false)} className="flex-1 border-slate-600">
                Cancelar
              </Button>
              <Button
                onClick={() => factoryReset.mutate({ deviceId })}
                disabled={factoryReset.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {factoryReset.isPending ? "Enviando..." : "Confirmar Reset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function CpeManager() {
  const [search, setSearch] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._cpeSearchTimer);
    (window as any)._cpeSearchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  };

  const { data, isLoading, error, refetch } = trpc.genieacs.listDevices.useQuery({
    search: debouncedSearch || undefined,
    onlineOnly,
    limit: 100,
  });

  const devices: CpeDevice[] = data?.devices || [];
  const onlineCount = devices.filter(d => d.isOnline).length;

  return (
    <div className="flex h-full gap-4">
      {/* Painel esquerdo — lista */}
      <div className="w-80 shrink-0 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              CPE Manager
            </h1>
            <p className="text-xs text-slate-400">
              {isLoading ? "Carregando..." : `${onlineCount} online / ${devices.length} total`}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              className="text-slate-400 hover:text-white w-8 h-8"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowConfig(true)}
              className="text-slate-400 hover:text-white w-8 h-8"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Pesquisar por serial..."
              className="pl-9 bg-slate-700/50 border-slate-600 text-white text-sm"
            />
          </div>
          <button
            onClick={() => setOnlineOnly(!onlineOnly)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              onlineOnly
                ? "bg-green-500/15 border-green-500/30 text-green-400"
                : "bg-slate-700/30 border-slate-600 text-slate-400 hover:text-white"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${onlineOnly ? "bg-green-400" : "bg-slate-500"}`} />
            {onlineOnly ? "Mostrando apenas online" : "Mostrar apenas online"}
          </button>
        </div>

        {/* Lista de dispositivos */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
              <XCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
              <p className="text-xs text-red-300">Erro ao conectar ao GenieACS</p>
              <p className="text-xs text-slate-400 mt-1">Configure a URL nas Configurações</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfig(true)}
                className="mt-2 text-xs text-slate-400 hover:text-white"
              >
                <Settings className="w-3 h-3 mr-1" />
                Configurar
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          )}

          {!isLoading && !error && devices.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Router className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma ONT encontrada</p>
              <p className="text-xs mt-1">Configure as ONTs com o ACS URL do GenieACS</p>
            </div>
          )}

          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device.id === selectedDevice ? null : device.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedDevice === device.id
                  ? "bg-emerald-500/15 border-emerald-500/30"
                  : "bg-slate-700/20 border-slate-700/50 hover:bg-slate-700/40"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${device.isOnline ? "bg-green-400" : "bg-red-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono text-white truncate">{device.id}</span>
                    {device.rxPower !== null && (
                      <span className={`text-xs font-mono shrink-0 ${getRxPowerColor(device.rxPower)}`}>
                        {device.rxPower.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">{device.manufacturer} {device.modelName}</div>
                  {device.wanIp && (
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{device.wanIp}</div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatLastInform(device.lastInform)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Painel direito — detalhes */}
      <div className="flex-1 min-w-0">
        {selectedDevice ? (
          <Card className="bg-slate-800/50 border-slate-700 h-full overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Router className="w-4 h-4 text-emerald-400" />
                Detalhes da ONT
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DevicePanel deviceId={selectedDevice} />
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Cpu className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Seleccione uma ONT</p>
            <p className="text-sm mt-1">Clique numa ONT da lista para ver detalhes e gerir</p>
            <div className="mt-6 grid grid-cols-2 gap-3 max-w-md">
              {[
                { icon: Wifi, label: "Alterar Wi-Fi", desc: "SSID e senha remotamente" },
                { icon: Power, label: "Reiniciar ONT", desc: "Reboot remoto com confirmação" },
                { icon: Activity, label: "Ping Diagnóstico", desc: "Teste de conectividade da ONT" },
                { icon: Signal, label: "Sinal Óptico", desc: "RxPower em dBm em tempo real" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-slate-700/20 border border-slate-700/50 rounded-lg p-3">
                  <Icon className="w-5 h-5 text-emerald-400 mb-2" />
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialog de Configuração */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              Configuração GenieACS
            </DialogTitle>
          </DialogHeader>
          <GenieACSConfig onClose={() => setShowConfig(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
