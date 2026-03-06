import { useState, useEffect } from "react";
import { MobileAuthProvider, useMobileAuth } from "./MobileAuthContext";
import MobileSetup from "./screens/MobileSetup";
import MobileLogin from "./screens/MobileLogin";
import MobileEquipments from "./screens/MobileEquipments";
import MobileCeos from "./screens/MobileCeos";
import MobileCtos from "./screens/MobileCtos";
import MobileMap from "./screens/MobileMap";
import MobileReport from "./screens/MobileReport";
import MobileProfile from "./screens/MobileProfile";
import MobileSshCommander from "./screens/MobileSshCommander";
import { Server, Cable, BarChart2, User, WifiOff, Radio, Map, Terminal } from "lucide-react";

type Tab = "equipamentos" | "ceos" | "ctos" | "mapa" | "relatorio" | "ssh" | "perfil";

function MobileShell() {
  const { isConfigured, isAuthenticated, user } = useMobileAuth();
  const isAdmin = user?.role === "admin";
  // operator e user não vêem o SSH Commander
  const [online, setOnline] = useState(navigator.onLine);

  // Deep-link via URL: /mobile?eq=ID abre directamente o equipamento
  const params = new URLSearchParams(window.location.search);
  const deepEqId = params.get("eq") ? Number(params.get("eq")) : null;
  const [activeTab, setActiveTab] = useState<Tab>(deepEqId ? "equipamentos" : "equipamentos");

  // Deep-link interno: ao tocar "Abrir detalhes" no mapa, navegar para CEO/CTO
  const [deepCeoId, setDeepCeoId] = useState<number | null>(null);
  const [deepCtoId, setDeepCtoId] = useState<number | null>(null);

  // Foco no mapa: ao tocar "Ver no Mapa" no CEO/CTO, navegar para o mapa e centrar
  const [mapFocusType, setMapFocusType] = useState<"ceo" | "cto" | null>(null);
  const [mapFocusId, setMapFocusId] = useState<number | null>(null);

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

  const allTabs: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: "equipamentos", label: "Equip.",    icon: Server    },
    { id: "ceos",         label: "CEO",       icon: Cable     },
    { id: "ctos",         label: "CTO",       icon: Radio     },
    { id: "mapa",         label: "Mapa",      icon: Map       },
    { id: "relatorio",    label: "Relatório", icon: BarChart2 },
    { id: "ssh",          label: "SSH",       icon: Terminal, adminOnly: true },
    { id: "perfil",       label: "Perfil",    icon: User      },
  ];
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin); // adminOnly=true => só admin vê

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
        {activeTab === "mapa"         && <MobileMap onOpenDetail={handleOpenDetail} focusType={mapFocusType} focusId={mapFocusId} onFocusConsumed={() => { setMapFocusType(null); setMapFocusId(null); }} />}
        {activeTab === "relatorio"    && <MobileReport />}
        {activeTab === "ssh"          && <MobileSshCommander />}
        {activeTab === "perfil"       && <MobileProfile />}
      </div>

      {/* Bottom navigation */}
      <nav className="flex-shrink-0 bg-zinc-900 border-t border-zinc-800 pb-safe">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative ${active ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium leading-tight">{tab.label}</span>
                {active && (
                  <div className="absolute bottom-0 w-6 h-0.5 bg-cyan-400 rounded-full" />
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
