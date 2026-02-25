import { useCallback, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Server,
  Cable,
  Trash2,
  ChevronRight,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type EquipmentRow = {
  name: string;
  type: string;
  model?: string;
  manufacturer?: string;
  serialNumber?: string;
  rack?: string;
  rackPosition?: string;
  ipAddress?: string;
  macAddress?: string;
  totalPorts?: number;
  status?: string;
  notes?: string;
  roomName?: string;
  _rowIndex: number;
  _errors: string[];
  _valid: boolean;
};

type FiberRow = {
  name: string;
  type?: string;
  color?: string;
  lengthMeters?: number;
  cableId?: string;
  tubeColor?: string;
  attenuation?: number;
  status?: string;
  notes?: string;
  _rowIndex: number;
  _errors: string[];
  _valid: boolean;
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const EQUIPMENT_TYPES = ["switch", "olt", "dgo", "splitter", "router", "server", "patch_panel", "amplifier", "other"];
const EQUIPMENT_STATUSES = ["active", "inactive", "maintenance"];
const FIBER_TYPES = ["single_mode", "multi_mode", "armored", "aerial", "underground"];
const FIBER_COLORS = ["blue", "orange", "green", "brown", "slate", "white", "red", "black", "yellow", "violet", "rose", "aqua"];
const FIBER_STATUSES = ["active", "inactive", "reserved", "faulty"];

// ─── CSV Templates ────────────────────────────────────────────────────────────
const EQUIPMENT_CSV_TEMPLATE = `name,type,model,manufacturer,serialNumber,rack,rackPosition,ipAddress,macAddress,totalPorts,status,notes,roomName
OLT Principal,olt,C300,Huawei,HW-001,RACK-01,1U,192.168.1.1,,16,active,OLT principal do POP,NOC Principal
Switch Core,switch,SG3428X,TP-Link,TP-002,RACK-01,2U,192.168.1.2,AA:BB:CC:DD:EE:FF,28,active,Switch de núcleo,NOC Principal
DGO Bairro Norte,dgo,,,DGO-003,,,,,8,active,DGO do Bairro Norte,
Splitter 1x8,splitter,,,SPL-004,RACK-02,3U,,,8,active,,NOC Principal`;

const FIBER_CSV_TEMPLATE = `name,type,color,lengthMeters,cableId,tubeColor,attenuation,status,notes
Fibra NOC-POP01,single_mode,blue,150,CAB-001,blue,0.3,active,Fibra principal backbone
Fibra Bairro Norte,single_mode,orange,800,CAB-002,orange,1.2,active,Enlace para Bairro Norte
Fibra Reserva,single_mode,green,200,CAB-003,green,,reserved,Fibra reserva
Fibra Aérea Rua A,aerial,blue,500,CAB-004,blue,2.1,active,Cabo aéreo Rua A`;

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Validators ───────────────────────────────────────────────────────────────
function validateEquipmentRow(row: Record<string, string>, index: number): EquipmentRow {
  const errors: string[] = [];
  if (!row.name?.trim()) errors.push("Nome é obrigatório");
  if (!row.type?.trim()) errors.push("Tipo é obrigatório");
  else if (!EQUIPMENT_TYPES.includes(row.type.trim().toLowerCase())) {
    errors.push(`Tipo inválido: "${row.type}". Use: ${EQUIPMENT_TYPES.join(", ")}`);
  }
  if (row.status && !EQUIPMENT_STATUSES.includes(row.status.trim().toLowerCase())) {
    errors.push(`Status inválido: "${row.status}". Use: ${EQUIPMENT_STATUSES.join(", ")}`);
  }
  if (row.totalPorts && isNaN(Number(row.totalPorts))) {
    errors.push("totalPorts deve ser um número");
  }

  return {
    name: row.name?.trim() ?? "",
    type: row.type?.trim().toLowerCase() ?? "",
    model: row.model?.trim() || undefined,
    manufacturer: row.manufacturer?.trim() || undefined,
    serialNumber: row.serialNumber?.trim() || undefined,
    rack: row.rack?.trim() || undefined,
    rackPosition: row.rackPosition?.trim() || undefined,
    ipAddress: row.ipAddress?.trim() || undefined,
    macAddress: row.macAddress?.trim() || undefined,
    totalPorts: row.totalPorts ? Number(row.totalPorts) : undefined,
    status: row.status?.trim().toLowerCase() || undefined,
    notes: row.notes?.trim() || undefined,
    roomName: row.roomName?.trim() || undefined,
    _rowIndex: index,
    _errors: errors,
    _valid: errors.length === 0,
  };
}

function validateFiberRow(row: Record<string, string>, index: number): FiberRow {
  const errors: string[] = [];
  if (!row.name?.trim()) errors.push("Nome é obrigatório");
  if (row.type && !FIBER_TYPES.includes(row.type.trim().toLowerCase())) {
    errors.push(`Tipo inválido: "${row.type}". Use: ${FIBER_TYPES.join(", ")}`);
  }
  if (row.color && !FIBER_COLORS.includes(row.color.trim().toLowerCase())) {
    errors.push(`Cor inválida: "${row.color}". Use: ${FIBER_COLORS.join(", ")}`);
  }
  if (row.status && !FIBER_STATUSES.includes(row.status.trim().toLowerCase())) {
    errors.push(`Status inválido: "${row.status}". Use: ${FIBER_STATUSES.join(", ")}`);
  }
  if (row.lengthMeters && isNaN(Number(row.lengthMeters))) {
    errors.push("lengthMeters deve ser um número");
  }
  if (row.attenuation && isNaN(Number(row.attenuation))) {
    errors.push("attenuation deve ser um número");
  }

  return {
    name: row.name?.trim() ?? "",
    type: row.type?.trim().toLowerCase() || undefined,
    color: row.color?.trim().toLowerCase() || undefined,
    lengthMeters: row.lengthMeters ? Number(row.lengthMeters) : undefined,
    cableId: row.cableId?.trim() || undefined,
    tubeColor: row.tubeColor?.trim() || undefined,
    attenuation: row.attenuation ? Number(row.attenuation) : undefined,
    status: row.status?.trim().toLowerCase() || undefined,
    notes: row.notes?.trim() || undefined,
    _rowIndex: index,
    _errors: errors,
    _valid: errors.length === 0,
  };
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold border transition-all ${
      done ? "bg-emerald-500 border-emerald-500 text-white" :
      active ? "bg-primary border-primary text-primary-foreground" :
      "bg-muted/30 border-border/50 text-muted-foreground"
    }`}>
      {done ? <CheckCircle className="h-4 w-4" /> : step}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Import() {
  const [activeTab, setActiveTab] = useState<"equipments" | "fibers">("equipments");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Equipment state
  const [equipRows, setEquipRows] = useState<EquipmentRow[]>([]);
  const [equipResult, setEquipResult] = useState<ImportResult | null>(null);

  // Fiber state
  const [fiberRows, setFiberRows] = useState<FiberRow[]>([]);
  const [fiberResult, setFiberResult] = useState<ImportResult | null>(null);

  const equipFileRef = useRef<HTMLInputElement>(null);
  const fiberFileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const importEquipmentsMutation = trpc.import.equipments.useMutation({
    onSuccess: (result) => {
      setEquipResult(result);
      setStep(3);
      utils.equipments.list.invalidate();
      utils.dashboard.stats.invalidate();
      if (result.imported > 0) toast.success(`${result.imported} equipamento(s) importado(s) com sucesso!`);
      if (result.skipped > 0) toast.warning(`${result.skipped} linha(s) ignorada(s) por erros.`);
    },
    onError: (e) => toast.error("Erro na importação: " + e.message),
  });

  const importFibersMutation = trpc.import.fibers.useMutation({
    onSuccess: (result) => {
      setFiberResult(result);
      setStep(3);
      utils.fibers.list.invalidate();
      utils.dashboard.stats.invalidate();
      if (result.imported > 0) toast.success(`${result.imported} fibra(s) importada(s) com sucesso!`);
      if (result.skipped > 0) toast.warning(`${result.skipped} linha(s) ignorada(s) por erros.`);
    },
    onError: (e) => toast.error("Erro na importação: " + e.message),
  });

  // ─── File Parsing ───────────────────────────────────────────────────────────
  const handleEquipFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("Arquivo CSV vazio ou sem dados."); return; }
      const headers = rows[0].map((h) => h.toLowerCase().trim());
      const data = rows.slice(1).filter((r) => r.some((c) => c.trim()));
      const parsed = data.map((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, j) => { obj[h] = row[j] ?? ""; });
        return validateEquipmentRow(obj, i + 2);
      });
      setEquipRows(parsed);
      setStep(2);
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleFiberFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("Arquivo CSV vazio ou sem dados."); return; }
      const headers = rows[0].map((h) => h.toLowerCase().trim());
      const data = rows.slice(1).filter((r) => r.some((c) => c.trim()));
      const parsed = data.map((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, j) => { obj[h] = row[j] ?? ""; });
        return validateFiberRow(obj, i + 2);
      });
      setFiberRows(parsed);
      setStep(2);
    };
    reader.readAsText(file, "utf-8");
  }, []);

  // ─── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent, type: "equipments" | "fibers") => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith(".csv")) { toast.error("Por favor, envie um arquivo .csv"); return; }
    if (type === "equipments") handleEquipFile(file);
    else handleFiberFile(file);
  }, [handleEquipFile, handleFiberFile]);

  // ─── Confirm Import ─────────────────────────────────────────────────────────
  function confirmEquipImport() {
    const valid = equipRows.filter((r) => r._valid);
    if (valid.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }
    importEquipmentsMutation.mutate({
      rows: valid.map(({ _rowIndex, _errors, _valid, ...rest }) => rest as any),
    });
  }

  function confirmFiberImport() {
    const valid = fiberRows.filter((r) => r._valid);
    if (valid.length === 0) { toast.error("Nenhuma linha válida para importar."); return; }
    importFibersMutation.mutate({
      rows: valid.map(({ _rowIndex, _errors, _valid, ...rest }) => rest as any),
    });
  }

  function resetEquip() { setEquipRows([]); setEquipResult(null); setStep(1); }
  function resetFiber() { setFiberRows([]); setFiberResult(null); setStep(1); }

  const isLoading = importEquipmentsMutation.isPending || importFibersMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Importação em Massa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importe equipamentos e fibras ópticas em lote a partir de arquivos CSV
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        <StepIndicator step={1} current={step} />
        <span className={`text-sm ${step === 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>Upload do arquivo</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        <StepIndicator step={2} current={step} />
        <span className={`text-sm ${step === 2 ? "text-foreground font-medium" : "text-muted-foreground"}`}>Validar e revisar</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        <StepIndicator step={3} current={step} />
        <span className={`text-sm ${step === 3 ? "text-foreground font-medium" : "text-muted-foreground"}`}>Resultado</span>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setStep(1); setEquipRows([]); setFiberRows([]); setEquipResult(null); setFiberResult(null); }}>
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="equipments" className="gap-2 data-[state=active]:bg-card">
            <Server className="h-4 w-4" /> Equipamentos
          </TabsTrigger>
          <TabsTrigger value="fibers" className="gap-2 data-[state=active]:bg-card">
            <Cable className="h-4 w-4" /> Fibras Ópticas
          </TabsTrigger>
        </TabsList>

        {/* ─── EQUIPMENTS TAB ─── */}
        <TabsContent value="equipments" className="mt-4 space-y-4">
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Upload Area */}
              <div className="lg:col-span-2">
                <Card
                  className="border-2 border-dashed border-border/50 bg-card/50 hover:border-primary/40 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, "equipments")}
                  onClick={() => equipFileRef.current?.click()}
                >
                  <CardContent className="py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-7 w-7 text-primary" />
                    </div>
                    <p className="text-base font-medium text-foreground">Arraste o arquivo CSV aqui</p>
                    <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground/60 mt-3">Formato aceito: .csv (UTF-8)</p>
                    <input
                      ref={equipFileRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEquipFile(f); e.target.value = ""; }}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Template & Info */}
              <div className="space-y-3">
                <Card className="border-border/50 bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Download className="h-4 w-4 text-primary" /> Template CSV
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Baixe o modelo com exemplos para preencher corretamente.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-border/50 gap-2"
                      onClick={() => downloadCSV(EQUIPMENT_CSV_TEMPLATE, "template_equipamentos.csv")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Baixar template
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="h-4 w-4 text-amber-400" /> Colunas aceitas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1">
                    {[
                      ["name *", "Nome do equipamento"],
                      ["type *", "switch, olt, dgo, splitter..."],
                      ["model", "Modelo"],
                      ["manufacturer", "Fabricante"],
                      ["serialNumber", "Número de série"],
                      ["rack", "Identificação do rack"],
                      ["rackPosition", "Posição no rack"],
                      ["ipAddress", "Endereço IP"],
                      ["macAddress", "Endereço MAC"],
                      ["totalPorts", "Total de portas (número)"],
                      ["status", "active / inactive / maintenance"],
                      ["roomName", "Nome da sala (deve existir)"],
                      ["notes", "Observações"],
                    ].map(([col, desc]) => (
                      <div key={col} className="flex gap-2 text-xs">
                        <span className="font-mono text-primary/80 shrink-0 w-28">{col}</span>
                        <span className="text-muted-foreground">{desc}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 2 && equipRows.length > 0 && (
            <EquipmentPreview
              rows={equipRows}
              onConfirm={confirmEquipImport}
              onReset={resetEquip}
              isLoading={isLoading}
            />
          )}

          {step === 3 && equipResult && (
            <ImportResultView result={equipResult} onReset={resetEquip} label="equipamentos" />
          )}
        </TabsContent>

        {/* ─── FIBERS TAB ─── */}
        <TabsContent value="fibers" className="mt-4 space-y-4">
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card
                  className="border-2 border-dashed border-border/50 bg-card/50 hover:border-primary/40 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, "fibers")}
                  onClick={() => fiberFileRef.current?.click()}
                >
                  <CardContent className="py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-7 w-7 text-emerald-400" />
                    </div>
                    <p className="text-base font-medium text-foreground">Arraste o arquivo CSV aqui</p>
                    <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground/60 mt-3">Formato aceito: .csv (UTF-8)</p>
                    <input
                      ref={fiberFileRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFiberFile(f); e.target.value = ""; }}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <Card className="border-border/50 bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Download className="h-4 w-4 text-emerald-400" /> Template CSV
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Baixe o modelo com exemplos para preencher corretamente.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-border/50 gap-2"
                      onClick={() => downloadCSV(FIBER_CSV_TEMPLATE, "template_fibras.csv")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Baixar template
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="h-4 w-4 text-amber-400" /> Colunas aceitas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1">
                    {[
                      ["name *", "Nome da fibra"],
                      ["type", "single_mode, multi_mode, armored..."],
                      ["color", "blue, orange, green, brown..."],
                      ["lengthMeters", "Comprimento em metros (número)"],
                      ["cableId", "ID do cabo"],
                      ["tubeColor", "Cor do tubo"],
                      ["attenuation", "Atenuação em dB (número)"],
                      ["status", "active / inactive / reserved / faulty"],
                      ["notes", "Observações"],
                    ].map(([col, desc]) => (
                      <div key={col} className="flex gap-2 text-xs">
                        <span className="font-mono text-emerald-400/80 shrink-0 w-28">{col}</span>
                        <span className="text-muted-foreground">{desc}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 2 && fiberRows.length > 0 && (
            <FiberPreview
              rows={fiberRows}
              onConfirm={confirmFiberImport}
              onReset={resetFiber}
              isLoading={isLoading}
            />
          )}

          {step === 3 && fiberResult && (
            <ImportResultView result={fiberResult} onReset={resetFiber} label="fibras" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Equipment Preview ────────────────────────────────────────────────────────
function EquipmentPreview({
  rows,
  onConfirm,
  onReset,
  isLoading,
}: {
  rows: EquipmentRow[];
  onConfirm: () => void;
  onReset: () => void;
  isLoading: boolean;
}) {
  const validCount = rows.filter((r) => r._valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
          <CheckCircle className="h-3.5 w-3.5" />
          {validCount} válidas
        </Badge>
        {invalidCount > 0 && (
          <Badge className="gap-1.5 bg-red-500/15 text-red-400 border-red-500/20 hover:bg-red-500/20">
            <XCircle className="h-3.5 w-3.5" />
            {invalidCount} com erros
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{rows.length} linhas no total</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5 border-border/50">
            <Trash2 className="h-3.5 w-3.5" /> Limpar
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={validCount === 0 || isLoading} className="gap-1.5">
            {isLoading ? "Importando..." : `Importar ${validCount} equipamento(s)`}
          </Button>
        </div>
      </div>

      {isLoading && <Progress value={undefined} className="h-1.5 animate-pulse" />}

      {/* Table */}
      <Card className="border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Fabricante</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Sala</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._rowIndex} className={`border-border/30 ${!row._valid ? "bg-red-500/5" : ""}`}>
                  <TableCell className="text-center text-xs text-muted-foreground">{row._rowIndex}</TableCell>
                  <TableCell>
                    {row._valid ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <div className="flex items-start gap-1">
                        <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-400 space-y-0.5">
                          {row._errors.map((e, i) => <div key={i}>{e}</div>)}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.name || <span className="text-red-400 italic">vazio</span>}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs border-border/50">{row.type || "—"}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.model || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.manufacturer || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.rack || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{row.ipAddress || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.roomName || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ─── Fiber Preview ────────────────────────────────────────────────────────────
const FIBER_COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500", orange: "bg-orange-500", green: "bg-green-500",
  brown: "bg-amber-800", slate: "bg-slate-500", white: "bg-white border border-border",
  red: "bg-red-500", black: "bg-zinc-800", yellow: "bg-yellow-400",
  violet: "bg-violet-500", rose: "bg-rose-500", aqua: "bg-cyan-400",
};

function FiberPreview({
  rows,
  onConfirm,
  onReset,
  isLoading,
}: {
  rows: FiberRow[];
  onConfirm: () => void;
  onReset: () => void;
  isLoading: boolean;
}) {
  const validCount = rows.filter((r) => r._valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">
          <CheckCircle className="h-3.5 w-3.5" />
          {validCount} válidas
        </Badge>
        {invalidCount > 0 && (
          <Badge className="gap-1.5 bg-red-500/15 text-red-400 border-red-500/20 hover:bg-red-500/20">
            <XCircle className="h-3.5 w-3.5" />
            {invalidCount} com erros
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{rows.length} linhas no total</span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5 border-border/50">
            <Trash2 className="h-3.5 w-3.5" /> Limpar
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={validCount === 0 || isLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {isLoading ? "Importando..." : `Importar ${validCount} fibra(s)`}
          </Button>
        </div>
      </div>

      {isLoading && <Progress value={undefined} className="h-1.5 animate-pulse" />}

      <Card className="border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Comprimento</TableHead>
                <TableHead>Cabo ID</TableHead>
                <TableHead>Atenuação</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row._rowIndex} className={`border-border/30 ${!row._valid ? "bg-red-500/5" : ""}`}>
                  <TableCell className="text-center text-xs text-muted-foreground">{row._rowIndex}</TableCell>
                  <TableCell>
                    {row._valid ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <div className="flex items-start gap-1">
                        <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-400 space-y-0.5">
                          {row._errors.map((e, i) => <div key={i}>{e}</div>)}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{row.name || <span className="text-red-400 italic">vazio</span>}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs border-border/50">{row.type || "single_mode"}</Badge></TableCell>
                  <TableCell>
                    {row.color ? (
                      <div className="flex items-center gap-1.5">
                        <div className={`h-3 w-3 rounded-full ${FIBER_COLOR_MAP[row.color] ?? "bg-muted"}`} />
                        <span className="text-xs text-muted-foreground">{row.color}</span>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.lengthMeters ? `${row.lengthMeters} m` : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{row.cableId || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.attenuation ? `${row.attenuation} dB` : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs border-border/50">{row.status || "active"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ─── Import Result ────────────────────────────────────────────────────────────
function ImportResultView({
  result,
  onReset,
  label,
}: {
  result: ImportResult;
  onReset: () => void;
  label: string;
}) {
  const total = result.imported + result.skipped;
  const pct = total > 0 ? Math.round((result.imported / total) * 100) : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border/50 bg-card">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${
              result.skipped === 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20"
            }`}>
              {result.skipped === 0
                ? <CheckCircle className="h-7 w-7 text-emerald-400" />
                : <AlertCircle className="h-7 w-7 text-amber-400" />
              }
            </div>
            <div>
              <h3 className="font-semibold text-lg text-foreground">
                {result.skipped === 0 ? "Importação concluída!" : "Importação parcial"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {result.imported} de {total} {label} importados com sucesso
              </p>
            </div>
          </div>

          <Progress value={pct} className="h-2 mb-4" />

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-muted/20 border border-border/30 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">{result.imported}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Importados</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-red-400">{result.skipped}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ignorados</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium text-foreground">Erros por linha:</p>
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-red-400 font-mono shrink-0">Linha {err.row}:</span>
                    <span className="text-muted-foreground">{err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={onReset} variant="outline" className="w-full border-border/50 gap-2">
            <Upload className="h-4 w-4" />
            Importar outro arquivo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
