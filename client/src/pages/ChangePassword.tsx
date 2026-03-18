/**
 * ChangePassword.tsx — Tela de alteração de senha obrigatória.
 * Exibida automaticamente após o primeiro login com as credenciais padrão.
 * Também acessível via menu de perfil para troca voluntária de senha.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { getTenantSlug } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Network, KeyRound, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ChangePasswordProps {
  forced?: boolean; // true = primeiro acesso obrigatório
}

export default function ChangePassword({ forced = false }: ChangePasswordProps) {
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }

    if (newPassword === currentPassword) {
      setError("A nova senha deve ser diferente da senha atual");
      return;
    }

    setLoading(true);

    try {
      const slug = getTenantSlug();
      const base = slug ? `/${slug}` : "";
      const res = await fetch(`${base}/api/local-change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao alterar senha");
        return;
      }

      setSuccess(true);

      // Usar window.location para forçar reload completo e recarregar estado de auth
      const slug2 = getTenantSlug();
      const base2 = slug2 ? `/${slug2}` : "";
      setTimeout(() => { window.location.href = `${base2}/`; }, 1500);
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">Senha alterada com sucesso!</h2>
              <p className="text-sm text-muted-foreground mt-1">Redirecionando para o painel...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Network className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">FiberDoc</h1>
            <p className="text-sm text-muted-foreground">Sistema de Documentação de Redes</p>
          </div>
        </div>

        {forced && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-200">
              <strong>Primeiro acesso detectado.</strong> Por segurança, você precisa definir uma nova senha antes de continuar.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              {forced ? "Definir nova senha" : "Alterar senha"}
            </CardTitle>
            <CardDescription>
              {forced
                ? "Escolha uma senha segura para proteger sua conta."
                : "Informe sua senha atual e escolha uma nova senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">
                  {forced ? "Senha atual (padrão)" : "Senha atual"}
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder={forced ? "fiberdoc2025" : "Sua senha atual"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4" />
                )}
                {loading ? "Aguarde..." : "Salvar nova senha"}
              </Button>

              {!forced && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/")}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
