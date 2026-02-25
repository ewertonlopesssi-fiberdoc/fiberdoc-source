import { useState } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { Wifi, Server, ChevronRight, AlertCircle } from "lucide-react";

export default function MobileSetup() {
  const { setServerUrl } = useMobileAuth();
  const [url, setUrl] = useState("https://");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const clean = url.trim().replace(/\/$/, "");
    if (!clean.startsWith("http")) {
      setError("A URL deve começar com https:// ou http://");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const res = await fetch(`${clean}/api/trpc/auth.me`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      // Qualquer resposta do servidor (mesmo erro de auth) confirma que ele está acessível
      if (res.status === 200 || res.status === 401 || res.status === 400) {
        setServerUrl(clean);
      } else {
        setError("Servidor não reconhecido. Verifique a URL.");
      }
    } catch {
      setError("Não foi possível conectar ao servidor. Verifique a URL e a conexão.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
          <Server className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">FiberDoc Mobile</h1>
          <p className="text-sm text-zinc-400 mt-1">Documentação de Fibras e Equipamentos</p>
        </div>
      </div>

      {/* Card de configuração */}
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Configurar Servidor</h2>
        </div>
        <p className="text-xs text-zinc-400 mb-5">
          Informe o endereço do sistema FiberDoc da sua empresa para conectar o aplicativo.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">URL do Servidor</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://empresa.manus.space"
              className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={testing || !url.trim()}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-semibold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {testing ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                Conectar
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        <p className="text-[10px] text-zinc-600 text-center mt-4">
          A URL é salva localmente no dispositivo e não é compartilhada.
        </p>
      </div>
    </div>
  );
}
