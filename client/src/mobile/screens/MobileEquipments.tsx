import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Server, Wifi, Network, Box, Router, HardDrive, LayoutGrid, Layers, Activity,
  ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Zap, Check, X, AlertCircle,
  Cable, Wrench, Plus
} from "lucide-react";

const EQUIPMENT_ICONS: Record<string, React.ElementType> = {
  switch: Network, olt: Wifi, dgo: Box, splitter: Layers,
  router: Router, server: Server, patch_panel: LayoutGrid,
  amplifier: Activity, other: HardDrive,
};

const EQUIPMENT_LABELS: Record<string, string> = {
  switch: "Switch", olt: "OLT", dgo: "DGO", splitter: "Splitter",
  router: "Roteador", server: "Servidor", patch_panel: "Patch Panel",
  amplifier: "Amplificador", other: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo", inactive: "Inativo", maintenance: "Manutenção",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  inactive: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  maintenance: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const PORT_STATUS_COLORS: Record<string, string> = {
  free: "bg-emerald-500",
  occupied: "bg-rose-500",
  reserved: "bg-amber-500",
  faulty: "bg-zinc-500",
};

const PORT_STATUS_LABELS: Record<string, string> = {
  free: "Livre", occupied: "Ocupada", reserved: "Reservada", faulty: "Com Falha",
};

type Equipment = {
  id: number; name: string; type: string; model?: string | null;
  status: string; rack?: string | null; rackPosition?: string | null;
  ipAddress?: string | null; totalPorts?: number | null;
  manufacturer?: string | null; serialNumber?: string | null;
  roomId?: number | null; roomName?: string | null;
  powerType?: string | null; powerSource?: string | null; powerSourceLabel?: string | null;
};

type Port = {
  id: number; portNumber: number; label?: string | null; type: string;
  speed?: string | null; status: string; notes?: string | null;
  equipmentId: number; slotId?: number | null;
};

type View = "list" | "detail" | "edit" | "ports" | "editPort" | "maintenance";

export default function MobileEquipments() {
  const { serverUrl, token } = useMobileAuth();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [ports, setPorts] = useState<Port[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Equipment>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<Port | null>(null);
  const [portStatus, setPortStatus] = useState("");
  const [portNotes, setPortNotes] = useState("");
  const [maintenanceNote, setMaintenanceNote] = useState("");
  const [maintenanceType, setMaintenanceType] = useState("preventive");

  const client = createMobileTrpcClient(serverUrl, token);

  const loadEquipments = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline()) {
        const data = await client.equipments.list.query({});
        setEquipments(data as Equipment[]);
        await saveOfflineCache("equipments_list", data);
      } else {
        const cached = await loadOfflineCache<Equipment[]>("equipments_list");
        setEquipments(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Equipment[]>("equipments_list");
      setEquipments(cached ?? []);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, token]);

  useEffect(() => { loadEquipments(); }, [loadEquipments]);

  const loadPorts = useCallback(async (equipmentId: number) => {
    setPortsLoading(true);
    try {
      if (isOnline()) {
        const data = await client.ports.byEquipment.query({ equipmentId });
        setPorts(data as unknown as Port[]);
        await saveOfflineCache(`ports_${equipmentId}`, data);
      } else {
        const cached = await loadOfflineCache<Port[]>(`ports_${equipmentId}`);
        setPorts(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Port[]>(`ports_${equipmentId}`);
      setPorts(cached ?? []);
    } finally {
      setPortsLoading(false);
    }
  }, [serverUrl, token]);

  const filtered = equipments.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.model ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.roomName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openDetail(eq: Equipment) {
    setSelected(eq);
    setView("detail");
  }

  function openEdit(eq: Equipment) {
    setEditForm({ ...eq });
    setView("edit");
  }

  function openPorts(eq: Equipment) {
    setSelected(eq);
    loadPorts(eq.id);
    setView("ports");
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await client.equipments.update.mutate({
        id: selected.id,
        name: editForm.name ?? selected.name,
        type: (editForm.type ?? selected.type) as any,
        model: editForm.model ?? null,
        status: (editForm.status ?? selected.status) as any,
        rack: editForm.rack ?? null,
        rackPosition: editForm.rackPosition ?? null,
        ipAddress: editForm.ipAddress ?? null,
        manufacturer: editForm.manufacturer ?? null,
        serialNumber: editForm.serialNumber ?? null,
        totalPorts: editForm.totalPorts ?? null,
        powerType: (editForm.powerType ?? null) as any,
        powerSource: (editForm.powerSource ?? null) as any,
        powerSourceLabel: editForm.powerSourceLabel ?? null,
      } as any);
      await loadEquipments();
      const updated = { ...selected, ...editForm };
      setSelected(updated as Equipment);
      setView("detail");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function savePortStatus() {
    if (!selectedPort) return;
    setSaving(true);
    setError(null);
    try {
      await client.ports.update.mutate({
        id: selectedPort.id,
        status: portStatus as any,
        notes: portNotes || null,
        portNumber: selectedPort.portNumber,
        type: selectedPort.type as any,
      } as any);
      if (selected) await loadPorts(selected.id);
      setView("ports");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar porta");
    } finally {
      setSaving(false);
    }
  }

  async function saveMaintenance() {
    if (!selected || !maintenanceNote.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await client.history.create.mutate({
        entityType: "equipment",
        entityId: selected.id,
        maintenanceType: maintenanceType as any,
        description: maintenanceNote,
        performedBy: "",
        scheduledAt: null,
        completedAt: null,
      } as any);
      setMaintenanceNote("");
      setView("detail");
    } catch (e: any) {
      setError(e?.message ?? "Erro ao registrar manutenção");
    } finally {
      setSaving(false);
    }
  }

  // ─── VIEWS ────────────────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white">Equipamentos</h1>
            <button onClick={loadEquipments} className="text-zinc-400 hover:text-white p-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar equipamento..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
              <Server className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum equipamento encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((eq) => {
                const Icon = EQUIPMENT_ICONS[eq.type] ?? HardDrive;
                return (
                  <button
                    key={eq.id}
                    onClick={() => openDetail(eq)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{eq.name}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {EQUIPMENT_LABELS[eq.type] ?? eq.type}
                        {eq.roomName ? ` · ${eq.roomName}` : ""}
                        {eq.rack ? ` · ${eq.rack}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[eq.status] ?? ""}`}>
                        {STATUS_LABELS[eq.status] ?? eq.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "detail" && selected) {
    const Icon = EQUIPMENT_ICONS[selected.type] ?? HardDrive;
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("list")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Equipamentos
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-white truncate">{selected.name}</h1>
              <p className="text-xs text-zinc-400">{EQUIPMENT_LABELS[selected.type] ?? selected.type}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[selected.status] ?? ""}`}>
              {STATUS_LABELS[selected.status] ?? selected.status}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Informações */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Informações</p>
            {[
              ["Modelo", selected.model],
              ["Fabricante", selected.manufacturer],
              ["Nº de Série", selected.serialNumber],
              ["IP", selected.ipAddress],
              ["Sala", selected.roomName],
              ["Rack", selected.rack],
              ["Posição (U)", selected.rackPosition],
              ["Total de Portas", selected.totalPorts?.toString()],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string} className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">{label as string}</span>
                <span className="text-xs text-zinc-200 font-mono">{value as string}</span>
              </div>
            ))}
          </div>

          {/* Energia */}
          {(selected.powerType || selected.powerSource) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3" /> Energia
              </p>
              {[
                ["Tipo", selected.powerType === "dc" ? "DC" : selected.powerType === "ac" ? "AC" : selected.powerType],
                ["Fonte", selected.powerSource === "rectifier" ? "Retificadora" : selected.powerSource === "inverter" ? "Inversora" : selected.powerSource],
                ["Identificação da Fonte", selected.powerSourceLabel],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label as string} className="flex justify-between items-center">
                  <span className="text-xs text-zinc-500">{label as string}</span>
                  <span className="text-xs text-zinc-200">{value as string}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ações */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => openEdit(selected)}
              className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-3 text-sm text-white transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Editar
            </button>
            <button
              onClick={() => openPorts(selected)}
              className="flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl py-3 text-sm text-cyan-300 transition-colors"
            >
              <Cable className="w-4 h-4" /> Portas
            </button>
            <button
              onClick={() => { setMaintenanceNote(""); setView("maintenance"); }}
              className="col-span-2 flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl py-3 text-sm text-amber-300 transition-colors"
            >
              <Wrench className="w-4 h-4" /> Registrar Manutenção
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "edit" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Cancelar
          </button>
          <h1 className="text-base font-bold text-white">Editar Equipamento</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {[
            { label: "Nome", key: "name", type: "text" },
            { label: "Modelo", key: "model", type: "text" },
            { label: "Fabricante", key: "manufacturer", type: "text" },
            { label: "Nº de Série", key: "serialNumber", type: "text" },
            { label: "Endereço IP", key: "ipAddress", type: "text" },
            { label: "Rack", key: "rack", type: "text" },
            { label: "Posição no Rack", key: "rackPosition", type: "text" },
            { label: "Total de Portas", key: "totalPorts", type: "number" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
              <input
                type={type}
                value={(editForm as any)[key] ?? ""}
                onChange={(e) => setEditForm(f => ({ ...f, [key]: type === "number" ? parseInt(e.target.value) || null : e.target.value || null }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}

          {/* Tipo */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Tipo</label>
            <select
              value={editForm.type ?? selected.type}
              onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              {Object.entries(EQUIPMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Status</label>
            <select
              value={editForm.status ?? selected.status}
              onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="maintenance">Manutenção</option>
            </select>
          </div>

          {/* Energia */}
          <div className="border-t border-zinc-800 pt-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Energia
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Tipo de Energia</label>
                <select
                  value={editForm.powerType ?? ""}
                  onChange={(e) => setEditForm(f => ({ ...f, powerType: e.target.value || null }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Não informado</option>
                  <option value="dc">DC</option>
                  <option value="ac">AC</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Fonte de Energia</label>
                <select
                  value={editForm.powerSource ?? ""}
                  onChange={(e) => setEditForm(f => ({ ...f, powerSource: e.target.value || null }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">Não informado</option>
                  <option value="rectifier">Retificadora</option>
                  <option value="inverter">Inversora</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Identificação da Fonte</label>
                <input
                  type="text"
                  value={editForm.powerSourceLabel ?? ""}
                  onChange={(e) => setEditForm(f => ({ ...f, powerSourceLabel: e.target.value || null }))}
                  placeholder="Ex: Retificadora 01 - Rack A"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveEdit}
            disabled={saving}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </div>
    );
  }

  if (view === "ports" && selected) {
    const occupied = ports.filter(p => p.status === "occupied").length;
    const total = ports.length;
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selected.name}
          </button>
          <h1 className="text-base font-bold text-white">Portas</h1>
          {total > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>{occupied} ocupadas de {total}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {portsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : ports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
              <Cable className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma porta cadastrada</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {ports.map((port) => (
                <button
                  key={port.id}
                  onClick={() => {
                    setSelectedPort(port);
                    setPortStatus(port.status);
                    setPortNotes(port.notes ?? "");
                    setError(null);
                    setView("editPort");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PORT_STATUS_COLORS[port.status] ?? "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium text-white">Porta {port.portNumber}</span>
                      {port.label && <span className="text-xs text-zinc-400 truncate">— {port.label}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500 uppercase">{port.type}</span>
                      {port.speed && <span className="text-[10px] text-zinc-500">{port.speed.toUpperCase()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-zinc-400">{PORT_STATUS_LABELS[port.status] ?? port.status}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === "editPort" && selectedPort) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("ports")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Portas
          </button>
          <h1 className="text-base font-bold text-white">Porta {selectedPort.portNumber}</h1>
          {selectedPort.label && <p className="text-xs text-zinc-400 mt-0.5">{selectedPort.label}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Info da porta (somente leitura) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Informações</p>
            {[
              ["Tipo", selectedPort.type?.toUpperCase()],
              ["Velocidade", selectedPort.speed?.toUpperCase()],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l as string} className="flex justify-between">
                <span className="text-xs text-zinc-500">{l as string}</span>
                <span className="text-xs text-zinc-200 font-mono">{v as string}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Status da Porta</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PORT_STATUS_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPortStatus(val)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    portStatus === val
                      ? "bg-cyan-500 border-cyan-500 text-zinc-900"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={portNotes}
              onChange={(e) => setPortNotes(e.target.value)}
              rows={3}
              placeholder="Notas sobre a porta..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <button
            onClick={savePortStatus}
            disabled={saving}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Salvar Status</>}
          </button>
        </div>
      </div>
    );
  }

  if (view === "maintenance" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> {selected.name}
          </button>
          <h1 className="text-base font-bold text-white">Registrar Manutenção</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Tipo de Manutenção</label>
            <select
              value={maintenanceType}
              onChange={(e) => setMaintenanceType(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="preventive">Preventiva</option>
              <option value="corrective">Corretiva</option>
              <option value="inspection">Inspeção</option>
              <option value="upgrade">Atualização</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Descrição</label>
            <textarea
              value={maintenanceNote}
              onChange={(e) => setMaintenanceNote(e.target.value)}
              rows={5}
              placeholder="Descreva o que foi realizado..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <button
            onClick={saveMaintenance}
            disabled={saving || !maintenanceNote.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> : <><Wrench className="w-4 h-4" /> Registrar</>}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
