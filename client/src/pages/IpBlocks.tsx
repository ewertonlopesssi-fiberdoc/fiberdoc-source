import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Network, Plus, Edit2, Trash2, Search, Filter, ChevronLeft,
  Globe, Server, Wifi, CheckCircle, XCircle, Clock, Cpu, Upload, FileText, Download,
} from "lucide-react";

const TYPE_OPTIONS = [
  { value: "infrastructure", label: "Infraestrutura" },
  { value: "clients",        label: "Clientes" },
  { value: "management",     label: "Gerência" },
  { value: "transit",        label: "Trânsito" },
  { value: "loopback",       label: "Loopback" },
  { value: "reserved",       label: "Reservado" },
  { value: "other",          label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "active",   label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "reserved", label: "Reservado" },
];

const IP_STATUS_OPTIONS = [
  { value: "allocated", label: "Alocado",  color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { value: "reserved",  label: "Reservado",color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "dhcp",      label: "DHCP",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "free",      label: "Livre",    color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
];

function ipStatusBadge(status: string) {
  const opt = IP_STATUS_OPTIONS.find((o) => o.value === status);
  return opt ? (
    <Badge variant="outline" className={`text-xs ${opt.color}`}>{opt.label}</Badge>
  ) : null;
}

function utilizationColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

// ─── Formulário de Bloco ─────────────────────────────────────────────────────
function BlockForm({
  initial, onSave, onClose, rooms,
}: {
  initial?: any;
  onSave: (data: any) => void;
  onClose: () => void;
  rooms: any[];
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    cidr: initial?.cidr ?? "",
    gateway: initial?.gateway ?? "",
    dns1: initial?.dns1 ?? "",
    dns2: initial?.dns2 ?? "",
    vlan: initial?.vlan ? String(initial.vlan) : "",
    type: initial?.type ?? "other",
    status: initial?.status ?? "active",
    description: initial?.description ?? "",
    roomId: initial?.roomId ? String(initial.roomId) : "",
    notes: initial?.notes ?? "",
  });
  const [cidrInfo, setCidrInfo] = useState<any>(null);
  const utils = trpc.useUtils();

  const parseCidrQuery = trpc.ipDoc.parseCidr.useQuery(
    { cidr: form.cidr },
    { enabled: form.cidr.includes("/") && form.cidr.length >= 9 }
  );

  useEffect(() => {
    if (parseCidrQuery.data?.success) setCidrInfo(parseCidrQuery.data.data);
    else setCidrInfo(null);
  }, [parseCidrQuery.data]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.cidr.trim()) return;
    onSave({
      name: form.name.trim(),
      cidr: form.cidr.trim(),
      gateway: form.gateway || null,
      dns1: form.dns1 || null,
      dns2: form.dns2 || null,
      vlan: form.vlan ? parseInt(form.vlan) : null,
      type: form.type,
      status: form.status,
      description: form.description || null,
      roomId: form.roomId ? parseInt(form.roomId) : null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex: Rede Clientes Zona Norte" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>CIDR *</Label>
          <Input
            value={form.cidr}
            onChange={(e) => set("cidr", e.target.value)}
            placeholder="ex: 192.168.1.0/24"
            className="font-mono"
          />
          {cidrInfo && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-0.5">
              <p>Rede: <span className="font-mono text-foreground">{cidrInfo.networkAddress}</span> — Broadcast: <span className="font-mono text-foreground">{cidrInfo.broadcastAddress}</span></p>
              <p>Utilizáveis: <span className="font-mono text-foreground">{cidrInfo.firstUsable}</span> → <span className="font-mono text-foreground">{cidrInfo.lastUsable}</span> ({cidrInfo.totalHosts} hosts)</p>
            </div>
          )}
          {parseCidrQuery.data?.success === false && form.cidr.length > 6 && (
            <p className="text-xs text-red-400">{parseCidrQuery.data.error}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Gateway</Label>
          <Input value={form.gateway} onChange={(e) => set("gateway", e.target.value)} placeholder="ex: 192.168.1.1" className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label>VLAN</Label>
          <Input type="number" value={form.vlan} onChange={(e) => set("vlan", e.target.value)} placeholder="ex: 100" />
        </div>
        <div className="space-y-1">
          <Label>DNS Primário</Label>
          <Input value={form.dns1} onChange={(e) => set("dns1", e.target.value)} placeholder="ex: 8.8.8.8" className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label>DNS Secundário</Label>
          <Input value={form.dns2} onChange={(e) => set("dns2", e.target.value)} placeholder="ex: 8.8.4.4" className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={form.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Sala / Local</Label>
          <Select value={form.roomId} onValueChange={(v) => set("roomId", v)}>
            <SelectTrigger><SelectValue placeholder="Selecionar sala..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Nenhuma</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Descrição</Label>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Descrição do bloco..." />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Observações</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Notas internas..." />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!form.name.trim() || !form.cidr.trim()}>
          {initial ? "Salvar Alterações" : "Criar Bloco"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Formulário de Endereço IP ───────────────────────────────────────────────
function IpForm({
  initial, blockId, onSave, onClose, equipments,
}: {
  initial?: any;
  blockId: number;
  onSave: (data: any) => void;
  onClose: () => void;
  equipments: any[];
}) {
  const [form, setForm] = useState({
    address: initial?.address ?? "",
    status: initial?.status ?? "allocated",
    hostname: initial?.hostname ?? "",
    description: initial?.description ?? "",
    equipmentId: initial?.equipmentId ? String(initial.equipmentId) : "",
    macAddress: initial?.macAddress ?? "",
    owner: initial?.owner ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Endereço IP *</Label>
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="ex: 192.168.1.10" className="font-mono" disabled={!!initial} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {IP_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Hostname</Label>
          <Input value={form.hostname} onChange={(e) => set("hostname", e.target.value)} placeholder="ex: router-01.isp.local" />
        </div>
        <div className="space-y-1">
          <Label>Proprietário / Cliente</Label>
          <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="ex: João Silva / Setor TI" />
        </div>
        <div className="space-y-1">
          <Label>Endereço MAC</Label>
          <Input value={form.macAddress} onChange={(e) => set("macAddress", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className="font-mono" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Equipamento Vinculado</Label>
          <Select value={form.equipmentId} onValueChange={(v) => set("equipmentId", v)}>
            <SelectTrigger><SelectValue placeholder="Selecionar equipamento..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Nenhum</SelectItem>
              {equipments.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Descrição</Label>
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label>Observações</Label>
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave({ ...form, blockId, equipmentId: form.equipmentId ? parseInt(form.equipmentId) : null })} disabled={!form.address.trim()}>
          {initial ? "Salvar" : "Alocar IP"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Página Principal ────────────────────────────────────────────────────────
export default function IpBlocks() {
  const [, params] = useRoute("/ip-doc/blocos/:id");
  const blockId = params?.id ? parseInt(params.id) : null;

  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [deletingBlock, setDeletingBlock] = useState<any>(null);
  const [showIpForm, setShowIpForm] = useState(false);
  const [editingIp, setEditingIp] = useState<any>(null);
  const [deletingIp, setDeletingIp] = useState<any>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [ipSearch, setIpSearch] = useState("");
  const [ipFilterStatus, setIpFilterStatus] = useState("all");

  const { data: blocks = [], isLoading: loadingBlocks } = trpc.ipDoc.listBlocks.useQuery({});
  const { data: rooms = [] } = trpc.rooms.list.useQuery();
  const { data: equipmentsList = [] } = trpc.equipments.list.useQuery({});
  const { data: selectedBlock } = trpc.ipDoc.blockById.useQuery(
    { id: blockId! },
    { enabled: !!blockId }
  );
  const { data: addresses = [], isLoading: loadingAddresses } = trpc.ipDoc.addressesByBlock.useQuery(
    { blockId: blockId! },
    { enabled: !!blockId }
  );

  const createBlock = trpc.ipDoc.createBlock.useMutation({
    onSuccess: () => { utils.ipDoc.listBlocks.invalidate(); utils.ipDoc.dashboard.invalidate(); setShowBlockForm(false); toast.success("Bloco criado com sucesso"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateBlock = trpc.ipDoc.updateBlock.useMutation({
    onSuccess: () => { utils.ipDoc.listBlocks.invalidate(); utils.ipDoc.dashboard.invalidate(); setEditingBlock(null); toast.success("Bloco atualizado"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteBlock = trpc.ipDoc.deleteBlock.useMutation({
    onSuccess: () => { utils.ipDoc.listBlocks.invalidate(); utils.ipDoc.dashboard.invalidate(); setDeletingBlock(null); toast.success("Bloco excluído"); },
  });
  const allocate = trpc.ipDoc.allocate.useMutation({
    onSuccess: () => { utils.ipDoc.addressesByBlock.invalidate(); utils.ipDoc.dashboard.invalidate(); setShowIpForm(false); toast.success("IP alocado com sucesso"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateAddress = trpc.ipDoc.updateAddress.useMutation({
    onSuccess: () => { utils.ipDoc.addressesByBlock.invalidate(); utils.ipDoc.dashboard.invalidate(); setEditingIp(null); toast.success("IP atualizado"); },
  });
  const releaseAddress = trpc.ipDoc.releaseAddress.useMutation({
    onSuccess: () => { utils.ipDoc.addressesByBlock.invalidate(); utils.ipDoc.dashboard.invalidate(); toast.success("IP liberado"); },
  });
  const deleteAddress = trpc.ipDoc.deleteAddress.useMutation({
    onSuccess: () => { utils.ipDoc.addressesByBlock.invalidate(); utils.ipDoc.dashboard.invalidate(); setDeletingIp(null); toast.success("Registro excluído"); },
  });
  const importCsv = trpc.ipDoc.importCsv.useMutation({
    onSuccess: (r) => {
      utils.ipDoc.addressesByBlock.invalidate();
      utils.ipDoc.dashboard.invalidate();
      setShowCsvImport(false);
      setCsvText("");
      setCsvPreview([]);
      toast.success(`Importados: ${r.imported} IPs${r.skipped > 0 ? ` | ${r.skipped} ignorados` : ""}`);
    },
    onError: (e) => toast.error("Erro na importação: " + e.message),
  });

  const parseCsvText = (text: string) => {
    const lines = text.trim().split("\n").filter(Boolean);
    const rows: any[] = [];
    const errs: string[] = [];
    const firstLine = lines[0]?.toLowerCase() ?? "";
    const hasHeader = firstLine.includes("address") || firstLine.includes("ip");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    for (const line of dataLines) {
      const sep = line.includes(";") ? ";" : ",";
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      const address = cols[0];
      if (!address || !address.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
        errs.push(`Linha ignorada (IP inválido): "${line.slice(0, 40)}"`); continue;
      }
      rows.push({ address, hostname: cols[1] || null, owner: cols[2] || null, mac: cols[3] || null, description: cols[4] || null });
    }
    setCsvPreview(rows);
    setCsvErrors(errs);
  };

  const isAdmin = user?.role === "admin";

  // Filtrar blocos
  const filteredBlocks = blocks.filter((b) => {
    const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) || b.cidr.includes(search);
    const matchType = filterType === "all" || b.type === filterType;
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    return matchSearch && matchType && matchStatus;
  });

  // Filtrar endereços
  const filteredAddresses = addresses.filter((a) => {
    const matchSearch = !ipSearch || a.address.includes(ipSearch) || (a.hostname ?? "").toLowerCase().includes(ipSearch.toLowerCase()) || (a.owner ?? "").toLowerCase().includes(ipSearch.toLowerCase());
    const matchStatus = ipFilterStatus === "all" || a.status === ipFilterStatus;
    return matchSearch && matchStatus;
  });

  // Vista de detalhe de bloco
  if (blockId) {
    const block = selectedBlock;
    if (!block) return <div className="p-6 text-muted-foreground">Carregando...</div>;

    const allocated = addresses.filter((a) => a.status === "allocated").length;
    const reserved  = addresses.filter((a) => a.status === "reserved").length;
    const dhcp      = addresses.filter((a) => a.status === "dhcp").length;
    const used = allocated + reserved + dhcp;
    const pct = block.totalHosts > 0 ? Math.round((used / block.totalHosts) * 100) : 0;

    return (
      <div className="p-6 space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/ip-doc/blocos"><span className="hover:text-foreground cursor-pointer flex items-center gap-1"><ChevronLeft className="h-3 w-3" /> Blocos IP</span></Link>
          <span>/</span>
          <span className="text-foreground font-medium">{block.name}</span>
        </div>

        {/* Header do bloco */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {block.name}
            </h1>
            <p className="font-mono text-sm text-muted-foreground mt-0.5">{block.cidr}</p>
            {block.description && <p className="text-sm text-muted-foreground mt-1">{block.description}</p>}
          </div>
          {isAdmin && (
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditingBlock(block)}>
                <Edit2 className="h-3 w-3" /> Editar
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => { setShowCsvImport(true); setCsvText(""); setCsvPreview([]); setCsvErrors([]); }}>
                <Upload className="h-3 w-3" /> Importar CSV
              </Button>
              <Button size="sm" className="gap-1" onClick={() => setShowIpForm(true)}>
                <Plus className="h-3 w-3" /> Alocar IP
              </Button>
            </div>
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Rede", value: block.networkAddress, mono: true },
            { label: "Broadcast", value: block.broadcastAddress, mono: true },
            { label: "Gateway", value: block.gateway ?? "—", mono: true },
            { label: "VLAN", value: block.vlan ? `VLAN ${block.vlan}` : "—" },
            { label: "DNS 1", value: block.dns1 ?? "—", mono: true },
            { label: "DNS 2", value: block.dns2 ?? "—", mono: true },
            { label: "Total de Hosts", value: block.totalHosts.toLocaleString("pt-BR") },
            { label: "Utilização", value: `${used}/${block.totalHosts} (${pct}%)`, color: pct >= 90 ? "text-red-400" : pct >= 70 ? "text-yellow-400" : "text-emerald-400" },
          ].map((item) => (
            <div key={item.label} className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-sm font-medium mt-0.5 ${item.mono ? "font-mono" : ""} ${item.color ?? "text-foreground"}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Barra de utilização */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Utilização: {pct}%</span>
            <span>{block.totalHosts - used} livres de {block.totalHosts}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div className={`h-full ${utilizationColor(pct)} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="text-emerald-400">{allocated} alocados</span>
            <span className="text-yellow-400">{reserved} reservados</span>
            <span className="text-blue-400">{dhcp} DHCP</span>
          </div>
        </div>

        {/* Filtros de endereços */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-9 h-8 text-sm" placeholder="Buscar IP, hostname, proprietário..." value={ipSearch} onChange={(e) => setIpSearch(e.target.value)} />
          </div>
          <Select value={ipFilterStatus} onValueChange={setIpFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {IP_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tabela de endereços */}
        <Card className="border-border/50">
          <CardContent className="p-0">
            {loadingAddresses ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Carregando endereços...</div>
            ) : filteredAddresses.length === 0 ? (
              <div className="p-8 text-center">
                <Server className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Nenhum endereço alocado neste bloco</p>
                {isAdmin && (
                  <Button size="sm" className="mt-3 gap-1" onClick={() => setShowIpForm(true)}>
                    <Plus className="h-3 w-3" /> Alocar Primeiro IP
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Endereço IP</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Hostname</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Proprietário</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Equipamento</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">MAC</th>
                      {isAdmin && <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAddresses.map((addr, idx) => (
                      <tr key={addr.id} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-2.5 font-mono text-foreground font-medium">{addr.address}</td>
                        <td className="px-4 py-2.5">{ipStatusBadge(addr.status)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{addr.hostname ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{addr.owner ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{(addr as any).equipmentName ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs">{addr.macAddress ?? "—"}</td>
                        {isAdmin && (
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingIp(addr)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              {addr.status !== "free" && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-yellow-400 hover:text-yellow-300" onClick={() => releaseAddress.mutate({ id: addr.id })}>
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300" onClick={() => setDeletingIp(addr)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <Dialog open={showIpForm} onOpenChange={setShowIpForm}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Alocar Endereço IP</DialogTitle></DialogHeader>
            <IpForm blockId={blockId} equipments={equipmentsList as any[]} onClose={() => setShowIpForm(false)}
              onSave={(data) => allocate.mutate(data)} />
          </DialogContent>
        </Dialog>
        <Dialog open={!!editingIp} onOpenChange={(o) => !o && setEditingIp(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Editar Endereço IP</DialogTitle></DialogHeader>
            {editingIp && (
              <IpForm blockId={blockId} initial={editingIp} equipments={equipmentsList as any[]}
                onClose={() => setEditingIp(null)}
                onSave={(data) => updateAddress.mutate({ id: editingIp.id, ...data })} />
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={!!editingBlock} onOpenChange={(o) => !o && setEditingBlock(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Editar Bloco IP</DialogTitle></DialogHeader>
            {editingBlock && (
              <BlockForm initial={editingBlock} rooms={rooms as any[]} onClose={() => setEditingBlock(null)}
                onSave={(data) => updateBlock.mutate({ id: editingBlock.id, ...data })} />
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog open={!!deletingIp} onOpenChange={(o) => !o && setDeletingIp(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir registro de IP?</AlertDialogTitle>
              <AlertDialogDescription>O endereço <span className="font-mono">{deletingIp?.address}</span> será removido permanentemente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteAddress.mutate({ id: deletingIp.id })}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Vista de listagem de blocos
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Gerenciamento de Blocos IP
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{blocks.length} bloco(s) cadastrado(s)</p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => setShowBlockForm(true)}>
            <Plus className="h-4 w-4" /> Novo Bloco
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-9 h-9 text-sm" placeholder="Buscar por nome ou CIDR..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de blocos */}
      {loadingBlocks ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filteredBlocks.length === 0 ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">Nenhum bloco encontrado</p>
            {isAdmin && (
              <Button className="mt-4 gap-2" size="sm" onClick={() => setShowBlockForm(true)}>
                <Plus className="h-4 w-4" /> Cadastrar Bloco
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBlocks.map((block) => {
            const typeInfo = TYPE_OPTIONS.find((o) => o.value === block.type);
            return (
              <Card key={block.id} className="border-border/50 hover:border-primary/30 transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/ip-doc/blocos/${block.id}`}>
                      <div className="cursor-pointer hover:text-primary transition-colors">
                        <p className="font-semibold text-foreground">{block.name}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">{block.cidr}</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingBlock(block)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => setDeletingBlock(block)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{typeInfo?.label ?? block.type}</Badge>
                    {block.vlan && <Badge variant="outline" className="text-xs font-mono">VLAN {block.vlan}</Badge>}
                    {block.gateway && <Badge variant="outline" className="text-xs font-mono">GW: {block.gateway}</Badge>}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{block.totalHosts} hosts</span>
                    <Link href={`/ip-doc/blocos/${block.id}`}>
                      <span className="text-primary hover:underline cursor-pointer">Ver endereços →</span>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog criar bloco */}
      <Dialog open={showBlockForm} onOpenChange={setShowBlockForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Bloco IP</DialogTitle></DialogHeader>
          <BlockForm rooms={rooms as any[]} onClose={() => setShowBlockForm(false)}
            onSave={(data) => createBlock.mutate(data)} />
        </DialogContent>
      </Dialog>

      {/* Dialog editar bloco */}
      <Dialog open={!!editingBlock} onOpenChange={(o) => !o && setEditingBlock(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Bloco IP</DialogTitle></DialogHeader>
          {editingBlock && (
            <BlockForm initial={editingBlock} rooms={rooms as any[]} onClose={() => setEditingBlock(null)}
              onSave={(data) => updateBlock.mutate({ id: editingBlock.id, ...data })} />
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deletingBlock} onOpenChange={(o) => !o && setDeletingBlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloco IP?</AlertDialogTitle>
            <AlertDialogDescription>
              O bloco <strong>{deletingBlock?.name}</strong> ({deletingBlock?.cidr}) e todos os endereços alocados serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteBlock.mutate({ id: deletingBlock.id })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Importação CSV */}
      <Dialog open={showCsvImport} onOpenChange={(o) => { if (!o) { setShowCsvImport(false); setCsvText(""); setCsvPreview([]); setCsvErrors([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Importar IPs via CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Formato esperado (separador: <code className="font-mono">,</code> ou <code className="font-mono">;</code>):</p>
              <code className="block font-mono text-xs bg-background rounded px-2 py-1">address;hostname;owner;mac;description</code>
              <p>A primeira linha pode ser um cabeçalho (será ignorado automaticamente). Apenas o campo <strong>address</strong> é obrigatório.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Cole o conteúdo CSV aqui</Label>
                <label className="cursor-pointer">
                  <span className="text-xs text-primary hover:underline flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Carregar arquivo
                  </span>
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      setCsvText(text);
                      parseCsvText(text);
                    };
                    reader.readAsText(file, "UTF-8");
                  }} />
                </label>
              </div>
              <Textarea
                value={csvText}
                onChange={(e) => { setCsvText(e.target.value); parseCsvText(e.target.value); }}
                placeholder={`192.168.1.1;router-core;Infraestrutura;AA:BB:CC:DD:EE:FF;Gateway principal\n192.168.1.2;sw-acesso-01;TI;00:11:22:33:44:55;Switch de acesso`}
                className="bg-background border-border/50 font-mono text-xs resize-none"
                rows={6}
              />
            </div>
            {csvPreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">{csvPreview.length} endereço{csvPreview.length !== 1 ? "s" : ""} válido{csvPreview.length !== 1 ? "s" : ""} encontrado{csvPreview.length !== 1 ? "s" : ""}:</p>
                <div className="max-h-40 overflow-y-auto rounded border border-border/50">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">IP</th>
                        <th className="text-left px-2 py-1.5 font-medium">Hostname</th>
                        <th className="text-left px-2 py-1.5 font-medium">Responsável</th>
                        <th className="text-left px-2 py-1.5 font-medium">MAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="px-2 py-1 font-mono">{row.address}</td>
                          <td className="px-2 py-1 text-muted-foreground">{row.hostname ?? "—"}</td>
                          <td className="px-2 py-1 text-muted-foreground">{row.owner ?? "—"}</td>
                          <td className="px-2 py-1 font-mono text-muted-foreground">{row.mac ?? "—"}</td>
                        </tr>
                      ))}
                      {csvPreview.length > 50 && <tr><td colSpan={4} className="px-2 py-1 text-center text-muted-foreground">... e mais {csvPreview.length - 50} registros</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {csvErrors.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-yellow-400">{csvErrors.length} linha{csvErrors.length !== 1 ? "s" : ""} ignorada{csvErrors.length !== 1 ? "s" : ""}:</p>
                {csvErrors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-muted-foreground font-mono">{e}</p>)}
                {csvErrors.length > 5 && <p className="text-xs text-muted-foreground">... e mais {csvErrors.length - 5}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCsvImport(false); setCsvText(""); setCsvPreview([]); setCsvErrors([]); }}>Cancelar</Button>
            <Button
              disabled={csvPreview.length === 0 || importCsv.isPending}
              onClick={() => blockId && importCsv.mutate({ blockId, rows: csvPreview })}
            >
              {importCsv.isPending ? "Importando..." : `Importar ${csvPreview.length} IPs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
