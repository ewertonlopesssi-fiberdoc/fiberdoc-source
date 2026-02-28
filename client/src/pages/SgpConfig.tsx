import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2, CheckCircle, XCircle, Loader2, ExternalLink, Info } from "lucide-react";

export default function SgpConfig() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: config, refetch } = trpc.sgp.config.useQuery();

  const [form, setForm] = useState({
    baseUrl: "",
    token: "",
    app: "",
    active: true,
  });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Preencher formulário quando config carregar
  useEffect(() => {
    if (config) {
      setForm({
        baseUrl: config.baseUrl ?? "",
        token: config.token ?? "",
        app: config.app ?? "",
        active: config.active ?? true,
      });
    }
  }, [config]);

  const saveMut = trpc.sgp.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração SGP salva com sucesso");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.baseUrl || !form.token || !form.app) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    saveMut.mutate(form);
  };

  const handleTest = async () => {
    if (!form.baseUrl || !form.token || !form.app) {
      toast.error("Preencha todos os campos antes de testar");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(`${form.baseUrl.replace(/\/$/, "")}/api/cliente/listar`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: form.token, app: form.app, cto: "TEST" }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 404 || res.status === 200) {
        setTestResult({ ok: true, message: `Conexão estabelecida (HTTP ${res.status})` });
      } else {
        setTestResult({ ok: false, message: `Erro HTTP ${res.status}` });
      }
    } catch (e: any) {
      // Tentar via backend
      try {
        const result = await (trpc as any).sgp.queryClientsByCto.query({ ctoName: "TEST" });
        if (result.error && result.error !== "SGP não configurado") {
          setTestResult({ ok: false, message: result.error });
        } else {
          setTestResult({ ok: true, message: "Conexão com SGP estabelecida" });
        }
      } catch {
        setTestResult({ ok: false, message: e.message ?? "Falha na conexão" });
      }
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-cyan-400" />
          Configuração SGP TSMx
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Integração com o sistema de gestão de provedores SGP para consulta de clientes por CTO
        </p>
      </div>

      {/* Status atual */}
      {config && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status atual:</span>
              {config.active ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" /> Ativo
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  <XCircle className="w-3 h-3 mr-1" /> Inativo
                </Badge>
              )}
            </div>
            {config.baseUrl && (
              <a
                href={config.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {config.baseUrl} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulário */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Parâmetros de Conexão</CardTitle>
          <CardDescription>
            Configure a URL base, token de autenticação e identificador do aplicativo SGP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>URL Base *</Label>
            <Input
              value={form.baseUrl}
              onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://sgp.seudominio.com.br"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              URL raiz do SGP TSMx, sem barra final
            </p>
          </div>

          <div className="space-y-1">
            <Label>Token *</Label>
            <Input
              value={form.token}
              onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
              placeholder="seu-token-de-api"
              type="password"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Token de autenticação da API SGP
            </p>
          </div>

          <div className="space-y-1">
            <Label>App *</Label>
            <Input
              value={form.app}
              onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
              placeholder="fiberdoc"
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              Identificador do aplicativo configurado no SGP
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                disabled={!isAdmin}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm">Integração ativa</span>
            </label>
          </div>

          {/* Resultado do teste */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {testResult.ok
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <XCircle className="w-4 h-4 flex-shrink-0" />
              }
              {testResult.message}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline" onClick={handleTest} disabled={testLoading}
                className="gap-2"
              >
                {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Testar Conexão
              </Button>
              <Button onClick={handleSave} disabled={saveMut.isPending} className="gap-2">
                {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar Configuração
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações de uso */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            Como funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Quando configurado, o FiberDoc consulta automaticamente o SGP TSMx para exibir os
            clientes conectados a cada CTO no mapa de infraestrutura.
          </p>
          <p>
            A consulta é feita via <code className="bg-muted px-1 rounded text-xs">POST /api/cliente/listar</code>{" "}
            com os parâmetros <code className="bg-muted px-1 rounded text-xs">token</code>,{" "}
            <code className="bg-muted px-1 rounded text-xs">app</code> e{" "}
            <code className="bg-muted px-1 rounded text-xs">cto</code> (nome da CTO).
          </p>
          <p>
            Os dados são exibidos em tempo real no painel lateral ao clicar em uma CTO no mapa.
            A integração é somente leitura — nenhum dado é alterado no SGP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
