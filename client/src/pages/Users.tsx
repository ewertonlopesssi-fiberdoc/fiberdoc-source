import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users as UsersIcon, ShieldCheck, Eye, Trash2, UserCog, Crown, Clock,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";

type UserRow = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: "admin" | "user";
  loginMethod: string | null;
  createdAt: Date;
  lastSignedIn: Date;
};

export default function Users() {
  const { isAdmin } = useRole();
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();
  const [roleDialog, setRoleDialog] = useState<UserRow | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<UserRow | null>(null);
  const [newRole, setNewRole] = useState<"admin" | "user">("user");

  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.users.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const updateRoleMutation = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Papel atualizado com sucesso!");
      utils.users.list.invalidate();
      setRoleDialog(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.users.remove.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido.");
      utils.users.list.invalidate();
      setDeleteDialog(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Esta página é acessível apenas para administradores do sistema.
        </p>
        <Button variant="outline" onClick={() => setLocation("/")} className="border-border/50">
          Voltar ao Dashboard
        </Button>
      </div>
    );
  }

  const userList = users as UserRow[];
  const adminCount = userList.filter(u => u.role === "admin").length;
  const viewerCount = userList.filter(u => u.role === "user").length;

  function openRoleDialog(user: UserRow) {
    setRoleDialog(user);
    setNewRole(user.role);
  }

  function formatDate(date: Date) {
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie os grupos de acesso dos usuários do sistema
          </p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <UsersIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-2xl font-bold text-foreground">{userList.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Crown className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Administradores</p>
              <p className="text-2xl font-bold text-amber-400">{adminCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Eye className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Visualizadores</p>
              <p className="text-2xl font-bold text-blue-400">{viewerCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de usuários */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Lista de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : userList.length === 0 ? (
            <div className="py-16 text-center">
              <UsersIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {userList.map((user) => {
                const isSelf = currentUser?.id === user.id;
                return (
                  <div
                    key={user.id}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30",
                      isSelf && "bg-primary/5"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border",
                      user.role === "admin"
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    )}>
                      {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">
                          {user.name ?? "Sem nome"}
                        </span>
                        {isSelf && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                            Você
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {user.email && (
                          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          Último acesso: {formatDate(user.lastSignedIn)}
                        </span>
                      </div>
                    </div>

                    {/* Badge de papel */}
                    <div className="shrink-0">
                      {user.role === "admin" ? (
                        <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 gap-1">
                          <Crown className="h-3 w-3" />
                          Administrador
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 gap-1">
                          <Eye className="h-3 w-3" />
                          Visualizador
                        </Badge>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openRoleDialog(user)}
                        disabled={isSelf}
                        title="Alterar papel"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteDialog(user)}
                        disabled={isSelf}
                        title="Remover usuário"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legenda de papéis */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Permissões por Grupo
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-400">Administrador</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✓ Visualizar todos os dados</li>
                <li>✓ Criar, editar e excluir equipamentos</li>
                <li>✓ Criar, editar e excluir fibras e CEOs</li>
                <li>✓ Gerenciar portas, slots e conexões</li>
                <li>✓ Importar dados via CSV</li>
                <li>✓ Gerenciar usuários e grupos de acesso</li>
              </ul>
            </div>
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-400">Visualizador</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✓ Visualizar todos os dados</li>
                <li>✓ Imprimir mapas de fusões</li>
                <li>✓ Consultar topologia de racks</li>
                <li>✓ Pesquisar equipamentos e fibras</li>
                <li>✗ Criar, editar ou excluir registros</li>
                <li>✗ Gerenciar usuários</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Alterar papel */}
      <Dialog open={roleDialog !== null} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Alterar Grupo de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Alterando o papel de <strong className="text-foreground">{roleDialog?.name ?? roleDialog?.email}</strong>
            </p>
            <div className="space-y-1.5">
              <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "user")}>
                <SelectTrigger className="bg-background border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                      Administrador — acesso total
                    </div>
                  </SelectItem>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-blue-400" />
                      Visualizador — somente leitura
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)} className="border-border/50">
              Cancelar
            </Button>
            <Button
              onClick={() => roleDialog && updateRoleMutation.mutate({ userId: roleDialog.id, role: newRole })}
              disabled={updateRoleMutation.isPending || newRole === roleDialog?.role}
            >
              {updateRoleMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar remoção */}
      <Dialog open={deleteDialog !== null} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Remover Usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover <strong className="text-foreground">{deleteDialog?.name ?? deleteDialog?.email}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)} className="border-border/50">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && removeMutation.mutate({ userId: deleteDialog.id })}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
