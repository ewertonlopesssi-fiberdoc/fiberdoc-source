import { useState, useEffect } from "react";
import { MobileAuthProvider, useMobileAuth } from "./MobileAuthContext";
import MobileSetup from "./screens/MobileSetup";
import MobileLogin from "./screens/MobileLogin";
import MobileEquipments from "./screens/MobileEquipments";
import MobileCeos from "./screens/MobileCeos";
import MobileReport from "./screens/MobileReport";
import MobileProfile from "./screens/MobileProfile";
import { Server, Cable, BarChart2, User, Wifi, WifiOff } from "lucide-react";

type Tab = "equipamentos" | "ceos" | "relatorio" | "perfil";

function MobileShell() {
  const { isConfigured, isAuthenticated } = useMobileAuth();
  const [online, setOnline] = useState(navigator.onLine);

  // Deep-link: /mobile?eq=ID abre diretamente o equipamento
  const params = new URLSearchParams(window.location.search);
  const deepEqId = params.get("eq") ? Number(params.get("eq")) : null;
  const [activeTab, setActiveTab] = useState<Tab>(deepEqId ? "equipamentos" : "equipamentos");

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!isConfigured) return <MobileSetup />;
  if (!isAuthenticated) return <MobileLogin />;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "equipamentos", label: "Equipamentos", icon: Server },
    { id: "ceos", label: "CEO", icon: Cable },
    { id: "relatorio", label: "Relatório", icon: BarChart2 },
    { id: "perfil", label: "Perfil", icon: User },
  ];

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
        {activeTab === "ceos" && <MobileCeos />}
        {activeTab === "relatorio" && <MobileReport />}
        {activeTab === "perfil" && <MobileProfile />}
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
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                  active ? "text-cyan-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {active && (
                  <div className="absolute bottom-0 w-8 h-0.5 bg-cyan-400 rounded-full" />
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
