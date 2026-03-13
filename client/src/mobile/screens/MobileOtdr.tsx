import { useState } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, isOnline } from "../mobileTrpc";
import {
  Activity, Zap, Radio, Search, ChevronRight, ChevronLeft,
  AlertCircle, Loader2, Copy, Check, BarChart2, MapPin,
} from "lucide-react";

// ─── Tipos ─────────────────────────────────────────────────────────────────
type View = "menu" | "otdr" | "balance";
type Cto = { id: number; name: string; lat?: string | null; lng?: string | null };
type Element = { id: number; type: string; referenceId: number; lat?: number | null; lng?: number | null };
type Tube = { id: number; identifier: string; totalVias: number; type: string };

// ─── Helpers ───────────────────────────────────────────────────────────────
function qualityColor(q: string) {
  if (q === "excellent") return "text-emerald-400";
  if (q === "good") return "text-cyan-400";
  if (q === "marginal") return "text-amber-400";
  if (q === "poor") return "text-orange-400";
  return "text-red-400";
}
function qualityLabel(q: string) {
  if (q === "excellent") return "Excelente";
  if (q === "good") return "Bom";
  if (q === "marginal") return "Marginal";
  if (q === "poor") return "Fraco";
  if (q === "no_signal") return "Sem sinal";
  return q;
}

interface MobileOtdrProps {
  onGoToMap?: (lat: number, lng: number) => void;
}

export default function MobileOtdr({ onGoToMap }: MobileOtdrProps = {}) {
  const { serverUrl, token } = useMobileAuth();
  const client = createMobileTrpcClient(serverUrl, token);

  const [view, setView] = useState<View>("menu");

  // ─── OTDR Virtual ─────────────────────────────────────────────────────────
  const [otdrSearch, setOtdrSearch] = useState("");
  const [otdrElements, setOtdrElements] = useState<Element[]>([]);
  const [otdrCeos, setOtdrCeos] = useState<any[]>([]);
  const [otdrCtos, setOtdrCtos] = useState<any[]>([]);
  const [otdrLoading, setOtdrLoading] = useState(false);
  const [otdrSearched, setOtdrSearched] = useState(false);

  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [tubes, setTubes] = useState<Tube[]>([]);
  const [tubeId, setTubeId] = useState("");
  const [viaNumber, setViaNumber] = useState("");
  const [distanceM, setDistanceM] = useState("");
  const [running, setRunning] = useState(false);
  const [otdrResult, setOtdrResult] = useState<any | null>(null);
  const [otdrError, setOtdrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function searchElements() {
    if (!otdrSearch.trim()) return;
    setOtdrLoading(true);
    setOtdrSearched(false);
    try {
      const [elems, ceos, ctos] = await Promise.all([
        client.infraMap.elements.query(),
        client.ceos.list.query({}),
        client.ctos.list.query(),
      ]);
      setOtdrElements(elems as Element[]);
      setOtdrCeos(ceos as any[]);
      setOtdrCtos(ctos as any[]);
    } catch {}
    setOtdrLoading(false);
    setOtdrSearched(true);
  }

  const q = otdrSearch.toLowerCase();
  const filteredElements = otdrElements.filter((el: Element) => {
    const ref = el.type === "cto"
      ? otdrCtos.find((c: any) => c.id === el.referenceId)
      : otdrCeos.find((c: any) => c.id === el.referenceId);
    return ref?.name?.toLowerCase().includes(q);
  });

  async function selectElement(el: Element) {
    setSelectedElement(el);
    setTubeId(""); setViaNumber(""); setDistanceM(""); setOtdrResult(null); setOtdrError(null);
    try {
      const data = await client.infraMap.tubesByElement.query({ elementId: el.id });
      setTubes(data as Tube[]);
    } catch { setTubes([]); }
  }

  async function runOtdr() {
    if (!selectedElement || !tubeId || !viaNumber || !distanceM) {
      setOtdrError("Preencha todos os campos"); return;
    }
    setRunning(true); setOtdrError(null); setOtdrResult(null);
    try {
      const result = await client.infraMap.traceOtdr.query({
        elementId: selectedElement.id,
        tubeId: parseInt(tubeId),
        viaNumber: parseInt(viaNumber),
        distanceMeters: parseFloat(distanceM),
      });
      setOtdrResult(result);
    } catch (e: any) {
      setOtdrError(e?.message ?? "Erro ao executar OTDR");
    }
    setRunning(false);
  }

  function copyGps() {
    if (!otdrResult?.lat || !otdrResult?.lng) return;
    navigator.clipboard.writeText(`${otdrResult.lat.toFixed(6)},${otdrResult.lng.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Balanço Óptico CTO ───────────────────────────────────────────────────
  const [balSearch, setBalSearch] = useState("");
  const [balCtos, setBalCtos] = useState<Cto[]>([]);
  const [balElements, setBalElements] = useState<Element[]>([]);
  const [balLoading, setBalLoading] = useState(false);
  const [balSearched, setBalSearched] = useState(false);
  const [selectedCtoEl, setSelectedCtoEl] = useState<{ cto: Cto; el: Element } | null>(null);
  const [balance, setBalance] = useState<any | null>(null);
  const [balRunning, setBalRunning] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);

  async function searchCtos() {
    if (!balSearch.trim()) return;
    setBalLoading(true); setBalSearched(false);
    try {
      const [ctos, elems] = await Promise.all([
        client.ctos.list.query(),
        client.infraMap.elements.query(),
      ]);
      setBalCtos(ctos as Cto[]);
      setBalElements((elems as Element[]).filter((e: Element) => e.type === "cto"));
    } catch {}
    setBalLoading(false); setBalSearched(true);
  }

  const bq = balSearch.toLowerCase();
  const filteredCtos = balCtos.filter((c: Cto) => c.name.toLowerCase().includes(bq));

  async function calcBalance(cto: Cto) {
    const el = balElements.find((e: Element) => e.referenceId === cto.id);
    if (!el) { setBalError("CTO não encontrada no mapa"); return; }
    setSelectedCtoEl({ cto, el });
    setBalance(null); setBalError(null); setBalRunning(true);
    try {
      const result = await client.infraMap.opticalBalance.query({ ctoElementId: el.id });
      setBalance(result);
    } catch (e: any) {
      setBalError(e?.message ?? "Erro ao calcular balanço");
    }
    setBalRunning(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (view === "menu") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-bold text-white">Ferramentas Ópticas</h1>
          </div>
          <p className="text-xs text-zinc-500">OTDR Virtual e Balanço Óptico</p>
        </div>
        <div className="flex-1 p-4 space-y-3">
          <button
            onClick={() => { setView("otdr"); setOtdrSearch(""); setOtdrSearched(false); setOtdrElements([]); setSelectedElement(null); setOtdrResult(null); setOtdrError(null); }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-amber-500/40 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">OTDR Virtual</p>
              <p className="text-xs text-zinc-500 mt-0.5">Rastrear ponto de falha por distância numa via de cabo</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
          </button>

          <button
            onClick={() => { setView("balance"); setBalSearch(""); setBalSearched(false); setBalCtos([]); setSelectedCtoEl(null); setBalance(null); setBalError(null); }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 hover:border-cyan-500/40 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <BarChart2 className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Balanço Óptico CTO</p>
              <p className="text-xs text-zinc-500 mt-0.5">Potência RX estimada na CTO com base na topologia do mapa</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  // ─── OTDR Virtual ─────────────────────────────────────────────────────────
  if (view === "otdr") {
    const selectedTube = tubes.find(t => String(t.id) === tubeId);
    const viaCount = selectedTube?.totalVias ?? 0;

    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("menu")} className="flex items-center gap-1 text-amber-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h1 className="text-base font-bold text-white">OTDR Virtual</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Selecione o CEO/CTO de partida, tubo, via e distância</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Busca de elemento */}
          {!selectedElement ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    value={otdrSearch}
                    onChange={e => setOtdrSearch(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && searchElements()}
                    placeholder="Buscar CEO ou CTO..."
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <button
                  onClick={searchElements}
                  disabled={otdrLoading || !otdrSearch.trim()}
                  className="px-4 py-2.5 bg-amber-500 text-zinc-900 font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {otdrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>

              {otdrSearched && filteredElements.length === 0 && (
                <div className="text-center py-8 text-zinc-600 text-sm">Nenhum elemento encontrado</div>
              )}

              <div className="space-y-2">
                {filteredElements.map((el: Element) => {
                  const ref = el.type === "cto"
                    ? otdrCtos.find((c: any) => c.id === el.referenceId)
                    : otdrCeos.find((c: any) => c.id === el.referenceId);
                  return (
                    <button
                      key={el.id}
                      onClick={() => selectElement(el)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-amber-500/40 transition-colors text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${el.type === "cto" ? "bg-cyan-500/10" : "bg-violet-500/10"}`}>
                        <Radio className={`w-4 h-4 ${el.type === "cto" ? "text-cyan-400" : "text-violet-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{ref?.name ?? `${el.type.toUpperCase()} #${el.referenceId}`}</p>
                        <p className="text-xs text-zinc-500">{el.type.toUpperCase()} · ID {el.id}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Elemento selecionado */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-400/70 mb-0.5">Ponto de partida</p>
                  <p className="text-sm font-semibold text-amber-300">
                    {(() => {
                      const ref = selectedElement.type === "cto"
                        ? otdrCtos.find((c: any) => c.id === selectedElement.referenceId)
                        : otdrCeos.find((c: any) => c.id === selectedElement.referenceId);
                      return ref?.name ?? `${selectedElement.type.toUpperCase()} #${selectedElement.referenceId}`;
                    })()}
                  </p>
                </div>
                <button onClick={() => { setSelectedElement(null); setTubes([]); setOtdrResult(null); }} className="text-xs text-zinc-500 underline">Trocar</button>
              </div>

              {/* Tubo */}
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Tubo de saída</label>
                {tubes.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic">Nenhum tubo disponível</p>
                ) : (
                  <select
                    value={tubeId}
                    onChange={e => { setTubeId(e.target.value); setViaNumber(""); }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">Selecionar tubo...</option>
                    {tubes.map(t => (
                      <option key={t.id} value={String(t.id)}>{t.identifier} ({t.totalVias} vias)</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Via */}
              {tubeId && viaCount > 0 && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Via (fibra)</label>
                  <select
                    value={viaNumber}
                    onChange={e => setViaNumber(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">Selecionar via...</option>
                    {Array.from({ length: viaCount }, (_, i) => i + 1).map(n => (
                      <option key={n} value={String(n)}>Via {n}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Distância */}
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Distância alvo (metros)</label>
                <input
                  type="number"
                  value={distanceM}
                  onChange={e => setDistanceM(e.target.value)}
                  placeholder="ex: 250"
                  min="1"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {otdrError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{otdrError}</p>
                </div>
              )}

              <button
                onClick={runOtdr}
                disabled={running || !tubeId || !viaNumber || !distanceM || !isOnline()}
                className="w-full bg-amber-500 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {running ? "Rastreando..." : "Executar OTDR Virtual"}
              </button>

              {/* Resultado */}
              {otdrResult && (
                <div className={`border rounded-2xl p-4 space-y-3 ${otdrResult.found ? "bg-amber-500/5 border-amber-500/20" : "bg-zinc-900 border-zinc-800"}`}>
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${otdrResult.found ? "text-amber-400" : "text-zinc-500"}`} />
                    <p className="text-sm font-semibold text-white">
                      {otdrResult.found ? "Ponto localizado" : "Fim da cadeia"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800">
                      <p className="text-xs text-zinc-500 mb-0.5">Distância percorrida</p>
                      <p className="text-lg font-bold text-amber-400">{Math.round(otdrResult.distanceTraveled)} m</p>
                    </div>
                    {otdrResult.segmentName && (
                      <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800">
                        <p className="text-xs text-zinc-500 mb-0.5">Cabo</p>
                        <p className="text-sm font-semibold text-white truncate">{otdrResult.segmentName}</p>
                      </div>
                    )}
                  </div>

                  {otdrResult.found && otdrResult.lat != null && otdrResult.lng != null && (
                    <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500">Coordenadas GPS</p>
                        <button onClick={copyGps} className="flex items-center gap-1 text-xs text-cyan-400">
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                      <p className="text-sm font-mono text-white">{otdrResult.lat.toFixed(6)}, {otdrResult.lng.toFixed(6)}</p>
                      {onGoToMap && (
                        <button
                          onClick={() => onGoToMap(otdrResult.lat, otdrResult.lng)}
                          className="w-full flex items-center justify-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl py-2 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" /> Ver no Mapa
                        </button>
                      )}
                    </div>
                  )}

                  {otdrResult.warnings?.length > 0 && (
                    <div className="space-y-1">
                      {otdrResult.warnings.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-amber-400/80 flex items-start gap-1.5">
                          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Balanço Óptico CTO ───────────────────────────────────────────────────
  if (view === "balance") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("menu")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            <h1 className="text-base font-bold text-white">Balanço Óptico CTO</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Potência RX estimada com base na topologia do mapa</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Busca CTO */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                value={balSearch}
                onChange={e => setBalSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchCtos()}
                placeholder="Buscar CTO..."
                className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <button
              onClick={searchCtos}
              disabled={balLoading || !balSearch.trim()}
              className="px-4 py-2.5 bg-cyan-500 text-zinc-900 font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {balLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>

          {balSearched && filteredCtos.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">Nenhuma CTO encontrada</div>
          )}

          {/* Lista de CTOs */}
          {!selectedCtoEl && (
            <div className="space-y-2">
              {filteredCtos.map((cto: Cto) => (
                <button
                  key={cto.id}
                  onClick={() => calcBalance(cto)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-cyan-500/40 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <Radio className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{cto.name}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </button>
              ))}
            </div>
          )}

          {/* Resultado do balanço */}
          {selectedCtoEl && (
            <div className="space-y-4">
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-cyan-400/70 mb-0.5">CTO selecionada</p>
                  <p className="text-sm font-semibold text-cyan-300">{selectedCtoEl.cto.name}</p>
                </div>
                <button onClick={() => { setSelectedCtoEl(null); setBalance(null); setBalError(null); }} className="text-xs text-zinc-500 underline">Trocar</button>
              </div>

              {balRunning && (
                <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Calculando balanço...</span>
                </div>
              )}

              {balError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{balError}</p>
                </div>
              )}

              {balance && (() => {
                const ob = balance as any;
                const rxPower: number | null = ob.rxPowerDbm;
                const txPower: number = ob.txPowerDbm ?? 0;
                const totalLoss: number = ob.totalLossDb ?? 0;
                const cableLoss: number = ob.cableLossDb ?? 0;
                const splitterLoss: number = ob.splitterLossDb ?? 0;
                const fusionLoss: number = ob.fusionLossDb ?? 0;
                const distKm: number = ob.distanceKm ?? 0;
                const quality: string = ob.signalQuality ?? "no_signal";
                const pathSteps: any[] = ob.path ?? [];
                const warnings: string[] = ob.warnings ?? [];
                const rxColor = quality === "excellent" ? "text-emerald-400" : quality === "good" ? "text-cyan-400" : quality === "marginal" ? "text-amber-400" : quality === "poor" ? "text-orange-400" : "text-red-400";

                return (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-white">Balanço Óptico Estimado</p>
                        {ob.found && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border border-current/30 bg-current/10 ${qualityColor(quality)}`}>
                            {qualityLabel(quality)}
                          </span>
                        )}
                      </div>

                      {!ob.found ? (
                        <div className="space-y-1">
                          <p className="text-xs text-zinc-500">Não foi possível calcular — CTO não está conectada a uma OLT no mapa.</p>
                          {warnings.map((w: string, i: number) => (
                            <p key={i} className="text-xs text-amber-400/80 flex items-start gap-1">
                              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Grid de métricas */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-zinc-800/50 rounded-xl p-3">
                              <p className="text-[10px] text-zinc-500 mb-0.5">Potência RX (CTO)</p>
                              <p className={`text-xl font-bold ${rxColor}`}>
                                {rxPower !== null ? `${rxPower > 0 ? "+" : ""}${rxPower.toFixed(1)}` : "—"} dBm
                              </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-xl p-3">
                              <p className="text-[10px] text-zinc-500 mb-0.5">Potência TX (OLT)</p>
                              <p className="text-sm font-semibold text-white">{txPower > 0 ? "+" : ""}{txPower.toFixed(1)} dBm</p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-xl p-3">
                              <p className="text-[10px] text-zinc-500 mb-0.5">Distância Total</p>
                              <p className="text-sm font-semibold text-white">{distKm.toFixed(2)} km</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5">Cabo: -{cableLoss.toFixed(1)} dB</p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-xl p-3">
                              <p className="text-[10px] text-zinc-500 mb-0.5">Perda Total</p>
                              <p className="text-sm font-semibold text-red-400">-{totalLoss.toFixed(1)} dB</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5">
                                {splitterLoss > 0 && `Spl: -${splitterLoss.toFixed(1)}`}
                                {splitterLoss > 0 && fusionLoss > 0 && " · "}
                                {fusionLoss > 0 && `Fus: -${fusionLoss.toFixed(1)}`}
                              </p>
                            </div>
                          </div>

                          {/* Percurso */}
                          {pathSteps.length > 0 && (
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Percurso do Sinal</p>
                              <div className="flex flex-wrap items-center gap-1">
                                {pathSteps.map((step: any, i: number) => (
                                  <span key={i} className="flex items-center gap-1">
                                    {i > 0 && <span className="text-zinc-600 text-xs">→</span>}
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                      step.type === "olt" ? "bg-amber-500/10 border-amber-500/30 text-amber-300" :
                                      step.type === "ceo" ? "bg-violet-500/10 border-violet-500/30 text-violet-300" :
                                      step.type === "splitter" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" :
                                      step.type === "cto" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300" :
                                      "bg-zinc-800 border-zinc-700 text-zinc-400"
                                    }`}>
                                      {step.name ?? step.type}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Avisos */}
                          {warnings.length > 0 && (
                            <div className="space-y-1">
                              {warnings.map((w: string, i: number) => (
                                <p key={i} className="text-[10px] text-amber-400/80 flex items-start gap-1">
                                  <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
