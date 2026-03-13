import { useState, useEffect } from "react";
import { MobileAuthProvider, useMobileAuth } from "./MobileAuthContext";
import MobileSetup from "./screens/MobileSetup";
import MobileLogin from "./screens/MobileLogin";
import MobileEquipments from "./screens/MobileEquipments";
import MobileCeos from "./screens/MobileCeos";
import MobileCtos from "./screens/MobileCtos";
import MobileMap from "./screens/MobileMap";
import MobileProfile from "./screens/MobileProfile";
import MobileOtdr from "./screens/MobileOtdr";
import { Server, Box, Activity, User, WifiOff, Radio, Map } from "lucide-react";

type Tab = "equipamentos" | "ceos" | "ctos" | "mapa" | "otdr" | "perfil";

function MobileShell() {
  const { isConfigured, isAuthenticated, user } = useMobileAuth();
  const isAdmin = user?.role === "admin";
  const [online, setOnline] = useState(navigator.onLine);

  // Deep-link via URL: /mobile?eq=ID abre directamente o equipamento
  const params = new URLSearchParams(window.location.search);
  const deepEqId = params.get("eq") ? Number(params.get("eq")) : null;
  const [activeTab, setActiveTab] = useState<Tab>("equipamentos");

  // Deep-link interno: ao tocar "Abrir detalhes" no mapa, navegar para CEO/CTO
  const [deepCeoId, setDeepCeoId] = useState<number | null>(null);
  const [deepCtoId, setDeepCtoId] = useState<number | null>(null);

  // Foco no mapa: ao tocar "Ver no Mapa" no CEO/CTO ou OTDR, navegar para o mapa e centrar
  const [mapFocusType, setMapFocusType] = useState<"ceo" | "cto" | "coords" | null>(null);
  const [mapFocusId, setMapFocusId] = useState<number | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Callback chamado pelo MobileMap ao tocar "Abrir detalhes"
  function handleOpenDetail(type: "ceo" | "cto", id: number) {
    if (type === "ceo") {
      setDeepCeoId(id);
      setDeepCtoId(null);
      setActiveTab("ceos");
    } else {
      setDeepCtoId(id);
      setDeepCeoId(null);
      setActiveTab("ctos");
    }
  }

  // Callback chamado pelo CEO/CTO ao tocar "Ver no Mapa"
  function handleGoToMap(type: "ceo" | "cto", id: number) {
    setMapFocusType(type);
    setMapFocusId(id);
    setMapFocusCoords(null);
    setActiveTab("mapa");
  }

  // Callback chamado pelo OTDR ao tocar "Ver no Mapa" com coordenadas
  function handleGoToMapCoords(lat: number, lng: number) {
    setMapFocusType("coords");
    setMapFocusId(null);
    setMapFocusCoords({ lat, lng });
    setActiveTab("mapa");
  }

  // Limpar deep-link quando o utilizador muda de aba manualmente
  function handleTabChange(tab: Tab) {
    if (tab !== "ceos") setDeepCeoId(null);
    if (tab !== "ctos") setDeepCtoId(null);
    setActiveTab(tab);
  }

  if (!isConfigured)    return <MobileSetup />;
  if (!isAuthenticated) return <MobileLogin />;

  const allTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "equipamentos", label: "Equip.",  icon: Server   },
    { id: "ceos",         label: "CEO",     icon: Box      },
    { id: "ctos",         label: "CTO",     icon: Radio    },
    { id: "mapa",         label: "Mapa",    icon: Map      },
    { id: "otdr",         label: "OTDR",    icon: Activity },
    { id: "perfil",       label: "Perfil",  icon: User     },
  ];
  const tabs = allTabs;

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1e] overflow-hidden">
      {/* Status bar offline */}
      {!online && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-500/20 border-b border-amber-500/30 py-1.5 px-4 flex-shrink-0">
          <WifiOff className="w-3 h-3 text-amber-400" />
          <span className="text-xs text-amber-300 font-medium">Modo offline — dados em cache</span>
        </div>
      )}

      {/* Conteúdo da aba ativa */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "equipamentos" && <MobileEquipments initialEquipmentId={deepEqId} />}
        {activeTab === "ceos"         && <MobileCeos initialCeoId={deepCeoId} onDeepLinkConsumed={() => setDeepCeoId(null)} onGoToMap={handleGoToMap} />}
        {activeTab === "ctos"         && <MobileCtos initialCtoId={deepCtoId} onDeepLinkConsumed={() => setDeepCtoId(null)} onGoToMap={handleGoToMap} />}
        {activeTab === "mapa"         && (
          <MobileMap
            onOpenDetail={handleOpenDetail}
            focusType={mapFocusType}
            focusId={mapFocusId}
            focusCoords={mapFocusCoords}
            onFocusConsumed={() => { setMapFocusType(null); setMapFocusId(null); setMapFocusCoords(null); }}
          />
        )}
        {activeTab === "otdr"         && <MobileOtdr onGoToMap={handleGoToMapCoords} />}
        {activeTab === "perfil"       && <MobileProfile />}
      </div>

      {/* Bottom navigation */}
      <nav className="flex-shrink-0 bg-zinc-900/95 border-t border-zinc-800 pb-safe backdrop-blur-sm">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center pt-2 pb-2.5 gap-0.5 transition-all relative ${active ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {/* Pill de fundo no ativo */}
                {active && (
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-10 h-8 bg-cyan-400/10 rounded-xl" />
                )}
                <Icon
                  className={`relative z-10 transition-all ${active ? "w-[22px] h-[22px]" : "w-5 h-5"}`}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span className={`relative z-10 text-[10px] leading-tight transition-all ${active ? "font-semibold" : "font-medium"}`}>
                  {tab.label}
                </span>
                {/* Indicador inferior */}
                {active && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-cyan-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function MobileApp() {
  return (
    <MobileAuthProvider>
      <MobileShell />
    </MobileAuthProvider>
  );
}
