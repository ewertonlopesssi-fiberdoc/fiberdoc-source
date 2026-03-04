import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Terminal, Server, Play, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, XCircle, AlertTriangle, Clock,
  Plus, Pencil, Trash2, Key,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ConfirmMode = "none" | "auto_y" | "auto_n" | "manual";

interface SshEquipment {
  id: number;
  name: string;
  type: string;
  sshUser: string;
}

interface SshCommand {
  id: number;
  equipmentId: number;
  name: string;
  description: string | null;
  commandLines: string[];
  sleepMs: number;
  confirmMode: ConfirmMode;
  params: string[];
}

interface TerminalLine {
  type: "output" | "input" | "info" | "error" | "confirm";
  text: string;
}

function genSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const CONFIRM_BADGES: Record<ConfirmMode, { label: string; cls: string }> = {
  none:   { label: "Sem confirm.", cls: "bg-zinc-700 text-zinc-300" },
  auto_y: { label: "Auto Y",      cls: "bg-green-800 text-green-200" },
  auto_n: { label: "Auto N",      cls: "bg-red-800 text-red-200" },
  manual: { label: "Manual",      cls: "bg-yellow-800 text-yellow-200" },
};

// ─── Ecrã principal ───────────────────────────────────────────────────────────
type View = "equipList" | "cmdList" | "terminal" | "params" | "history";

export default function MobileSshCommander() {
  const [view, setView] = useState<View>("equipList");
  const [selectedEquip, setSelectedEquip] = useState<SshEquipment | null>(null);
  const [pendingCmd, setPendingCmd] = useState<SshCommand | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  // Terminal
  const [termLines, setTermLines] = useState<TerminalLine[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<boolean | null>(null);
  const termBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    termBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [termLines]);

  // Queries
  const { data: equipList = [] } = trpc.sshCommander.listEquipmentsWithSsh.useQuery();
  const { data: commands = [], refetch: refetchCmds } = trpc.sshCommander.listCommands.useQuery(
    { equipmentId: selectedEquip?.id ?? 0 },
    { enabled: !!selectedEquip }
  );
  const { data: execLog = [], refetch: refetchLog } = trpc.sshCommander.executionLog.useQuery(
    { equipmentId: selectedEquip?.id ?? 0 },
    { enabled: !!selectedEquip }
  );

  const utils = trpc.useUtils();
  const deleteCmdMut = trpc.sshCommander.deleteCommand.useMutation({
    onSuccess: () => { refetchCmds(); toast.success("Comando removido"); },
    onError: (e) => toast.error("Erro ao remover: " + e.message),
  });
  const clearSshMut = trpc.sshCommander.clearSshCredentials.useMutation({
    onSuccess: () => {
      utils.sshCommander.listEquipmentsWithSsh.invalidate();
      setSelectedEquip(null);
      setView("equipList");
      toast.success("Credenciais SSH removidas");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  // ─── Execução SSH via SSE ─────────────────────────────────────────────────
  const executeCommand = useCallback((cmd: SshCommand, params: Record<string, string> = {}) => {
    if (!selectedEquip) return;
    const sessionId = genSessionId();
    setActiveSessionId(sessionId);
    setTermLines([{ type: "info", text: `Conectando a ${selectedEquip.name}...` }]);
    setIsExecuting(true);
    setWaitingConfirm(false);
    setLastSuccess(null);
    setView("terminal");

    const url = new URL("/api/ssh/execute-stream", window.location.origin);
    url.searchParams.set("equipmentId", String(selectedEquip.id));
    url.searchParams.set("commandId", String(cmd.id));
    url.searchParams.set("sessionId", sessionId);
    if (Object.keys(params).length > 0) {
      url.searchParams.set("params", encodeURIComponent(JSON.stringify(params)));
    }

    const es = new EventSource(url.toString());
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; data?: string; success?: boolean };
        if (msg.type === "output" && msg.data?.trim()) {
          setTermLines(prev => [...prev, { type: "output", text: msg.data! }]);
        } else if (msg.type === "input") {
          setTermLines(prev => [...prev, { type: "input", text: msg.data ?? "" }]);
        } else if (msg.type === "confirm_required") {
          setTermLines(prev => [...prev, { type: "confirm", text: msg.data ?? "Equipamento aguarda confirmação [Y/N]" }]);
          setWaitingConfirm(true);
        } else if (msg.type === "done") {
          setIsExecuting(false);
          setWaitingConfirm(false);
          setLastSuccess(msg.success ?? true);
          setTermLines(prev => [...prev, { type: "info", text: msg.success ? "✓ Concluído com sucesso." : "✗ Concluído com erros." }]);
          refetchLog();
          es.close();
        } else if (msg.type === "error") {
          setIsExecuting(false);
          setWaitingConfirm(false);
          setLastSuccess(false);
          setTermLines(prev => [...prev, { type: "error", text: `Erro: ${msg.data}` }]);
          es.close();
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {
      setIsExecuting(false);
      setWaitingConfirm(false);
      setTermLines(prev => [...prev, { type: "error", text: "Conexão encerrada inesperadamente." }]);
      es.close();
    };
  }, [selectedEquip, refetchLog]);

  const handleConfirm = useCallback(async (answer: "y" | "n") => {
    if (!activeSessionId) return;
    setWaitingConfirm(false);
    setTermLines(prev => [...prev, { type: "input", text: answer.toUpperCase() }]);
    await fetch("/api/ssh/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSessionId, answer }),
    });
  }, [activeSessionId]);

  const handleRunCmd = (cmd: SshCommand) => {
    if (cmd.params.length > 0) {
      const init: Record<string, string> = {};
      cmd.params.forEach(p => { init[p] = ""; });
      setParamValues(init);
      setPendingCmd(cmd);
      setView("params");
    } else {
      setPendingCmd(cmd);
      executeCommand(cmd);
    }
  };

  // ─── VIEW: Lista de Equipamentos ──────────────────────────────────────────
  if (view === "equipList") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <Terminal className="w-5 h-5 text-cyan-400" />
          <div>
            <h1 className="text-base font-bold text-white">Comandos SSH</h1>
            <p className="text-xs text-zinc-400">Seleccione um equipamento</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {equipList.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum equipamento com SSH configurado.</p>
              <p className="text-xs mt-1">Configure no desktop em Equipamentos → SSH.</p>
            </div>
          )}
          {(equipList as SshEquipment[]).map(eq => (
            <div key={eq.id} className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedEquip(eq); setView("cmdList"); }}
                className="flex-1 text-left p-4 rounded-xl bg-zinc-900 border border-zinc-700 active:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{eq.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{eq.type} · {eq.sshUser}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </div>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Remover credenciais SSH de "${eq.name}"?`)) {
                    clearSshMut.mutate({ equipmentId: eq.id });
                  }
                }}
                className="p-3 rounded-xl bg-zinc-900 border border-zinc-700 active:bg-zinc-800 text-zinc-500 active:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── VIEW: Lista de Comandos ──────────────────────────────────────────────
  if (view === "cmdList") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <button onClick={() => setView("equipList")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">{selectedEquip?.name}</h1>
            <p className="text-xs text-zinc-400">{commands.length} comandos</p>
          </div>
          <button
            onClick={() => setView("history")}
            className="p-2 rounded-lg bg-zinc-800 active:bg-zinc-700"
          >
            <Clock className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {commands.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Terminal className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum comando cadastrado.</p>
              <p className="text-xs mt-1">Adicione comandos no desktop.</p>
            </div>
          )}
          {(commands as SshCommand[]).map(cmd => {
            const badge = CONFIRM_BADGES[cmd.confirmMode] ?? CONFIRM_BADGES.none;
            return (
              <div key={cmd.id} className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{cmd.name}</p>
                    {cmd.description && (
                      <p className="text-xs text-zinc-400 mt-0.5">{cmd.description}</p>
                    )}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                {/* Preview das linhas */}
                <div className="bg-zinc-950 rounded-lg p-2 font-mono text-xs text-green-400 max-h-16 overflow-hidden mb-3">
                  {cmd.commandLines.slice(0, 3).map((l, i) => <div key={i}>{l}</div>)}
                  {cmd.commandLines.length > 3 && (
                    <div className="text-zinc-600">+{cmd.commandLines.length - 3} linhas...</div>
                  )}
                </div>
                {cmd.params.length > 0 && (
                  <p className="text-xs text-blue-400 mb-2">
                    {cmd.params.length} parâmetro(s): {cmd.params.join(", ")}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunCmd(cmd)}
                    disabled={isExecuting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-700 active:bg-green-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Executar
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remover "${cmd.name}"?`)) deleteCmdMut.mutate({ id: cmd.id }); }}
                    className="p-2.5 rounded-lg bg-zinc-800 active:bg-zinc-700 text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {/* Botão para ver terminal da última execução */}
        {termLines.length > 0 && (
          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={() => setView("terminal")}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 active:bg-zinc-700 text-zinc-300 text-sm"
            >
              <Terminal className="w-4 h-4" />
              Ver último terminal
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── VIEW: Parâmetros ─────────────────────────────────────────────────────
  if (view === "params" && pendingCmd) {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <button onClick={() => setView("cmdList")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">Parâmetros</h1>
            <p className="text-xs text-zinc-400">{pendingCmd.name}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-zinc-400">Preencha os valores para os parâmetros variáveis:</p>
          {pendingCmd.params.map(param => (
            <div key={param}>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">{param}</label>
              <input
                type="text"
                value={paramValues[param] ?? ""}
                onChange={e => setParamValues(prev => ({ ...prev, [param]: e.target.value }))}
                placeholder={`Valor para {${param}}`}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={() => {
              setView("cmdList");
              executeCommand(pendingCmd, paramValues);
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-700 active:bg-green-600 text-white font-semibold"
          >
            <Play className="w-4 h-4" /> Executar
          </button>
        </div>
      </div>
    );
  }

  // ─── VIEW: Terminal ───────────────────────────────────────────────────────
  if (view === "terminal") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <button onClick={() => setView("cmdList")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-white">Terminal SSH</h1>
            <p className="text-xs text-zinc-400">{selectedEquip?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
            {!isExecuting && lastSuccess === true && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {!isExecuting && lastSuccess === false && <XCircle className="w-4 h-4 text-red-400" />}
            <button
              onClick={() => { setTermLines([]); setLastSuccess(null); }}
              className="text-xs text-zinc-500 px-2 py-1 rounded bg-zinc-800 active:bg-zinc-700"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Terminal output */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-3 font-mono text-xs space-y-0.5">
          {termLines.length === 0 && (
            <span className="text-zinc-600">Aguardando execução...</span>
          )}
          {termLines.map((line, i) => (
            <div key={i} className={
              line.type === "error" ? "text-red-400" :
              line.type === "input" ? "text-cyan-400" :
              line.type === "info" ? "text-yellow-400" :
              line.type === "confirm" ? "text-yellow-300 font-bold" :
              "text-green-300"
            }>
              {line.type === "input" && <span className="text-zinc-600 mr-1">→</span>}
              {line.type === "confirm" && <span className="text-yellow-500 mr-1">⚠</span>}
              <span className="whitespace-pre-wrap">{line.text}</span>
            </div>
          ))}
          <div ref={termBottomRef} />
        </div>

        {/* Confirmação interactiva */}
        {waitingConfirm && (
          <div className="p-4 border-t border-yellow-700 bg-yellow-900/20">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
              <p className="text-xs text-yellow-300">O equipamento aguarda confirmação:</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleConfirm("y")}
                className="flex-1 py-3 rounded-xl bg-green-700 active:bg-green-600 text-white font-bold text-sm"
              >
                Confirmar (Y)
              </button>
              <button
                onClick={() => handleConfirm("n")}
                className="flex-1 py-3 rounded-xl bg-red-700 active:bg-red-600 text-white font-bold text-sm"
              >
                Cancelar (N)
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── VIEW: Histórico ──────────────────────────────────────────────────────
  if (view === "history") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <button onClick={() => setView("cmdList")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">Histórico</h1>
            <p className="text-xs text-zinc-400">{selectedEquip?.name}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {execLog.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhuma execução registada.</p>
            </div>
          )}
          {(execLog as any[]).map(log => (
            <div key={log.id} className="bg-zinc-900 rounded-xl border border-zinc-700 p-3">
              <div className="flex items-center gap-2 mb-1">
                {log.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className="text-sm font-medium text-white">{log.commandName}</span>
              </div>
              <p className="text-xs text-zinc-500 mb-2">
                {new Date(log.executedAt).toLocaleString()}
                {log.executedBy ? ` · ${log.executedBy}` : ""}
              </p>
              {log.output && (
                <div className="bg-zinc-950 rounded p-2 font-mono text-xs text-green-400 max-h-20 overflow-y-auto">
                  {String(log.output).slice(0, 300)}{log.output.length > 300 ? "..." : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
