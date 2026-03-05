import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Terminal, Server, Play, Plus, Pencil, Trash2,
  Clock, CheckCircle2, XCircle, Loader2, Search,
  KeyRound, Wifi, WifiOff, Network, Zap, Shield,
  Send, RefreshCw, Eye, EyeOff, Sparkles,
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

// ─── Tipos ────────────────────────────────────────────────────────────────────
type AuthType = "password" | "key";
interface SshDevice {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  deviceType: string | null;
  notes: string | null;
  password: string | null;
  privateKey: string | null;
}
interface SshCommand {
  id: number;
  name: string;
  description: string | null;
  command: string;
  category: string | null;
  deviceType: string | null;
  isDangerous: number | null;
  color: string | null;
}
interface SshDeviceCommand {
  id: number;
  deviceId: number;
  name: string;
  description: string | null;
  command: string;
  category: string | null;
  isDangerous: number | null;
  color: string | null;
  sortOrder: number | null;
}
interface BgpPeer {
  id: number;
  deviceId: number;
  peerIp: string;
  remoteAs: number;
  description: string | null;
  peerType: string | null;
  localAs: number | null;
  activateScript: string | null;
  deactivateScript: string | null;
  notes: string | null;
}
interface TerminalLine {
  type: "output" | "input" | "info" | "error" | "success" | "separator" | "session-open" | "session-close";
  text: string;
}

const DEVICE_TYPE_LABELS: Record<string, string> = {
  ne8000: "Huawei NE8000",
  olt: "OLT",
  switch: "Switch",
  linux: "Linux/Unix",
  generic: "Genérico",
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  diagnostico: { label: "Diagnóstico", color: "bg-blue-900/50 text-blue-300 border-blue-700" },
  configuracao: { label: "Configuração", color: "bg-orange-900/50 text-orange-300 border-orange-700" },
  manutencao: { label: "Manutenção", color: "bg-yellow-900/50 text-yellow-300 border-yellow-700" },
  bgp: { label: "BGP", color: "bg-purple-900/50 text-purple-300 border-purple-700" },
  pon: { label: "PON/OLT", color: "bg-green-900/50 text-green-300 border-green-700" },
};

// ─── Coloração sintáctica do output SSH ──────────────────────────────────────
// Aplica spans coloridos a palavras-chave do output VRP/Huawei
function colorizeOutputLine(text: string): React.ReactNode {
  interface Segment { start: number; end: number; cls: string; }
  const segs: Segment[] = [];

  const mark = (re: RegExp, cls: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const s = m.index, e = s + m[0].length;
      if (!segs.some(x => s < x.end && e > x.start)) segs.push({ start: s, end: e, cls });
    }
  };

  // Prompt do equipamento: [~BORDA-NE8K-SUPORTI]
  mark(/^\[.*?\]/g, "text-yellow-200 font-bold");
  // *down (com asterisco — mais específico primeiro)
  mark(/\*down/gi, "text-red-400 font-semibold");
  // down isolado
  mark(/\bdown\b/gi, "text-red-400");
  // discarding / blocked
  mark(/\b(discarding|blocked)\b/gi, "text-red-400");
  // up isolado
  mark(/\bup\b/gi, "text-green-400 font-semibold");
  // Percentagens (ex: 1.31%, 56.48%)
  mark(/\d+\.?\d*%/g, "text-yellow-300");
  // Contadores grandes (erros, pacotes) — número >= 100
  mark(/\b[1-9]\d{2,}\b/g, "text-orange-400");
  // Interfaces Huawei (100GE0/5/1, 25GE0/5/32, Eth-Trunk1.682, LoopBack0)
  mark(/(\d+GE[\d\/\.]+|Eth-Trunk[\d\.]+|GigabitEthernet[\d\/]+|XGE[\d\/]+|LoopBack\d+|NULL\d+)/gi, "text-cyan-300");
  // Cabeçalho de tabela (linha que começa com "Interface" seguido de espaços e PHY)
  if (/^Interface\s+PHY/i.test(text)) {
    segs.length = 0;
    return <span className="text-zinc-300 font-semibold">{text}</span>;
  }
  // Linhas de legenda (*down: ^down: (e): etc.)
  if (/^[\*\^]?\(\w+\):|^[\*\^]down:/.test(text.trim())) {
    segs.length = 0;
    return <span className="text-zinc-500">{text}</span>;
  }

  if (segs.length === 0) return <span className="text-zinc-200">{text}</span>;

  segs.sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cur = 0;
  for (const seg of segs) {
    if (seg.start > cur) parts.push(<span key={`t${cur}`} className="text-zinc-200">{text.slice(cur, seg.start)}</span>);
    parts.push(<span key={`s${seg.start}`} className={seg.cls}>{text.slice(seg.start, seg.end)}</span>);
    cur = seg.end;
  }
  if (cur < text.length) parts.push(<span key={`e${cur}`} className="text-zinc-200">{text.slice(cur)}</span>);
  return parts;
}

// ─── Terminal Component ───────────────────────────────────────────────────────
function TerminalOutput({ lines, isRunning }: { lines: TerminalLine[]; isRunning?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);
  return (
    <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-green-500"}`} />
        <span className="text-xs text-zinc-500 ml-2 font-mono">SSH Terminal</span>
        {isRunning && (
          <span className="text-xs text-cyan-400 font-mono animate-pulse ml-auto">● sessão activa...</span>
        )}
      </div>
      {/* overflow-x-auto + whitespace-pre preserva o espaçamento de colunas do VRP */}
      <div className="px-3 py-2 flex-1 overflow-y-auto overflow-x-auto min-h-[300px]" style={{ fontFamily: "'JetBrains Mono', 'Courier New', Courier, monospace", fontSize: "12px", lineHeight: "1.5", letterSpacing: "0" }}>
        {lines.length === 0 && (
          <span className="text-zinc-600">Selecione um dispositivo e execute um comando...</span>
        )}
        {lines.map((line, i) => {
          if (line.type === "separator") {
            return (
              <div key={i} className="flex items-center gap-2 my-2">
                <div className="flex-1 border-t border-zinc-800" />
                <span className="text-[10px] text-zinc-600 font-mono px-1">{line.text}</span>
                <div className="flex-1 border-t border-zinc-800" />
              </div>
            );
          }
          if (line.type === "session-open") {
            return (
              <div key={i} className="my-1.5">
                <span className="text-[10px] text-cyan-700 font-mono">┌─ {line.text}</span>
              </div>
            );
          }
          if (line.type === "session-close") {
            return (
              <div key={i} className="my-1 mb-3">
                <span className="text-[10px] text-zinc-600 font-mono">└─ {line.text}</span>
              </div>
            );
          }
          if (line.type === "input") {
            return (
              <div key={i} className="whitespace-pre text-yellow-300">
                <span className="text-zinc-600 mr-1">›</span>{line.text}
              </div>
            );
          }
          if (line.type === "error") {
            return <div key={i} className="whitespace-pre text-red-400">{line.text}</div>;
          }
          if (line.type === "info") {
            return <div key={i} className="whitespace-pre text-cyan-400">{line.text}</div>;
          }
          if (line.type === "success") {
            return <div key={i} className="whitespace-pre text-emerald-400">{line.text}</div>;
          }
          // output — coloração sintáctica + whitespace-pre para alinhar colunas
          return (
            <div key={i} className="whitespace-pre">
              {colorizeOutputLine(line.text)}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Device Form ──────────────────────────────────────────────────────────────
function DeviceForm({
  device,
  onClose,
  onSaved,
}: {
  device?: SshDevice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(device?.name ?? "");
  const [host, setHost] = useState(device?.host ?? "");
  const [port, setPort] = useState(String(device?.port ?? 22));
  const [username, setUsername] = useState(device?.username ?? "");
  const [authType, setAuthType] = useState<AuthType>(device?.authType ?? "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [deviceType, setDeviceType] = useState(device?.deviceType ?? "generic");
  const [notes, setNotes] = useState(device?.notes ?? "");
  const [showPass, setShowPass] = useState(false);

  const create = trpc.sshCommander.createDevice.useMutation({
    onSuccess: () => { toast.success("Dispositivo adicionado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const update = trpc.sshCommander.updateDevice.useMutation({
    onSuccess: () => { toast.success("Dispositivo actualizado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSave = () => {
    if (!name.trim() || !host.trim() || !username.trim()) {
      toast.error("Preencha nome, host e utilizador");
      return;
    }
    const payload: any = {
      name: name.trim(),
      host: host.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      authType,
      deviceType,
      notes: notes || undefined,
    };
    if (authType === "password" && password) payload.password = password;
    if (authType === "key" && privateKey) payload.privateKey = privateKey;
    if (device) {
      update.mutate({ id: device.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Nome do Dispositivo *</Label>
          <Input value={name} onChange={e => setName(e.target.value)}
            placeholder="NE8000-SP01" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={deviceType} onValueChange={setDeviceType}>
            <SelectTrigger className="h-8 text-sm bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEVICE_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Host / IP *</Label>
          <Input value={host} onChange={e => setHost(e.target.value)}
            placeholder="192.168.1.1" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Porta</Label>
          <Input type="number" value={port} onChange={e => setPort(e.target.value)}
            placeholder="22" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Utilizador SSH *</Label>
        <Input value={username} onChange={e => setUsername(e.target.value)}
          placeholder="admin" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Autenticação</Label>
        <div className="flex gap-2">
          <Button size="sm" variant={authType === "password" ? "default" : "outline"}
            className="h-8 text-xs" onClick={() => setAuthType("password")}>
            <KeyRound className="w-3 h-3 mr-1" /> Senha
          </Button>
          <Button size="sm" variant={authType === "key" ? "default" : "outline"}
            className="h-8 text-xs" onClick={() => setAuthType("key")}>
            <Shield className="w-3 h-3 mr-1" /> Chave Privada
          </Button>
        </div>
      </div>
      {authType === "password" ? (
        <div className="space-y-1.5">
          <Label className="text-xs">Senha SSH {device ? "(deixe em branco para manter)" : "*"}</Label>
          <div className="relative">
            <Input type={showPass ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={device ? "••••••••" : "Senha do equipamento"}
              className="h-8 text-sm bg-zinc-950 border-zinc-700 pr-8" />
            <button className="absolute right-2 top-1.5 text-zinc-500 hover:text-zinc-300"
              onClick={() => setShowPass(!showPass)}>
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Chave Privada (PEM) {device ? "(deixe em branco para manter)" : "*"}</Label>
          <Textarea value={privateKey} onChange={e => setPrivateKey(e.target.value)}
            placeholder={"-----BEGIN RSA PRIVATE KEY-----\n..."}
            className="text-xs bg-zinc-950 border-zinc-700 font-mono h-24 resize-none" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Notas</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Observações opcionais" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-cyan-700 hover:bg-cyan-600" onClick={handleSave}
          disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {device ? "Actualizar" : "Adicionar"}
        </Button>
      </div>
    </div>
  );
}

// ─── Command Form ─────────────────────────────────────────────────────────────
function CommandForm({
  command,
  onClose,
  onSaved,
}: {
  command?: SshCommand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(command?.name ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [commandText, setCommandText] = useState(command?.command ?? "");
  const [category, setCategory] = useState(command?.category ?? "diagnostico");
  const [deviceType, setDeviceType] = useState(command?.deviceType ?? "generic");
  const [color, setColor] = useState(command?.color ?? "#3B82F6");
  const [isDangerous, setIsDangerous] = useState(command?.isDangerous === 1);

  const create = trpc.sshCommander.createQuickCommand.useMutation({
    onSuccess: () => { toast.success("Comando adicionado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const update = trpc.sshCommander.updateQuickCommand.useMutation({
    onSuccess: () => { toast.success("Comando actualizado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSave = () => {
    if (!name.trim() || !commandText.trim()) { toast.error("Preencha nome e comando"); return; }
    const payload: any = {
      name: name.trim(),
      description: description || undefined,
      command: commandText.trim(),
      category,
      deviceType,
      color,
      isDangerous: isDangerous ? 1 : 0,
    };
    if (command) {
      update.mutate({ id: command.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Nome do Comando *</Label>
        <Input value={name} onChange={e => setName(e.target.value)}
          placeholder="Ver versão do sistema" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Breve descrição do comando" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Comando(s) * (um por linha)</Label>
        <Textarea value={commandText} onChange={e => setCommandText(e.target.value)}
          placeholder={"display version\ndisplay cpu-usage"}
          className="text-xs bg-zinc-950 border-zinc-700 font-mono h-24 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-sm bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de Dispositivo</Label>
          <Select value={deviceType} onValueChange={setDeviceType}>
            <SelectTrigger className="h-8 text-sm bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEVICE_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Cor do Botão</Label>
        <div className="flex gap-2">
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="h-8 w-12 rounded border border-zinc-700 bg-zinc-950 cursor-pointer" />
          <Input value={color} onChange={e => setColor(e.target.value)}
            className="h-8 text-xs bg-zinc-950 border-zinc-700 font-mono" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="dangerous" checked={isDangerous}
          onChange={e => setIsDangerous(e.target.checked)}
          className="w-4 h-4 rounded border-zinc-600" />
        <Label htmlFor="dangerous" className="text-xs text-red-400 cursor-pointer">
          ⚠️ Marcar como perigoso (pede confirmação antes de executar)
        </Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-blue-700 hover:bg-blue-600" onClick={handleSave}
          disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {command ? "Actualizar" : "Adicionar"}
        </Button>
      </div>
    </div>
  );
}

// ───// ─── Device Command Form ─────────────────────────────────────────────
function DeviceCommandForm({
  deviceId,
  command,
  onClose,
  onSaved,
}: {
  deviceId: number;
  command?: SshDeviceCommand;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(command?.name ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [commandText, setCommandText] = useState(command?.command ?? "");
  const [category, setCategory] = useState(command?.category ?? "diagnostico");
  const [color, setColor] = useState(command?.color ?? "#06B6D4");
  const [isDangerous, setIsDangerous] = useState(command?.isDangerous === 1);

  const create = trpc.sshCommander.createDeviceCommand.useMutation({
    onSuccess: () => { toast.success("Comando adicionado ao dispositivo"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const update = trpc.sshCommander.updateDeviceCommand.useMutation({
    onSuccess: () => { toast.success("Comando actualizado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSave = () => {
    if (!name.trim() || !commandText.trim()) { toast.error("Preencha nome e comando"); return; }
    const payload: any = {
      name: name.trim(),
      description: description || undefined,
      command: commandText.trim(),
      category,
      color,
      isDangerous: isDangerous ? 1 : 0,
    };
    if (command) {
      update.mutate({ id: command.id, ...payload });
    } else {
      create.mutate({ deviceId, ...payload });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Nome do Comando *</Label>
        <Input value={name} onChange={e => setName(e.target.value)}
          placeholder="Ver interfaces" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Breve descrição do comando" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Comando(s) * (um por linha)</Label>
        <Textarea value={commandText} onChange={e => setCommandText(e.target.value)}
          placeholder={"display interface brief\ndisplay cpu-usage"}
          className="text-xs bg-zinc-950 border-zinc-700 font-mono h-24 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-sm bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cor do Botão</Label>
          <div className="flex gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="h-8 w-12 rounded border border-zinc-700 bg-zinc-950 cursor-pointer" />
            <Input value={color} onChange={e => setColor(e.target.value)}
              className="h-8 text-xs bg-zinc-950 border-zinc-700 font-mono" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="dcmd-dangerous" checked={isDangerous}
          onChange={e => setIsDangerous(e.target.checked)}
          className="w-4 h-4 rounded border-zinc-600" />
        <Label htmlFor="dcmd-dangerous" className="text-xs text-red-400 cursor-pointer">
          ⚠️ Marcar como perigoso (pede confirmação antes de executar)
        </Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-cyan-700 hover:bg-cyan-600" onClick={handleSave}
          disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {command ? "Actualizar" : "Adicionar"}
        </Button>
      </div>
    </div>
  );
}

// ─── BGP Peer Form ────────────────────────────────────────────────
function BgpPeerForm({
  deviceId,
  peer,
  onClose,
  onSaved,
}: {
  deviceId: number;
  peer?: BgpPeer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [peerIp, setPeerIp] = useState(peer?.peerIp ?? "");
  const [remoteAs, setRemoteAs] = useState(String(peer?.remoteAs ?? ""));
  const [localAsVal, setLocalAsVal] = useState(String(peer?.localAs ?? ""));
  const [description, setDescription] = useState(peer?.description ?? "");
  const [peerType, setPeerType] = useState(peer?.peerType ?? "ebgp");
  const [activateScript, setActivateScript] = useState(
    peer?.activateScript ??
    "system-view\nbgp {LOCAL_AS}\n undo peer {PEER_IP} ignore\ncommit\nquit\nquit"
  );
  const [deactivateScript, setDeactivateScript] = useState(
    peer?.deactivateScript ??
    "system-view\nbgp {LOCAL_AS}\n peer {PEER_IP} ignore\ncommit\nquit\nquit"
  );

  const create = trpc.sshCommander.createBgpPeer.useMutation({
    onSuccess: () => { toast.success("BGP peer adicionado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const update = trpc.sshCommander.updateBgpPeer.useMutation({
    onSuccess: () => { toast.success("BGP peer actualizado"); onSaved(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleSave = () => {
    if (!peerIp.trim() || !remoteAs) { toast.error("Preencha IP e AS remoto"); return; }
    const payload: any = {
      deviceId,
      peerIp: peerIp.trim(),
      remoteAs: parseInt(remoteAs),
      localAs: localAsVal ? parseInt(localAsVal) : undefined,
      description: description || undefined,
      peerType: peerType as "ebgp" | "ibgp",
      activateScript: activateScript || undefined,
      deactivateScript: deactivateScript || undefined,
    };
    if (peer) {
      update.mutate({ id: peer.id, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">IP do Peer *</Label>
          <Input value={peerIp} onChange={e => setPeerIp(e.target.value)}
            placeholder="203.0.113.1" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={peerType} onValueChange={setPeerType}>
            <SelectTrigger className="h-8 text-sm bg-zinc-950 border-zinc-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ebgp">eBGP</SelectItem>
              <SelectItem value="ibgp">iBGP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">AS Remoto *</Label>
          <Input type="number" value={remoteAs} onChange={e => setRemoteAs(e.target.value)}
            placeholder="65002" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">AS Local</Label>
          <Input type="number" value={localAsVal} onChange={e => setLocalAsVal(e.target.value)}
            placeholder="65001" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Peer com operadora XYZ" className="h-8 text-sm bg-zinc-950 border-zinc-700" />
      </div>
      <div className="p-3 bg-zinc-900/50 rounded border border-zinc-700 text-xs text-zinc-400 space-y-1">
        <p className="font-semibold text-zinc-300">Variáveis disponíveis nos scripts:</p>
        <p><code className="text-cyan-400">{"{PEER_IP}"}</code> — IP do peer ({peerIp || "ex: 203.0.113.1"})</p>
        <p><code className="text-cyan-400">{"{LOCAL_AS}"}</code> — AS local ({localAsVal || "ex: 65001"})</p>
        <p><code className="text-cyan-400">{"{REMOTE_AS}"}</code> — AS remoto ({remoteAs || "ex: 65002"})</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-green-400">Script de Activação (undo peer ignore)</Label>
        <Textarea value={activateScript} onChange={e => setActivateScript(e.target.value)}
          className="text-xs bg-zinc-950 border-zinc-700 font-mono h-28 resize-none" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-orange-400">Script de Desactivação (peer ignore)</Label>
        <Textarea value={deactivateScript} onChange={e => setDeactivateScript(e.target.value)}
          className="text-xs bg-zinc-950 border-zinc-700 font-mono h-28 resize-none" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-purple-700 hover:bg-purple-600" onClick={handleSave}
          disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {peer ? "Actualizar" : "Adicionar Peer"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SshCommander() {
  const [selectedDevice, setSelectedDevice] = useState<SshDevice | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [manualCmd, setManualCmd] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("terminal");

  // Dialogs
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editDevice, setEditDevice] = useState<SshDevice | undefined>();
  const [showCommandForm, setShowCommandForm] = useState(false);
  const [editCommand, setEditCommand] = useState<SshCommand | undefined>();
  const [showDeviceCmdForm, setShowDeviceCmdForm] = useState(false);
  const [editDeviceCmd, setEditDeviceCmd] = useState<SshDeviceCommand | undefined>();
  const [showBgpForm, setShowBgpForm] = useState(false);
  const [editBgpPeer, setEditBgpPeer] = useState<BgpPeer | undefined>();
  const [bgpConfirm, setBgpConfirm] = useState<{ peer: BgpPeer; action: "activate" | "deactivate" } | null>(null);
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [seedDeviceType, setSeedDeviceType] = useState<"all" | "switch" | "ne8000">("all");
  const [seedOverwrite, setSeedOverwrite] = useState(false);

  // Queries — usando os nomes correctos do sshCommanderRouter do fiberdoc
  const devicesQ = trpc.sshCommander.listDevices.useQuery();
  const commandsQ = trpc.sshCommander.listQuickCommands.useQuery({ deviceType: "all" });
  const deviceCommandsQ = trpc.sshCommander.listDeviceCommands.useQuery(
    { deviceId: selectedDevice?.id ?? 0 },
    { enabled: !!selectedDevice }
  );
  const bgpPeersQ = trpc.sshCommander.listBgpPeers.useQuery(
    { deviceId: selectedDevice?.id ?? 0 },
    { enabled: !!selectedDevice }
  );
  const executionsQ = trpc.sshCommander.listExecutions.useQuery(
    { deviceId: selectedDevice?.id ?? 0, limit: 20 },
    { enabled: !!selectedDevice }
  );

  // Mutations
  const deleteDevice = trpc.sshCommander.deleteDevice.useMutation({
    onSuccess: () => { toast.success("Dispositivo removido"); devicesQ.refetch(); setSelectedDevice(null); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteCommand = trpc.sshCommander.deleteQuickCommand.useMutation({
    onSuccess: () => { toast.success("Comando removido"); commandsQ.refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteDeviceCmd = trpc.sshCommander.deleteDeviceCommand.useMutation({
    onSuccess: () => { toast.success("Comando do dispositivo removido"); deviceCommandsQ.refetch(); },
    onError: (e: { message: string }) => toast.error("Erro: " + e.message),
  });
  const deleteBgpPeer = trpc.sshCommander.deleteBgpPeer.useMutation({
    onSuccess: () => { toast.success("Peer removido"); bgpPeersQ.refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const testConn = trpc.sshCommander.testConnection.useMutation({
    onSuccess: (r: { success: boolean; latencyMs?: number; error?: string }) => {
      if (r.success) toast.success(`Conectado em ${r.latencyMs}ms`);
      else toast.error("Falha: " + r.error);
    },
    onError: (e: { message: string }) => toast.error("Erro: " + e.message),
  });
  const execute = trpc.sshCommander.execute.useMutation({
    onSuccess: (r: { output: string; success: boolean; durationMs: number }) => {
      // Preservar todas as linhas incluindo as em branco (importantes para o alinhamento de colunas do VRP)
      const lines: TerminalLine[] = r.output.split("\n")
        .map((l: string) => ({ type: (r.success ? "output" : "error") as TerminalLine["type"], text: l }));
      const ts = new Date().toLocaleTimeString("pt-BR");
      setTerminalLines(prev => [
        ...prev,
        ...lines,
        { type: "session-close", text: `sessão encerrada — ${r.durationMs}ms — ${ts}` },
      ]);
      executionsQ.refetch();
    },
    onError: (e: { message: string }) => {
      const ts = new Date().toLocaleTimeString("pt-BR");
      setTerminalLines(prev => [
        ...prev,
        { type: "error", text: "✗ Erro: " + e.message },
        { type: "session-close", text: `sessão encerrada com erro — ${ts}` },
      ]);
    },
  });
  const seedCommands = trpc.sshCommander.seedQuickCommands.useMutation({
    onSuccess: (r: { inserted: number; message: string }) => {
      if (r.inserted > 0) {
        toast.success(`${r.inserted} templates carregados com sucesso!`);
        commandsQ.refetch();
        setShowSeedDialog(false);
      } else {
        toast.info(r.message);
      }
    },
    onError: (e: { message: string }) => toast.error("Erro ao carregar templates: " + e.message),
  });
  const executeBgp = trpc.sshCommander.executeBgpAction.useMutation({
    onSuccess: (r: { output: string; success: boolean; durationMs: number }) => {
      const pendingAction = bgpConfirm?.action;
      // Preservar todas as linhas incluindo as em branco (importantes para o alinhamento de colunas do VRP)
      const lines: TerminalLine[] = r.output.split("\n")
        .map((l: string) => ({ type: (r.success ? "output" : "error") as TerminalLine["type"], text: l }));
      const actionLabel = pendingAction === "activate" ? "Activado" : "Desactivado";
      setTerminalLines(prev => [
        ...prev,
        { type: "info", text: `── BGP Peer — ${actionLabel} ──` },
        ...lines,
        { type: "success", text: `✓ ${actionLabel} em ${r.durationMs}ms` },
      ]);
      setActiveTab("terminal");
      bgpPeersQ.refetch();
      executionsQ.refetch();
      setBgpConfirm(null);
      toast.success(`Peer ${actionLabel.toLowerCase()} com sucesso`);
    },
    onError: (e: { message: string }) => {
      setTerminalLines(prev => [...prev, { type: "error", text: "✗ Erro BGP: " + e.message }]);
      setBgpConfirm(null);
      toast.error("Erro: " + e.message);
    },
  });

  const handleExecuteCommand = (commands: string[], name?: string) => {
    if (!selectedDevice) { toast.error("Selecione um dispositivo primeiro"); return; }
    const cmds = commands.filter(c => c.trim());
    if (cmds.length === 0) return;
    const ts = new Date().toLocaleTimeString("pt-BR");
    setTerminalLines(prev => [
      ...prev,
      ...(prev.length > 0 ? [{ type: "separator" as const, text: ts }] : []),
      { type: "session-open" as const, text: `nova sessão SSH → ${selectedDevice.name} (${selectedDevice.host}:${selectedDevice.port}) — ${name || "comando manual"}` },
      ...cmds.map(c => ({ type: "input" as const, text: c })),
    ]);
    execute.mutate({ deviceId: selectedDevice.id, commands: cmds, commandName: name });
  };

  const handleManualSend = () => {
    if (!manualCmd.trim()) return;
    handleExecuteCommand([manualCmd.trim()]);
    setManualCmd("");
  };

  const filteredDevices = (devicesQ.data ?? []).filter((d: { name: string; host: string }) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.host.toLowerCase().includes(search.toLowerCase())
  );

  const commandsByCategory = (commandsQ.data ?? []).reduce((acc: Record<string, SshCommand[]>, cmd: any) => {
    const cat = cmd.category || "diagnostico";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd as SshCommand);
    return acc;
  }, {} as Record<string, SshCommand[]>);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ── Painel Esquerdo: Lista de Dispositivos ── */}
      <div className="w-72 flex-shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900">
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              Dispositivos SSH
            </h2>
            <Button size="sm" className="h-7 w-7 p-0 bg-cyan-700 hover:bg-cyan-600"
              onClick={() => { setEditDevice(undefined); setShowDeviceForm(true); }}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar..." className="h-8 pl-8 text-xs bg-zinc-950 border-zinc-700" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {devicesQ.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}
          {filteredDevices.map((device: any) => (
            <div key={device.id}
              className={`p-3 rounded-lg cursor-pointer border transition-all ${
                selectedDevice?.id === device.id
                  ? "bg-cyan-900/30 border-cyan-700"
                  : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
              }`}
              onClick={() => setSelectedDevice(device as SshDevice)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{device.name}</p>
                  <p className="text-xs text-zinc-400 font-mono truncate">{device.host}:{device.port}</p>
                  <Badge className="mt-1 text-[10px] h-4 px-1.5 bg-zinc-700 text-zinc-300 border-0">
                    {DEVICE_TYPE_LABELS[device.deviceType || "generic"] || device.deviceType}
                  </Badge>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button className="p-1 text-zinc-500 hover:text-cyan-400 transition-colors"
                    title="Testar conexão"
                    onClick={e => { e.stopPropagation(); testConn.mutate({ id: device.id }); }}>
                    <Wifi className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 text-zinc-500 hover:text-yellow-400 transition-colors"
                    title="Editar"
                    onClick={e => { e.stopPropagation(); setEditDevice(device as SshDevice); setShowDeviceForm(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remover"
                    onClick={e => { e.stopPropagation(); if (confirm(`Remover ${device.name}?`)) deleteDevice.mutate({ id: device.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!devicesQ.isLoading && filteredDevices.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Nenhum dispositivo</p>
              <p className="text-xs mt-1">Clique + para adicionar</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Painel Direito: Terminal + Abas ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between flex-shrink-0">
          {selectedDevice ? (
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <div>
                <span className="text-sm font-semibold">{selectedDevice.name}</span>
                <span className="text-xs text-zinc-500 ml-2 font-mono">
                  {selectedDevice.username}@{selectedDevice.host}:{selectedDevice.port}
                </span>
              </div>
              <Badge className="text-[10px] h-4 px-1.5 bg-zinc-700 text-zinc-300 border-0">
                {DEVICE_TYPE_LABELS[selectedDevice.deviceType || "generic"]}
              </Badge>
            </div>
          ) : (
            <span className="text-sm text-zinc-500">Selecione um dispositivo no painel esquerdo</span>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs border-zinc-700"
            onClick={() => setTerminalLines([])}>
            <RefreshCw className="w-3 h-3 mr-1" /> Limpar
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <div className="px-4 pt-2 border-b border-zinc-800 flex-shrink-0">
              <TabsList className="bg-zinc-800 h-8">
                <TabsTrigger value="terminal" className="text-xs h-6 data-[state=active]:bg-zinc-700">
                  <Terminal className="w-3 h-3 mr-1" /> Terminal
                </TabsTrigger>
                <TabsTrigger value="commands" className="text-xs h-6 data-[state=active]:bg-zinc-700">
                  <Zap className="w-3 h-3 mr-1" /> Comandos Rápidos
                </TabsTrigger>
                <TabsTrigger value="bgp" className="text-xs h-6 data-[state=active]:bg-zinc-700">
                  <Network className="w-3 h-3 mr-1" /> BGP Peers
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs h-6 data-[state=active]:bg-zinc-700">
                  <Clock className="w-3 h-3 mr-1" /> Histórico
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Aba Terminal ── */}
            <TabsContent value="terminal" className="flex-1 flex flex-col overflow-hidden p-4 gap-3 mt-0">
              <div className="flex-1 overflow-hidden">
                <TerminalOutput lines={terminalLines} isRunning={execute.isPending || executeBgp.isPending} />
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Input
                  value={manualCmd}
                  onChange={e => setManualCmd(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleManualSend(); }}
                  placeholder={selectedDevice ? "Digite um comando e pressione Enter..." : "Selecione um dispositivo primeiro"}
                  disabled={!selectedDevice || execute.isPending}
                  className="font-mono text-sm bg-zinc-900 border-zinc-700 text-green-300 placeholder:text-zinc-600"
                />
                <Button className="bg-cyan-700 hover:bg-cyan-600 flex-shrink-0"
                  onClick={handleManualSend}
                  disabled={!selectedDevice || !manualCmd.trim() || execute.isPending}>
                  {execute.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>

            {/* ── Aba Comandos Rápidos ── */}
            <TabsContent value="commands" className="flex-1 overflow-y-auto p-4 mt-0">
              {!selectedDevice && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-300 text-xs">
                  <Server className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Seleccione um dispositivo no painel esquerdo para activar os botões <strong>Executar</strong>.</span>
                </div>
              )}
              {/* ── Comandos do Dispositivo ── */}
              {selectedDevice && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 rounded-full bg-cyan-500" />
                      <h3 className="text-sm font-semibold text-cyan-300">Comandos de {selectedDevice.name}</h3>
                      {deviceCommandsQ.isLoading && <span className="text-xs text-zinc-500">a carregar...</span>}
                    </div>
                    <Button size="sm" className="h-7 text-xs bg-cyan-800 hover:bg-cyan-700"
                      onClick={() => { setEditDeviceCmd(undefined); setShowDeviceCmdForm(true); }}>
                      <Plus className="w-3 h-3 mr-1" /> Novo
                    </Button>
                  </div>
                  {(deviceCommandsQ.data ?? []).length === 0 && !deviceCommandsQ.isLoading ? (
                    <div className="text-xs text-zinc-500 italic px-3 py-4 text-center border border-dashed border-zinc-800 rounded-lg">
                      Nenhum comando específico para este dispositivo.<br />Clique em <strong>Novo</strong> para adicionar.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {(deviceCommandsQ.data ?? []).map((cmd: SshDeviceCommand) => (
                        <div key={cmd.id}
                          className="flex items-center gap-3 p-3 bg-cyan-950/20 rounded-lg border border-cyan-900/40 hover:border-cyan-800/60 group">
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cmd.color || "#06B6D4" }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{cmd.name}</p>
                              {cmd.isDangerous === 1 && (
                                <Badge className="text-[10px] h-4 px-1 bg-red-900/50 text-red-300 border-red-700">Perigoso</Badge>
                              )}
                            </div>
                            {cmd.description && (
                              <p className="text-xs text-zinc-500 truncate">{cmd.description}</p>
                            )}
                            <p className="text-xs text-zinc-600 font-mono truncate mt-0.5">{cmd.command}</p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-1.5 text-zinc-500 hover:text-yellow-400"
                              onClick={() => { setEditDeviceCmd(cmd); setShowDeviceCmdForm(true); }}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-1.5 text-zinc-500 hover:text-red-400"
                              onClick={() => { if (confirm(`Remover "${cmd.name}"?`)) deleteDeviceCmd.mutate({ id: cmd.id }); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <Button size="sm"
                            className={`h-8 text-xs flex-shrink-0 ${
                              cmd.isDangerous === 1
                                ? "bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-700"
                                : "bg-cyan-800 hover:bg-cyan-700"
                            }`}
                            disabled={execute.isPending}
                            onClick={() => {
                              if (cmd.isDangerous === 1 && !confirm(`⚠️ Comando perigoso!\n\n"${cmd.name}"\n\nDeseja continuar?`)) return;
                              handleExecuteCommand(
                                cmd.command.split("\n").filter((l: string) => l.trim()),
                                cmd.name
                              );
                              setActiveTab("terminal");
                            }}>
                            <Play className="w-3 h-3 mr-1" /> Executar
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Comandos Globais ── */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Comandos Pré-configurados</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                    onClick={() => setShowSeedDialog(true)}>
                    <Sparkles className="w-3 h-3 mr-1" /> Templates
                  </Button>
                  <Button size="sm" className="h-7 text-xs bg-blue-700 hover:bg-blue-600"
                    onClick={() => { setEditCommand(undefined); setShowCommandForm(true); }}>
                    <Plus className="w-3 h-3 mr-1" /> Novo Comando
                  </Button>
                </div>
              </div>
              {Object.entries(commandsByCategory).map(([cat, cmds]) => (
                <div key={cat} className="mb-6">
                  <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border mb-3 ${
                    CATEGORY_LABELS[cat]?.color || "bg-zinc-800 text-zinc-300 border-zinc-700"
                  }`}>
                    {CATEGORY_LABELS[cat]?.label || cat}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {(cmds as SshCommand[]).map((cmd: SshCommand) => (
                      <div key={cmd.id}
                        className="flex items-center gap-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-700 group">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cmd.color || "#3B82F6" }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{cmd.name}</p>
                            {cmd.isDangerous === 1 && (
                              <Badge className="text-[10px] h-4 px-1 bg-red-900/50 text-red-300 border-red-700">
                                Perigoso
                              </Badge>
                            )}
                          </div>
                          {cmd.description && (
                            <p className="text-xs text-zinc-500 truncate">{cmd.description}</p>
                          )}
                          <p className="text-xs text-zinc-600 font-mono truncate mt-0.5">{cmd.command}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 text-zinc-500 hover:text-yellow-400"
                            onClick={() => { setEditCommand(cmd); setShowCommandForm(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 text-zinc-500 hover:text-red-400"
                            onClick={() => { if (confirm(`Remover "${cmd.name}"?`)) deleteCommand.mutate({ id: cmd.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <Button size="sm"
                          className={`h-8 text-xs flex-shrink-0 ${
                            cmd.isDangerous === 1
                              ? "bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-700"
                              : "bg-zinc-700 hover:bg-zinc-600"
                          }`}
                          disabled={!selectedDevice || execute.isPending}
                          onClick={() => {
                            if (cmd.isDangerous === 1 && !confirm(`⚠️ Comando perigoso!\n\n"${cmd.name}"\n\nDeseja continuar?`)) return;
                            handleExecuteCommand(
                              cmd.command.split("\n").filter((l: string) => l.trim()),
                              cmd.name
                            );
                            setActiveTab("terminal");
                          }}>
                          <Play className="w-3 h-3 mr-1" /> Executar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(commandsByCategory).length === 0 && (
                <div className="text-center py-12 text-zinc-600">
                  <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum comando configurado</p>
                  <p className="text-xs mt-1">Clique "Templates" para carregar comandos Huawei</p>
                </div>
              )}
            </TabsContent>

            {/* ── Aba BGP Peers ── */}
            <TabsContent value="bgp" className="flex-1 overflow-y-auto p-4 mt-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Network className="w-4 h-4 text-purple-400" />
                  BGP Peers — {selectedDevice?.name || "Selecione um dispositivo"}
                </h3>
                {selectedDevice && (
                  <Button size="sm" className="h-7 text-xs bg-purple-700 hover:bg-purple-600"
                    onClick={() => { setEditBgpPeer(undefined); setShowBgpForm(true); }}>
                    <Plus className="w-3 h-3 mr-1" /> Novo Peer
                  </Button>
                )}
              </div>
              {!selectedDevice && (
                <div className="text-center py-12 text-zinc-600">
                  <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione um dispositivo para ver os peers BGP</p>
                </div>
              )}
              {selectedDevice && bgpPeersQ.isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                </div>
              )}
              {selectedDevice && (bgpPeersQ.data ?? []).length === 0 && !bgpPeersQ.isLoading && (
                <div className="text-center py-12 text-zinc-600">
                  <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum peer BGP configurado</p>
                  <p className="text-xs mt-1">Clique "Novo Peer" para adicionar</p>
                </div>
              )}
              <div className="space-y-3">
                {(bgpPeersQ.data ?? []).map((peer: any) => (
                  <Card key={peer.id} className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-white">{peer.peerIp}</span>
                            <Badge className="text-[10px] h-4 px-1.5 bg-zinc-700 text-zinc-300 border-0">
                              AS {peer.remoteAs}
                            </Badge>
                            <Badge className={`text-[10px] h-4 px-1.5 border-0 ${
                              peer.peerType === "ebgp"
                                ? "bg-blue-900/50 text-blue-300"
                                : "bg-orange-900/50 text-orange-300"
                            }`}>
                              {peer.peerType?.toUpperCase()}
                            </Badge>
                          </div>
                          {peer.description && (
                            <p className="text-xs text-zinc-400 mt-1">{peer.description}</p>
                          )}
                          {peer.localAs && (
                            <p className="text-xs text-zinc-600 mt-0.5">AS Local: {peer.localAs}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button className="p-1.5 text-zinc-500 hover:text-yellow-400 transition-colors"
                            onClick={() => { setEditBgpPeer(peer as BgpPeer); setShowBgpForm(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                            onClick={() => { if (confirm(`Remover peer ${peer.peerIp}?`)) deleteBgpPeer.mutate({ id: peer.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <Button size="sm"
                            className="h-8 text-xs bg-orange-900/50 hover:bg-orange-800 text-orange-300 border border-orange-700"
                            disabled={executeBgp.isPending || !selectedDevice}
                            onClick={() => setBgpConfirm({ peer: peer as BgpPeer, action: "deactivate" })}>
                            <WifiOff className="w-3 h-3 mr-1" /> Desactivar
                          </Button>
                          <Button size="sm"
                            className="h-8 text-xs bg-green-900/50 hover:bg-green-800 text-green-300 border border-green-700"
                            disabled={executeBgp.isPending || !selectedDevice}
                            onClick={() => setBgpConfirm({ peer: peer as BgpPeer, action: "activate" })}>
                            <Wifi className="w-3 h-3 mr-1" /> Activar
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                          <p className="text-[10px] text-green-400 font-semibold mb-1">Script Activar:</p>
                          <pre className="text-[10px] text-zinc-500 font-mono overflow-hidden whitespace-pre-wrap line-clamp-3">
                            {peer.activateScript || "Não configurado"}
                          </pre>
                        </div>
                        <div className="p-2 bg-zinc-950 rounded border border-zinc-800">
                          <p className="text-[10px] text-orange-400 font-semibold mb-1">Script Desactivar:</p>
                          <pre className="text-[10px] text-zinc-500 font-mono overflow-hidden whitespace-pre-wrap line-clamp-3">
                            {peer.deactivateScript || "Não configurado"}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ── Aba Histórico ── */}
            <TabsContent value="history" className="flex-1 overflow-y-auto p-4 mt-0">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                Últimas Execuções — {selectedDevice?.name || "Selecione um dispositivo"}
              </h3>
              {!selectedDevice && (
                <div className="text-center py-12 text-zinc-600 text-sm">
                  Selecione um dispositivo para ver o histórico
                </div>
              )}
              <div className="space-y-2">
                {(executionsQ.data ?? []).map((exec: any) => (
                  <div key={exec.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        {exec.status === "success"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                        <span className="text-xs font-medium">
                          {exec.commandName || "Comando manual"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>{exec.durationMs}ms</span>
                        <span>{new Date(exec.executedAt).toLocaleString("pt-BR")}</span>
                      </div>
                    </div>
                    <pre className="text-[10px] text-zinc-600 font-mono bg-zinc-950 rounded p-2 overflow-x-auto max-h-20 overflow-y-auto">
                      {exec.commandText}
                    </pre>
                    {exec.output && (
                      <pre className="text-[10px] text-green-400 font-mono bg-zinc-950 rounded p-2 mt-1 overflow-x-auto max-h-24 overflow-y-auto">
                        {exec.output}
                      </pre>
                    )}
                  </div>
                ))}
                {selectedDevice && (executionsQ.data ?? []).length === 0 && (
                  <div className="text-center py-8 text-zinc-600 text-sm">
                    Nenhuma execução registada
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Dialog: Dispositivo ── */}
      <Dialog open={showDeviceForm} onOpenChange={setShowDeviceForm}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              {editDevice ? "Editar Dispositivo SSH" : "Novo Dispositivo SSH"}
            </DialogTitle>
          </DialogHeader>
          <DeviceForm
            device={editDevice}
            onClose={() => setShowDeviceForm(false)}
            onSaved={() => devicesQ.refetch()}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Comando ── */}
      <Dialog open={showCommandForm} onOpenChange={setShowCommandForm}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              {editCommand ? "Editar Comando" : "Novo Comando Pré-configurado"}
            </DialogTitle>
          </DialogHeader>
          <CommandForm
            command={editCommand}
            onClose={() => setShowCommandForm(false)}
            onSaved={() => commandsQ.refetch()}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Comando do Dispositivo ── */}
      <Dialog open={showDeviceCmdForm} onOpenChange={setShowDeviceCmdForm}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              {editDeviceCmd ? "Editar Comando" : `Novo Comando — ${selectedDevice?.name ?? ""}`}
            </DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <DeviceCommandForm
              deviceId={selectedDevice.id}
              command={editDeviceCmd}
              onClose={() => setShowDeviceCmdForm(false)}
              onSaved={() => deviceCommandsQ.refetch()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: BGP Peer ── */}
      <Dialog open={showBgpForm} onOpenChange={setShowBgpForm}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Network className="w-4 h-4 text-purple-400" />
              {editBgpPeer ? "Editar BGP Peer" : "Novo BGP Peer"}
            </DialogTitle>
          </DialogHeader>
          {selectedDevice && (
            <BgpPeerForm
              deviceId={selectedDevice.id}
              peer={editBgpPeer}
              onClose={() => setShowBgpForm(false)}
              onSaved={() => bgpPeersQ.refetch()}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirmação BGP ── */}
      <Dialog open={!!bgpConfirm} onOpenChange={() => setBgpConfirm(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {bgpConfirm?.action === "activate"
                ? <><Wifi className="w-4 h-4 text-green-400" /> Activar BGP Peer</>
                : <><WifiOff className="w-4 h-4 text-orange-400" /> Desactivar BGP Peer</>}
            </DialogTitle>
          </DialogHeader>
          {bgpConfirm && (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <p className="text-sm text-zinc-300">
                  <span className="text-zinc-500">Peer:</span>{" "}
                  <span className="font-mono text-white">{bgpConfirm.peer.peerIp}</span>
                </p>
                {bgpConfirm.peer.description && (
                  <p className="text-xs text-zinc-500 mt-1">{bgpConfirm.peer.description}</p>
                )}
                <p className="text-sm text-zinc-300 mt-2">
                  <span className="text-zinc-500">Dispositivo:</span>{" "}
                  <span className="text-white">{selectedDevice?.name}</span>
                </p>
              </div>
              <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2 font-semibold">Script que será executado:</p>
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
                  {(bgpConfirm.action === "activate"
                    ? bgpConfirm.peer.activateScript
                    : bgpConfirm.peer.deactivateScript
                  )?.replace(/\{PEER_IP\}/g, bgpConfirm.peer.peerIp)
                    .replace(/\{REMOTE_AS\}/g, String(bgpConfirm.peer.remoteAs))
                    .replace(/\{LOCAL_AS\}/g, String(bgpConfirm.peer.localAs || "")) || "Script não configurado"}
                </pre>
              </div>
              <DialogFooter>
                <Button variant="outline" className="border-zinc-700 text-xs"
                  onClick={() => setBgpConfirm(null)}>
                  Cancelar
                </Button>
                <Button
                  className={`text-xs ${
                    bgpConfirm.action === "activate"
                      ? "bg-green-700 hover:bg-green-600"
                      : "bg-orange-700 hover:bg-orange-600"
                  }`}
                  disabled={executeBgp.isPending}
                  onClick={() => {
                    if (!selectedDevice) return;
                    executeBgp.mutate({
                      deviceId: selectedDevice.id,
                      peerId: bgpConfirm.peer.id,
                      action: bgpConfirm.action,
                    });
                  }}>
                  {executeBgp.isPending
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Executando...</>
                    : bgpConfirm.action === "activate" ? "Activar Peer" : "Desactivar Peer"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Templates Huawei ── */}
      <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              Carregar Templates Huawei
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-zinc-400">
              Carrega comandos pré-configurados e verificados para equipamentos Huawei.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Equipamento</Label>
              <Select value={seedDeviceType} onValueChange={(v) => setSeedDeviceType(v as any)}>
                <SelectTrigger className="h-9 bg-zinc-950 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (S6730 + NE8000) — 31 templates</SelectItem>
                  <SelectItem value="switch">Switch Huawei S6730 — 23 templates</SelectItem>
                  <SelectItem value="ne8000">Roteador Huawei NE8000 — 9 templates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-1.5">
              <p className="text-xs text-zinc-400 font-semibold">Templates inclusos:</p>
              {(seedDeviceType === "all" || seedDeviceType === "switch") && (
                <div className="space-y-0.5">
                  <p className="text-xs text-orange-400 font-medium">S6730 (Switch):</p>
                  <p className="text-[11px] text-zinc-500">Diagnóstico (10): version, cpu, memória, interfaces, VLANs, MAC, routing, MPLS LDP, LSP, STP</p>
                  <p className="text-[11px] text-zinc-500">Configuração (5): criar VLAN, múltiplas VLANs, porta access, porta trunk, remover VLAN</p>
                  <p className="text-[11px] text-zinc-500">MPLS (4): activar LDP, rota estática, route-policy, desactivar LDP</p>
                  <p className="text-[11px] text-zinc-500">Manutenção (4): salvar config, display config, reset counters, reiniciar</p>
                </div>
              )}
              {(seedDeviceType === "all" || seedDeviceType === "ne8000") && (
                <div className="space-y-0.5 mt-2">
                  <p className="text-xs text-blue-400 font-medium">NE8000 (Roteador):</p>
                  <p className="text-[11px] text-zinc-500">Diagnóstico (6): version, routing, interfaces, MPLS LDP, LSP</p>
                  <p className="text-[11px] text-zinc-500">BGP (2): display peer, display peer verbose</p>
                  <p className="text-[11px] text-zinc-500">Manutenção (2): salvar config, reiniciar</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="overwrite" checked={seedOverwrite}
                onChange={e => setSeedOverwrite(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-950" />
              <Label htmlFor="overwrite" className="text-xs text-zinc-400 cursor-pointer">
                Substituir comandos existentes (apaga todos e recarrega)
              </Label>
            </div>
            {!seedOverwrite && (commandsQ.data?.length ?? 0) > 0 && (
              <p className="text-xs text-yellow-500">
                ⚠️ Já existem {commandsQ.data?.length} comandos. Marque "Substituir" para recarregar os templates.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-700 text-xs"
              onClick={() => setShowSeedDialog(false)}>Cancelar</Button>
            <Button
              className="bg-yellow-600 hover:bg-yellow-500 text-xs"
              disabled={seedCommands.isPending}
              onClick={() => seedCommands.mutate({ deviceType: seedDeviceType, overwrite: seedOverwrite })}>
              {seedCommands.isPending
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Carregando...</>
                : <><Sparkles className="w-3 h-3 mr-1" /> Carregar Templates</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
