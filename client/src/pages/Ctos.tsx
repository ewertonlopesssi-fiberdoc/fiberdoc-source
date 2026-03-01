import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Edit, Trash2, MapPin, Wifi, WifiOff, Wrench, Box, Upload, LocateFixed, Loader2 } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Ativo", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  maintenance: { label: "Manutenção", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  inactive: { label: "Inativo", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const EMPTY_FORM = {
  name: "",
  address: "",
  capacity: 8,
  usedPorts: 0,
  status: "active" as "active" | "maintenance" | "inactive",
  lat: "" as string | number,
  lng: "" as string | number,
  notes: "",
};

export default function Ctos() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterOccupancy, setFilterOccupancy] = useState<string>("all"); // "all" | "above50" | "above70" | "above80" | "above90"
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const utils = trpc.useUtils();

  async function handleGetLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm(f => ({ ...f, lat, lng }));
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`
          );
          const data = await res.json();
          if (data?.display_name) {
            setForm(f => ({ ...f, address: data.display_name }));
            toast.success("Localização e endereço preenchidos!");
          } else {
            toast.success(`Coordenadas preenchidas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        } catch {
          toast.success(`Coordenadas preenchidas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === 1) toast.error("Permissão de localização negada. Habilite o GPS no navegador.");
        else if (err.code === 2) toast.error("Posição indisponível. Verifique o GPS do dispositivo.");
        else toast.error("Tempo esgotado ao obter localização.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }
  const { data: ctos = [], refetch } = trpc.ctos.list.useQuery();

  const createMut = trpc.ctos.create.useMutation({
    onSuccess: () => { toast.success("CTO criada com sucesso"); refetch(); utils.infraMap.elements.invalidate(); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.ctos.update.useMutation({
    onSuccess: () => { toast.success("CTO atualizada"); refetch(); utils.infraMap.elements.invalidate(); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.ctos.delete.useMutation({
    onSuccess: () => { toast.success("CTO excluída"); refetch(); utils.infraMap.elements.invalidate(); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => { setEditId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); };
  const openEdit = (cto: any) => {
    setEditId(cto.id);
    setForm({
      name: cto.name ?? "",
      address: cto.address ?? "",
      capacity: cto.capacity ?? 8,
      usedPorts: cto.usedPorts ?? 0,
      status: cto.status ?? "active",
      lat: cto.lat ?? "",
      lng: cto.lng ?? "",
      notes: cto.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...form,
      capacity: Number(form.capacity),
      usedPorts: Number(form.usedPorts),
      lat: form.lat !== "" ? Number(form.lat) : undefined,
      lng: form.lng !== "" ? Number(form.lng) : undefined,
    };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  const filtered = ctos.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.address ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const pctFilter = (c.capacity ?? 0) > 0 ? Math.round(((c.usedPorts ?? 0) / c.capacity) * 100) : 0;
    const matchOccupancy =
      filterOccupancy === "all" ? true :
      filterOccupancy === "above50" ? pctFilter >= 50 :
      filterOccupancy === "above70" ? pctFilter >= 70 :
      filterOccupancy === "above80" ? pctFilter >= 80 :
      filterOccupancy === "above90" ? pctFilter >= 90 : true;
    return matchSearch && matchStatus && matchOccupancy;
  });

  const stats = {
    total: ctos.length,
    active: ctos.filter((c: any) => c.status === "active").length,
    maintenance: ctos.filter((c: any) => c.status === "maintenance").length,
    inactive: ctos.filter((c: any) => c.status === "inactive").length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CTOs</h1>
          <p className="text-muted-foreground text-sm mt-1">Caixas de Terminação Óptica</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/cto/importar")} className="gap-2">
              <Upload className="w-4 h-4" /> Importar CSV
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> Nova CTO
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Box, color: "text-cyan-400" },
          { label: "Ativas", value: stats.active, icon: Wifi, color: "text-emerald-400" },
          { label: "Manutenção", value: stats.maintenance, icon: Wrench, color: "text-amber-400" },
          { label: "Inativas", value: stats.inactive, icon: WifiOff, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou endereço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="maintenance">Manutenção</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterOccupancy} onValueChange={setFilterOccupancy}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Ocupação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer ocupação</SelectItem>
            <SelectItem value="above50">≥ 50% ocupada</SelectItem>
            <SelectItem value="above70">≥ 70% ocupada</SelectItem>
            <SelectItem value="above80">≥ 80% ocupada</SelectItem>
            <SelectItem value="above90">≥ 90% ocupada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Nome</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Endereço</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Portas</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ocupação</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Localização</th>
                  <th className="text-center px-4 py-3 text-muted-foreground font-medium">Detalhes</th>
                  {isAdmin && <th className="text-center px-4 py-3 text-muted-foreground font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      Nenhuma CTO encontrada
                    </td>
                  </tr>
                ) : filtered.map((cto: any) => {
                  const pct = cto.capacity > 0 ? Math.round((cto.usedPorts / cto.capacity) * 100) : 0;
                  const st = STATUS_LABELS[cto.status] ?? STATUS_LABELS.active;
                  return (
                    <tr key={cto.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{cto.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{cto.address || "—"}</td>
                      <td className="px-4 py-3 text-center text-foreground">{cto.usedPorts}/{cto.capacity}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {cto.lat && cto.lng ? (
                          <a
                            href={`https://maps.google.com/?q=${cto.lat},${cto.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs"
                          >
                            <MapPin className="w-3 h-3" />
                            Ver
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/cto/${cto.id}`)}
                          className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        >
                          Tubos/Vias
                        </Button>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(cto)} className="h-7 w-7 p-0">
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteId(cto.id)} className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar CTO" : "Nova CTO"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CTO-01" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, bairro" />
              </div>
              <div className="space-y-1">
                <Label>Capacidade (portas)</Label>
                <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm(f => ({ ...f, capacity: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Portas usadas</Label>
                <Input type="number" min={0} value={form.usedPorts} onChange={(e) => setForm(f => ({ ...f, usedPorts: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="maintenance">Manutenção</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <Label>Coordenadas GPS</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGetLocation}
                    disabled={geoLoading}
                    className="h-7 gap-1.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                  >
                    {geoLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Obtendo...</>
                    ) : (
                      <><LocateFixed className="h-3.5 w-3.5" /> Usar Minha Localização</>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="any" value={form.lat} onChange={(e) => setForm(f => ({ ...f, lat: e.target.value }))} placeholder="Latitude: -23.5505" />
                  <Input type="number" step="any" value={form.lng} onChange={(e) => setForm(f => ({ ...f, lng: e.target.value }))} placeholder="Longitude: -46.6333" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Clique no botão para preencher automaticamente com a posição atual do dispositivo.</p>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Informações adicionais..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name || createMut.isPending || updateMut.isPending}>
              {editId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir CTO</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">Tem certeza que deseja excluir esta CTO? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMut.mutate({ id: deleteId })} disabled={deleteMut.isPending}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
