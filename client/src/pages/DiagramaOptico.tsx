import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Loader2, AlertTriangle, Info, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FIBER_VIA_COLORS } from "@/lib/map/icons";
import { distanciaTotal, formatarDistancia } from "@/lib/map/measure";

/**
 * Diagrama óptico de uma CEO ou CTO — Fase 1, somente leitura.
 *
 * Mostra o que já está no banco: tubos com as suas vias, splitters, e as
 * fusões que ligam umas às outras. Nada aqui grava. Conectar, desconectar e
 * criar splitters vêm depois, e é de propósito: um canvas que escreve antes de
 * o desenho estar provado transforma um engano de leitura em estrago real.
 *
 * Duas escolhas de desenho, ambas para o diagrama se ler de relance:
 *
 * O splitter é um triângulo — o símbolo óptico de sempre — com a entrada no
 * vértice e as saídas na base. Um 1:16 desenhado como lista de portas ocupava
 * dezasseis linhas de texto e empurrava tudo o resto para fora do ecrã; como
 * triângulo ocupa a altura de dezasseis pontos. O que interessa ver num
 * splitter é para onde vai cada saída, não o nome de cada porta.
 *
 * As vias dos tubos aparecem todas, mas as que não têm fusão ficam esbatidas.
 * Só mostrar as ocupadas encolheria o desenho, e perderia justamente a
 * informação de quem projeta: quantas vias sobram naquele tubo.
 *
 * O layout é automático e determinístico — tubos à esquerda, splitters à
 * direita — e não é guardado. Guardar posições de algo que ainda não se pode
 * arrastar seria guardar nada.
 *
 * SVG à mão, como o Topology.tsx já faz nesta base. Uma biblioteca de
 * diagramas resolveria o arrastar e o encaminhamento de linhas, mas para
 * desenhar blocos e curvas são poucas dezenas de linhas, e a dependência
 * pesaria mais do que resolve.
 */

// ─── Geometria do desenho ─────────────────────────────────────────────────────
const LARG_TUBO = 210;
const ALT_CABECALHO = 38;
const ALT_VIA = 20;
const ESP_VERTICAL = 26;
const COL_TUBOS_X = 40;
const COL_SPLITTERS_X = 420;
const MARGEM_TOPO = 30;

// Splitter: título por cima, triângulo por baixo.
const LARG_SPLITTER = 88;
const ALT_TITULO_SPL = 30;
const ALT_PORTA_SPL = 14;
const ALT_MIN_SPL = 54;

/** Ponto de ligação de uma via: onde uma linha entra e de onde sai. */
interface Ancora { xEsq: number; xDir: number; y: number }

type Via = { id: number; viaNumber: number; label: string | null; y: number };

type Bloco =
  | {
      forma: "tubo";
      chave: string;
      titulo: string;
      subtitulo: string;
      x: number; y: number; altura: number;
      cor: string | null;
      vias: Via[];
    }
  | {
      forma: "splitter";
      chave: string;
      titulo: string;
      subtitulo: string;
      x: number; y: number; altura: number;
      cor: string | null;
      /** Topo e altura só do triângulo, sem o título. */
      yTri: number; altTri: number;
      entrada: Via | null;
      saidas: Via[];
    };

/** Cor da fibra pela numeração da norma, ciclando a cada 12. */
function corDaVia(n: number): string {
  if (n <= 0) return "#94a3b8"; // via 0 = entrada de splitter
  const idx = ((n - 1) % 12) + 1;
  return FIBER_VIA_COLORS[idx] ?? "#94a3b8";
}

export default function DiagramaOptico() {
  const params = useParams<{ tipo: string; id: string }>();
  const tipo = params.tipo === "cto" ? "cto" : "ceo";
  const id = Number(params.id);

  const { data, isLoading, error } = trpc.infraMap.opticalDiagram.useQuery(
    { tipo, id },
    { enabled: Number.isFinite(id) && id > 0, staleTime: 30_000 }
  );

  // ─── Pan e zoom ─────────────────────────────────────────────────────────────
  const [escala, setEscala] = useState(1);
  const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });
  const arrastando = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const aoRodar = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setEscala(k => Math.min(2.5, Math.max(0.25, k * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
  }, []);

  const aoPressionar = useCallback((e: React.MouseEvent) => {
    arrastando.current = { x: e.clientX - deslocamento.x, y: e.clientY - deslocamento.y };
  }, [deslocamento]);

  useEffect(() => {
    const mover = (e: MouseEvent) => {
      if (!arrastando.current) return;
      setDeslocamento({ x: e.clientX - arrastando.current.x, y: e.clientY - arrastando.current.y });
    };
    const soltar = () => { arrastando.current = null; };
    // No document, e não no SVG: soltar o botão fora do canvas deixaria o
    // arrasto preso para sempre — o mesmo erro que já apanhámos na caixa de
    // selecção do Mapa 2.0.
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
    return () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
    };
  }, []);

  const repor = useCallback(() => { setEscala(1); setDeslocamento({ x: 0, y: 0 }); }, []);

  /**
   * Vias que têm fusão, para esbater as outras.
   *
   * A chave junta o tipo à identidade porque um id de via de tubo e um id de
   * via de splitter são numerações independentes — sem o tipo, uma via livre
   * aparecia ocupada por coincidência de número.
   */
  const viasEmUso = useMemo(() => {
    const s = new Set<string>();
    for (const f of data?.fusoes ?? []) {
      s.add(`${f.sourceType}:${f.sourceViaId}`);
      s.add(`${f.targetType}:${f.targetViaId}`);
    }
    return s;
  }, [data]);

  // ─── Layout determinístico ──────────────────────────────────────────────────
  const { blocos, ancoras, altura, largura } = useMemo(() => {
    const blocos: Bloco[] = [];
    const ancoras = new Map<string, Ancora>();
    if (!data) return { blocos, ancoras, altura: 400, largura: 800 };

    // Que cabo chega a cada tubo — o cabo é o que dá sentido ao tubo no desenho.
    const caboPorTubo = new Map<number, { nome: string; fibras: number; cor: string | null; km: number }>();
    for (const c of data.cabos) {
      let km = 0;
      try {
        const pts = c.path ? JSON.parse(c.path) : [];
        if (Array.isArray(pts) && pts.length >= 2) {
          km = distanciaTotal(pts.map((p: any) => [Number(p.lat), Number(p.lng)] as [number, number])) / 1000;
        }
      } catch { km = 0; }
      for (const t of c.tuboIds) {
        caboPorTubo.set(t, { nome: c.nome, fibras: c.fibras, cor: c.cor, km });
      }
    }

    // ── Tubos: rectângulo com uma linha por via ──
    let yTubo = MARGEM_TOPO;
    for (const t of data.tubos) {
      const cabo = caboPorTubo.get(t.id);
      const alt = ALT_CABECALHO + t.vias.length * ALT_VIA + 8;
      const vias: Via[] = t.vias.map((v, i) => ({
        ...v,
        y: yTubo + ALT_CABECALHO + i * ALT_VIA + ALT_VIA / 2,
      }));
      for (const v of vias) {
        ancoras.set(`tube:${v.id}`, { xEsq: COL_TUBOS_X, xDir: COL_TUBOS_X + LARG_TUBO, y: v.y });
      }
      blocos.push({
        forma: "tubo",
        chave: `tubo-${t.id}`,
        titulo: t.identifier,
        subtitulo: cabo
          ? `${cabo.nome} · ${cabo.fibras} FO${cabo.km > 0 ? ` · ${formatarDistancia(cabo.km * 1000)}` : ""}`
          : `${t.totalVias} vias · sem cabo ligado`,
        x: COL_TUBOS_X, y: yTubo, altura: alt,
        cor: cabo?.cor ?? t.cor ?? null,
        vias,
      });
      yTubo += alt + ESP_VERTICAL;
    }

    // ── Splitters: triângulo, entrada no vértice, saídas na base ──
    let ySpl = MARGEM_TOPO;
    for (const s of data.splitters) {
      const entrada = s.vias.find(v => v.viaNumber === 0) ?? null;
      const saidas = s.vias.filter(v => v.viaNumber > 0);
      const altTri = Math.max(ALT_MIN_SPL, saidas.length * ALT_PORTA_SPL);
      const yTri = ySpl + ALT_TITULO_SPL;
      const alt = ALT_TITULO_SPL + altTri + 10;

      // O vértice é a entrada; a base, à direita, distribui as saídas.
      const xApice = COL_SPLITTERS_X;
      const xBase = COL_SPLITTERS_X + LARG_SPLITTER;

      const entradaPos: Via | null = entrada
        ? { ...entrada, y: yTri + altTri / 2 }
        : null;
      if (entradaPos) {
        ancoras.set(`splitter:${entradaPos.id}`, { xEsq: xApice, xDir: xApice, y: entradaPos.y });
      }

      const saidasPos: Via[] = saidas.map((v, i) => ({
        ...v,
        y: yTri + ((i + 0.5) * altTri) / Math.max(1, saidas.length),
      }));
      for (const v of saidasPos) {
        ancoras.set(`splitter:${v.id}`, { xEsq: xBase, xDir: xBase, y: v.y });
      }

      blocos.push({
        forma: "splitter",
        chave: `splitter-${s.id}`,
        titulo: s.identifier,
        subtitulo: `${s.ratio} · ${s.splitterType === "balanced" ? "balanceado" : "desbalanceado"}`,
        x: COL_SPLITTERS_X, y: ySpl, altura: alt,
        cor: "#a855f7",
        yTri, altTri,
        entrada: entradaPos,
        saidas: saidasPos,
      });
      ySpl += alt + ESP_VERTICAL;
    }

    return {
      blocos,
      ancoras,
      altura: Math.max(yTubo, ySpl, 400),
      largura: COL_SPLITTERS_X + LARG_SPLITTER + 160,
    };
  }, [data]);

  const cabosSemEstrutura = useMemo(
    () => (data?.cabos ?? []).filter(c => c.tuboIds.length === 0),
    [data]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />Carregando o diagrama…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm">{error?.message ?? "Elemento não encontrado."}</p>
        <Link href="/mapa2"><Button variant="outline" size="sm">Voltar ao Mapa 2.0</Button></Link>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-muted/20">
      {/* ── Cabeçalho ── */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <Link href="/mapa2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <ArrowLeft className="w-3.5 h-3.5" />Mapa 2.0
          </Button>
        </Link>
        <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-1.5 shadow">
          <div className="text-sm font-semibold leading-tight">{data.nome}</div>
          <div className="text-[10px] text-muted-foreground">
            {data.tipo.toUpperCase()} · {data.tubos.length} tubos · {data.splitters.length} splitters · {data.fusoes.length} fusões
          </div>
        </div>
      </div>

      {/* ── Zoom ── */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/95 backdrop-blur px-1 py-1 shadow">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEscala(k => Math.min(2.5, k * 1.2))} title="Aproximar">
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEscala(k => Math.max(0.25, k / 1.2))} title="Afastar">
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={repor} title="Repor a vista">
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── Avisos ── */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 max-w-md">
        {cabosSemEstrutura.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500 text-[11px] px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {cabosSemEstrutura.length} cabo(s) ligado(s) sem tubo nem vias
            </div>
            <div className="mt-0.5 leading-snug">
              {cabosSemEstrutura.map(c => `${c.nome} (${c.fibras} FO)`).join(", ")} — sem estrutura,
              não há vias para fusionar. Criar automaticamente ao ligar o cabo é o próximo passo.
            </div>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card/90 text-muted-foreground text-[11px] px-2.5 py-1.5">
          <Info className="w-3 h-3 shrink-0" />
          Somente leitura. Vias esbatidas estão livres. Arraste para mover, role para aproximar.
        </div>
      </div>

      {/* ── Canvas ── */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={aoRodar}
        onMouseDown={aoPressionar}
      >
        <g transform={`translate(${deslocamento.x}, ${deslocamento.y}) scale(${escala})`}>
          {/* Fusões primeiro, para as linhas passarem por baixo dos blocos */}
          {data.fusoes.map(f => {
            const a = ancoras.get(`${f.sourceType}:${f.sourceViaId}`);
            const b = ancoras.get(`${f.targetType}:${f.targetViaId}`);
            if (!a || !b) return null;
            // Sai pela direita da origem e entra pela esquerda do destino. Se o
            // destino não estiver à direita — dois tubos na mesma coluna, ou uma
            // saída de splitter a voltar para trás — a curva abre pela direita
            // dos dois, em vez de atravessar os próprios blocos.
            const paraFrente = b.xEsq - a.xDir > 40;
            const x1 = a.xDir;
            const x2 = paraFrente ? b.xEsq : b.xDir;
            const ctrl = paraFrente ? Math.max(40, (x2 - x1) / 2) : 70;
            const d = paraFrente
              ? `M ${x1} ${a.y} C ${x1 + ctrl} ${a.y}, ${x2 - ctrl} ${b.y}, ${x2} ${b.y}`
              : `M ${x1} ${a.y} C ${x1 + ctrl} ${a.y}, ${x2 + ctrl} ${b.y}, ${x2} ${b.y}`;
            return (
              <path key={f.id} d={d} fill="none" stroke="#22d3ee" strokeWidth={1.6} opacity={0.75} />
            );
          })}

          {blocos.map(b => b.forma === "tubo" ? (
            <g key={b.chave}>
              <rect
                x={b.x} y={b.y} width={LARG_TUBO} height={b.altura} rx={8}
                className="fill-card stroke-border" strokeWidth={1}
              />
              <rect x={b.x} y={b.y} width={LARG_TUBO} height={3} rx={1.5} fill={b.cor ?? "#64748b"} />
              <text x={b.x + 12} y={b.y + 20} className="fill-foreground" fontSize={12} fontWeight={600}>
                {b.titulo}
              </text>
              <text x={b.x + 12} y={b.y + 32} className="fill-muted-foreground" fontSize={9}>
                {b.subtitulo}
              </text>
              {b.vias.map(v => {
                const usada = viasEmUso.has(`tube:${v.id}`);
                return (
                  <g key={v.id} opacity={usada ? 1 : 0.32}>
                    <rect
                      x={b.x + 10} y={v.y - 6} width={10} height={12} rx={2}
                      fill={corDaVia(v.viaNumber)} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5}
                    />
                    <text
                      x={b.x + 26} y={v.y + 4} fontSize={10}
                      className={usada ? "fill-foreground" : "fill-muted-foreground"}
                    >
                      {v.viaNumber === 0 ? "ENT" : String(v.viaNumber).padStart(2, "0")}
                      {v.label ? ` · ${v.label}` : ""}
                    </text>
                    {usada && (
                      <circle cx={b.x + LARG_TUBO} cy={v.y} r={2.5} className="fill-muted-foreground/60" />
                    )}
                  </g>
                );
              })}
            </g>
          ) : (
            <g key={b.chave}>
              <text x={b.x} y={b.y + 12} className="fill-foreground" fontSize={12} fontWeight={600}>
                {b.titulo}
              </text>
              <text x={b.x} y={b.y + 24} className="fill-muted-foreground" fontSize={9}>
                {b.subtitulo}
              </text>

              {/* O triângulo: vértice à esquerda (entrada), base à direita. */}
              <path
                d={`M ${b.x} ${b.yTri + b.altTri / 2} L ${b.x + LARG_SPLITTER} ${b.yTri} L ${b.x + LARG_SPLITTER} ${b.yTri + b.altTri} Z`}
                fill="#a855f7" fillOpacity={0.14} stroke="#a855f7" strokeWidth={1.4} strokeLinejoin="round"
              />

              {b.entrada && (
                <>
                  <circle cx={b.x} cy={b.entrada.y} r={3.5} fill="#a855f7" />
                  <text
                    x={b.x - 7} y={b.entrada.y + 3} fontSize={9} textAnchor="end"
                    className="fill-muted-foreground"
                  >
                    ENT
                  </text>
                </>
              )}

              {b.saidas.map(v => {
                const usada = viasEmUso.has(`splitter:${v.id}`);
                return (
                  <g key={v.id} opacity={usada ? 1 : 0.35}>
                    {usada
                      ? <circle cx={b.x + LARG_SPLITTER} cy={v.y} r={3} fill={corDaVia(v.viaNumber)} />
                      : <circle cx={b.x + LARG_SPLITTER} cy={v.y} r={2} className="fill-muted-foreground" />}
                    <text
                      x={b.x + LARG_SPLITTER + 7} y={v.y + 3} fontSize={8.5}
                      className={usada ? "fill-foreground" : "fill-muted-foreground"}
                    >
                      {String(v.viaNumber).padStart(2, "0")}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {blocos.length === 0 && (
            <text x={COL_TUBOS_X} y={MARGEM_TOPO + 20} className="fill-muted-foreground" fontSize={13}>
              Este elemento ainda não tem tubos nem splitters cadastrados.
            </text>
          )}

          {/* Reserva a área para o scroll não colapsar quando há poucos blocos */}
          <rect x={0} y={0} width={largura} height={altura} fill="none" />
        </g>
      </svg>
    </div>
  );
}
