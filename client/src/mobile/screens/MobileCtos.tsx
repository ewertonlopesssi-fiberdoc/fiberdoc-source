import { useState, useEffect, useCallback } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient, saveOfflineCache, loadOfflineCache, isOnline } from "../mobileTrpc";
import {
  Radio, ChevronRight, ChevronLeft, Search, RefreshCw, Edit2, Check,
  AlertCircle, LocateFixed, Loader2, MapPin,
} from "lucide-react";

type Cto = {
  id: number;
  name: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  capacity?: number | null;
  usedPorts?: number | null;
  status?: string | null;
  notes?: string | null;
};

type View = "list" | "detail" | "edit";

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Manutenção",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  inactive: "bg-zinc-500/20 text-zinc-400",
  maintenance: "bg-amber-500/20 text-amber-300",
};

export default function MobileCtos() {
  const { serverUrl, token } = useMobileAuth();
  const [ctos, setCtos] = useState<Cto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Cto | null>(null);
  const [editForm, setEditForm] = useState<Partial<Cto>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const client = createMobileTrpcClient(serverUrl, token);

  const loadCtos = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline()) {
        const data = await client.ctos.list.query();
        setCtos(data as Cto[]);
        await saveOfflineCache("ctos_list", data);
      } else {
        const cached = await loadOfflineCache<Cto[]>("ctos_list");
        setCtos(cached ?? []);
      }
    } catch {
      const cached = await loadOfflineCache<Cto[]>("ctos_list");
      setCtos(cached ?? []);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, token]);

  useEffect(() => { loadCtos(); }, [loadCtos]);

  async function handleGetLocation() {
    if (!navigator.geolocation) { setError("Geolocalização não suportada neste dispositivo"); return; }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(8);
        const lng = pos.coords.longitude.toFixed(8);
        let address = `${lat}, ${lng}`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`
          );
          const data = await res.json();
          if (data?.display_name) address = data.display_name;
        } catch { /* ignora erro de geocodificação */ }
        setEditForm(f => ({ ...f, lat, lng, address }));
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        setError("Não foi possível obter a localização. Verifique se o GPS está ativado.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const filtered = ctos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ─── LIST ────────────────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white">CTO</h1>
            <button onClick={loadCtos} className="text-zinc-400 hover:text-white p-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar CTO..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
              <Radio className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhuma CTO encontrada</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((cto) => {
                const pct = cto.capacity && cto.capacity > 0
                  ? Math.round(((cto.usedPorts ?? 0) / cto.capacity) * 100)
                  : null;
                return (
                  <button
                    key={cto.id}
                    onClick={() => { setSelected(cto); setView("detail"); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Radio className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{cto.name}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {cto.address ?? "Sem endereço"}
                        {pct !== null ? ` · ${pct}% ocupada` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {cto.status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[cto.status] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                          {STATUS_LABEL[cto.status] ?? cto.status}
                        </span>
                      )}
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

  // ─── DETAIL ──────────────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    const pct = selected.capacity && selected.capacity > 0
      ? Math.round(((selected.usedPorts ?? 0) / selected.capacity) * 100)
      : null;

    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("list")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> CTO
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-white">{selected.name}</h1>
              {selected.address && (
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {selected.address}
                </p>
              )}
            </div>
            {isOnline() && (
              <button
                onClick={() => { setEditForm({ ...selected }); setError(null); setView("edit"); }}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Informações */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            {selected.status && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status] ?? "bg-zinc-500/20 text-zinc-400"}`}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
              </div>
            )}
            {selected.capacity != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-zinc-500">Capacidade</span>
                  <span className="text-xs text-zinc-200">{selected.usedPorts ?? 0} / {selected.capacity} portas</span>
                </div>
                {pct !== null && (
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {selected.lat && selected.lng && (
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500">Coordenadas</span>
                <span className="text-xs text-zinc-200 font-mono">{parseFloat(selected.lat).toFixed(5)}, {parseFloat(selected.lng).toFixed(5)}</span>
              </div>
            )}
            {selected.notes && (
              <div>
                <span className="text-xs text-zinc-500 block mb-1">Observações</span>
                <p className="text-xs text-zinc-300">{selected.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── EDIT ────────────────────────────────────────────────────────────────────
  if (view === "edit" && selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setView("detail")} className="flex items-center gap-1 text-cyan-400 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Cancelar
          </button>
          <h1 className="text-base font-bold text-white">Editar CTO</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Nome *</label>
            <input
              type="text"
              value={editForm.name ?? ""}
              onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Localização com GPS */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Localização / Endereço</label>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={geoLoading}
              className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium border border-emerald-500/50 text-emerald-400 bg-transparent hover:bg-emerald-500/10 rounded-xl mb-2 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {geoLoading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Obtendo GPS...</>
                : <><LocateFixed className="w-5 h-5" /> Atualizar Minha Localização</>}
            </button>
            <input
              type="text"
              value={editForm.address ?? ""}
              onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value || null }))}
              placeholder="Rua, número, bairro"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <p className="text-[11px] text-emerald-400/70 mt-1">Toque no botão para capturar a posição atual e depois toque em Salvar.</p>
          </div>

          {/* Lat / Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Latitude</label>
              <input
                type="number"
                step="any"
                value={editForm.lat ?? ""}
                onChange={(e) => setEditForm(f => ({ ...f, lat: e.target.value || null }))}
                placeholder="-23.5505"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Longitude</label>
              <input
                type="number"
                step="any"
                value={editForm.lng ?? ""}
                onChange={(e) => setEditForm(f => ({ ...f, lng: e.target.value || null }))}
                placeholder="-46.6333"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {[["active", "Ativo"], ["inactive", "Inativo"], ["maintenance", "Manutenção"]].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, status: val }))}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                    editForm.status === val
                      ? "bg-cyan-500 border-cyan-500 text-zinc-900"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Capacidade */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Capacidade (portas)</label>
            <input
              type="number"
              value={editForm.capacity ?? ""}
              onChange={(e) => setEditForm(f => ({ ...f, capacity: parseInt(e.target.value) || null }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Observações</label>
            <textarea
              value={editForm.notes ?? ""}
              onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value || null }))}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          {/* Salvar */}
          <button
            onClick={async () => {
              if (!editForm.name?.trim()) { setError("O nome é obrigatório"); return; }
              setSaving(true); setError(null);
              try {
                await client.ctos.update.mutate({
                  id: selected.id,
                  name: editForm.name!,
                  address: editForm.address ?? undefined,
                  lat: editForm.lat != null ? parseFloat(String(editForm.lat)) : undefined,
                  lng: editForm.lng != null ? parseFloat(String(editForm.lng)) : undefined,
                  status: (editForm.status as "active" | "inactive" | "maintenance") ?? undefined,
                  capacity: editForm.capacity != null ? Number(editForm.capacity) : undefined,
                  notes: editForm.notes ?? undefined,
                });
                await loadCtos();
                setSelected({ ...selected, ...editForm } as Cto);
                setView("detail");
              } catch (e: any) { setError(e?.message ?? "Erro ao salvar"); }
              finally { setSaving(false); }
            }}
            disabled={saving || !editForm.name?.trim()}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-900 font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              : <><Check className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
