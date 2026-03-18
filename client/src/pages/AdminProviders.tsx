/**
 * AdminProviders.tsx
 * Painel de administração para gerenciar provedores (tenants) no FiberDoc.
 * Acessível apenas para usuários com role=admin.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, ExternalLink, AlertTriangle, Copy, CheckCheck } from "lucide-react";
import { useState as useLocalState } from "react";

interface Tenant {
  id: number;
  slug: string;
  name: string;
  dbName: string;
  logoUrl: string | null;
  active: boolean;
  createdAt: string | null;
}

export default function AdminProviders() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Tenant | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [permissionError, setPermissionError] = useState<{ error: string; help: string; sql: string } | null>(null);
  const [defaultCredentials, setDefaultCredentials] = useState<{ email: string; password: string; slug: string; name: string } | null>(null);

  async function loadTenants() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tenants", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error ?? "Erro ao carregar provedores");
        return;
      }
      const data = await res.json();
      setTenants(data.tenants ?? []);
    } catch (err: any) {
      toast.error("Erro de conexão ao carregar provedores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTenants();
  }, []);

  // Verificar disponibilidade do slug com debounce
  useEffect(() => {
    if (!newSlug || newSlug.length < 2) {
      setSlugAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const res = await fetch(`/api/admin/tenants/check-slug/${encodeURIComponent(newSlug)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setSlugAvailable(data.available);
        }
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [newSlug]);

  async function handleCreate() {
    if (!newSlug || !newName) {
      toast.error("Slug e nome são obrigatórios");
      return;
    }
    if (slugAvailable === false) {
      toast.error("Este slug já está em uso");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug.toLowerCase().trim(),
          name: newName.trim(),
          logoUrl: newLogoUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Erro de permissão MySQL: exibir dialog com instruções de correção
        if (data.permissionError) {
          setPermissionError({
            error: data.error ?? "Permissão negada",
            help: data.permissionHelp ?? "",
            sql: data.fix?.sql ?? "",
          });
          return;
        }
        toast.error(data.error ?? "Erro ao criar provedor");
        return;
      }
      setShowCreate(false);
      setNewSlug("");
      setNewName("");
      setNewLogoUrl("");
      setSlugAvailable(null);
      await loadTenants();
      // Exibir credenciais padrão se foram criadas
      if (data.defaultCredentials) {
        setDefaultCredentials({
          email: data.defaultCredentials.email,
          password: data.defaultCredentials.password,
          slug: data.slug,
          name: data.name ?? newName,
        });
      } else {
        toast.success(data.message ?? `Provedor '${newName}' criado com sucesso!`);
      }
    } catch (err: any) {
      toast.error("Erro de conexão ao criar provedor");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(tenant: Tenant) {
    setActionLoading(tenant.id);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tenant.active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error ?? "Erro ao atualizar provedor");
        return;
      }
      toast.success(
        tenant.active
          ? `Provedor '${tenant.name}' desativado.`
          : `Provedor '${tenant.name}' ativado.`
      );
      await loadTenants();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReprovision(tenant: Tenant) {
    setActionLoading(tenant.id);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/reprovision`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao reaplicar migrações");
        return;
      }
      toast.success(data.message ?? "Migrações reaplicadas com sucesso!");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(tenant: Tenant) {
    setActionLoading(tenant.id);
    setDeleteConfirm(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao remover provedor");
        return;
      }
      toast.success(data.message ?? `Provedor '${tenant.name}' removido.`);
      await loadTenants();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setActionLoading(null);
    }
  }

  const slugPattern = /^[a-z0-9-_]+$/;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Provedores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cada provedor possui banco de dados isolado e acesso via URL dedicada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadTenants} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Provedor
          </Button>
        </div>
      </div>

      {/* Tabela de provedores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Provedores Cadastrados
            {!loading && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">
                ({tenants.length} {tenants.length === 1 ? "provedor" : "provedores"})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum provedor cadastrado ainda.</p>
              <p className="text-sm mt-1">Clique em "Novo Provedor" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug (URL)</TableHead>
                  <TableHead>Banco de Dados</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          /{tenant.slug}
                        </code>
                        <a
                          href={`/${tenant.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="Abrir em nova aba"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground">
                        {tenant.dbName}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.active ? "default" : "secondary"}>
                        {tenant.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {tenant.createdAt
                        ? new Date(tenant.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {/* Ativar/Desativar */}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={tenant.active ? "Desativar" : "Ativar"}
                          disabled={actionLoading === tenant.id}
                          onClick={() => handleToggleActive(tenant)}
                        >
                          {actionLoading === tenant.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : tenant.active ? (
                            <ToggleRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        {/* Reaplicar migrações */}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reaplicar migrações de banco"
                          disabled={actionLoading === tenant.id}
                          onClick={() => handleReprovision(tenant)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        {/* Excluir */}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remover provedor"
                          disabled={actionLoading === tenant.id}
                          onClick={() => setDeleteConfirm(tenant)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Informações sobre o sistema multi-tenant */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Como funciona o sistema multi-tenant:</p>
            <p>
              • Cada provedor possui um banco de dados MySQL isolado (ex:{" "}
              <code className="bg-muted px-1 rounded">fiberdoc_netfibra</code>)
            </p>
            <p>
              • O acesso é feito via URL dedicada:{" "}
              <code className="bg-muted px-1 rounded">https://servidor/slug-do-provedor</code>
            </p>
            <p>
              • Ao criar um provedor, o banco é criado automaticamente com todas as tabelas
            </p>
            <p>
              • Provedores inativos não são acessíveis via URL (retornam 404)
            </p>
            <p>
              • Remover um provedor aqui não apaga o banco de dados (preservação de dados)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Criar novo provedor */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Provedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug (identificador na URL)
                <span className="text-destructive ml-1">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="slug"
                  placeholder="ex: netfibra"
                  value={newSlug}
                  onChange={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "");
                    setNewSlug(v);
                    setSlugAvailable(null);
                  }}
                  className={
                    slugAvailable === false
                      ? "border-destructive"
                      : slugAvailable === true
                      ? "border-green-500"
                      : ""
                  }
                />
                {checkingSlug && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {newSlug && !slugPattern.test(newSlug) && (
                <p className="text-xs text-destructive">
                  Use apenas letras minúsculas, números, hífens e underscores.
                </p>
              )}
              {slugAvailable === false && (
                <p className="text-xs text-destructive">Este slug já está em uso.</p>
              )}
              {slugAvailable === true && (
                <p className="text-xs text-green-500">Slug disponível!</p>
              )}
              {newSlug && slugPattern.test(newSlug) && (
                <p className="text-xs text-muted-foreground">
                  URL de acesso:{" "}
                  <code className="bg-muted px-1 rounded">
                    {window.location.origin}/{newSlug}
                  </code>
                  <br />
                  Banco de dados:{" "}
                  <code className="bg-muted px-1 rounded">
                    fiberdoc_{newSlug.replace(/-/g, "_")}
                  </code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                Nome do Provedor
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="name"
                placeholder="ex: NetFibra Telecom"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">URL do Logo (opcional)</Label>
              <Input
                id="logoUrl"
                placeholder="https://exemplo.com/logo.png"
                value={newLogoUrl}
                onChange={(e) => setNewLogoUrl(e.target.value)}
              />
            </div>

            <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">O que será criado:</p>
              <p>1. Registro do provedor no banco master</p>
              <p>2. Banco de dados MySQL isolado</p>
              <p>3. Todas as tabelas do FiberDoc (73 tabelas)</p>
              <p className="mt-1 text-yellow-600 dark:text-yellow-400">
                ⚠ Este processo pode levar alguns segundos.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newSlug || !newName || slugAvailable === false}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Provedor
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Erro de permissão MySQL */}
      <Dialog open={!!permissionError} onOpenChange={() => setPermissionError(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permissão MySQL Insuficiente
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              {permissionError?.error}
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-4 space-y-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Para corrigir, execute o seguinte comando no MySQL como root:
              </p>
              <div className="relative">
                <pre className="bg-black/80 text-green-400 text-xs rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                  {permissionError?.sql}
                </pre>
                <button
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(permissionError?.sql ?? "");
                    toast.success("Comando copiado!");
                  }}
                  title="Copiar comando"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Acesse o MySQL como root: <code className="bg-muted px-1 rounded">mysql -u root -p</code>
              </p>
            </div>
            <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
              <p className="font-medium">Após executar o comando:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Feche este diálogo</li>
                <li>Tente criar o provedor novamente</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionError(null)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(permissionError?.sql ?? "");
                toast.success("Comando copiado!");
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Comando SQL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Credenciais padrão do novo provedor */}
      <Dialog open={!!defaultCredentials} onOpenChange={() => setDefaultCredentials(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCheck className="h-5 w-5" />
              Provedor Criado com Sucesso!
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              O provedor <strong>{defaultCredentials?.name}</strong> foi criado com banco de dados isolado.
              Use as credenciais abaixo para o primeiro acesso:
            </p>
            <div className="bg-muted rounded-md p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">URL de Acesso</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-background border rounded px-2 py-1 flex-1 overflow-x-auto">
                    {window.location.origin}/{defaultCredentials?.slug}
                  </code>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/${defaultCredentials?.slug}`); toast.success("URL copiada!"); }}
                    title="Copiar URL"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Email</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-background border rounded px-2 py-1 flex-1">
                    {defaultCredentials?.email}
                  </code>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { navigator.clipboard.writeText(defaultCredentials?.email ?? ""); toast.success("Email copiado!"); }}
                    title="Copiar email"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Senha Padrão</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-background border rounded px-2 py-1 flex-1">
                    {defaultCredentials?.password}
                  </code>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => { navigator.clipboard.writeText(defaultCredentials?.password ?? ""); toast.success("Senha copiada!"); }}
                    title="Copiar senha"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-amber-600 dark:text-amber-400">
              <strong>⚠ Importante:</strong> O sistema solicitará a troca de senha no primeiro acesso.
              Guarde essas credenciais em local seguro antes de fechar este diálogo.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const text = `Provedor: ${defaultCredentials?.name}\nURL: ${window.location.origin}/${defaultCredentials?.slug}\nEmail: ${defaultCredentials?.email}\nSenha: ${defaultCredentials?.password}`;
                navigator.clipboard.writeText(text);
                toast.success("Credenciais copiadas!");
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Tudo
            </Button>
            <Button onClick={() => setDefaultCredentials(null)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar exclusão */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover Provedor</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p>
              Tem certeza que deseja remover o provedor{" "}
              <strong>{deleteConfirm?.name}</strong>?
            </p>
            <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
              <p>
                O banco de dados{" "}
                <code className="bg-muted px-1 rounded">{deleteConfirm?.dbName}</code>{" "}
                será <strong>preservado</strong>. Apenas o registro no sistema será removido.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
