import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Terminal, Server, Play, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, XCircle, Clock, Wifi,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface TerminalLine {
  type: "output" | "input" | "info" | "error" | "success";
  text: string;
}

type View = "deviceList" | "terminal" | "history";

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MobileSshCommander() {
  const [view, setView] = useState<View>("deviceList");
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [manualCmd, setManualCmd] = useState("");
  const [termLines, setTermLines] = useState<TerminalLine[]>([]);
  const termBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    termBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [termLines]);

  // Queries
  const devicesQ = trpc.sshCommander.listDevices.useQuery();
  const executionsQ = trpc.sshCommander.listExecutions.useQuery(
    { deviceId: selectedDeviceId ?? 0 },
    { enabled: !!selectedDeviceId }
  );
  const commandsQ = trpc.sshCommander.listQuickCommands.useQuery({ deviceType: "all" });

  const selectedDevice = devicesQ.data?.find(d => d.id === selectedDeviceId) ?? null;

  // Mutations
  const testConn = trpc.sshCommander.testConnection.useMutation({
    onSuccess: (r: { success: boolean; latencyMs?: number; error?: string }) => {
      if (r.success) toast.success(`Conectado em ${r.latencyMs}ms`);
      else toast.error("Falha: " + r.error);
    },
    onError: (e: { message: string }) => toast.error("Erro: " + e.message),
  });

  const execute = trpc.sshCommander.execute.useMutation({
    onSuccess: (r: { output: string; success: boolean; durationMs: number }) => {
      const lines: TerminalLine[] = r.output.split("\n")
        .filter((l: string) => l.trim())
        .map((l: string) => ({ type: (r.success ? "output" : "error") as TerminalLine["type"], text: l }));
      setTermLines(prev => [
        ...prev,
        ...lines,
        { type: r.success ? "success" : "error", text: `✓ Concluído em ${r.durationMs}ms` },
      ]);
      executionsQ.refetch();
    },
    onError: (e: { message: string }) => {
      setTermLines(prev => [...prev, { type: "error", text: "✗ Erro: " + e.message }]);
    },
  });

  const handleRunCommand = (commands: string[], name?: string) => {
    if (!selectedDeviceId) { toast.error("Selecione um dispositivo"); return; }
    const cmds = commands.filter(c => c.trim());
    if (cmds.length === 0) return;
    setTermLines(prev => [
      ...prev,
      { type: "info", text: `→ ${name || "comando manual"} — ${selectedDevice?.name}` },
      ...cmds.map(c => ({ type: "input" as const, text: c })),
    ]);
    execute.mutate({ deviceId: selectedDeviceId, commands: cmds, commandName: name });
  };

  const handleManualSend = () => {
    if (!manualCmd.trim()) return;
    handleRunCommand([manualCmd.trim()]);
    setManualCmd("");
  };

  // ─── VIEW: Lista de dispositivos ──────────────────────────────────────────
  if (view === "deviceList") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="px-4 py-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            SSH Commander
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Selecione um dispositivo para iniciar</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {devicesQ.isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          )}
          {!devicesQ.isLoading && (devicesQ.data ?? []).length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Server className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum dispositivo configurado.</p>
            </div>
          )}
          {(devicesQ.data ?? []).map(device => (
            <button
              key={device.id}
              onClick={() => {
                setSelectedDeviceId(device.id);
                setTermLines([]);
                setView("terminal");
              }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex items-center gap-3 active:bg-zinc-800 text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-900/30 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{device.name}</p>
                <p className="text-xs text-zinc-400">{device.host}:{device.port} · {device.username}</p>
                <p className="text-xs text-zinc-500 capitalize">{device.deviceType || "generic"}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── VIEW: Terminal ───────────────────────────────────────────────────────
  if (view === "terminal") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <button onClick={() => setView("deviceList")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-white truncate">{selectedDevice?.name}</h1>
            <p className="text-xs text-zinc-400">{selectedDevice?.host}:{selectedDevice?.port}</p>
          </div>
          <div className="flex items-center gap-2">
            {execute.isPending && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
            <button
              onClick={() => selectedDeviceId && testConn.mutate({ id: selectedDeviceId })}
              disabled={testConn.isPending}
              className="p-1.5 rounded-lg bg-zinc-800 active:bg-zinc-700"
            >
              <Wifi className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={() => setView("history")}
              className="p-1.5 rounded-lg bg-zinc-800 active:bg-zinc-700"
            >
              <Clock className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={() => setTermLines([])}
              className="text-xs text-zinc-500 px-2 py-1 rounded bg-zinc-800 active:bg-zinc-700"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Comandos rápidos */}
        {(commandsQ.data ?? []).length > 0 && (
          <div className="px-3 py-2 border-b border-zinc-800 overflow-x-auto">
            <div className="flex gap-2">
              {(commandsQ.data ?? []).slice(0, 8).map((cmd: { id: number; name: string; command: string }) => (
                <button
                  key={cmd.id}
                  onClick={() => handleRunCommand([cmd.command], cmd.name)}
                  disabled={execute.isPending}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-300 active:bg-zinc-700 whitespace-nowrap"
                >
                  {cmd.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
              line.type === "success" ? "text-green-400" :
              "text-green-300"
            }>
              {line.type === "input" && <span className="text-zinc-600 mr-1">→</span>}
              <span className="whitespace-pre-wrap">{line.text}</span>
            </div>
          ))}
          <div ref={termBottomRef} />
        </div>

        {/* Input manual */}
        <div className="p-3 border-t border-zinc-800 flex gap-2">
          <input
            type="text"
            value={manualCmd}
            onChange={e => setManualCmd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManualSend()}
            placeholder="Comando manual..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600"
          />
          <button
            onClick={handleManualSend}
            disabled={!manualCmd.trim() || execute.isPending}
            className="px-4 py-2 rounded-lg bg-cyan-700 active:bg-cyan-600 disabled:opacity-40 text-white"
          >
            <Play className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── VIEW: Histórico ──────────────────────────────────────────────────────
  if (view === "history") {
    return (
      <div className="flex flex-col h-full bg-[#0a0f1e]">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
          <button onClick={() => setView("terminal")} className="p-1 rounded-lg active:bg-zinc-800">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">Histórico</h1>
            <p className="text-xs text-zinc-400">{selectedDevice?.name}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(executionsQ.data ?? []).length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhuma execução registada.</p>
            </div>
          )}
          {(executionsQ.data ?? []).map((log: { id: number; status: string | null; commandName: string | null; executedAt: Date; output: string | null }) => (
            <div key={log.id} className="bg-zinc-900 rounded-xl border border-zinc-700 p-3">
              <div className="flex items-center gap-2 mb-1">
                {log.status === "success"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className="text-sm font-medium text-white">{log.commandName || "Comando manual"}</span>
              </div>
              <p className="text-xs text-zinc-500 mb-2">
                {new Date(log.executedAt).toLocaleString()}
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
