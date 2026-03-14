import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Network, RefreshCw, Save, AlertTriangle, CheckCircle2, Wifi, Globe, Shield } from "lucide-react";

interface NetworkInfo {
  interfaces: Array<{ name: string; ip: string; prefix: number; type: string }>;
  gateway: string;
  dns: string;
  activeIface: string;
}

export default function NetworkConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [iface, setIface] = useState("ens18");
  const [ip, setIp] = useState("");
  const [prefix, setPrefix] = useState("30");
  const [gateway, setGateway] = useState("");
  const [dns, setDns] = useState("8.8.8.8");

  const loadNetworkInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/network");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro ao carregar configuração de rede");
      }
      const data: NetworkInfo = await res.json();
      setNetworkInfo(data);
      // Preencher formulário com valores atuais
      if (data.interfaces.length > 0) {
        const primary = data.interfaces[0];
        setIface(primary.name);
        setIp(primary.ip);
        setPrefix(String(primary.prefix));
      }
      if (data.gateway) setGateway(data.gateway);
      if (data.dns) setDns(data.dns);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNetworkInfo();
  }, []);

  const prefixToMask = (p: number): string => {
    const mask = (0xffffffff << (32 - p)) >>> 0;
    return [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff].join(".");
  };

  const validateIp = (v: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every(n => parseInt(n) <= 255);

  const handleSave = async () => {
    if (!validateIp(ip)) { toast.error("IP inválido"); return; }
    if (!validateIp(gateway)) { toast.error("Gateway inválido"); return; }
    const prefixNum = parseInt(prefix);
    if (isNaN(prefixNum) || prefixNum < 1 || prefixNum > 32) { toast.error("Prefixo inválido (1-32)"); return; }

    const confirmed = window.confirm(
      `⚠️ ATENÇÃO: Você está prestes a alterar o IP do servidor.\n\n` +
      `Interface: ${iface}\n` +
      `Novo IP: ${ip}/${prefixNum}\n` +
      `Gateway: ${gateway}\n\n` +
      `Após a alteração, o sistema ficará acessível em:\nhttp://${ip}\n\n` +
      `Deseja continuar?`
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/system/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iface, ip, prefix: prefixNum, gateway, dns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao aplicar configuração");
      setSuccess(data.message);
      toast.success("Configuração de rede aplicada com sucesso!");
      // Recarregar após 2s para refletir novo IP
      setTimeout(() => loadNetworkInfo(), 2000);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Network className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Configuração de Rede</h1>
              <p className="text-sm text-muted-foreground">Altere o IP da interface de rede do servidor</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadNetworkInfo} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Aviso de segurança */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-300">Atenção antes de alterar</p>
            <p className="text-xs text-muted-foreground">
              Alterar o IP do servidor fará com que a conexão atual seja interrompida. Após a alteração, acesse o sistema pelo novo IP.
              Certifique-se de que o novo IP está disponível na rede e que o gateway está correto.
            </p>
          </div>
        </div>

        {/* Status atual */}
        {networkInfo && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4 text-emerald-400" />
                Configuração Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {networkInfo.interfaces.map((ifc) => (
                  <div key={ifc.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <div>
                        <p className="text-sm font-medium font-mono text-foreground">{ifc.name}</p>
                        <p className="text-xs text-muted-foreground">Máscara: {prefixToMask(ifc.prefix)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono text-primary">{ifc.ip}/{ifc.prefix}</p>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground">Gateway</p>
                    <p className="text-sm font-mono text-foreground">{networkInfo.gateway || "—"}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                    <p className="text-xs text-muted-foreground">DNS</p>
                    <p className="text-sm font-mono text-foreground">{networkInfo.dns || "—"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Formulário de configuração */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              Novo Endereço IP
            </CardTitle>
            <CardDescription>
              Preencha os campos abaixo com a nova configuração de rede. A alteração é aplicada imediatamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-3 py-6 justify-center text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span className="text-sm">Carregando configuração atual...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="iface">Interface de Rede</Label>
                  <Input
                    id="iface"
                    value={iface}
                    onChange={(e) => setIface(e.target.value)}
                    placeholder="ens18"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Interfaces disponíveis: {networkInfo?.interfaces.map(i => i.name).join(", ") || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="ip">Endereço IP</Label>
                    <Input
                      id="ip"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      placeholder="172.31.141.2"
                      className={`font-mono text-sm ${ip && !validateIp(ip) ? "border-red-500" : ""}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefix">Prefixo (CIDR)</Label>
                    <Input
                      id="prefix"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      placeholder="30"
                      className="font-mono text-sm"
                      type="number"
                      min={1}
                      max={32}
                    />
                  </div>
                </div>
                {prefix && !isNaN(parseInt(prefix)) && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    Máscara: <span className="font-mono">{prefixToMask(parseInt(prefix))}</span>
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="gateway">Gateway (Roteador)</Label>
                  <Input
                    id="gateway"
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
                    placeholder="172.31.141.1"
                    className={`font-mono text-sm ${gateway && !validateIp(gateway) ? "border-red-500" : ""}`}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dns">Servidor DNS</Label>
                  <Input
                    id="dns"
                    value={dns}
                    onChange={(e) => setDns(e.target.value)}
                    placeholder="8.8.8.8"
                    className="font-mono text-sm"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <p className="text-xs text-muted-foreground">Para múltiplos DNS, separe com espaço: <span className="font-mono">8.8.8.8 1.1.1.1</span></p>
                </div>

                {/* Preview do novo acesso */}
                {ip && validateIp(ip) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Globe className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-cyan-300 font-medium">Após a alteração, acesse:</p>
                      <p className="text-sm font-mono text-cyan-400 mt-0.5">http://{ip}</p>
                    </div>
                  </div>
                )}

                {/* Mensagem de sucesso */}
                {success && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-300">{success}</p>
                  </div>
                )}

                {/* Mensagem de erro */}
                {error && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{error}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    Apenas administradores podem alterar a rede
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !ip || !gateway || !validateIp(ip) || !validateIp(gateway)}
                    className="ml-auto gap-2"
                  >
                    {saving ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Aplicando...</>
                    ) : (
                      <><Save className="h-4 w-4" /> Aplicar Configuração</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
