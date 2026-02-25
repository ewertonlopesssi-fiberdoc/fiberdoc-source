import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Building2, Edit, Trash2, MapPin, Server, Thermometer } from "lucide-react";
import { useRole } from "@/hooks/useRole";

const ROOM_TYPES = [
  { value: "datacenter", label: "Data Center" },
  { value: "noc", label: "NOC" },
  { value: "pop", label: "POP" },
  { value: "cabinet", label: "Armário" },
  { value: "outdoor", label: "Externo" },
  { value: "other", label: "Outro" },
];

type RoomForm = {
  name: string;
  type: string;
  location: string;
  address: string;
  floor: string;
  city: string;
  state: string;
  notes: string;
};

const defaultForm: RoomForm = {
  name: "",
  type: "pop",
  location: "",
  address: "",
  floor: "",
  city: "",
  state: "",
  notes: "",
};

export default function Rooms() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<RoomForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: rooms, isLoading } = trpc.rooms.list.useQuery();

  const createMutation = trpc.rooms.create.useMutation({
    onSuccess: () => {
      toast.success("Sala cadastrada!");
      utils.rooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.rooms.update.useMutation({
    onSuccess: () => {
      toast.success("Sala atualizada!");
      utils.rooms.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.rooms.delete.useMutation({
    onSuccess: () => {
      toast.success("Sala removida!");
      utils.rooms.list.invalidate();
      utils.dashboard.stats.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function handleEdit(room: NonNullable<typeof rooms>[0]) {
    setEditId(room.id);
    setForm({
      name: room.name,
      type: room.type,
      location: room.location ?? "",
      address: room.address ?? "",
      floor: room.floor ?? "",
      city: room.city ?? "",
      state: room.state ?? "",
      notes: room.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      type: form.type as any,
      location: form.location || undefined,
      address: form.address || undefined,
      floor: form.floor || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      notes: form.notes || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = (rooms ?? []).filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.city?.toLowerCase().includes(search.toLowerCase()) ||
      r.location?.toLowerCase().includes(search.toLowerCase())
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Salas e Locais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro de data centers, POPs, NOCs e demais localizações
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Sala
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border/50"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">Nenhuma sala encontrada</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {search ? "Tente ajustar a busca" : "Cadastre o primeiro local"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((room) => (
            <Card key={room.id} className="border-border/50 bg-card card-hover">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                      <Building2 className="h-4.5 w-4.5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{room.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {ROOM_TYPES.find((t) => t.value === room.type)?.label ?? room.type}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 mb-4">
                  {(room.city || room.state) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{[room.city, room.state].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  {room.address && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-primary/60 font-mono text-xs">END</span>
                      <span className="truncate">{room.address}{room.floor ? `, ${room.floor}` : ""}</span>
                    </div>
                  )}
                  {room.location && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Server className="h-3 w-3 shrink-0" />
                      <span className="truncate">{room.location}</span>
                    </div>
                  )}

                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => handleEdit(room)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(room.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Sala" : "Nova Sala / Local"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: NOC Principal, POP Centro" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Localização Interna</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex: Sala 201, Andar 2" className="bg-background border-border/50" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Endereço</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ex: São Paulo" className="bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Ex: SP" className="bg-background border-border/50" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Informações adicionais..." className="bg-background border-border/50 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!form.name || isSubmitting}>
              {isSubmitting ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja remover esta sala?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border/50">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
