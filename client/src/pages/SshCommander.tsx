import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Terminal, Server, Play, Plus, Pencil, Trash2, ChevronRight,
  Clock, CheckCircle2, XCircle, Loader2,
  HelpCircle, Search, KeyRound, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ConfirmMode = "none" | "auto_y" | "auto_n" | "manual";

type SshEquipment = {
  id: number;
  name: string;
  type: string;
  hasCredentials?: boolean;
  sshUser?: string | null;
  sshPort?: number | null;
  [key: string]: unknown;
};

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

// ─── Utilitários ──────────────────────────────────────────────────────────────
function genSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const CONFIRM_MODE_LABELS: Record<ConfirmMode, string> = {
  none: "Nenhuma (não pede confirmação)",
  auto_y: "Automática — responder Y automaticamente",
  auto_n: "Automática — responder N automaticamente",
  manual: "Manual — aguardar confirmação do utilizador",
};

const CONFIRM_MODE_BADGES: Record<ConfirmMode, { label: string; color: string }> = {
  none: { label: "Sem confirmação", color: "bg-zinc-700 text-zinc-200" },
  auto_y: { label: "Auto Y", color: "bg-green-800 text-green-200" },
  auto_n: { label: "Auto N", color: "bg-red-800 text-red-200" },
  manual: { label: "Manual", color: "bg-yellow-800 text-yellow-200" },
};

// ─── Componente Terminal ──────────────────────────────────────────────────────
function TerminalOutput({
  lines,
  waitingConfirm,
  sessionId,
  onConfirm,
}: {
  lines: TerminalLine[];
  waitingConfirm: boolean;
  sessionId: string | null;
  onConfirm: (answer: "y" | "n") => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  return (
    <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="text-xs text-zinc-500 ml-2">SSH Terminal</span>
      </div>
      <div className="p-4 font-mono text-sm min-h-[200px] max-h-[400px] overflow-y-auto space-y-0.5">
        {lines.length === 0 && (
          <span className="text-zinc-600">Aguardando execução...</span>
        )}
        {lines.map((line, i) => (
          <div key={i} className={
            line.type === "error" ? "text-red-400" :
            line.type === "info" ? "text-cyan-400" :
            line.type === "input" ? "text-yellow-300" :
            line.type === "confirm" ? "text-orange-400 font-bold" :
            "text-green-300"
          }>
            {line.type === "input" ? `> ${line.text}` : line.text}
          </div>
        ))}
        {waitingConfirm && (
          <div className="flex items-center gap-2 mt-2">
            <Button size="sm" className="h-7 bg-green-700 hover:bg-green-600 text-xs"
              onClick={() => onConfirm("y")}>
              Confirmar (Y)
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-600 text-red-400 hover:bg-red-950"
              onClick={() => onConfirm("n")}>
              Cancelar (N)
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Formulário de Credenciais SSH ────────────────────────────────────────────
function SshCredentialForm({
  equip,
  onSaved,
  onCancel,
}: {
  equip: SshEquipment;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [sshUser, setSshUser] = useState(equip.sshUser ?? "");
  const [sshPassword, setSshPassword] = useState("");
  const [sshPort, setSshPort] = useState(String(equip.sshPort ?? 22));

  const save = trpc.sshCommander.saveCredential.useMutation({
    onSuccess: () => { toast.success("Credenciais SSH guardadas"); onSaved(); },
    onError: (e) => toast.error("Erro ao guardar credenciais: " + e.message),
  });

  const handleSave = () => {
    if (!sshUser.trim()) { toast.error("Preencha o utilizador SSH"); return; }
    if (!sshPassword.trim()) { toast.error("Preencha a senha SSH"); return; }
    save.mutate({
      equipmentId: equip.id,
      sshUser: sshUser.trim(),
      sshPassword: sshPassword.trim(),
      sshPort: parseInt(sshPort) || 22,
    });
  };

  return (
    <div className="space-y-4 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-white">Credenciais SSH — {equip.name}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Utilizador SSH</Label>
          <Input
            value={sshUser}
            onChange={e => setSshUser(e.target.value)}
            placeholder="admin"
            className="h-8 text-sm bg-zinc-950 border-zinc-700"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Porta</Label>
          <Input
            type="number"
            value={sshPort}
            onChange={e => setSshPort(e.target.value)}
            placeholder="22"
            className="h-8 text-sm bg-zinc-950 border-zinc-700"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Senha SSH</Label>
        <Input
          type="password"
          value={sshPassword}
          onChange={e => setSshPassword(e.target.value)}
          placeholder="Senha do equipamento"
          className="h-8 text-sm bg-zinc-950 border-zinc-700"
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" className="h-8 text-xs bg-cyan-700 hover:bg-cyan-600" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <KeyRound className="w-3 h-3 mr-1" />}
          Guardar Credenciais
        </Button>
      </div>
    </div>
  );
}

// ─── Formulário de Comando ────────────────────────────────────────────────────
function CommandForm({
  equipmentId,
  initial,
  onSave,
  onCancel,
}: {
  equipmentId: number;
  initial?: SshCommand;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [lines, setLines] = useState(initial?.commandLines.join("\n") ?? "");
  const [sleepMs, setSleepMs] = useState(String(initial?.sleepMs ?? 300));
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(initial?.confirmMode ?? "none");

  const create = trpc.sshCommander.createCommand.useMutation({
    onSuccess: onSave,
    onError: (e) => toast.error("Erro ao criar comando: " + e.message),
  });
  const update = trpc.sshCommander.updateCommand.useMutation({
    onSuccess: onSave,
    onError: (e) => toast.error("Erro ao actualizar comando: " + e.message),
  });

  const handleSave = () => {
    const commandLines = lines.split("\n").map(l => l.trim()).filter(Boolean);
    if (!name.trim() || commandLines.length === 0) {
      toast.error("Preencha o nome e pelo menos uma linha de comando");
      return;
    }
    if (initial) {
      update.mutate({ id: initial.id, name, description: description || undefined, commandLines, sleepMs: parseInt(sleepMs) || 300, confirmMode });
    } else {
      create.mutate({ equipmentId, name, description: description || undefined, commandLines, sleepMs: parseInt(sleepMs) || 300, confirmMode });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nome do Comando *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Criar VLAN" />
        </div>
        <div className="space-y-1.5">
          <Label>Sleep entre linhas (ms)</Label>
          <Input type="number" value={sleepMs} onChange={e => setSleepMs(e.target.value)} min={0} max={10000} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição opcional" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label>Linhas de Comando *</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-zinc-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Uma linha por comando. Use {"{param}"} para parâmetros variáveis.</p>
                <p className="mt-1 text-xs text-zinc-400">Ex: vlan {"{vlan_id}"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Textarea
          value={lines}
          onChange={e => setLines(e.target.value)}
          placeholder={"enable\nconfigure terminal\nvlan {vlan_id}\nname {vlan_name}\nexit"}
          rows={6}
          className="font-mono text-sm"
        />
        <p className="text-xs text-zinc-500">Use {"{nome_param}"} para parâmetros que serão pedidos antes da execução.</p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label>Modo de Confirmação Interactiva</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-zinc-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-medium mb-1">Quando o equipamento pede [Y/N]:</p>
                <ul className="text-xs space-y-1">
                  <li><strong>Nenhuma:</strong> ignora (para comandos que não pedem confirmação)</li>
                  <li><strong>Auto Y:</strong> responde Y automaticamente</li>
                  <li><strong>Auto N:</strong> responde N automaticamente</li>
                  <li><strong>Manual:</strong> pausa e aguarda o utilizador clicar Y ou N</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select value={confirmMode} onValueChange={v => setConfirmMode(v as ConfirmMode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(CONFIRM_MODE_LABELS) as [ConfirmMode, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {initial ? "Guardar Alterações" : "Criar Comando"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function SshCommander() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Todos os equipamentos com indicador de credenciais
  const { data: equipList = [], refetch: refetchEquips } = trpc.sshCommander.listEquipmentsWithSsh.useQuery();

  // Pesquisa de equipamentos
  const [equipSearch, setEquipSearch] = useState("");
  const filteredEquipList = (equipList as SshEquipment[]).filter(eq =>
    eq.name.toLowerCase().includes(equipSearch.toLowerCase()) ||
    (eq.type ?? "").toLowerCase().includes(equipSearch.toLowerCase())
  );

  // Equipamento seleccionado
  const [selectedEquip, setSelectedEquip] = useState<SshEquipment | null>(null);

  // Mostrar formulário de credenciais inline
  const [showCredForm, setShowCredForm] = useState(false);

  // Comandos do equipamento seleccionado
  const { data: commands = [], refetch: refetchCmds } = trpc.sshCommander.listCommands.useQuery(
    { equipmentId: selectedEquip?.id ?? 0 },
    { enabled: !!selectedEquip }
  );

  // Histórico de execuções
  const { data: execLog = [], refetch: refetchLog } = trpc.sshCommander.executionLog.useQuery(
    { equipmentId: selectedEquip?.id ?? 0 },
    { enabled: !!selectedEquip }
  );

  // Estado do terminal
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean } | null>(null);
  // Aba activa (controlled) — muda para "terminal" ao executar
  const [activeTab, setActiveTab] = useState<string>("commands");

  // Dialog de novo/editar comando
  const [showCmdDialog, setShowCmdDialog] = useState(false);
  const [editingCmd, setEditingCmd] = useState<SshCommand | null>(null);

  // Dialog de parâmetros antes de executar
  const [showParamsDialog, setShowParamsDialog] = useState(false);
  const [pendingCmd, setPendingCmd] = useState<SshCommand | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});

  const deleteCmdMut = trpc.sshCommander.deleteCommand.useMutation({
    onSuccess: () => { refetchCmds(); toast.success("Comando removido"); },
  });

  const utils = trpc.useUtils();
  const deleteCredMut = trpc.sshCommander.deleteCredential.useMutation({
    onSuccess: () => {
      utils.sshCommander.listEquipmentsWithSsh.invalidate();
      toast.success("Credenciais SSH removidas");
    },
    onError: (e) => toast.error("Erro ao remover credenciais: " + e.message),
  });

  // Quando selecciona equipamento, esconder formulário de credenciais
  const handleSelectEquip = (eq: SshEquipment) => {
    setSelectedEquip(eq);
    setTerminalLines([]);
    setLastResult(null);
    setActiveTab("commands");
    // Mostrar formulário de credenciais automaticamente se não tiver credenciais
    setShowCredForm(!eq.hasCredentials);
  };

  // ─── Execução SSH via SSE ────────────────────────────────────────────────
  const executeCommand = useCallback((cmd: SshCommand, params: Record<string, string> = {}) => {
    if (!selectedEquip) return;
    const sessionId = genSessionId();
    setActiveSessionId(sessionId);
    setTerminalLines([{ type: "info", text: `Conectando a ${selectedEquip.name}...` }]);
    setIsExecuting(true);
    setWaitingConfirm(false);
    setLastResult(null);

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
        const msg = JSON.parse(ev.data) as { type: string; data?: string; success?: boolean; output?: string };
        if (msg.type === "output") {
          const text = msg.data ?? "";
          setTerminalLines(prev => [...prev, { type: "output", text }]);
        } else if (msg.type === "input") {
          setTerminalLines(prev => [...prev, { type: "input", text: msg.data ?? "" }]);
        } else if (msg.type === "confirm_required") {
          setTerminalLines(prev => [...prev, { type: "confirm", text: msg.data ?? "O equipamento aguarda confirmação [Y/N]" }]);
          setWaitingConfirm(true);
        } else if (msg.type === "done") {
          setIsExecuting(false);
          setWaitingConfirm(false);
          setLastResult({ success: msg.success ?? true });
          setTerminalLines(prev => [...prev, { type: "info", text: msg.success ? "✓ Execução concluída com sucesso." : "✗ Execução concluída com erros." }]);
          refetchLog();
          es.close();
        } else if (msg.type === "error") {
          setIsExecuting(false);
          setWaitingConfirm(false);
          setLastResult({ success: false });
          setTerminalLines(prev => [...prev, { type: "error", text: `Erro: ${msg.data}` }]);
          // Se erro de credenciais, mostrar formulário automaticamente
          if (msg.data?.includes("credenciais") || msg.data?.includes("desencriptar")) {
            setShowCredForm(true);
            setActiveTab("commands");
          }
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setIsExecuting(false);
      setWaitingConfirm(false);
      setTerminalLines(prev => [...prev, { type: "error", text: "Conexão SSE encerrada inesperadamente." }]);
      es.close();
    };
  }, [selectedEquip, refetchLog]);

  const handleConfirm = useCallback(async (answer: "y" | "n") => {
    if (!activeSessionId) return;
    setWaitingConfirm(false);
    setTerminalLines(prev => [...prev, { type: "input", text: answer.toUpperCase() }]);
    await fetch("/api/ssh/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSessionId, answer }),
    });
  }, [activeSessionId]);

  const handleRunCmd = (cmd: SshCommand) => {
    setActiveTab("terminal");
    if (cmd.params.length > 0) {
      const initial: Record<string, string> = {};
      cmd.params.forEach(p => { initial[p] = ""; });
      setParamValues(initial);
      setPendingCmd(cmd);
      setShowParamsDialog(true);
    } else {
      executeCommand(cmd);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-cyan-400" />
            <div>
              <h1 className="text-xl font-bold text-white">SSH Commander</h1>
              <p className="text-sm text-zinc-400">Execute comandos nos equipamentos da rede</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna esquerda: lista de equipamentos */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Equipamentos</h2>

            {/* Pesquisa */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
              <Input
                value={equipSearch}
                onChange={e => setEquipSearch(e.target.value)}
                placeholder="Pesquisar equipamento..."
                className="pl-8 h-8 text-sm bg-zinc-900 border-zinc-700"
              />
            </div>

            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filteredEquipList.length === 0 && (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{equipList.length === 0 ? "Nenhum equipamento cadastrado." : `Nenhum resultado para "${equipSearch}"`}</p>
                </div>
              )}
              {filteredEquipList.map((eq) => (
                <div
                  key={eq.id}
                  className={`group relative rounded-lg border transition-colors cursor-pointer ${
                    selectedEquip?.id === eq.id
                      ? "border-cyan-500 bg-cyan-950/30"
                      : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                  }`}
                  onClick={() => handleSelectEquip(eq)}
                >
                  <div className="w-full text-left p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 pr-6">
                        <p className="text-sm font-medium text-white truncate">{eq.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-zinc-400">{eq.type}</span>
                          {eq.hasCredentials ? (
                            <span className="flex items-center gap-0.5 text-xs text-green-400">
                              <Wifi className="w-3 h-3" /> SSH
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-xs text-zinc-600">
                              <WifiOff className="w-3 h-3" /> Sem SSH
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna central + direita */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedEquip ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                <Terminal className="w-12 h-12 mb-3 opacity-20" />
                <p>Seleccione um equipamento para ver os comandos</p>
              </div>
            ) : (
              <>
                {/* Cabeçalho do equipamento */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-white">{selectedEquip.name}</span>
                    <Badge variant="outline" className="text-xs">{selectedEquip.type}</Badge>
                    {selectedEquip.hasCredentials ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-950/40 border border-green-800 rounded px-2 py-0.5">
                        <Wifi className="w-3 h-3" /> SSH configurado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-950/40 border border-orange-800 rounded px-2 py-0.5">
                        <WifiOff className="w-3 h-3" /> Sem credenciais SSH
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 text-xs gap-1 ${showCredForm ? "border-cyan-500 text-cyan-400" : "border-zinc-600"}`}
                            onClick={() => setShowCredForm(v => !v)}
                          >
                            <KeyRound className="w-3 h-3" />
                            {selectedEquip.hasCredentials ? "Editar SSH" : "Configurar SSH"}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Configurar credenciais SSH para este equipamento</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {isAdmin && selectedEquip.hasCredentials && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        onClick={() => {
                          if (confirm(`Remover credenciais SSH de "${selectedEquip.name}"?`)) {
                            deleteCredMut.mutate({ equipmentId: selectedEquip.id });
                            setSelectedEquip({ ...selectedEquip, hasCredentials: false });
                            setShowCredForm(true);
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" /> Remover SSH
                      </Button>
                    )}
                  </div>
                </div>

                {/* Formulário de credenciais SSH (inline) */}
                {showCredForm && (
                  <SshCredentialForm
                    equip={selectedEquip}
                    onSaved={() => {
                      setShowCredForm(false);
                      refetchEquips();
                      // Actualizar o equipamento seleccionado com hasCredentials=true
                      setSelectedEquip(prev => prev ? { ...prev, hasCredentials: true } : prev);
                    }}
                    onCancel={() => setShowCredForm(false)}
                  />
                )}

                {/* Aviso se sem credenciais e formulário fechado */}
                {!showCredForm && !selectedEquip.hasCredentials && (
                  <div className="flex items-center gap-3 p-3 bg-orange-950/30 border border-orange-800 rounded-lg text-sm text-orange-300">
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>Este equipamento não tem credenciais SSH configuradas. Clique em <strong>Configurar SSH</strong> para adicionar.</span>
                  </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button size="sm" className="h-7 text-xs gap-1 bg-cyan-700 hover:bg-cyan-600"
                          onClick={() => { setEditingCmd(null); setShowCmdDialog(true); }}>
                          <Plus className="w-3 h-3" /> Novo Comando
                        </Button>
                      )}
                    </div>
                    <TabsList className="h-7">
                      <TabsTrigger value="commands" className="text-xs h-6">Comandos</TabsTrigger>
                      <TabsTrigger value="terminal" className="text-xs h-6">Terminal</TabsTrigger>
                      <TabsTrigger value="history" className="text-xs h-6">Histórico</TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Aba: Comandos */}
                  <TabsContent value="commands" className="space-y-2">
                    {commands.length === 0 && (
                      <div className="text-center py-10 text-zinc-500 text-sm">
                        <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhum comando cadastrado.</p>
                        {isAdmin && <p className="text-xs mt-1">Clique em "Novo Comando" para adicionar.</p>}
                      </div>
                    )}
                    {commands.map(cmd => {
                      const badge = CONFIRM_MODE_BADGES[cmd.confirmMode as ConfirmMode] ?? CONFIRM_MODE_BADGES.none;
                      return (
                        <Card key={cmd.id} className="bg-zinc-900 border-zinc-700">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-white">{cmd.name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                                  {cmd.params.length > 0 && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-200">
                                      {cmd.params.length} parâm.
                                    </span>
                                  )}
                                </div>
                                {cmd.description && (
                                  <p className="text-xs text-zinc-400 mt-1">{cmd.description}</p>
                                )}
                                <div className="mt-2 bg-zinc-950 rounded p-2 font-mono text-xs text-green-400 max-h-20 overflow-y-auto">
                                  {cmd.commandLines.map((l, i) => <div key={i}>{l}</div>)}
                                </div>
                                <p className="text-xs text-zinc-600 mt-1">Sleep: {cmd.sleepMs}ms entre linhas</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isAdmin && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7"
                                      onClick={() => { setEditingCmd(cmd); setShowCmdDialog(true); }}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                                      onClick={() => { if (confirm(`Remover "${cmd.name}"?`)) deleteCmdMut.mutate({ id: cmd.id }); }}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" className="h-7 bg-green-700 hover:bg-green-600 gap-1"
                                  disabled={isExecuting || !selectedEquip.hasCredentials}
                                  onClick={() => handleRunCmd(cmd)}>
                                  <Play className="w-3 h-3" /> Executar
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </TabsContent>

                  {/* Aba: Terminal */}
                  <TabsContent value="terminal">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExecuting && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
                          {lastResult !== null && !isExecuting && (
                            lastResult.success
                              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                              : <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-sm text-zinc-400">
                            {isExecuting ? "Executando..." : lastResult === null ? "Pronto" : lastResult.success ? "Sucesso" : "Erro"}
                          </span>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setTerminalLines([]); setLastResult(null); }}>
                          Limpar
                        </Button>
                      </div>
                      <TerminalOutput
                        lines={terminalLines}
                        waitingConfirm={waitingConfirm}
                        sessionId={activeSessionId}
                        onConfirm={handleConfirm}
                      />
                    </div>
                  </TabsContent>

                  {/* Aba: Histórico */}
                  <TabsContent value="history">
                    <div className="space-y-2">
                      {execLog.length === 0 && (
                        <div className="text-center py-8 text-zinc-500 text-sm">
                          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>Nenhuma execução registada.</p>
                        </div>
                      )}
                      {execLog.map(log => (
                        <Card key={log.id} className="bg-zinc-900 border-zinc-700">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {log.success
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                                    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                  <span className="text-sm font-medium text-white">{log.commandName}</span>
                                  {log.executedBy && (
                                    <span className="text-xs text-zinc-500">por {log.executedBy}</span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {new Date(log.executedAt).toLocaleString()}
                                </p>
                                {log.output && (
                                  <div className="mt-2 bg-zinc-950 rounded p-2 font-mono text-xs text-green-400 max-h-24 overflow-y-auto">
                                    {log.output.slice(0, 500)}{log.output.length > 500 ? "..." : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dialog: Novo/Editar Comando */}
      <Dialog open={showCmdDialog} onOpenChange={setShowCmdDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCmd ? "Editar Comando" : "Novo Comando SSH"}</DialogTitle>
          </DialogHeader>
          {selectedEquip && (
            <CommandForm
              equipmentId={selectedEquip.id}
              initial={editingCmd ?? undefined}
              onSave={() => { setShowCmdDialog(false); refetchCmds(); toast.success(editingCmd ? "Comando actualizado" : "Comando criado"); }}
              onCancel={() => setShowCmdDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Parâmetros antes de executar */}
      <Dialog open={showParamsDialog} onOpenChange={setShowParamsDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Parâmetros — {pendingCmd?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Preencha os valores para os parâmetros variáveis:</p>
            {pendingCmd?.params.map(param => (
              <div key={param} className="space-y-1.5">
                <Label>{param}</Label>
                <Input
                  value={paramValues[param] ?? ""}
                  onChange={e => setParamValues(prev => ({ ...prev, [param]: e.target.value }))}
                  placeholder={`Valor para {${param}}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowParamsDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!pendingCmd) return;
                setShowParamsDialog(false);
                executeCommand(pendingCmd, paramValues);
              }}
              className="bg-green-700 hover:bg-green-600"
            >
              <Play className="w-4 h-4 mr-2" /> Executar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
