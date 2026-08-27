import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  MousePointer2, Ruler, Hexagon, Layers, Loader2, Trash2, Undo2, Info, Check,
} from "lucide-react";
import { createStreetLayer, createSatelliteLayer, clampZoomForStreet, satelliteProviderLabel } from "@/lib/mapTiles";
import { createLeafletIcon } from "@/lib/map/icons";
import { safeLeafletRemove } from "@/lib/map/leaflet-utils";
import { distanciaTotal, distanciasPorTrecho, areaPoligono, formatarDistancia, formatarArea } from "@/lib/map/measure";
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, PROJECT_STATUS_COLOR, PROJECT_TIPO_LABEL,
  normalizeProjectStatus, type ProjectStatus,
} from "@shared/projectStatus";

/**
 * Mapa 2.0 (beta) — casca nova sobre o motor extraído de InfrastructureMap.
 *
 * Esta tela grava UMA coisa: o estado de projeto, em lote. Nada mais. A regra
 * que a mantinha somente-leitura existia porque um beta que escreve transforma
 * qualquer engano em estrago real — e ela continua valendo para tudo o que é
 * destrutivo. O estado de projeto é a excepção porque é reversível: marcar
 * errado desfaz-se selecionando de novo e marcando certo, sem perder posição,
 * nome, fusões ou histórico. Criar, mover, editar e apagar continuam no mapa
 * atual.
 *
 * O que ela testa é a ergonomia: barra de modos no lugar do menu suspenso, as
 * duas ferramentas que hoje não existem — régua livre e desenho de área — e a
 * selecção múltipla, que é o gesto que falta para trabalhar um projeto inteiro
 * de uma vez em vez de um marcador de cada vez.
 *
 * Tudo o que ela desenha reaproveita os módulos de lib/map/. Conforme a tela
 * precisar de mais peças do mapa atual, elas saem de lá para lib/map/ com um
 * caso de uso real guiando a interface, em vez de adivinhada de antemão.
 */

type Modo = "selecionar" | "regua" | "area";

/** Tipos que esta tela sabe selecionar. Cabos e reservas ainda não. */
type TipoSel = "cto" | "ceo" | "poste";

interface Item {
  tipo: TipoSel;
  id: number;
  lat: number;
  lng: number;
  nome: string;
  estado: ProjectStatus;
}

const chave = (tipo: TipoSel, id: number) => `${tipo}:${id}`;

const OPCOES_QUERY = { staleTime: 30_000, refetchOnWindowFocus: false } as const;

export default function MapaBeta() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapPronto, setMapPronto] = useState(false);

  const [satelite, setSatelite] = useState(false);
  const [modo, setModo] = useState<Modo>("selecionar");
  const [mostrarCaixas, setMostrarCaixas] = useState(true);
  const [mostrarPostes, setMostrarPostes] = useState(true);
  const [mostrarCabos, setMostrarCabos] = useState(true);

  // Pontos da medição em curso. O ref acompanha o estado porque os handlers
  // do Leaflet são registados uma vez e veriam um valor congelado.
  const [pontos, setPontos] = useState<L.LatLng[]>([]);
  const pontosRef = useRef<L.LatLng[]>([]);
  const modoRef = useRef<Modo>("selecionar");
  useEffect(() => { pontosRef.current = pontos; }, [pontos]);
  useEffect(() => { modoRef.current = modo; }, [modo]);

  const camadaMedicaoRef = useRef<L.LayerGroup | null>(null);
  const camadaDadosRef = useRef<L.LayerGroup | null>(null);
  // A selecção vive na sua própria camada. Assim clicar num item redesenha só
  // os anéis de destaque, e não os milhares de marcadores da camada de dados.
  const camadaSelecaoRef = useRef<L.LayerGroup | null>(null);

  const { user } = useAuth();
  const podeEditar = user?.role === "admin" || user?.role === "operator";

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [estadoAlvo, setEstadoAlvo] = useState<ProjectStatus>("deployed");
  // A caixa de selecção em curso, em coordenadas do mapa.
  const [caixa, setCaixa] = useState<L.LatLngBounds | null>(null);

  const { data: ctos = [], isLoading: carregandoCtos } = trpc.ctos.list.useQuery(undefined, OPCOES_QUERY);
  const { data: ceos = [], isLoading: carregandoCeos } = trpc.ceos.list.useQuery({}, OPCOES_QUERY);
  const { data: postes = [] } = trpc.mapPoles.list.useQuery(undefined, OPCOES_QUERY);
  const { data: rotas = [] } = trpc.infraMap.routes.useQuery(undefined, OPCOES_QUERY);
  const { data: sysConfig } = trpc.systemConfig.get.useQuery(undefined, { staleTime: 600_000, refetchOnWindowFocus: false });

  const carregando = carregandoCtos || carregandoCeos;

  /**
   * Tudo o que é seleccionável, já filtrado pelas camadas visíveis: esconder
   * uma camada e ainda assim apanhá-la numa caixa de selecção seria a receita
   * de uma escrita em massa que ninguém viu acontecer.
   */
  const itens = useMemo<Item[]>(() => {
    const saida: Item[] = [];
    const juntar = (linhas: any[], tipo: TipoSel, rotuloPadrao: string) => {
      for (const r of linhas) {
        if (r?.lat == null || r?.lng == null || r?.id == null) continue;
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        saida.push({
          tipo, id: Number(r.id), lat, lng,
          nome: r.name ?? rotuloPadrao,
          estado: normalizeProjectStatus(r.projectStatus),
        });
      }
    };
    if (mostrarCaixas) {
      juntar(ctos as any[], "cto", "CTO");
      juntar(ceos as any[], "ceo", "CEO");
    }
    if (mostrarPostes) juntar(postes as any[], "poste", "Poste");
    return saida;
  }, [ctos, ceos, postes, mostrarCaixas, mostrarPostes]);

  const itensPorChave = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of itens) m.set(chave(i.tipo, i.id), i);
    return m;
  }, [itens]);

  /** Só os que continuam visíveis — esconder a camada esvazia a selecção dela. */
  const selecionadosVisiveis = useMemo(
    // Array.from, e não [...], porque o tsconfig não define target e o TypeScript
    // assume ES5, onde espalhar um Set exige downlevelIteration.
    () => Array.from(selecionados).map(k => itensPorChave.get(k)).filter(Boolean) as Item[],
    [selecionados, itensPorChave]
  );

  const contagemPorTipo = useMemo(() => {
    const c: Partial<Record<TipoSel, number>> = {};
    for (const i of selecionadosVisiveis) c[i.tipo] = (c[i.tipo] ?? 0) + 1;
    return c;
  }, [selecionadosVisiveis]);

  // Os handlers do Leaflet são ligados uma vez e veriam uma lista congelada.
  const itensRef = useRef<Item[]>([]);
  useEffect(() => { itensRef.current = itens; }, [itens]);

  const alternarItem = useCallback((tipo: TipoSel, id: number, acumular: boolean) => {
    setSelecionados(atual => {
      const k = chave(tipo, id);
      if (!acumular) {
        // Clique simples: se já era o único seleccionado, desmarca; senão isola.
        if (atual.size === 1 && atual.has(k)) return new Set();
        return new Set([k]);
      }
      const novo = new Set(atual);
      novo.has(k) ? novo.delete(k) : novo.add(k);
      return novo;
    });
  }, []);

  // ─── Inicialização do mapa ────────────────────────────────────────────────
  // Roda UMA vez. Recriar o mapa quando sysConfig chega destruiria a instância
  // à qual os handlers de clique já foram ligados — e como mapPronto não muda
  // nesse segundo ciclo, o efeito que os liga não roda de novo e os cliques
  // ficam presos num mapa que não existe mais. A posição configurada é
  // aplicada no efeito seguinte, sem recriar nada.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [-15.7801, -47.9292],
      zoom: 5,
      zoomControl: true,
    });
    const base = createStreetLayer();
    base.addTo(map);
    tileLayerRef.current = base;
    camadaDadosRef.current = L.layerGroup().addTo(map);
    camadaSelecaoRef.current = L.layerGroup().addTo(map);
    camadaMedicaoRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapPronto(true);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      camadaDadosRef.current = null;
      camadaSelecaoRef.current = null;
      camadaMedicaoRef.current = null;
    };
  }, []);

  // Centro e zoom padrão do sistema, aplicados quando a configuração chega.
  // Só uma vez, e só se o usuário ainda não tiver mexido no mapa.
  const posicaoAplicadaRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapPronto || !map || posicaoAplicadaRef.current || !sysConfig) return;
    const lat = parseFloat((sysConfig as any)?.mapDefaultLat ?? "");
    const lng = parseFloat((sysConfig as any)?.mapDefaultLng ?? "");
    const zoom = parseInt((sysConfig as any)?.mapDefaultZoom ?? "");
    if (isNaN(lat) || isNaN(lng)) return;
    map.setView([lat, lng], !isNaN(zoom) ? zoom : 5);
    posicaoAplicadaRef.current = true;
  }, [mapPronto, sysConfig]);

  // ─── Camada base ──────────────────────────────────────────────────────────
  const alternarSatelite = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const novo = !satelite;
    setSatelite(novo);
    if (tileLayerRef.current) safeLeafletRemove(tileLayerRef.current);
    const camada = novo ? createSatelliteLayer() : createStreetLayer();
    if (!novo) clampZoomForStreet(map);
    camada.addTo(map);
    camada.bringToBack();
    tileLayerRef.current = camada;
  }, [satelite]);

  // ─── Desenho dos dados ────────────────────────────────────────────────────
  useEffect(() => {
    const grupo = camadaDadosRef.current;
    if (!mapPronto || !grupo) return;
    grupo.clearLayers();

    if (mostrarCabos) {
      (rotas as any[]).forEach(r => {
        let caminho: { lat: number; lng: number }[] = [];
        try { caminho = typeof r.path === "string" ? JSON.parse(r.path) : (r.path ?? []); } catch { caminho = []; }
        if (caminho.length < 2) return;
        L.polyline(caminho.map(p => [p.lat, p.lng] as [number, number]), {
          color: r.color ?? "#3b82f6", weight: 3, opacity: 0.85,
        }).bindTooltip(r.name ?? "Cabo", { sticky: true }).addTo(grupo);
      });
    }

    // O clique de selecção é ligado aqui, mas o destaque visual NÃO: ele mora
    // na camada de selecção. Se dependesse deste efeito, cada clique
    // redesenharia todos os marcadores do mapa.
    const aoClicarItem = (tipo: TipoSel, id: number) => (e: L.LeafletMouseEvent) => {
      if (modoRef.current !== "selecionar") return;
      L.DomEvent.stopPropagation(e.originalEvent);
      alternarItem(tipo, id, e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
    };

    // Índice por id. Sem ele, procurar a linha original de cada item com um
    // find() dentro do laço seria O(n²) — imperceptível com dezenas de caixas,
    // e segundos de travamento com milhares.
    const indice = new Map<string, any>();
    for (const r of ctos as any[]) indice.set(chave("cto", Number(r.id)), r);
    for (const r of ceos as any[]) indice.set(chave("ceo", Number(r.id)), r);

    for (const item of itens) {
      if (item.tipo === "poste") {
        L.circleMarker([item.lat, item.lng], {
          radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 1,
          // Ao contrário do L.Marker, um caminho propaga o clique para o mapa
          // por padrão — o que abriria uma medição por baixo da selecção.
          bubblingMouseEvents: false,
        })
          .bindTooltip(`${item.nome} · ${PROJECT_STATUS_LABEL[item.estado]}`, { direction: "top" })
          .on("click", aoClicarItem(item.tipo, item.id))
          .addTo(grupo);
        continue;
      }
      const origem = indice.get(chave(item.tipo, item.id));
      L.marker([item.lat, item.lng], {
        icon: createLeafletIcon(
          item.tipo, origem?.status ?? "active", item.nome, false, null, origem?.color ?? null, true, item.estado
        ),
      })
        .bindTooltip(`${item.tipo.toUpperCase()} ${item.nome} · ${PROJECT_STATUS_LABEL[item.estado]}`, { direction: "top" })
        .on("click", aoClicarItem(item.tipo, item.id))
        .addTo(grupo);
    }
  }, [mapPronto, itens, ctos, ceos, rotas, mostrarCabos, alternarItem]);

  // ─── Destaque da selecção ─────────────────────────────────────────────────
  // Camada própria, redesenhada a cada mudança de selecção. É barata: desenha
  // um anel por item seleccionado, não por item do mapa.
  useEffect(() => {
    const grupo = camadaSelecaoRef.current;
    if (!mapPronto || !grupo) return;
    grupo.clearLayers();
    for (const item of selecionadosVisiveis) {
      L.circleMarker([item.lat, item.lng], {
        radius: item.tipo === "poste" ? 9 : 22,
        color: "#22d3ee", weight: 2, fillColor: "#22d3ee", fillOpacity: 0.15,
        interactive: false,
      }).addTo(grupo);
    }
  }, [selecionadosVisiveis, mapPronto]);

  // ─── Medição: captura de cliques ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapPronto || !map) return;

    const aoClicar = (e: L.LeafletMouseEvent) => {
      if (modoRef.current === "selecionar") return;
      setPontos(atuais => [...atuais, e.latlng]);
    };
    // Duplo clique encerra a medição sem apagá-la.
    const aoDuploClique = () => {
      if (modoRef.current !== "selecionar") setModo("selecionar");
    };
    map.on("click", aoClicar);
    map.on("dblclick", aoDuploClique);
    return () => { map.off("click", aoClicar); map.off("dblclick", aoDuploClique); };
  }, [mapPronto]);

  // O cursor indica que o mapa está em modo de medição.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = modo === "selecionar" ? "" : "crosshair";
    // Duplo clique dá zoom por padrão, o que atrapalha ao encerrar a medição.
    if (modo === "selecionar") map.doubleClickZoom.enable();
    else map.doubleClickZoom.disable();
    // Shift+arrastar é zoom por caixa no Leaflet. No modo Selecionar esse gesto
    // é nosso — sem desligar, arrastar com shift dava zoom em vez de seleccionar.
    if (modo === "selecionar") map.boxZoom.disable();
    else map.boxZoom.enable();
  }, [modo, mapPronto]);

  // ─── Selecção por caixa (shift + arrastar) ────────────────────────────────
  // Shift, e não arrastar puro, porque arrastar puro é como se move o mapa —
  // roubar esse gesto tornaria a tela irritante para quem só quer navegar.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapPronto || !map) return;

    let inicio: L.LatLng | null = null;

    const aoPressionar = (e: L.LeafletMouseEvent) => {
      if (modoRef.current !== "selecionar" || !e.originalEvent.shiftKey) return;
      inicio = e.latlng;
      map.dragging.disable();
      L.DomEvent.preventDefault(e.originalEvent);
    };
    const aoMover = (e: L.LeafletMouseEvent) => {
      if (inicio) setCaixa(L.latLngBounds(inicio, e.latlng));
    };
    const aoSoltar = (e: L.LeafletMouseEvent) => {
      if (!inicio) return;
      const limites = L.latLngBounds(inicio, e.latlng);
      inicio = null;
      map.dragging.enable();
      setCaixa(null);
      // Shift+clique sem arrastar não deve seleccionar o mapa inteiro nem nada.
      if (limites.getNorth() === limites.getSouth() && limites.getEast() === limites.getWest()) return;
      setSelecionados(atual => {
        const novo = new Set(atual);
        for (const it of itensRef.current) {
          if (limites.contains(L.latLng(it.lat, it.lng))) novo.add(chave(it.tipo, it.id));
        }
        return novo;
      });
    };

    // Soltar o botão fora do mapa nunca dispara o mouseup do Leaflet, e sem
    // isto o arrasto ficaria aberto para sempre: o mapa preso, sem poder mover.
    // Cancela em vez de selecionar — um arrasto que terminou fora da tela não
    // diz o que a pessoa queria apanhar.
    const aoSoltarForaDoMapa = () => {
      if (!inicio) return;
      inicio = null;
      map.dragging.enable();
      setCaixa(null);
    };

    map.on("mousedown", aoPressionar);
    map.on("mousemove", aoMover);
    map.on("mouseup", aoSoltar);
    document.addEventListener("mouseup", aoSoltarForaDoMapa);
    return () => {
      map.off("mousedown", aoPressionar);
      map.off("mousemove", aoMover);
      map.off("mouseup", aoSoltar);
      document.removeEventListener("mouseup", aoSoltarForaDoMapa);
      // Se a tela sair no meio de um arrasto, o mapa ficaria travado.
      map.dragging.enable();
    };
  }, [mapPronto]);

  // Retângulo da caixa em curso. Camada própria para o arrasto não redesenhar
  // os anéis de destaque a cada movimento do rato.
  const retanguloRef = useRef<L.Rectangle | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapPronto || !map) return;
    if (retanguloRef.current) { safeLeafletRemove(retanguloRef.current); retanguloRef.current = null; }
    if (!caixa) return;
    retanguloRef.current = L.rectangle(caixa, {
      color: "#22d3ee", weight: 1, dashArray: "4 3", fillOpacity: 0.08, interactive: false,
    }).addTo(map);
  }, [caixa, mapPronto]);

  // ─── Medição: desenho ─────────────────────────────────────────────────────
  useEffect(() => {
    const grupo = camadaMedicaoRef.current;
    if (!mapPronto || !grupo) return;
    grupo.clearLayers();
    if (pontos.length === 0) return;

    const cor = modo === "area" || (modo === "selecionar" && pontos.length > 2) ? "#a855f7" : "#f97316";

    if (modo === "area" && pontos.length >= 3) {
      L.polygon(pontos, { color: cor, weight: 2, fillOpacity: 0.15 }).addTo(grupo);
    } else if (pontos.length >= 2) {
      L.polyline(pontos, { color: cor, weight: 3, dashArray: "6 4" }).addTo(grupo);
      // Rótulo de distância no meio de cada trecho.
      const trechos = distanciasPorTrecho(pontos);
      trechos.forEach((m, i) => {
        const meio = L.latLng((pontos[i].lat + pontos[i + 1].lat) / 2, (pontos[i].lng + pontos[i + 1].lng) / 2);
        L.marker(meio, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="background:rgba(17,24,39,0.85);color:#fff;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px;white-space:nowrap;">${formatarDistancia(m)}</div>`,
            iconSize: [0, 0],
          }),
        }).addTo(grupo);
      });
    }

    pontos.forEach((p, i) => {
      L.circleMarker(p, {
        radius: 5, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 1,
      }).bindTooltip(`${i + 1}`, { direction: "top" }).addTo(grupo);
    });
  }, [pontos, modo, mapPronto]);

  const total = distanciaTotal(pontos);
  const area = modo === "area" ? areaPoligono(pontos) : 0;

  const limpar = useCallback(() => setPontos([]), []);
  const desfazer = useCallback(() => setPontos(p => p.slice(0, -1)), []);

  // ─── Estado de projeto em lote ────────────────────────────────────────────
  const utils = trpc.useUtils();
  const setManyMut = trpc.projectStatus.setMany.useMutation();

  const aplicarEstado = useCallback(async () => {
    // Uma chamada por tipo: setMany aceita um tipo de cada vez, porque o nome
    // da tabela vem de um mapa fechado no servidor e nunca da entrada.
    const porTipo = new Map<TipoSel, number[]>();
    for (const i of selecionadosVisiveis) {
      if (i.estado === estadoAlvo) continue; // nada a escrever
      const lista = porTipo.get(i.tipo) ?? [];
      lista.push(i.id);
      porTipo.set(i.tipo, lista);
    }
    if (porTipo.size === 0) {
      toast.info("Todos os selecionados já estão nesse estado.");
      return;
    }
    try {
      let total = 0;
      // Array.from nas entradas pela mesma razão do Array.from acima: iterar
      // um Map directamente exige downlevelIteration com target ES5.
      for (const [tipo, ids] of Array.from(porTipo.entries())) {
        // O procedure aceita no máximo 500 ids. Uma caixa grande passa disso
        // com facilidade, e sem fatiar a chamada morreria na validação.
        for (let i = 0; i < ids.length; i += 500) {
          // Em série, não em paralelo: são UPDATEs no mesmo banco, e uma falha
          // no meio deixa um relato honesto do que passou em vez de um
          // emaranhado de escritas concorrentes.
          const r = await setManyMut.mutateAsync({ tipo, ids: ids.slice(i, i + 500), status: estadoAlvo });
          total += r.alterados;
        }
      }
      toast.success(`${total} ${total === 1 ? "item marcado" : "itens marcados"} como ${PROJECT_STATUS_LABEL[estadoAlvo]}`);
      await Promise.all([
        utils.ctos.list.invalidate(),
        utils.ceos.list.invalidate(),
        utils.mapPoles.list.invalidate(),
      ]);
    } catch (e: any) {
      toast.error("Erro ao aplicar: " + (e?.message ?? "desconhecido"));
    }
  }, [selecionadosVisiveis, estadoAlvo, setManyMut, utils]);

  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  const trocarModo = useCallback((novo: Modo) => {
    setModo(atual => {
      if (atual === novo) return "selecionar";
      // Trocar de ferramenta começa uma medição nova.
      if (novo !== "selecionar") setPontos([]);
      return novo;
    });
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      {/* ── Barra de modos ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 rounded-lg border border-border bg-card/95 backdrop-blur px-1.5 py-1 shadow-lg">
        <BotaoModo ativo={modo === "selecionar"} onClick={() => trocarModo("selecionar")} Icone={MousePointer2} rotulo="Selecionar" />
        <div className="w-px h-6 bg-border mx-0.5" />
        <BotaoModo ativo={modo === "regua"} onClick={() => trocarModo("regua")} Icone={Ruler} rotulo="Régua" />
        <BotaoModo ativo={modo === "area"} onClick={() => trocarModo("area")} Icone={Hexagon} rotulo="Área" />
      </div>

      {/* ── Camadas e base ── */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 items-end">
        <Button size="sm" variant={satelite ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={alternarSatelite}
          title={`Camada de satélite (${satelliteProviderLabel()})`}>
          <Layers className="w-3 h-3" />{satelite ? "Satélite" : "Ruas"}
        </Button>
        <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg flex flex-col gap-1.5 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Camadas</span>
          <Alternador marcado={mostrarCaixas} onChange={setMostrarCaixas} rotulo={`Caixas (${ctos.length + ceos.length})`} />
          <Alternador marcado={mostrarPostes} onChange={setMostrarPostes} rotulo={`Postes (${postes.length})`} />
          <Alternador marcado={mostrarCabos} onChange={setMostrarCabos} rotulo={`Cabos (${rotas.length})`} />
        </div>
      </div>

      {/* ── Resultado da medição ── */}
      {pontos.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] rounded-lg border border-border bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {modo === "area" ? "Área" : "Distância"}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {modo === "area" ? formatarArea(area) : formatarDistancia(total)}
            </span>
          </div>
          {modo === "area" && pontos.length >= 3 && (
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Perímetro</span>
              <span className="text-sm tabular-nums">{formatarDistancia(distanciaTotal([...pontos, pontos[0]]))}</span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pontos</span>
            <span className="text-sm tabular-nums">{pontos.length}</span>
          </div>
          <div className="flex items-center gap-1 border-l border-border pl-3">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={desfazer} disabled={pontos.length === 0}>
              <Undo2 className="w-3 h-3" />Desfazer
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={limpar}>
              <Trash2 className="w-3 h-3" />Limpar
            </Button>
          </div>
        </div>
      )}

      {/* ── Barra de selecção ── */}
      {selecionadosVisiveis.length > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] rounded-lg border border-cyan-500/40 bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg flex items-center gap-4 max-w-[calc(100vw-2rem)]">
          <div className="flex flex-col">
            <span className="text-base font-semibold tabular-nums leading-tight">
              {selecionadosVisiveis.length} {selecionadosVisiveis.length === 1 ? "selecionado" : "selecionados"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {(Object.keys(contagemPorTipo) as TipoSel[])
                .map(t => `${contagemPorTipo[t]} ${PROJECT_TIPO_LABEL[t]}`)
                .join(" · ")}
            </span>
          </div>

          {podeEditar ? (
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <span className="text-xs text-muted-foreground">Marcar como</span>
              <select
                value={estadoAlvo}
                onChange={e => setEstadoAlvo(e.target.value as ProjectStatus)}
                className="h-7 rounded-md border border-border bg-background text-xs px-2"
              >
                {PROJECT_STATUSES.map(s => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                ))}
              </select>
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: PROJECT_STATUS_COLOR[estadoAlvo] }}
              />
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={aplicarEstado} disabled={setManyMut.isPending}>
                {setManyMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Aplicar
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground border-l border-border pl-3">
              Só operadores podem alterar o estado de projeto.
            </span>
          )}

          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs border-l border-border rounded-none pl-3"
            onClick={limparSelecao}>
            <Trash2 className="w-3 h-3" />Limpar
          </Button>
        </div>
      )}

      {/* ── Instrução do modo activo ── */}
      {modo === "selecionar" && selecionadosVisiveis.length === 0 && pontos.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] rounded-md bg-foreground/90 text-background text-xs px-3 py-1.5 shadow-lg">
          Clique num item para selecionar. Shift+clique acrescenta; Shift+arrastar faz caixa.
        </div>
      )}
      {modo !== "selecionar" && pontos.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] rounded-md bg-foreground/90 text-background text-xs px-3 py-1.5 shadow-lg">
          {modo === "regua" ? "Clique no mapa para medir. Duplo clique encerra." : "Clique para marcar os vértices da área. Duplo clique encerra."}
        </div>
      )}

      {/* ── Aviso de beta ── */}
      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[11px] px-2.5 py-1.5">
        <Info className="w-3 h-3 shrink-0" />
        <span>Beta — só altera o estado de projeto. Criar, mover e editar continuam no Mapa de Infraestrutura.</span>
      </div>

      {carregando && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 rounded-md bg-card/95 backdrop-blur border border-border px-3 py-1.5 text-xs shadow">
          <Loader2 className="w-3 h-3 animate-spin" />Carregando dados do mapa…
        </div>
      )}

      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />
    </div>
  );
}

function BotaoModo({ ativo, onClick, Icone, rotulo }: {
  ativo: boolean; onClick: () => void; Icone: any; rotulo: string;
}) {
  return (
    <button
      onClick={onClick}
      title={rotulo}
      className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-md transition-colors ${
        ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icone className="w-4 h-4" />
      <span className="text-[10px] font-medium leading-none">{rotulo}</span>
    </button>
  );
}

function Alternador({ marcado, onChange, rotulo }: {
  marcado: boolean; onChange: (v: boolean) => void; rotulo: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={marcado} onChange={e => onChange(e.target.checked)} className="accent-primary w-3 h-3" />
      <span className={marcado ? "" : "text-muted-foreground"}>{rotulo}</span>
    </label>
  );
}
