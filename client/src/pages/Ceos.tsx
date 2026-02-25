import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Box, MapPin, Layers, Pencil, Trash2, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useRole } from "@/hooks/useRole";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Manutenção",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  inactive: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  maintenance: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

type CeoForm = {
  name: string;
  location: string;
  roomId: string;
  notes: string;
  status: string;
};

const defaultForm: CeoForm = {
  name: "", location: "", roomId: "", notes: "", status: "active",
};

export default function Ceos() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CeoForm>(defaultForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  const { data: ceos = [], isLoading } = trpc.ceos.list.useQuery({});
  const { data: rooms = [] } = trpc.rooms.list.useQuery();

  const createMutation = trpc.ceos.create.useMutation({
    onSuccess: () => {
      toast.success("CEO cadastrado!");
      utils.ceos.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const updateMutation = trpc.ceos.update.useMutation({
    onSuccess: () => {
      toast.success("CEO atualizado!");
      utils.ceos.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  const deleteMutation = trpc.ceos.delete.useMutation({
    onSuccess: () => {
      toast.success("CEO removido!");
      utils.ceos.list.invalidate();
      setDeleteId(null);
    },
    onError: e => toast.error("Erro: " + e.message),
  });

  function handleEdit(ceo: typeof ceos[0]) {
    setEditId(ceo.id);
    setForm({
      name: ceo.name,
      location: ceo.location ?? "",
      roomId: ceo.roomId ? String(ceo.roomId) : "",
      notes: ceo.notes ?? "",
      status: ceo.status,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      location: form.location || undefined,
      roomId: form.roomId ? parseInt(form.roomId) : undefined,
      notes: form.notes || undefined,
      status: form.status as any,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = ceos.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const roomMap = Object.fromEntries((rooms as { id: number; name: string }[]).map(r => [r.id, r.name]));

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">CEO</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Caixas de Emenda Óptica · {ceos.length} cadastrada{ceos.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditId(null); setForm(defaultForm); setDialogOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova CEO
          </Button>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar CEO..."
          className="pl-9 bg-background border-border/50"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="py-16 text-center">
            <Box className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">
              {search ? "Nenhuma CEO encontrada" : "Nenhuma CEO cadastrada"}
            </p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {search ? "Tente outro termo de busca" : "Clique em \"Nova CEO\" para começar"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(ceo => (
            <Card
              key={ceo.id}
              className="border-border/50 bg-card group hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => setLocation(`/ceo/${ceo.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Box className="h-5 w-5 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-foreground truncate">{ceo.name}</h3>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 mt-1 ${STATUS_COLORS[ceo.status] ?? ""}`}
                      >
                        {STATUS_LABELS[ceo.status] ?? ceo.status}
                      </Badge>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); handleEdit(ceo); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={e => { e.stopPropagation(); setDeleteId(ceo.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1.5">
                  {ceo.location && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{ceo.location}</span>
                    </div>
                  )}
                  {ceo.roomId && roomMap[ceo.roomId] && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Layers className="h-3 w-3 shrink-0" />
                      <span className="truncate">{roomMap[ceo.roomId]}</span>
                    </div>
                  )}
                  {ceo.notes && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-1">{ceo.notes}</p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <span className="text-xs text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                    Ver tubos e vias <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Criar/Editar CEO */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar CEO" : "Nova CEO"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da CEO *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: CEO-01, CEO Rua das Flores"
                className="bg-background border-border/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Localização / Endereço</Label>
              <Input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Ex: Poste 123, Rua das Flores, 456"
                className="bg-background border-border/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sala / Local</Label>
                <Select value={form.roomId || "__none__"} onValueChange={v => setForm({ ...form, roomId: v === "__none__" ? "" : v })}>
                  <SelectTrigger className="bg-background border-border/50">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {(rooms as { id: number; name: string }[]).map(r => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="maintenance">Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas sobre esta CEO..."
                className="bg-background border-border/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/50">Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editId ? "Salvar" : "Criar CEO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Remover CEO</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Todos os tubos, splitters e vias desta CEO serão removidos permanentemente. Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} className="border-border/50">Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
