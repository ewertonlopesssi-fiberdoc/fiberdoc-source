import { useState, useRef, useEffect, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MousePointer2, Ruler, Hexagon, Layers, Loader2, Trash2, Undo2, Info,
} from "lucide-react";
import { createStreetLayer, createSatelliteLayer, clampZoomForStreet, satelliteProviderLabel } from "@/lib/mapTiles";
import { createLeafletIcon } from "@/lib/map/icons";
import { safeLeafletRemove } from "@/lib/map/leaflet-utils";
import { distanciaTotal, distanciasPorTrecho, areaPoligono, formatarDistancia, formatarArea } from "@/lib/map/measure";

/**
 * Mapa 2.0 (beta) — casca nova sobre o motor extraído de InfrastructureMap.
 *
 * Esta tela NÃO grava nada. É deliberado: ela está visível para todos os
 * usuários enquanto amadurece, e um beta que escreve no banco transforma
 * qualquer engano em estrago real. Criação e edição continuam no mapa atual.
 *
 * O que ela testa é a ergonomia: barra de modos no lugar do menu suspenso,
 * e as duas ferramentas que hoje não existem — régua livre e desenho de área.
 *
 * Tudo o que ela desenha reaproveita os módulos de lib/map/. Conforme a tela
 * precisar de mais peças do mapa atual, elas saem de lá para lib/map/ com um
 * caso de uso real guiando a interface, em vez de adivinhada de antemão.
 */

type Modo = "selecionar" | "regua" | "area";

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

  const { data: ctos = [], isLoading: carregandoCtos } = trpc.ctos.list.useQuery(undefined, OPCOES_QUERY);
  const { data: ceos = [], isLoading: carregandoCeos } = trpc.ceos.list.useQuery({}, OPCOES_QUERY);
  const { data: postes = [] } = trpc.mapPoles.list.useQuery(undefined, OPCOES_QUERY);
  const { data: rotas = [] } = trpc.infraMap.routes.useQuery(undefined, OPCOES_QUERY);
  const { data: sysConfig } = trpc.systemConfig.get.useQuery(undefined, { staleTime: 600_000, refetchOnWindowFocus: false });

  const carregando = carregandoCtos || carregandoCeos;

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
    camadaMedicaoRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapPronto(true);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      camadaDadosRef.current = null;
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

    if (mostrarCaixas) {
      (ctos as any[]).forEach(c => {
        if (c.lat == null || c.lng == null) return;
        L.marker([Number(c.lat), Number(c.lng)], { icon: createLeafletIcon("cto", c.status ?? "active", c.name ?? "CTO") })
          .bindTooltip(`CTO ${c.name ?? ""}`, { direction: "top" })
          .addTo(grupo);
      });
      (ceos as any[]).forEach(c => {
        if (c.lat == null || c.lng == null) return;
        L.marker([Number(c.lat), Number(c.lng)], { icon: createLeafletIcon("ceo", c.status ?? "active", c.name ?? "CEO") })
          .bindTooltip(`CEO ${c.name ?? ""}`, { direction: "top" })
          .addTo(grupo);
      });
    }

    if (mostrarPostes) {
      (postes as any[]).forEach(p => {
        if (p.lat == null || p.lng == null) return;
        L.circleMarker([Number(p.lat), Number(p.lng)], {
          radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.9, weight: 1,
        }).bindTooltip(p.name ?? "Poste", { direction: "top" }).addTo(grupo);
      });
    }
  }, [mapPronto, ctos, ceos, postes, rotas, mostrarCaixas, mostrarPostes, mostrarCabos]);

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
  }, [modo, mapPronto]);

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

      {/* ── Instrução do modo activo ── */}
      {modo !== "selecionar" && pontos.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] rounded-md bg-foreground/90 text-background text-xs px-3 py-1.5 shadow-lg">
          {modo === "regua" ? "Clique no mapa para medir. Duplo clique encerra." : "Clique para marcar os vértices da área. Duplo clique encerra."}
        </div>
      )}

      {/* ── Aviso de beta ── */}
      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[11px] px-2.5 py-1.5">
        <Info className="w-3 h-3 shrink-0" />
        <span>Beta — somente visualização. Para criar ou editar, use o Mapa de Infraestrutura.</span>
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
