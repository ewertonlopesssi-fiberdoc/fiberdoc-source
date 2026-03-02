import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings2, CheckCircle, XCircle, Loader2, ExternalLink,
  RefreshCw, Download, ArrowLeftRight, Search, Wifi, WifiOff,
  Sparkles, Link2, History, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface SgpCto {
  id: number;
  ident?: string;
  nome?: string;
  note?: string;
  lat?: string | number | null;
  lng?: string | number | null;
  un_ports?: number;
  [key: string]: unknown;
}

export default function SgpConfig() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  // ─── Configuração ─────────────────────────────────────────────────────────
  const { data: config, refetch: refetchConfig } = trpc.sgp.config.useQuery();
  const [form, setForm] = useState({ baseUrl: "", token: "", app: "", active: true });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

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
    onSuccess: () => { toast.success("Configuração SGP salva com sucesso"); refetchConfig(); },
    onError: (e) => toast.error(e.message),
  });

  const testMut = trpc.sgp.testConnection.useMutation({
    onSuccess: (r) => {
      setTestResult(r.ok
        ? { ok: true, message: "Conexão com SGP estabelecida com sucesso" }
        : { ok: false, message: r.error ?? "Falha na conexão" });
      setTestLoading(false);
    },
    onError: (e) => { setTestResult({ ok: false, message: e.message }); setTestLoading(false); },
  });

  const handleSave = () => {
    if (!form.baseUrl || !form.token || !form.app) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    saveMut.mutate(form);
  };

  const handleTest = () => {
    setTestLoading(true);
    setTestResult(null);
    testMut.mutate();
  };

  // ─── Lista de CTOs do SGP ─────────────────────────────────────────────────
  const [showCtos, setShowCtos] = useState(false);
  const [ctoSearch, setCtoSearch] = useState("");
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // ─── Sincronizar todos (sugestões automáticas) ────────────────────────────
  const [showSuggest, setShowSuggest] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [bulkLinking, setBulkLinking] = useState(false);
  const { data: suggestData, isLoading: loadingSuggest, refetch: refetchSuggest } =
    trpc.sgp.suggestLinks.useQuery(undefined, { enabled: showSuggest && !!config?.active });
  const bulkLinkMut = trpc.sgp.bulkLink.useMutation({
    onSuccess: (r) => {
      setBulkLinking(false);
      toast.success(`${r.linked} CTO${r.linked !== 1 ? "s" : ""} vinculada${r.linked !== 1 ? "s" : ""} com sucesso`);
      setShowSuggest(false);
      setSelectedSuggestions(new Set());
      utils.ctos.list.invalidate();
      refetchSuggest();
    },
    onError: (e) => { setBulkLinking(false); toast.error(e.message); },
  });
  const suggestions = suggestData?.suggestions ?? [];
  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const handleBulkLink = () => {
    const links = Array.from(selectedSuggestions).map(idx => ({
      ctoId: suggestions[idx].localCtoId,
      sgpId: suggestions[idx].sgpId,
    }));
    if (links.length === 0) { toast.error("Selecione ao menos uma sugestão"); return; }
    setBulkLinking(true);
    bulkLinkMut.mutate({ links });
  };

  const { data: sgpCtosData, isLoading: loadingCtos, refetch: refetchCtos } =
    trpc.sgp.listCtos.useQuery(undefined, { enabled: showCtos && !!config?.active });

  const { data: fiberCtos } = trpc.ctos.list.useQuery(undefined, { enabled: showCtos });

  const syncMut = trpc.sgp.syncCtoFromSgp.useMutation({
    onSuccess: (r) => {
      setSyncingId(null);
      if (r.created) {
        toast.success(`CTO "${r.id}" importada com sucesso`);
        utils.ctos.list.invalidate();
      } else {
        toast.info(r.message);
      }
    },
    onError: (e) => { setSyncingId(null); toast.error(e.message); },
  });

  const sgpCtos: SgpCto[] = (sgpCtosData?.ctos ?? []) as SgpCto[];
  const filteredCtos = sgpCtos.filter(c => {
    const name = (c.ident ?? c.nome ?? "").toLowerCase();
    return name.includes(ctoSearch.toLowerCase());
  });

  const isSynced = (sgpCto: SgpCto) => {
    const name = sgpCto.ident ?? sgpCto.nome ?? "";
    return (fiberCtos ?? []).some(
      (fc: { name: string; sgpId?: number | null }) =>
        fc.name === name || fc.sgpId === sgpCto.id
    );
  };

  const handleSync = (cto: SgpCto) => {
    setSyncingId(cto.id);
    syncMut.mutate({
      sgpId: cto.id,
      ident: cto.ident ?? cto.nome ?? `CTO-${cto.id}`,
      note: cto.note ?? "",
      lat: cto.lat != null ? Number(cto.lat) : null,
      lng: cto.lng != null ? Number(cto.lng) : null,
      unPorts: cto.un_ports ?? 8,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-cyan-400" />
          Integração SGP
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sincronização bidirecional com o SGP TSMx — importar CTOs, visualizar ONUs e clientes
        </p>
      </div>

      {/* Status atual */}
      {config && (
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Status:</span>
              {config.active ? (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" /> Ativo
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  <XCircle className="w-3 h-3 mr-1" /> Inativo
                </Badge>
              )}
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
            </div>
            {config.active && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => { setShowCtos(v => !v); if (!showCtos) refetchCtos(); }}
              >
                <ArrowLeftRight className="w-4 h-4" />
                {showCtos ? "Ocultar CTOs SGP" : "Sincronizar CTOs"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sincronizar todos — sugestões automáticas */}
      {isAdmin && config?.active && (
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Sincronizar Todos
                </CardTitle>
                <CardDescription>
                  Sugestões automáticas de vínculo por semelhança de nome entre CTOs locais e do SGP
                </CardDescription>
              </div>
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => { setShowSuggest(v => !v); if (!showSuggest) refetchSuggest(); }}
              >
                {showSuggest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showSuggest ? "Ocultar sugestões" : "Ver sugestões"}
              </Button>
            </div>
          </CardHeader>
          {showSuggest && (
            <CardContent className="space-y-3">
              {loadingSuggest ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> A analisar CTOs...
                </div>
              ) : suggestData?.error ? (
                <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                  <XCircle className="w-4 h-4 flex-shrink-0" /> {suggestData.error}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                  Todas as CTOs locais já estão vinculadas ou não há correspondências no SGP
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{suggestions.length} sugestão{suggestions.length !== 1 ? "ões" : ""} encontrada{suggestions.length !== 1 ? "s" : ""}</span>
                    <button
                      className="text-cyan-400 hover:text-cyan-300 underline"
                      onClick={() => setSelectedSuggestions(
                        selectedSuggestions.size === suggestions.length
                          ? new Set()
                          : new Set(suggestions.map((_, i) => i))
                      )}
                    >
                      {selectedSuggestions.size === suggestions.length ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  </div>
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-3 w-8"></th>
                          <th className="text-left p-3 font-medium text-muted-foreground">CTO Local</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">CTO SGP</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Confiança</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {suggestions.map((s, idx) => (
                          <tr
                            key={idx}
                            className={`transition-colors cursor-pointer ${
                              selectedSuggestions.has(idx) ? "bg-cyan-500/10" : "hover:bg-muted/30"
                            }`}
                            onClick={() => toggleSuggestion(idx)}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedSuggestions.has(idx)}
                                onChange={() => toggleSuggestion(idx)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 rounded border-border accent-cyan-500"
                              />
                            </td>
                            <td className="p-3 font-medium">{s.localCtoName}</td>
                            <td className="p-3 text-muted-foreground">
                              <span className="font-mono text-xs text-cyan-400 mr-1">#{s.sgpId}</span>
                              {s.sgpName}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      s.score >= 90 ? "bg-emerald-400" :
                                      s.score >= 70 ? "bg-amber-400" : "bg-orange-400"
                                    }`}
                                    style={{ width: `${s.score}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-mono ${
                                  s.score >= 90 ? "text-emerald-400" :
                                  s.score >= 70 ? "text-amber-400" : "text-orange-400"
                                }`}>{s.score}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      onClick={handleBulkLink}
                      disabled={bulkLinking || selectedSuggestions.size === 0}
                      className="gap-2"
                    >
                      {bulkLinking
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Link2 className="w-4 h-4" />}
                      Vincular {selectedSuggestions.size > 0 ? `(${selectedSuggestions.size})` : "selecionados"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Lista de CTOs do SGP */}
      {showCtos && (
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  CTOs no SGP
                </CardTitle>
                <CardDescription>
                  Importe CTOs do SGP para o FiberDoc ou verifique quais já estão sincronizadas
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchCtos()} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${loadingCtos ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {sgpCtosData?.error && (
              <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                {sgpCtosData.error}
              </div>
            )}

            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar CTOs..."
                value={ctoSearch}
                onChange={e => setCtoSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Resumo */}
            {sgpCtos.length > 0 && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{sgpCtos.length} CTOs no SGP</span>
                <span>{sgpCtos.filter(c => isSynced(c)).length} sincronizadas</span>
                <span>{sgpCtos.filter(c => !isSynced(c)).length} pendentes</span>
              </div>
            )}

            {/* Tabela */}
            {loadingCtos ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Carregando CTOs do SGP...
              </div>
            ) : filteredCtos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {sgpCtos.length === 0 ? "Nenhuma CTO encontrada no SGP" : "Nenhuma CTO corresponde ao filtro"}
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium text-muted-foreground">ID SGP</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Identificador</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Portas</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      {isAdmin && <th className="text-right p-3 font-medium text-muted-foreground">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredCtos.map(cto => {
                      const synced = isSynced(cto);
                      const name = cto.ident ?? cto.nome ?? `CTO-${cto.id}`;
                      return (
                        <tr key={cto.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-muted-foreground font-mono text-xs">{cto.id}</td>
                          <td className="p-3 font-medium">{name}</td>
                          <td className="p-3 text-muted-foreground">{cto.un_ports ?? "—"}</td>
                          <td className="p-3">
                            {synced ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1" /> Sincronizada
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                                Pendente
                              </Badge>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="p-3 text-right">
                              {!synced && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-xs h-7"
                                  disabled={syncingId === cto.id}
                                  onClick={() => handleSync(cto)}
                                >
                                  {syncingId === cto.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Download className="w-3 h-3" />}
                                  Importar
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulário de configuração */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Parâmetros de Conexão</CardTitle>
          <CardDescription>
            Configure a URL base, token de autenticação e identificador do aplicativo SGP.
            Cada instalação do FiberDoc pode ter suas próprias credenciais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1">
              <Label>URL Base *</Label>
              <Input
                value={form.baseUrl}
                onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://suporti.sgp.tsmx.com.br"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">URL raiz do SGP TSMx, sem barra final</p>
            </div>

            <div className="space-y-1">
              <Label>Token *</Label>
              <Input
                value={form.token}
                onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
                placeholder="fcc73f94-2aaa-4ac6-abbb-..."
                type="password"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">Token de autenticação da API SGP</p>
            </div>

            <div className="space-y-1">
              <Label>App *</Label>
              <Input
                value={form.app}
                onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
                placeholder="fiberdoc"
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">Identificador do aplicativo no SGP</p>
            </div>
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
                ? <Wifi className="w-4 h-4 flex-shrink-0" />
                : <WifiOff className="w-4 h-4 flex-shrink-0" />}
              {testResult.message}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-3 pt-2 flex-wrap">
              <Button
                variant="outline" onClick={handleTest}
                disabled={testLoading || testMut.isPending}
                className="gap-2"
              >
                {(testLoading || testMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
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

      {/* Funcionalidades disponíveis */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Funcionalidades da Integração</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            { icon: <ArrowLeftRight className="w-4 h-4 text-cyan-400" />, title: "Sincronização de CTOs", desc: "Importar CTOs do SGP para o FiberDoc e criar CTOs no SGP ao cadastrar no FiberDoc" },
            { icon: <Wifi className="w-4 h-4 text-emerald-400" />, title: "ONUs nas Vias", desc: "Ao abrir uma CTO, exibe as ONUs vinculadas no SGP com status Online/Offline por via" },
            { icon: <Download className="w-4 h-4 text-amber-400" />, title: "Autorizar / Resetar ONU", desc: "Botões para autorizar ou resetar uma ONU directamente via API SGP, sem sair do FiberDoc" },
            { icon: <Search className="w-4 h-4 text-purple-400" />, title: "Vincular Cliente à Via", desc: "Ao registar uma fusão, pesquisa o cliente/contrato no SGP e associa o nome ao label da via" },
          ].map((f, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-md bg-muted/30">
              <div className="flex-shrink-0 mt-0.5">{f.icon}</div>
              <div>
                <p className="font-medium text-foreground">{f.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
