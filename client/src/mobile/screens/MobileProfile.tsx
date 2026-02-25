import { useState } from "react";
import { useMobileAuth } from "../MobileAuthContext";
import { LogOut, Server, User, Shield, Wifi, WifiOff, RefreshCw, Key } from "lucide-react";
import { isOnline } from "../mobileTrpc";

export default function MobileProfile() {
  const { user, serverUrl, logout, setServerUrl } = useMobileAuth();
  const [editingServer, setEditingServer] = useState(false);
  const [newUrl, setNewUrl] = useState(serverUrl);
  const [online, setOnline] = useState(isOnline());

  function checkOnline() {
    setOnline(isOnline());
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-4 pb-3 flex-shrink-0">
        <h1 className="text-lg font-bold text-white">Perfil</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Usuário */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <User className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{user?.name ?? "Usuário"}</p>
              <p className="text-xs text-zinc-400">{user?.email ?? ""}</p>
              <div className="flex items-center gap-1 mt-1">
                <Shield className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 capitalize">{user?.role ?? "user"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status de conexão */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {online ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-sm text-white">
                {online ? "Conectado ao servidor" : "Modo offline"}
              </span>
            </div>
            <button onClick={checkOnline} className="text-zinc-400 hover:text-white p-1">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {!online && (
            <p className="text-xs text-zinc-500 mt-2">
              Equipamentos, portas e CEO disponíveis em cache para consulta.
            </p>
          )}
        </div>

        {/* Servidor */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Servidor</span>
            </div>
            <button
              onClick={() => { setEditingServer(!editingServer); setNewUrl(serverUrl); }}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              {editingServer ? "Cancelar" : "Alterar"}
            </button>
          </div>

          {editingServer ? (
            <div className="space-y-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://seu-servidor.manus.space"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => {
                  if (newUrl.trim()) {
                    setServerUrl(newUrl.trim().replace(/\/$/, ""));
                    setEditingServer(false);
                  }
                }}
                className="w-full bg-cyan-500 text-zinc-900 font-semibold py-2.5 rounded-xl text-sm"
              >
                Salvar URL
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 font-mono break-all">{serverUrl}</p>
          )}
        </div>

        {/* Sobre */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sobre</p>
          <div className="flex justify-between">
            <span className="text-xs text-zinc-500">Aplicativo</span>
            <span className="text-xs text-zinc-200">FiberDoc Mobile</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-zinc-500">Versão</span>
            <span className="text-xs text-zinc-200">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-zinc-500">Cache offline</span>
            <span className="text-xs text-emerald-400">Ativo</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium py-3 rounded-xl text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair da conta
        </button>
      </div>
    </div>
  );
}
