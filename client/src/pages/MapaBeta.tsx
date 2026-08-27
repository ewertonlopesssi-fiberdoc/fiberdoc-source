import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  MousePointer2, Ruler, Hexagon, Layers, Loader2, Trash2, Undo2, Info, Check,
  FolderTree, Plus, ChevronDown, FolderPlus, Cable,
} from "lucide-react";
import MapContextMenu, { type MapContextMenuTarget, type MapContextMenuTipo } from "@/components/map/MapContextMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { resumirProjeto, formatarContagem } from "@shared/projectSummary";
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

/**
 * "cabo" partilha a maquinaria da régua de propósito: desenhar um cabo é
 * colocar vértices e querer saber quanto deu. A diferença é o que acontece no
 * fim — a régua descarta, o cabo grava.
 */
type Modo = "selecionar" | "regua" | "area" | "cabo";

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

/**
 * O projeto activo sobrevive a recarregamentos.
 *
 * A ideia é escolher uma vez e trabalhar o dia inteiro; perder a escolha a
 * cada F5 transformaria a comodidade em irritação. Fica no navegador de quem
 * desenha, porque é preferência de trabalho e não dado do sistema — duas
 * pessoas a projetar bairros diferentes não devem disputar o mesmo valor.
 */
const CHAVE_PROJETO = "fiberdoc.mapa2.projetoAtivo";

function lerProjetoGuardado(): number | null {
  try {
    const v = localStorage.getItem(CHAVE_PROJETO);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    // Modo privado, armazenamento bloqueado. Sem projeto activo, e sem drama.
    return null;
  }
}

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

  // ─── Criação ──────────────────────────────────────────────────────────────
  const [menuContexto, setMenuContexto] = useState<MapContextMenuTarget | null>(null);
  const [dialogoCriar, setDialogoCriar] = useState<{ tipo: TipoSel; lat: number; lng: number } | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [novaCapacidade, setNovaCapacidade] = useState(8);
  // O padrão é "Em projeto", e não "Implantado" como no resto do sistema.
  // Aqui é prancheta: quem desenha está a projetar, não a documentar o que já
  // existe em campo. Marcar como implantado por omissão faria o percentual do
  // projeto nascer em 100%, que é o oposto do que se quer ver.
  const [novoEstado, setNovoEstado] = useState<ProjectStatus>("planned");

  // ─── Desenho de cabo ──────────────────────────────────────────────────────
  /**
   * A que caixa cada vértice do cabo está preso, na mesma ordem de `pontos`.
   * Null quando o vértice caiu no vazio.
   *
   * É um array paralelo, e não dois valores "de"/"para", por causa do desfazer:
   * guardando só as duas pontas, remover o último vértice deixaria uma ligação
   * fantasma apontando para uma caixa que já não está no traçado. Assim as
   * pontas são sempre derivadas do que está desenhado agora.
   *
   * Os ids são de ELEMENTO DO MAPA — que é o que map_routes referencia — e não
   * do cadastro da CTO. São números diferentes para a mesma caixa.
   */
  const [pontasIdx, setPontasIdx] = useState<Array<{ id: number; rotulo: string } | null>>([]);
  const [dialogoCabo, setDialogoCabo] = useState(false);
  const [caboNome, setCaboNome] = useState("");
  const [caboFibras, setCaboFibras] = useState(12);
  const [caboTipo, setCaboTipo] = useState("FO");
  const [caboCor, setCaboCor] = useState("#22d3ee");
  const [caboEstado, setCaboEstado] = useState<ProjectStatus>("planned");

  const { data: ctos = [], isLoading: carregandoCtos } = trpc.ctos.list.useQuery(undefined, OPCOES_QUERY);
  const { data: ceos = [], isLoading: carregandoCeos } = trpc.ceos.list.useQuery({}, OPCOES_QUERY);
  const { data: postes = [] } = trpc.mapPoles.list.useQuery(undefined, OPCOES_QUERY);
  const { data: rotas = [] } = trpc.infraMap.routes.useQuery(undefined, OPCOES_QUERY);
  const { data: sysConfig } = trpc.systemConfig.get.useQuery(undefined, { staleTime: 600_000, refetchOnWindowFocus: false });
  const { data: grupos = [] } = trpc.mapGroups.list.useQuery(undefined, OPCOES_QUERY);
  const { data: resumos = {} } = trpc.mapGroups.projectSummary.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: true });
  // Os elementos do mapa não são desenhados a partir daqui — as caixas vêm de
  // ctos/ceos com a sua própria posição. Esta consulta serve só para traduzir
  // (tipo, id do cadastro) → id do elemento do mapa, que é a chave por onde a
  // associação a grupo funciona.
  const { data: elementosMapa = [] } = trpc.infraMap.elements.useQuery(undefined, OPCOES_QUERY);

  // ─── Projeto activo ───────────────────────────────────────────────────────
  const [projetoAtivo, setProjetoAtivo] = useState<number | null>(lerProjetoGuardado);
  const [soDoProjeto, setSoDoProjeto] = useState(false);

  useEffect(() => {
    try {
      if (projetoAtivo == null) localStorage.removeItem(CHAVE_PROJETO);
      else localStorage.setItem(CHAVE_PROJETO, String(projetoAtivo));
    } catch { /* armazenamento indisponível — a escolha vale só nesta sessão */ }
  }, [projetoAtivo]);

  const projetos = useMemo(() => (grupos as any[]).filter(g => g?.isProject), [grupos]);
  const projeto = useMemo(
    () => projetos.find((p: any) => Number(p.id) === projetoAtivo) ?? null,
    [projetos, projetoAtivo]
  );

  // O projeto guardado pode ter sido apagado noutra tela. Sem isto, o filtro
  // "só este projeto" esconderia tudo apontando para um grupo que não existe.
  useEffect(() => {
    if (projetoAtivo != null && projetos.length > 0 && !projeto) {
      setProjetoAtivo(null);
      setSoDoProjeto(false);
    }
  }, [projeto, projetoAtivo, projetos.length]);

  const resumoProjeto = useMemo(
    () => (projeto ? resumirProjeto((resumos as any)[projeto.id]) : null),
    [projeto, resumos]
  );

  /** (tipo, id do cadastro) → id do elemento do mapa. */
  const idElementoPorItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elementosMapa as any[]) {
      if (e?.type === "cto" || e?.type === "ceo") {
        m.set(chave(e.type, Number(e.referenceId)), Number(e.id));
      }
    }
    return m;
  }, [elementosMapa]);

  /** Chaves dos itens que pertencem ao projeto activo. Null = sem projeto. */
  const chavesDoProjeto = useMemo(() => {
    if (!projeto) return null;
    const s = new Set<string>();
    const idsElementos = new Set((projeto.elements ?? []).map((x: any) => Number(x.elementId)));
    for (const e of elementosMapa as any[]) {
      if ((e?.type === "cto" || e?.type === "ceo") && idsElementos.has(Number(e.id))) {
        s.add(chave(e.type, Number(e.referenceId)));
      }
    }
    for (const p of (projeto.poles ?? [])) s.add(chave("poste", Number(p.poleId)));
    return s;
  }, [projeto, elementosMapa]);

  /** Ids de cabos do projeto activo, para o filtro de visualização. */
  const rotasDoProjeto = useMemo(() => {
    if (!projeto) return null;
    return new Set((projeto.routes ?? []).map((r: any) => Number(r.routeId)));
  }, [projeto]);

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
    // "Só este projeto" é um interruptor à parte, e não um efeito de escolher
    // o projeto: escolher já filtrar esconderia em silêncio a rede existente,
    // e desenhar por cima do que não se vê é como se criam sobreposições.
    if (soDoProjeto && chavesDoProjeto) {
      return saida.filter(i => chavesDoProjeto.has(chave(i.tipo, i.id)));
    }
    return saida;
  }, [ctos, ceos, postes, mostrarCaixas, mostrarPostes, soDoProjeto, chavesDoProjeto]);

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

  // O mesmo motivo, para o índice de elementos: pô-lo nas dependências do
  // efeito de desenho faria o mapa inteiro ser redesenhado a cada refetch.
  const idElementoPorItemRef = useRef<Map<string, number>>(new Map());
  useEffect(() => { idElementoPorItemRef.current = idElementoPorItem; }, [idElementoPorItem]);

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
        if (soDoProjeto && rotasDoProjeto && !rotasDoProjeto.has(Number(r.id))) return;
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
    const aoClicarItem = (tipo: TipoSel, id: number, lat: number, lng: number, nome: string) => (e: L.LeafletMouseEvent) => {
      // No modo cabo, clicar numa caixa krava o vértice na posição exacta dela
      // e liga a ponta. Traçar até "perto" da caixa deixaria o cabo solto, e a
      // ligação é o que faz o cabo valer alguma coisa no cadastro.
      if (modoRef.current === "cabo") {
        L.DomEvent.stopPropagation(e.originalEvent);
        const idElemento = tipo === "poste" ? null : (idElementoPorItemRef.current.get(chave(tipo, id)) ?? null);
        // Lido do ref, e não de dentro do actualizador do setPontos: disparar
        // um setState dentro do actualizador de outro roda duas vezes em modo
        // estrito, e a ponta acabaria gravada duas vezes.
        const ponta = idElemento != null
          ? { id: idElemento, rotulo: `${tipo.toUpperCase()} ${nome}` }
          : null;
        setPontasIdx(a => [...a, ponta]);
        setPontos(atuais => [...atuais, L.latLng(lat, lng)]);
        return;
      }
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
          .on("click", aoClicarItem(item.tipo, item.id, item.lat, item.lng, item.nome))
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
        .on("click", aoClicarItem(item.tipo, item.id, item.lat, item.lng, item.nome))
        .addTo(grupo);
    }
  }, [mapPronto, itens, ctos, ceos, rotas, mostrarCabos, alternarItem, soDoProjeto, rotasDoProjeto]);

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
      // No modo cabo o vértice caiu no vazio: entra sem ponta.
      if (modoRef.current === "cabo") setPontasIdx(a => [...a, null]);
      setPontos(atuais => [...atuais, e.latlng]);
    };
    // Duplo clique encerra a medição sem apagá-la. No modo cabo, encerra o
    // traçado e abre o diálogo — os dois cliques que compõem o duplo já
    // acrescentaram vértices repetidos, e eles são retirados ao gravar.
    const aoDuploClique = () => {
      if (modoRef.current === "cabo") {
        if (pontosRef.current.length >= 2) setDialogoCabo(true);
        return;
      }
      if (modoRef.current !== "selecionar") setModo("selecionar");
    };
    map.on("click", aoClicar);
    map.on("dblclick", aoDuploClique);
    return () => { map.off("click", aoClicar); map.off("dblclick", aoDuploClique); };
  }, [mapPronto]);

  // ─── Botão direito: criar neste ponto ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapPronto || !map) return;
    const aoBotaoDireito = (e: L.LeafletMouseEvent) => {
      L.DomEvent.preventDefault(e.originalEvent);
      setMenuContexto({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    };
    map.on("contextmenu", aoBotaoDireito);
    return () => { map.off("contextmenu", aoBotaoDireito); };
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

    // No modo cabo o traçado já sai na cor escolhida, para o que se vê ser o
    // que vai ficar gravado.
    const cor = modo === "cabo"
      ? caboCor
      : modo === "area" || (modo === "selecionar" && pontos.length > 2) ? "#a855f7" : "#f97316";

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

  const limpar = useCallback(() => { setPontos([]); setPontasIdx([]); }, []);
  const desfazer = useCallback(() => {
    setPontos(p => p.slice(0, -1));
    setPontasIdx(a => a.slice(0, -1));
  }, []);

  // ─── Estado de projeto em lote ────────────────────────────────────────────
  const utils = trpc.useUtils();
  const setManyMut = trpc.projectStatus.setMany.useMutation();

  /**
   * Recarrega tudo o que uma escrita pode ter mexido.
   *
   * Fica declarado ANTES de quem o usa de propósito: a lista de dependências
   * de um useCallback é avaliada durante o render, e referenciar um const
   * declarado mais abaixo estoura com "Cannot access before initialization".
   *
   * E inclui projectSummary. Sem ele, aplicar estado em lote actualizava os
   * marcadores e deixava o percentual do projeto congelado até um F5 — que
   * foi exactamente o que aconteceu no primeiro teste de ponta a ponta.
   */
  const recarregarTudo = useCallback(() => Promise.all([
    utils.ctos.list.invalidate(),
    utils.ceos.list.invalidate(),
    utils.mapPoles.list.invalidate(),
    utils.infraMap.elements.invalidate(),
    utils.mapGroups.list.invalidate(),
    utils.mapGroups.projectSummary.invalidate(),
  ]), [utils]);


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
      await recarregarTudo();
    } catch (e: any) {
      toast.error("Erro ao aplicar: " + (e?.message ?? "desconhecido"));
    }
  }, [selecionadosVisiveis, estadoAlvo, setManyMut, recarregarTudo]);

  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  // ─── Criar elemento no ponto clicado ──────────────────────────────────────
  const criarCtoMut = trpc.ctos.create.useMutation();
  const criarCeoMut = trpc.ceos.create.useMutation();
  const criarPosteMut = trpc.mapPoles.create.useMutation();
  const upsertElementoMut = trpc.infraMap.upsertElement.useMutation();
  const setStatusMut = trpc.projectStatus.set.useMutation();
  const addElementoGrupoMut = trpc.mapGroups.addElement.useMutation();
  const addPosteGrupoMut = trpc.mapGroups.addPole.useMutation();
  const criarProjetoMut = trpc.mapGroups.create.useMutation();

  const criando =
    criarCtoMut.isPending || criarCeoMut.isPending || criarPosteMut.isPending ||
    upsertElementoMut.isPending || setStatusMut.isPending;

  const abrirDialogoCriar = useCallback((tipo: MapContextMenuTipo, lat: number, lng: number) => {
    // O menu só oferece os três tipos que esta tela desenha, mas a assinatura
    // do componente permite cinco — a guarda é para o dia em que alguém
    // alargar a lista e esquecer o resto.
    if (tipo !== "cto" && tipo !== "ceo" && tipo !== "poste") {
      toast.info("Este tipo ainda não é criado pelo Mapa 2.0.");
      return;
    }
    setDialogoCriar({ tipo, lat, lng });
    setNovoNome("");
    setNovaCapacidade(8);
    setNovoEstado("planned");
  }, []);

  const confirmarCriacao = useCallback(async () => {
    if (!dialogoCriar) return;
    const nome = novoNome.trim();
    if (!nome) { toast.error("Informe o nome."); return; }
    const { tipo, lat, lng } = dialogoCriar;
    try {
      if (tipo === "poste") {
        const r = await criarPosteMut.mutateAsync({ name: nome, lat, lng });
        if (novoEstado !== "deployed") {
          await setStatusMut.mutateAsync({ tipo: "poste", id: r.id, status: novoEstado });
        }
        if (projetoAtivo != null) {
          await addPosteGrupoMut.mutateAsync({ poleId: r.id, groupId: projetoAtivo });
        }
      } else {
        // CTO e CEO nascem em duas partes: o cadastro numa tabela própria, e a
        // posição em map_elements. Sem o segundo passo o elemento existe e não
        // aparece no mapa — foi assim que o mapa antigo sempre fez.
        const criado = tipo === "cto"
          ? await criarCtoMut.mutateAsync({ name: nome, capacity: novaCapacidade, lat, lng })
          : await criarCeoMut.mutateAsync({ name: nome });
        // O id que a associação a grupo usa é o do ELEMENTO DO MAPA, devolvido
        // aqui — não o do cadastro. Confundir os dois associaria o grupo a um
        // elemento qualquer, em silêncio.
        const elemento = await upsertElementoMut.mutateAsync({ type: tipo, referenceId: criado.id, lat, lng });
        // `deployed` é o padrão da coluna; só escreve quando é outra coisa.
        if (novoEstado !== "deployed") {
          await setStatusMut.mutateAsync({ tipo, id: criado.id, status: novoEstado });
        }
        if (projetoAtivo != null) {
          await addElementoGrupoMut.mutateAsync({ elementId: elemento.id, groupId: projetoAtivo });
        }
      }
      toast.success(
        projeto
          ? `${tipo === "poste" ? "Poste" : tipo.toUpperCase()} "${nome}" criado em ${projeto.name}`
          : `${tipo === "poste" ? "Poste" : tipo.toUpperCase()} "${nome}" criado`
      );
      setDialogoCriar(null);
      await recarregarTudo();
    } catch (e: any) {
      toast.error("Erro ao criar: " + (e?.message ?? "desconhecido"));
    }
  }, [dialogoCriar, novoNome, novaCapacidade, novoEstado, projetoAtivo, projeto,
      criarCtoMut, criarCeoMut, criarPosteMut, upsertElementoMut, setStatusMut,
      addElementoGrupoMut, addPosteGrupoMut, recarregarTudo]);

  // ─── Juntar o que já está seleccionado ao projeto activo ──────────────────
  const adicionarSelecaoAoProjeto = useCallback(async () => {
    if (projetoAtivo == null || !projeto) return;
    const jaDentro = chavesDoProjeto ?? new Set<string>();
    const novos = selecionadosVisiveis.filter(i => !jaDentro.has(chave(i.tipo, i.id)));
    if (novos.length === 0) {
      toast.info("Todos os selecionados já estão neste projeto.");
      return;
    }
    try {
      let entraram = 0;
      let semElemento = 0;
      for (const i of novos) {
        if (i.tipo === "poste") {
          await addPosteGrupoMut.mutateAsync({ poleId: i.id, groupId: projetoAtivo });
          entraram++;
          continue;
        }
        const elementId = idElementoPorItem.get(chave(i.tipo, i.id));
        if (elementId == null) {
          // Caixa cadastrada com coordenada mas sem linha em map_elements.
          // Acontece com importações antigas; associar sem isso é impossível.
          semElemento++;
          continue;
        }
        await addElementoGrupoMut.mutateAsync({ elementId, groupId: projetoAtivo });
        entraram++;
      }
      if (entraram > 0) toast.success(`${entraram} ${entraram === 1 ? "item adicionado" : "itens adicionados"} a ${projeto.name}`);
      if (semElemento > 0) toast.warning(`${semElemento} sem posição no mapa — abra pelo Mapa de Infraestrutura primeiro.`);
      await recarregarTudo();
    } catch (e: any) {
      toast.error("Erro ao adicionar: " + (e?.message ?? "desconhecido"));
    }
  }, [projetoAtivo, projeto, chavesDoProjeto, selecionadosVisiveis, idElementoPorItem,
      addElementoGrupoMut, addPosteGrupoMut, recarregarTudo]);

  // ─── Gravar o cabo desenhado ──────────────────────────────────────────────
  const criarRotaMut = trpc.infraMap.createRoute.useMutation();
  const addRotaGrupoMut = trpc.mapGroups.addRoute.useMutation();

  /**
   * Vértices sem as repetições que o duplo clique deixa.
   *
   * O duplo clique dispara dois cliques antes, então o traçado acaba com dois
   * ou três vértices no mesmo sítio. Gravar assim daria um cabo com pontos
   * mortos no fim e um comprimento correcto por acidente.
   */
  const caminhoCabo = useMemo(() => {
    const saida: L.LatLng[] = [];
    const pontas: Array<{ id: number; rotulo: string } | null> = [];
    pontos.forEach((p, i) => {
      const ultimo = saida[saida.length - 1];
      if (ultimo && Math.abs(ultimo.lat - p.lat) < 1e-9 && Math.abs(ultimo.lng - p.lng) < 1e-9) {
        // Repetido: mantém a ponta se este vértice trouxe uma e o anterior não.
        if (pontasIdx[i] && !pontas[pontas.length - 1]) pontas[pontas.length - 1] = pontasIdx[i];
        return;
      }
      saida.push(p);
      pontas.push(pontasIdx[i] ?? null);
    });
    return { pontos: saida, pontas };
  }, [pontos, pontasIdx]);

  /** Pontas derivadas do que está desenhado agora — nunca de estado antigo. */
  const pontasDoCabo = useMemo(() => {
    const comPonta = caminhoCabo.pontas
      .map((p, i) => (p ? { ...p, i } : null))
      .filter(Boolean) as Array<{ id: number; rotulo: string; i: number }>;
    if (comPonta.length === 0) return { de: null, para: null };
    const de = comPonta[0];
    const para = comPonta.length > 1 ? comPonta[comPonta.length - 1] : null;
    // Um cabo que sai e volta à mesma caixa não tem duas pontas distintas.
    return { de, para: para && para.id !== de.id ? para : null };
  }, [caminhoCabo]);

  const comprimentoCabo = useMemo(() => distanciaTotal(caminhoCabo.pontos), [caminhoCabo]);

  const confirmarCabo = useCallback(async () => {
    const nome = caboNome.trim();
    if (caminhoCabo.pontos.length < 2) { toast.error("Um cabo precisa de pelo menos dois pontos."); return; }
    try {
      const r = await criarRotaMut.mutateAsync({
        name: nome || undefined,
        fromElementId: pontasDoCabo.de?.id,
        toElementId: pontasDoCabo.para?.id,
        fiberCount: caboFibras,
        cableType: caboTipo,
        color: caboCor,
        path: JSON.stringify(caminhoCabo.pontos.map(p => ({ lat: p.lat, lng: p.lng }))),
      });
      if (caboEstado !== "deployed") {
        await setStatusMut.mutateAsync({ tipo: "cabo", id: r.id, status: caboEstado });
      }
      if (projetoAtivo != null) {
        await addRotaGrupoMut.mutateAsync({ routeId: r.id, groupId: projetoAtivo });
      }
      toast.success(
        `Cabo ${nome ? `"${nome}" ` : ""}gravado — ${formatarDistancia(comprimentoCabo)}` +
        (projeto ? ` em ${projeto.name}` : "")
      );
      setDialogoCabo(false);
      setCaboNome("");
      setPontos([]);
      setPontasIdx([]);
      setModo("selecionar");
      await Promise.all([utils.infraMap.routes.invalidate(), recarregarTudo()]);
    } catch (e: any) {
      toast.error("Erro ao gravar o cabo: " + (e?.message ?? "desconhecido"));
    }
  }, [caboNome, caminhoCabo, pontasDoCabo, caboFibras, caboTipo, caboCor, caboEstado,
      comprimentoCabo, projetoAtivo, projeto, criarRotaMut, setStatusMut, addRotaGrupoMut,
      utils, recarregarTudo]);

  // ─── Criar projeto sem sair da prancheta ──────────────────────────────────
  const [dialogoProjeto, setDialogoProjeto] = useState(false);
  const [nomeProjeto, setNomeProjeto] = useState("");
  const [corProjeto, setCorProjeto] = useState("#6366f1");

  const confirmarCriarProjeto = useCallback(async () => {
    const nome = nomeProjeto.trim();
    if (!nome) { toast.error("Informe o nome do projeto."); return; }
    try {
      const r = await criarProjetoMut.mutateAsync({ name: nome, color: corProjeto, isProject: true });
      setProjetoAtivo(r.id);
      setDialogoProjeto(false);
      setNomeProjeto("");
      toast.success(`Projeto "${nome}" criado e activo`);
      await utils.mapGroups.list.invalidate();
    } catch (e: any) {
      toast.error("Erro ao criar projeto: " + (e?.message ?? "desconhecido"));
    }
  }, [nomeProjeto, corProjeto, criarProjetoMut, utils]);

  const trocarModo = useCallback((novo: Modo) => {
    setModo(atual => {
      if (atual === novo) return "selecionar";
      // Trocar de ferramenta começa um traçado novo.
      if (novo !== "selecionar") { setPontos([]); setPontasIdx([]); }
      return novo;
    });
  }, []);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)]">
      {/* ── Barra de modos ── */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 rounded-lg border border-border bg-card/95 backdrop-blur px-1.5 py-1 shadow-lg">
        {/* Seletor de projeto activo */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              // Alvo estável para o teste de fumaça. Sem isto ele teria de
              // apontar para a estrutura do DOM, e qualquer mexida no desenho
              // quebraria o teste sem nada de errado ter acontecido.
              data-smoke="seletor-projeto"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-muted text-left max-w-[220px]"
              title={
                projeto
                  ? resumoProjeto && !resumoProjeto.vazio
                    ? `${projeto.name} — ${resumoProjeto.feitos} de ${resumoProjeto.total} implantados · ${formatarContagem(resumoProjeto, PROJECT_TIPO_LABEL)}`
                    : `${projeto.name} — ainda sem itens`
                  : "Nenhum projeto activo. Escolher um faz tudo o que você criar entrar nele."
              }
            >
              {projeto ? (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: projeto.color ?? "#6366f1" }} />
              ) : (
                <FolderTree className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs truncate">
                {projeto ? projeto.name : <span className="text-muted-foreground">Nenhum projeto</span>}
              </span>
              {projeto && resumoProjeto && !resumoProjeto.vazio && (
                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                  {resumoProjeto.percentual}%
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs">Projeto activo</DropdownMenuLabel>
            <DropdownMenuItem className="text-xs" onSelect={() => { setProjetoAtivo(null); setSoDoProjeto(false); }}>
              <span className="text-muted-foreground">Nenhum projeto</span>
            </DropdownMenuItem>
            {projetos.length > 0 && <DropdownMenuSeparator />}
            {projetos.map((p: any) => {
              const r = resumirProjeto((resumos as any)[p.id]);
              return (
                <DropdownMenuItem key={p.id} className="text-xs gap-2" onSelect={() => setProjetoAtivo(Number(p.id))}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color ?? "#6366f1" }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {r.vazio ? "vazio" : `${r.percentual}%`}
                  </span>
                </DropdownMenuItem>
              );
            })}
            {podeEditar && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs gap-2" onSelect={() => setDialogoProjeto(true)}>
                  <FolderPlus className="w-3.5 h-3.5 text-violet-400" />
                  Novo projeto…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {projeto && (
          <button
            onClick={() => setSoDoProjeto(v => !v)}
            title="Mostrar apenas os itens deste projeto"
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              soDoProjeto ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            só este
          </button>
        )}

        <div className="w-px h-6 bg-border mx-0.5" />
        <BotaoModo ativo={modo === "selecionar"} onClick={() => trocarModo("selecionar")} Icone={MousePointer2} rotulo="Selecionar" />
        <div className="w-px h-6 bg-border mx-0.5" />
        <BotaoModo ativo={modo === "regua"} onClick={() => trocarModo("regua")} Icone={Ruler} rotulo="Régua" />
        <BotaoModo ativo={modo === "area"} onClick={() => trocarModo("area")} Icone={Hexagon} rotulo="Área" />
        {podeEditar && (
          <BotaoModo ativo={modo === "cabo"} onClick={() => trocarModo("cabo")} Icone={Cable} rotulo="Cabo" dataSmoke="modo-cabo" />
        )}
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
              {modo === "area" ? "Área" : modo === "cabo" ? "Comprimento" : "Distância"}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {modo === "area" ? formatarArea(area) : formatarDistancia(modo === "cabo" ? comprimentoCabo : total)}
            </span>
          </div>
          {modo === "cabo" && (
            <div className="flex flex-col max-w-[260px]">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pontas</span>
              <span className="text-xs truncate">
                {pontasDoCabo.de
                  ? <>{pontasDoCabo.de.rotulo}{pontasDoCabo.para ? <> → {pontasDoCabo.para.rotulo}</> : <span className="text-muted-foreground"> → solta</span>}</>
                  : <span className="text-muted-foreground">nenhuma — clique numa caixa para ligar</span>}
              </span>
            </div>
          )}
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
            {modo === "cabo" && (
              <Button size="sm" className="h-7 gap-1 text-xs ml-1" onClick={() => setDialogoCabo(true)}
                disabled={caminhoCabo.pontos.length < 2}>
                <Check className="w-3 h-3" />Gravar cabo
              </Button>
            )}
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

          {podeEditar && projeto && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0"
              onClick={adicionarSelecaoAoProjeto} title={`Adicionar ao projeto ${projeto.name}`}>
              <Plus className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{projeto.name}</span>
            </Button>
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
          {modo === "regua"
            ? "Clique no mapa para medir. Duplo clique encerra."
            : modo === "cabo"
              ? "Clique para traçar o cabo. Clique numa caixa para ligar a ponta. Duplo clique encerra."
              : "Clique para marcar os vértices da área. Duplo clique encerra."}
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

      {/* ── Menu do botão direito ── */}
      {menuContexto && (
        <MapContextMenu
          target={menuContexto}
          isAdmin={podeEditar}
          tipos={["cto", "ceo", "poste"]}
          onClose={() => setMenuContexto(null)}
          onAdd={abrirDialogoCriar}
          onCopyCoords={(lat, lng) => {
            navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
              .then(() => toast.success("Coordenadas copiadas"))
              .catch(() => toast.error("Não foi possível copiar"));
          }}
        />
      )}

      {/* ── Diálogo de criação ── */}
      <Dialog open={dialogoCriar !== null} onOpenChange={aberto => { if (!aberto) setDialogoCriar(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialogoCriar?.tipo === "poste" ? "Novo poste" : `Novo ${dialogoCriar?.tipo?.toUpperCase() ?? ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={novoNome}
                autoFocus
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !criando) confirmarCriacao(); }}
                placeholder={dialogoCriar?.tipo === "cto" ? "Ex: CX-0042" : "Ex: CEO Centro"}
              />
            </div>
            {dialogoCriar?.tipo === "cto" && (
              <div className="space-y-1.5">
                <Label>Capacidade (portas)</Label>
                <Input
                  type="number" min={1}
                  value={novaCapacidade}
                  onChange={e => setNovaCapacidade(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Estado de projeto</Label>
              <select
                value={novoEstado}
                onChange={e => setNovoEstado(e.target.value as ProjectStatus)}
                className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
              >
                {PROJECT_STATUSES.map(s => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Começa em "Em projeto" porque aqui se desenha o que ainda vai ser feito.
              </p>
            </div>
            {projeto && (
              <p className="text-[11px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: projeto.color ?? "#6366f1" }} />
                <span className="text-muted-foreground">Entra no projeto <strong className="text-foreground">{projeto.name}</strong></span>
              </p>
            )}
            {dialogoCriar && (
              <p className="text-[11px] text-muted-foreground font-mono">
                {dialogoCriar.lat.toFixed(6)}, {dialogoCriar.lng.toFixed(6)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoCriar(null)} disabled={criando}>Cancelar</Button>
            <Button onClick={confirmarCriacao} disabled={criando}>
              {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo do cabo ── */}
      <Dialog open={dialogoCabo} onOpenChange={setDialogoCabo}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Gravar cabo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Comprimento</span>
                <span className="font-semibold tabular-nums">{formatarDistancia(comprimentoCabo)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Vértices</span>
                <span className="tabular-nums">{caminhoCabo.pontos.length}</span>
              </div>
              <div className="text-xs pt-1 border-t border-border/60">
                {pontasDoCabo.de ? (
                  <span>
                    {pontasDoCabo.de.rotulo}
                    {pontasDoCabo.para
                      ? <> → {pontasDoCabo.para.rotulo}</>
                      : <span className="text-amber-500"> → ponta solta</span>}
                  </span>
                ) : (
                  <span className="text-amber-500">Sem ligação a caixas — o cabo fica solto no mapa.</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={caboNome} autoFocus onChange={e => setCaboNome(e.target.value)}
                placeholder="Opcional — ex: Tronco Dom Hélder" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fibras</Label>
                <Input type="number" min={1} value={caboFibras}
                  onChange={e => setCaboFibras(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Input value={caboTipo} onChange={e => setCaboTipo(e.target.value)} placeholder="FO" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={caboCor} onChange={e => setCaboCor(e.target.value)}
                    className="w-10 h-8 rounded cursor-pointer border border-border" />
                  <span className="text-xs text-muted-foreground">{caboCor}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <select value={caboEstado} onChange={e => setCaboEstado(e.target.value as ProjectStatus)}
                  className="w-full h-9 rounded-md border border-border bg-background text-sm px-2">
                  {PROJECT_STATUSES.map(s => (
                    <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            {projeto && (
              <p className="text-[11px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: projeto.color ?? "#6366f1" }} />
                <span className="text-muted-foreground">Entra no projeto <strong className="text-foreground">{projeto.name}</strong></span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoCabo(false)} disabled={criarRotaMut.isPending}>Continuar traçando</Button>
            <Button onClick={confirmarCabo} disabled={criarRotaMut.isPending || caminhoCabo.pontos.length < 2}>
              {criarRotaMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gravar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo de novo projeto ── */}
      <Dialog open={dialogoProjeto} onOpenChange={setDialogoProjeto}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={nomeProjeto}
                autoFocus
                onChange={e => setNomeProjeto(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !criarProjetoMut.isPending) confirmarCriarProjeto(); }}
                placeholder="Ex: Expansão Dom Hélder"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={corProjeto} onChange={e => setCorProjeto(e.target.value)}
                  className="w-10 h-8 rounded cursor-pointer border border-border" />
                <span className="text-xs text-muted-foreground">{corProjeto}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O projeto é uma pasta do mapa com acompanhamento de execução. Ele
              aparece igual no painel de grupos do Mapa de Infraestrutura.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoProjeto(false)} disabled={criarProjetoMut.isPending}>Cancelar</Button>
            <Button onClick={confirmarCriarProjeto} disabled={criarProjetoMut.isPending}>
              {criarProjetoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />
    </div>
  );
}

function BotaoModo({ ativo, onClick, Icone, rotulo, dataSmoke }: {
  ativo: boolean; onClick: () => void; Icone: any; rotulo: string; dataSmoke?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={rotulo}
      data-smoke={dataSmoke}
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
