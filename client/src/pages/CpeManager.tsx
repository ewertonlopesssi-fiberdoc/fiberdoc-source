import { useState, useEffect } from "react";
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
  Router, Eye, EyeOff, Globe, Gauge, Download, RotateCcw, Plug,
  Zap, User, Lock, Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface SgpOlt {
  id: number;
  name?: string;
  nome?: string;
  ident?: string;
  ip?: string;
}
interface SgpOnuItem {
  id: number;
  onu: number;
  slot: number;
  pon: number;
  olt_id?: number;
  olt_name?: string;
  login?: string | null;
  onu_login?: string | null;
  serial?: string | null;
  address?: string | null;
  signal?: string | null;
  connection?: string | null;
  status?: number | null;
  servico?: number | null;
  contrato?: number | null;
  wifi_ssid?: string | null;
  wifi_ssid5?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getOnuLogin(onu: SgpOnuItem): string {
  return onu.onu_login || onu.login || `ONU ${onu.onu}`;
}
function getOnuStatus(onu: SgpOnuItem): "online" | "offline" | "unknown" {
  if (onu.connection === "online" || onu.status === 1) return "online";
  if (onu.connection === "offline" || onu.status === 0) return "offline";
  return "unknown";
}
function getSignalColor(signal: string | null | undefined): string {
  if (!signal) return "text-slate-400";
  const val = parseFloat(signal);
  if (isNaN(val)) return "text-slate-400";
  if (val >= -20) return "text-green-400";
  if (val >= -25) return "text-yellow-400";
  if (val >= -27) return "text-orange-400";
  return "text-red-400";
}
function getSignalLabel(signal: string | null | undefined): string {
  if (!signal) return "—";
  const val = parseFloat(signal);
  if (isNaN(val)) return signal;
  if (val >= -20) return "Excelente";
  if (val >= -25) return "Bom";
  if (val >= -27) return "Fraco";
  return "Crítico";
}

// ─── Painel de Detalhes da ONU ────────────────────────────────────────────────
function OnuPanel({ onu }: { onu: SgpOnuItem }) {
  const [activeTab, setActiveTab] = useState("info");
  const [pppoeLogin, setPppoeLogin] = useState(onu.onu_login || onu.login || "");
  const [pppoePassword, setPppoePassword] = useState("");
  const [showPppoePass, setShowPppoePass] = useState(false);
  const [wifiSsid2, setWifiSsid2] = useState(onu.wifi_ssid || "");
  const [wifiPassword2, setWifiPassword2] = useState("");
  const [wifiSsid5, setWifiSsid5] = useState(onu.wifi_ssid5 || "");
  const [wifiPassword5, setWifiPassword5] = useState("");
  const [showWifiPass2, setShowWifiPass2] = useState(false);
  const [showWifiPass5, setShowWifiPass5] = useState(false);
  const [configurePppoe, setConfigurePppoe] = useState(true);
  const [configureWifi, setConfigureWifi] = useState(false);
  const [configResult, setConfigResult] = useState<{ success: boolean; results: string[]; errors: string[] } | null>(null);
  const [cpeResult, setCpeResult] = useState<{ action: string; success: boolean; message: string } | null>(null);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [genieResult, setGenieResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGenieRebootConfirm, setShowGenieRebootConfirm] = useState(false);
  const [genieWifiSsid2, setGenieWifiSsid2] = useState("");
  const [genieWifiPass2, setGenieWifiPass2] = useState("");
  const [genieWifiSsid5, setGenieWifiSsid5] = useState("");
  const [genieWifiPass5, setGenieWifiPass5] = useState("");
  const [showGenieWifiPass2, setShowGenieWifiPass2] = useState(false);
  const [showGenieWifiPass5, setShowGenieWifiPass5] = useState(false);
  const [geniePppoeLogin, setGeniePppoeLogin] = useState("");
  const [geniePppoePass, setGeniePppoePass] = useState("");
  const [showGeniePppoePass, setShowGeniePppoePass] = useState(false);
  const [genieSection, setGenieSection] = useState<"wifi" | "pppoe" | null>(null);

  const { data: detail, isLoading: detailLoading, refetch: refetchDetail } = (trpc as any).sgp.getOnuDetail.useQuery(
    { onuId: onu.id },
    { retry: false, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (detail) {
      if (detail.onu_login && !pppoeLogin) setPppoeLogin(detail.onu_login);
      if (detail.wifi_ssid && !wifiSsid2) setWifiSsid2(detail.wifi_ssid);
      if (detail.wifi_ssid5 && !wifiSsid5) setWifiSsid5(detail.wifi_ssid5);
    }
  }, [detail]);

  const configureOntMut = (trpc as any).sgp.configureOnt.useMutation({
    onSuccess: (r: any) => {
      setConfigResult(r);
      if (r.success) toast.success(`ONU configurada! (${r.results.length} ação(ões))`);
      else toast.error(`Configuração parcial: ${r.errors.join("; ")}`);
      refetchDetail();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mkCpeMut = (action: string) => (trpc as any).genieacs[action].useMutation({
    onSuccess: (r: any) => {
      const ok = r?.ok !== false && r?.success !== false;
      const msg = r?.message || r?.status || (typeof r === "string" ? r : JSON.stringify(r));
      setCpeResult({ action, success: ok, message: msg });
      if (ok) toast.success(`SGP: ${msg || "Comando enviado"}`);
      else toast.error(`SGP: ${msg || "Erro"}`);
    },
    onError: (e: any) => {
      setCpeResult({ action, success: false, message: e.message });
      toast.error(`SGP: ${e.message}`);
    },
  });

  const sgpCpePppoeMut = mkCpeMut("sgpCpePppoe");
  const sgpCpeWifiMut = mkCpeMut("sgpCpeWifi");
  const sgpCpeImportWifiMut = mkCpeMut("sgpCpeImportWifi");
  const sgpCpeSyncWanMut = mkCpeMut("sgpCpeSyncWan");
  const sgpCpePingMut = mkCpeMut("sgpCpePing");
  const sgpCpeSpeedTestMut = mkCpeMut("sgpCpeSpeedTest");
  const sgpCpeRebootMut = mkCpeMut("sgpCpeReboot");

  const sgpServiceId: number | null = (detail as any)?.servico ?? onu.servico ?? null;
  const status = getOnuStatus(onu);

  // ─── GenieACS Direto ──────────────────────────────────────────────────────
  const onuSerial: string | null = (detail as any)?.serial || onu.serial || null;
  const { data: genieDevice, isLoading: genieLoading, refetch: refetchGenie } = (trpc as any).genieacs.findDeviceBySerial.useQuery(
    { serial: onuSerial! },
    { enabled: !!onuSerial && activeTab === "cpe", retry: false, refetchOnWindowFocus: false }
  );
  const genieDeviceId: string | null = genieDevice?.deviceId || null;
  const genieDeviceInfo = genieDevice?.device || null;

  const genieSetWifiMut = (trpc as any).genieacs.setWifi.useMutation({
    onSuccess: (r: any) => {
      setGenieResult({ success: true, message: r?.message || "Wi-Fi configurado via TR-069" });
      toast.success("Wi-Fi enviado para a ONT via GenieACS");
    },
    onError: (e: any) => {
      setGenieResult({ success: false, message: e.message });
      toast.error(`GenieACS: ${e.message}`);
    },
  });

  const genieRebootMut = (trpc as any).genieacs.reboot.useMutation({
    onSuccess: (r: any) => {
      setGenieResult({ success: true, message: r?.message || "Reboot enviado para a ONT" });
      toast.success("Reboot enviado via GenieACS");
    },
    onError: (e: any) => {
      setGenieResult({ success: false, message: e.message });
      toast.error(`GenieACS: ${e.message}`);
    },
  });

  const genieRefreshMut = (trpc as any).genieacs.refreshDevice.useMutation({
    onSuccess: () => {
      setGenieResult({ success: true, message: "Refresh solicitado — aguarde o próximo Inform" });
      toast.success("Refresh enviado para a ONT");
      setTimeout(() => refetchGenie(), 5000);
    },
    onError: (e: any) => {
      setGenieResult({ success: false, message: e.message });
      toast.error(`GenieACS: ${e.message}`);
    },
  });

  const genieConfigureMut = (trpc as any).genieacs.configureOnt.useMutation({
    onSuccess: (r: any) => {
      const ok = r?.success !== false;
      const msg = r?.results?.join("; ") || r?.message || "Configuração enviada";
      setGenieResult({ success: ok, message: msg });
      if (ok) toast.success(`GenieACS: ${msg}`);
      else toast.error(`GenieACS: ${r?.errors?.join("; ") || msg}`);
    },
    onError: (e: any) => {
      setGenieResult({ success: false, message: e.message });
      toast.error(`GenieACS: ${e.message}`);
    },
  });

  // Preencher campos GenieACS com dados do SGP quando disponíveis
  useEffect(() => {
    if (detail && genieDeviceInfo) {
      if (!genieWifiSsid2 && (detail.wifi_ssid || onu.wifi_ssid)) setGenieWifiSsid2(detail.wifi_ssid || onu.wifi_ssid || "");
      if (!genieWifiSsid5 && (detail.wifi_ssid5 || onu.wifi_ssid5)) setGenieWifiSsid5(detail.wifi_ssid5 || onu.wifi_ssid5 || "");
      if (!geniePppoeLogin && (detail.onu_login || onu.onu_login)) setGeniePppoeLogin(detail.onu_login || onu.onu_login || "");
    }
  }, [detail, genieDeviceInfo]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              status === "online" ? "bg-green-400 animate-pulse" :
              status === "offline" ? "bg-red-400" : "bg-slate-500"
            }`} />
            <span className="font-semibold text-white">{getOnuLogin(onu)}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            OLT: {onu.olt_name || `ID ${onu.olt_id}`} · Slot {onu.slot} · PON {onu.pon} · ONU {onu.onu}
          </p>
          {onu.address && <p className="text-xs text-slate-500 mt-0.5">{onu.address}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetchDetail()} disabled={detailLoading} className="text-slate-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${detailLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-700/50 w-full">
          <TabsTrigger value="info" className="flex-1 text-xs">Info</TabsTrigger>
          <TabsTrigger value="configure" className="flex-1 text-xs flex items-center gap-1">
            <Zap className="w-3 h-3" />Config
          </TabsTrigger>
          <TabsTrigger value="cpe" className="flex-1 text-xs flex items-center gap-1">
            <Plug className="w-3 h-3" />CPE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-3 mt-3">
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Sinal Óptico</div>
                  <div className={`text-lg font-bold ${getSignalColor(onu.signal)}`}>
                    {onu.signal ? `${onu.signal} dBm` : "—"}
                  </div>
                  <div className={`text-xs ${getSignalColor(onu.signal)}`}>{getSignalLabel(onu.signal)}</div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Status</div>
                  <div className={`text-lg font-bold ${
                    status === "online" ? "text-green-400" :
                    status === "offline" ? "text-red-400" : "text-slate-400"
                  }`}>
                    {status === "online" ? "Online" : status === "offline" ? "Offline" : "—"}
                  </div>
                  <div className="text-xs text-slate-400">Conexão</div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { label: "Login PPPoE", value: (detail as any)?.onu_login || onu.onu_login || onu.login },
                  { label: "Serial", value: (detail as any)?.serial || onu.serial },
                  { label: "SSID 2.4GHz", value: (detail as any)?.wifi_ssid || onu.wifi_ssid },
                  { label: "SSID 5GHz", value: (detail as any)?.wifi_ssid5 || onu.wifi_ssid5 },
                  { label: "VLAN", value: (detail as any)?.vlan },
                  { label: "Contrato", value: onu.contrato ? `#${onu.contrato}` : null },
                  { label: "Serviço SGP", value: sgpServiceId ? `#${sgpServiceId}` : null },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-700/30">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-white font-mono text-xs">{value}</span>
                  </div>
                ) : null)}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="configure" className="space-y-3 mt-3">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">Configura PPPoE e Wi-Fi diretamente na ONU via API SGP.</p>
          </div>
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
          </div>
          {configurePppoe && (
            <div className="space-y-2 border border-slate-700/50 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs font-medium text-slate-300 mb-2">
                <Globe className="w-3 h-3 text-blue-400" /> PPPoE WAN
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Login PPPoE</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <Input value={pppoeLogin} onChange={e => setPppoeLogin(e.target.value)} placeholder="usuario@provedor.com.br" className="pl-8 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                </div>
              </div>
              <div>
                <Label className="text-slate-400 text-xs">Senha PPPoE</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <Input type={showPppoePass ? "text" : "password"} value={pppoePassword} onChange={e => setPppoePassword(e.target.value)} placeholder="Senha PPPoE" className="pl-8 pr-8 bg-slate-700 border-slate-600 text-white text-sm h-8" />
                  <button onClick={() => setShowPppoePass(!showPppoePass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPppoePass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )}
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
                    <Input type={showWifiPass2 ? "text" : "password"} value={wifiPassword2} onChange={e => setWifiPassword2(e.target.value)} placeholder="Senha" className="pr-7 bg-slate-700 border-slate-600 text-white text-sm h-8" />
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
          {configResult && (
            <div className={`rounded-lg p-3 space-y-1 text-xs ${configResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
              {configResult.results.map((r, i) => (
                <div key={i} className="flex items-center gap-1 text-green-300"><CheckCircle className="w-3 h-3 shrink-0" /> {r}</div>
              ))}
              {configResult.errors.map((e, i) => (
                <div key={i} className="flex items-center gap-1 text-red-300"><XCircle className="w-3 h-3 shrink-0" /> {e}</div>
              ))}
            </div>
          )}
          <Button
            onClick={() => {
              setConfigResult(null);
              configureOntMut.mutate({
                onuId: onu.id,
                configurePppoe,
                pppoeLogin: pppoeLogin || undefined,
                pppoePassword: pppoePassword || undefined,
                configureWifi,
                wifiSsid: wifiSsid2 || undefined,
                wifiPassword: wifiPassword2 || undefined,
                wifiSsid5: wifiSsid5 || undefined,
                wifiPassword5: wifiPassword5 || undefined,
              });
            }}
            disabled={configureOntMut.isPending || (!configurePppoe && !configureWifi)}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Zap className="w-4 h-4 mr-2" />
            {configureOntMut.isPending ? "Configurando..." : "Configurar ONU via SGP"}
          </Button>
        </TabsContent>

        <TabsContent value="cpe" className="space-y-3 mt-3">
          <div className="border border-purple-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                <Plug className="w-3.5 h-3.5" /> Gerenciador CPE SGP
              </div>
              {sgpServiceId ? (
                <span className="text-xs text-purple-400 font-mono">Serviço #{sgpServiceId}</span>
              ) : (
                <span className="text-xs text-slate-500">Serviço não vinculado</span>
              )}
            </div>
            {!sgpServiceId && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">ONU sem serviço SGP vinculado. Verifique o campo <span className="font-mono">servico</span> na ONU do SGP.</p>
              </div>
            )}
            {cpeResult && (
              <div className={`rounded p-2 text-xs flex items-start gap-1.5 ${cpeResult.success ? "bg-green-500/10 border border-green-500/20 text-green-300" : "bg-red-500/10 border border-red-500/20 text-red-300"}`}>
                {cpeResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span>{cpeResult.message}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "PPPoE", icon: Globe, mut: sgpCpePppoeMut },
                { label: "Wi-Fi", icon: Wifi, mut: sgpCpeWifiMut },
                { label: "Sync WAN", icon: RefreshCw, mut: sgpCpeSyncWanMut },
                { label: "Import Wi-Fi", icon: Download, mut: sgpCpeImportWifiMut },
                { label: "Ping", icon: Activity, mut: sgpCpePingMut },
                { label: "Speed Test", icon: Gauge, mut: sgpCpeSpeedTestMut },
              ].map(({ label, icon: Icon, mut }) => (
                <button
                  key={label}
                  onClick={() => { setCpeResult(null); sgpServiceId && mut.mutate({ servicoId: sgpServiceId }); }}
                  disabled={!sgpServiceId || mut.isPending}
                  className="flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors bg-purple-700/40 border-purple-600/50 text-purple-200 hover:bg-purple-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon className="w-3 h-3" />
                  {mut.isPending ? "..." : label}
                </button>
              ))}
              <button
                onClick={() => setShowRebootConfirm(true)}
                disabled={!sgpServiceId || sgpCpeRebootMut.isPending}
                className="col-span-2 flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors bg-amber-700/30 border-amber-600/40 text-amber-200 hover:bg-amber-700/60 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3 h-3" />
                {sgpCpeRebootMut.isPending ? "Reiniciando..." : "Reboot via SGP"}
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center">Comandos enviados via Gerenciador CPE do SGP</p>
          </div>

          {/* ─── GenieACS Direto (TR-069) ───────────────────────────────────────────────────────── */}
          <div className="border border-emerald-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Router className="w-3.5 h-3.5" /> GenieACS Direto (TR-069)
              </div>
              <button onClick={() => { setGenieResult(null); refetchGenie(); }} className="text-slate-400 hover:text-white">
                <RefreshCw className={`w-3.5 h-3.5 ${genieLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Status do dispositivo no GenieACS */}
            {genieLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Buscando no GenieACS...
              </div>
            ) : !onuSerial ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">Serial da ONU não disponível. Verifique o cadastro no SGP.</p>
              </div>
            ) : !genieDeviceId ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">ONT não encontrada no GenieACS. Serial: <span className="font-mono">{onuSerial}</span></p>
              </div>
            ) : (
              <>
                {/* Info do dispositivo */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-300 font-medium">{genieDeviceInfo?.manufacturer} {genieDeviceInfo?.modelName}</span>
                    <span className={`text-xs font-medium ${genieDeviceInfo?.isOnline ? "text-green-400" : "text-slate-400"}`}>
                      {genieDeviceInfo?.isOnline ? "● Online" : "○ Offline"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono truncate">{genieDeviceId}</div>
                  {genieDeviceInfo?.wanIp && (
                    <div className="text-xs text-slate-300">IP WAN: <span className="font-mono">{genieDeviceInfo.wanIp}</span></div>
                  )}
                  {genieDeviceInfo?.ssid24 && (
                    <div className="text-xs text-slate-300">SSID: <span className="font-mono">{genieDeviceInfo.ssid24}</span></div>
                  )}
                  {genieDeviceInfo?.rxPower !== null && genieDeviceInfo?.rxPower !== undefined && (
                    <div className={`text-xs font-medium ${genieDeviceInfo.rxPower >= -20 ? "text-green-400" : genieDeviceInfo.rxPower >= -25 ? "text-yellow-400" : "text-red-400"}`}>
                      Sinal: {genieDeviceInfo.rxPower} dBm
                    </div>
                  )}
                </div>

                {/* Resultado da última operação */}
                {genieResult && (
                  <div className={`rounded p-2 text-xs flex items-start gap-1.5 ${genieResult.success ? "bg-green-500/10 border border-green-500/20 text-green-300" : "bg-red-500/10 border border-red-500/20 text-red-300"}`}>
                    {genieResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    <span>{genieResult.message}</span>
                  </div>
                )}

                {/* Botões de seção */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setGenieSection(genieSection === "wifi" ? null : "wifi")}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                      genieSection === "wifi" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    <Wifi className="w-3 h-3" /> Wi-Fi
                  </button>
                  <button
                    onClick={() => setGenieSection(genieSection === "pppoe" ? null : "pppoe")}
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                      genieSection === "pppoe" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    <Globe className="w-3 h-3" /> PPPoE
                  </button>
                </div>

                {/* Formulário Wi-Fi */}
                {genieSection === "wifi" && (
                  <div className="space-y-2 border border-slate-700/50 rounded-lg p-2.5">
                    <p className="text-xs font-medium text-slate-300 flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-400" /> Configurar Wi-Fi via TR-069</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-slate-400 text-xs">SSID 2.4GHz</Label>
                        <Input value={genieWifiSsid2} onChange={e => setGenieWifiSsid2(e.target.value)} placeholder="Nome da rede" className="mt-1 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Senha 2.4GHz</Label>
                        <div className="relative mt-1">
                          <Input type={showGenieWifiPass2 ? "text" : "password"} value={genieWifiPass2} onChange={e => setGenieWifiPass2(e.target.value)} placeholder="Senha" className="pr-6 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                          <button onClick={() => setShowGenieWifiPass2(!showGenieWifiPass2)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
                            {showGenieWifiPass2 ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">SSID 5GHz</Label>
                        <Input value={genieWifiSsid5} onChange={e => setGenieWifiSsid5(e.target.value)} placeholder="Nome 5GHz" className="mt-1 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Senha 5GHz</Label>
                        <div className="relative mt-1">
                          <Input type={showGenieWifiPass5 ? "text" : "password"} value={genieWifiPass5} onChange={e => setGenieWifiPass5(e.target.value)} placeholder="Senha 5GHz" className="pr-6 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                          <button onClick={() => setShowGenieWifiPass5(!showGenieWifiPass5)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
                            {showGenieWifiPass5 ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setGenieResult(null);
                        const params: any = { deviceId: genieDeviceId!, band: "both" };
                        if (genieWifiSsid2) params.ssid = genieWifiSsid2;
                        if (genieWifiPass2) params.password = genieWifiPass2;
                        genieSetWifiMut.mutate(params);
                        // 5GHz separado se tiver SSID diferente
                        if (genieWifiSsid5 || genieWifiPass5) {
                          const params5: any = { deviceId: genieDeviceId!, band: "5" };
                          if (genieWifiSsid5) params5.ssid = genieWifiSsid5;
                          if (genieWifiPass5) params5.password = genieWifiPass5;
                          setTimeout(() => genieSetWifiMut.mutate(params5), 500);
                        }
                      }}
                      disabled={genieSetWifiMut.isPending || (!genieWifiSsid2 && !genieWifiPass2 && !genieWifiSsid5 && !genieWifiPass5)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                    >
                      <Wifi className="w-3 h-3 mr-1" />
                      {genieSetWifiMut.isPending ? "Enviando..." : "Aplicar Wi-Fi na ONT"}
                    </Button>
                  </div>
                )}

                {/* Formulário PPPoE */}
                {genieSection === "pppoe" && (
                  <div className="space-y-2 border border-slate-700/50 rounded-lg p-2.5">
                    <p className="text-xs font-medium text-slate-300 flex items-center gap-1"><Globe className="w-3 h-3 text-emerald-400" /> Configurar PPPoE via TR-069</p>
                    <div>
                      <Label className="text-slate-400 text-xs">Login PPPoE</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <Input value={geniePppoeLogin} onChange={e => setGeniePppoeLogin(e.target.value)} placeholder="usuario@provedor.com.br" className="pl-7 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-400 text-xs">Senha PPPoE</Label>
                      <div className="relative mt-1">
                        <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                        <Input type={showGeniePppoePass ? "text" : "password"} value={geniePppoePass} onChange={e => setGeniePppoePass(e.target.value)} placeholder="Senha PPPoE" className="pl-7 pr-6 bg-slate-700 border-slate-600 text-white text-xs h-7" />
                        <button onClick={() => setShowGeniePppoePass(!showGeniePppoePass)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400">
                          {showGeniePppoePass ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setGenieResult(null);
                        genieConfigureMut.mutate({
                          deviceId: genieDeviceId!,
                          useGenieacs: true,
                          configurePppoe: true,
                          pppoeLogin: geniePppoeLogin || undefined,
                          pppoePassword: geniePppoePass || undefined,
                          configureWifi: false,
                        });
                      }}
                      disabled={genieConfigureMut.isPending || !geniePppoeLogin}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                    >
                      <Globe className="w-3 h-3 mr-1" />
                      {genieConfigureMut.isPending ? "Enviando..." : "Aplicar PPPoE na ONT"}
                    </Button>
                  </div>
                )}

                {/* Ações rápidas */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => { setGenieResult(null); genieRefreshMut.mutate({ deviceId: genieDeviceId! }); }}
                    disabled={genieRefreshMut.isPending}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors bg-slate-700/60 border-slate-600/50 text-slate-200 hover:bg-slate-600 disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${genieRefreshMut.isPending ? "animate-spin" : ""}`} />
                    {genieRefreshMut.isPending ? "..." : "Refresh"}
                  </button>
                  <button
                    onClick={() => setShowGenieRebootConfirm(true)}
                    disabled={genieRebootMut.isPending}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors bg-amber-700/30 border-amber-600/40 text-amber-200 hover:bg-amber-700/60 disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {genieRebootMut.isPending ? "..." : "Reboot"}
                  </button>
                </div>
                <p className="text-xs text-slate-500 text-center">Comandos enviados diretamente via TR-069 (GenieACS NBI)</p>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {showGenieRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <Power className="w-6 h-6 text-amber-400" />
              <h3 className="font-semibold text-white">Confirmar Reboot via GenieACS</h3>
            </div>
            <p className="text-sm text-slate-300">
              A ONT <span className="text-white font-mono">{getOnuLogin(onu)}</span> será reiniciada diretamente via TR-069 (GenieACS).
              O cliente ficará sem internet por aproximadamente 60 segundos.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowGenieRebootConfirm(false)} className="flex-1 border-slate-600">Cancelar</Button>
              <Button
                onClick={() => {
                  setGenieResult(null);
                  if (genieDeviceId) genieRebootMut.mutate({ deviceId: genieDeviceId });
                  setShowGenieRebootConfirm(false);
                }}
                disabled={genieRebootMut.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {genieRebootMut.isPending ? "Enviando..." : "Reiniciar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <Power className="w-6 h-6 text-amber-400" />
              <h3 className="font-semibold text-white">Confirmar Reinicialização</h3>
            </div>
            <p className="text-sm text-slate-300">
              A ONU <span className="text-white font-mono">{getOnuLogin(onu)}</span> será reiniciada via SGP.
              O cliente ficará sem internet por aproximadamente 60 segundos.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowRebootConfirm(false)} className="flex-1 border-slate-600">Cancelar</Button>
              <Button
                onClick={() => {
                  if (sgpServiceId) { setCpeResult(null); sgpCpeRebootMut.mutate({ servicoId: sgpServiceId }); }
                  setShowRebootConfirm(false);
                }}
                disabled={sgpCpeRebootMut.isPending}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {sgpCpeRebootMut.isPending ? "Enviando..." : "Reiniciar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function CpeManager() {
  const [selectedOltId, setSelectedOltId] = useState<number | null>(null);
  const [selectedOnu, setSelectedOnu] = useState<SgpOnuItem | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._cpeSearchTimer);
    (window as any)._cpeSearchTimer = setTimeout(() => setDebouncedSearch(val), 400);
  };

  const { data: oltsData, isLoading: oltsLoading, error: oltsError, refetch: refetchOlts } = (trpc as any).sgp.listOlts.useQuery(
    undefined,
    { retry: false }
  );
  const olts: SgpOlt[] = (oltsData?.olts as SgpOlt[]) || [];

  const { data: onusData, isLoading: onusLoading, refetch: refetchOnus } = (trpc as any).sgp.listOnusByOlt.useQuery(
    { oltId: selectedOltId!, search: debouncedSearch || undefined, limit: 200 },
    { enabled: selectedOltId !== null, retry: false }
  );
  const onus: SgpOnuItem[] = (onusData?.onus as SgpOnuItem[]) || [];

  useEffect(() => {
    if (olts.length > 0 && selectedOltId === null) {
      setSelectedOltId(olts[0].id);
    }
  }, [olts]);

  useEffect(() => {
    setSelectedOnu(null);
  }, [selectedOltId]);

  const getOltName = (olt: SgpOlt) => olt.name || olt.nome || olt.ident || `OLT #${olt.id}`;

  return (
    <div className="flex h-full gap-4">
      <div className="w-80 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              CPE Manager
            </h1>
            <p className="text-xs text-slate-400">
              {onusLoading ? "Carregando..." : `${onus.length} ONU(s) encontrada(s)`}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => { refetchOlts(); if (selectedOltId) refetchOnus(); }} className="text-slate-400 hover:text-white w-8 h-8">
              <RefreshCw className={`w-4 h-4 ${oltsLoading || onusLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowConfig(true)} className="text-slate-400 hover:text-white w-8 h-8">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {oltsLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="w-3 h-3 animate-spin" /> Carregando OLTs...
          </div>
        ) : oltsError || oltsData?.error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
            <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-xs text-red-300">SGP não configurado ou inacessível</p>
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(true)} className="mt-1 text-xs text-slate-400 hover:text-white">
              <Settings className="w-3 h-3 mr-1" /> Configurar SGP
            </Button>
          </div>
        ) : olts.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">OLTs</p>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {olts.map(olt => (
                <button
                  key={olt.id}
                  onClick={() => setSelectedOltId(olt.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left ${
                    selectedOltId === olt.id
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-slate-700/20 border-slate-700/50 text-slate-300 hover:bg-slate-700/40"
                  }`}
                >
                  <Router className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{getOltName(olt)}</span>
                  {olt.ip && <span className="text-xs text-slate-500 ml-auto font-mono shrink-0">{olt.ip}</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-xs text-amber-300">Nenhuma OLT encontrada no SGP</p>
          </div>
        )}

        {selectedOltId !== null && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Buscar por login, serial..." className="pl-9 bg-slate-700/50 border-slate-600 text-white text-sm" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {onusLoading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          )}
          {!onusLoading && selectedOltId !== null && onus.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Router className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma ONU encontrada</p>
              {debouncedSearch && <p className="text-xs mt-1">Tente outro termo de busca</p>}
            </div>
          )}
          {!onusLoading && selectedOltId === null && (
            <div className="text-center py-12 text-slate-400">
              <Router className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecione uma OLT</p>
            </div>
          )}
          {onus.map(onu => {
            const status = getOnuStatus(onu);
            return (
              <button
                key={onu.id}
                onClick={() => setSelectedOnu(selectedOnu?.id === onu.id ? null : onu)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedOnu?.id === onu.id
                    ? "bg-emerald-500/15 border-emerald-500/30"
                    : "bg-slate-700/20 border-slate-700/50 hover:bg-slate-700/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    status === "online" ? "bg-green-400" :
                    status === "offline" ? "bg-red-400" : "bg-slate-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-mono text-white truncate">{getOnuLogin(onu)}</span>
                      {onu.signal && (
                        <span className={`text-xs font-mono shrink-0 ${getSignalColor(onu.signal)}`}>{onu.signal}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">Slot {onu.slot} · PON {onu.pon} · ONU {onu.onu}</div>
                    {onu.address && <div className="text-xs text-slate-500 truncate mt-0.5">{onu.address}</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {selectedOnu ? (
          <Card className="bg-slate-800/50 border-slate-700 h-full overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Router className="w-4 h-4 text-emerald-400" />
                Detalhes da ONU
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OnuPanel key={selectedOnu.id} onu={selectedOnu} />
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Cpu className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecione uma ONU</p>
            <p className="text-sm mt-1">Escolha uma OLT e clique numa ONU para ver detalhes e gerir</p>
            <div className="mt-6 grid grid-cols-2 gap-3 max-w-md">
              {[
                { icon: Wifi, label: "Configurar Wi-Fi", desc: "SSID e senha via SGP" },
                { icon: Globe, label: "Configurar PPPoE", desc: "Login WAN via SGP" },
                { icon: Activity, label: "Ping / Speed Test", desc: "Diagnóstico via CPE Manager" },
                { icon: Signal, label: "Sinal Óptico", desc: "RxPower em dBm" },
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

      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              Configuração SGP
            </DialogTitle>
          </DialogHeader>
          <SgpConfigPanel onClose={() => setShowConfig(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Painel de Configuração SGP ───────────────────────────────────────────────
function SgpConfigPanel({ onClose }: { onClose: () => void }) {
  const { data: config } = (trpc as any).sgp.config.useQuery();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [app, setApp] = useState("");
  const [showToken, setShowToken] = useState(false);

  const saveConfig = (trpc as any).sgp.saveConfig.useMutation({
    onSuccess: () => { toast.success("Configuração SGP salva com sucesso"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const testConn = (trpc as any).sgp.testConnection.useMutation({
    onSuccess: (r: any) => {
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl || "");
      setToken(config.token || "");
      setApp(config.app || "");
    }
  }, [config]);

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300">
          <p className="font-medium mb-1">Configuração do SGP:</p>
          <p>URL base do seu servidor SGP (ex: <code className="bg-slate-700 px-1 rounded">https://sgp.empresa.com.br</code>)</p>
          <p className="mt-1">Token e App são as credenciais de API do SGP.</p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <Label className="text-slate-300 text-sm">URL Base do SGP</Label>
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://sgp.empresa.com.br" className="mt-1 bg-slate-700 border-slate-600 text-white" />
        </div>
        <div>
          <Label className="text-slate-300 text-sm">Token de API</Label>
          <div className="relative mt-1">
            <Input type={showToken ? "text" : "password"} value={token} onChange={e => setToken(e.target.value)} placeholder="Token de autenticação SGP" className="bg-slate-700 border-slate-600 text-white pr-10" />
            <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <Label className="text-slate-300 text-sm">App (identificador)</Label>
          <Input value={app} onChange={e => setApp(e.target.value)} placeholder="Nome do app SGP" className="mt-1 bg-slate-700 border-slate-600 text-white" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => testConn.mutate()} disabled={testConn.isPending || !baseUrl} className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700">
          <Activity className="w-4 h-4 mr-2" />
          {testConn.isPending ? "Testando..." : "Testar Conexão"}
        </Button>
        <Button onClick={() => saveConfig.mutate({ baseUrl, token, app, active: true })} disabled={saveConfig.isPending || !baseUrl || !token || !app} className="bg-emerald-600 hover:bg-emerald-700 ml-auto">
          <CheckCircle className="w-4 h-4 mr-2" />
          {saveConfig.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
