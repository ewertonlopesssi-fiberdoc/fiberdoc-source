import { useState, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, isOnline } from "../mobileTrpc";
import { BarChart2, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

type EquipmentReport = {
  equipmentId: number;
  equipmentName: string;
  roomName: string | null;
  totalPorts: number;
  freePorts: number;
  occupiedPorts: number;
  reservedPorts: number;
  faultyPorts: number;
  occupancyRate: number;
  ports: {
    id: number; portNumber: number; label: string | null;
    type: string; speed: string | null; status: string; notes: string | null;
  }[];
};

const STATUS_LABELS: Record<string, string> = {
  free: "Livre", occupied: "Ocupada", reserved: "Reservada", faulty: "Com Falha",
};

const STATUS_DOT: Record<string, string> = {
  free: "bg-emerald-500", occupied: "bg-rose-500",
  reserved: "bg-amber-500", faulty: "bg-zinc-500",
};

export default function MobileReport() {
  const { serverUrl, token } = useMobileAuth();
  const [data, setData] = useState<EquipmentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const client = createMobileTrpcClient(serverUrl, token);

  const load = useCallback(async () => {
    if (!isOnline()) {
      setError("Relatório requer conexão com o servidor.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await client.reports.occupancy.query({});
      setData(result as unknown as EquipmentReport[]);
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }, [serverUrl, token]);

  const totalPorts = data.reduce((s, e) => s + e.totalPorts, 0);
  const totalOccupied = data.reduce((s, e) => s + e.occupiedPorts, 0);
  const globalRate = totalPorts > 0 ? Math.round((totalOccupied / totalPorts) * 100) : 0;

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">Relatório de Ocupação</h1>
          <button onClick={load} disabled={loading} className="text-zinc-400 hover:text-white p-1 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {loaded && (
          <p className="text-xs text-zinc-400 mt-1">{data.length} equipamentos · {totalPorts} portas</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!loaded && !loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-4">
            <BarChart2 className="w-10 h-10 text-zinc-600" />
            <p className="text-sm text-zinc-400 text-center">Toque em atualizar para carregar o relatório</p>
            <button
              onClick={load}
              className="bg-cyan-500 hover:bg-cyan-400 text-zinc-900 font-semibold px-6 py-2.5 rounded-xl text-sm"
            >
              Carregar Relatório
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {loaded && !loading && (
          <>
            {/* Resumo global */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Ocupação Global</p>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-300">{totalOccupied} ocupadas</span>
                <span className="font-bold text-white">{globalRate}%</span>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${globalRate >= 90 ? "bg-rose-500" : globalRate >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${globalRate}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-500 mt-2">
                <span>{totalPorts - totalOccupied} livres</span>
                <span>{totalPorts} total</span>
              </div>
            </div>

            {/* Lista de equipamentos */}
            <div className="space-y-2">
              {data.map((eq) => {
                const isExp = expanded.has(eq.equipmentId);
                return (
                  <div key={eq.equipmentId} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleExpand(eq.equipmentId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{eq.equipmentName}</p>
                        {eq.roomName && <p className="text-xs text-zinc-500">{eq.roomName}</p>}
                        <div className="mt-1.5 w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${eq.occupancyRate >= 90 ? "bg-rose-500" : eq.occupancyRate >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${eq.occupancyRate}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-bold ${eq.occupancyRate >= 90 ? "text-rose-400" : eq.occupancyRate >= 70 ? "text-amber-400" : "text-emerald-400"}`}>
                          {eq.occupancyRate}%
                        </span>
                        {isExp ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                      </div>
                    </button>

                    {isExp && (
                      <div className="border-t border-zinc-800 px-4 pb-3">
                        <div className="flex gap-4 py-2 text-xs text-zinc-400">
                          <span className="text-emerald-400">{eq.freePorts} livres</span>
                          <span className="text-rose-400">{eq.occupiedPorts} ocupadas</span>
                          {eq.reservedPorts > 0 && <span className="text-amber-400">{eq.reservedPorts} reservadas</span>}
                          {eq.faultyPorts > 0 && <span className="text-zinc-400">{eq.faultyPorts} com falha</span>}
                        </div>
                        <div className="space-y-1.5 mt-1">
                          {eq.ports.map((port) => (
                            <div key={port.id} className="flex items-center gap-2.5 py-1 border-b border-zinc-800/50 last:border-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[port.status] ?? "bg-zinc-500"}`} />
                              <span className="text-xs font-mono text-zinc-300 w-12 flex-shrink-0">P{port.portNumber}</span>
                              {port.label && <span className="text-xs text-zinc-500 truncate flex-1">{port.label}</span>}
                              <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                                <span className="text-[10px] text-zinc-500 uppercase">{port.type}</span>
                                {port.speed && <span className="text-[10px] text-zinc-600">{port.speed.toUpperCase()}</span>}
                                <span className="text-[10px] text-zinc-400">{STATUS_LABELS[port.status] ?? port.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
