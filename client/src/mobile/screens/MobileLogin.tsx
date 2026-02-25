import { useState } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { createMobileTrpcClient } from "../mobileTrpc";
import { Lock, Mail, Eye, EyeOff, Server, AlertCircle, Settings } from "lucide-react";

export default function MobileLogin() {
  const { serverUrl, setServerUrl, login } = useMobileAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const client = createMobileTrpcClient(serverUrl);
      const result = await client.mobileAuth.login.mutate({ email, password });
      login(result.token, result.user as any);
    } catch (e: any) {
      const msg = e?.message ?? "Erro ao fazer login";
      setError(msg.includes("inválidos") ? "E-mail ou senha incorretos." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
          <Lock className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">FiberDoc Mobile</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono truncate max-w-[240px]">{serverUrl}</p>
        </div>
      </div>

      {/* Card de login */}
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-xl">
        <h2 className="text-sm font-semibold text-white mb-5">Entrar na sua conta</h2>

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-semibold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
            ) : (
              "Entrar"
            )}
          </button>
        </div>
      </div>

      {/* Trocar servidor */}
      <button
        onClick={() => setServerUrl("")}
        className="mt-6 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        Trocar servidor
      </button>
    </div>
  );
}
