import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, Download, CheckCircle, XCircle, Loader2, Radio, AlertTriangle, FileText
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Colunas esperadas no CSV ─────────────────────────────────────────────────
const EXPECTED_COLS = ["nome", "endereco", "capacidade", "portas_usadas", "status", "lat", "lng", "observacoes"];
const REQUIRED_COLS = ["nome"];

type ParsedRow = {
  name: string;
  address?: string;
  capacity: number;
  usedPorts: number;
  status: "active" | "maintenance" | "inactive";
  lat?: number;
  lng?: number;
  notes?: string;
  _raw: Record<string, string>;
  _error?: string;
};

function parseStatus(s: string): "active" | "maintenance" | "inactive" {
  const map: Record<string, "active" | "maintenance" | "inactive"> = {
    ativo: "active", active: "active",
    manutencao: "maintenance", manutenção: "maintenance", maintenance: "maintenance",
    inativo: "inactive", inactive: "inactive",
  };
  return map[s.toLowerCase().trim()] ?? "active";
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(";").map(c => c.trim());
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = cols[i] ?? ""; });

    const name = raw["nome"] ?? "";
    if (!name) {
      return { name: "", capacity: 8, usedPorts: 0, status: "active" as const, _raw: raw, _error: "Nome obrigatório" };
    }

    const lat = raw["lat"] ? parseFloat(raw["lat"]) : undefined;
    const lng = raw["lng"] ? parseFloat(raw["lng"]) : undefined;

    return {
      name,
      address: raw["endereco"] || undefined,
      capacity: raw["capacidade"] ? parseInt(raw["capacidade"]) || 8 : 8,
      usedPorts: raw["portas_usadas"] ? parseInt(raw["portas_usadas"]) || 0 : 0,
      status: parseStatus(raw["status"] ?? ""),
      lat: lat && !isNaN(lat) ? lat : undefined,
      lng: lng && !isNaN(lng) ? lng : undefined,
      notes: raw["observacoes"] || undefined,
      _raw: raw,
    };
  });
}

export default function CtoImport() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  const importMut = trpc.ctos.importCsv.useMutation();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setRows(parsed);
    };
    reader.readAsText(file, "UTF-8");
  };

  const validRows = rows.filter(r => !r._error);
  const errorRows = rows.filter(r => r._error);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await importMut.mutateAsync({
        rows: validRows.map(r => ({
          name: r.name,
          address: r.address,
          capacity: r.capacity,
          usedPorts: r.usedPorts,
          status: r.status,
          lat: r.lat,
          lng: r.lng,
          notes: r.notes,
        })),
      });
      setResult(res);
      if (res.created > 0) {
        toast.success(`${res.created} CTO(s) importada(s) com sucesso`);
      }
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} erro(s) durante a importação`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const header = "nome;endereco;capacidade;portas_usadas;status;lat;lng;observacoes";
    const example = "CTO-01;Rua das Flores 123;8;3;ativo;-23.5505;-46.6333;Poste 42";
    const example2 = "CTO-02;Av. Principal 456;16;0;ativo;-23.5510;-46.6340;";
    const csv = [header, example, example2].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-ctos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Radio className="w-6 h-6 text-cyan-400" />
            Importar CTOs via CSV
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre múltiplas CTOs em lote a partir de um arquivo CSV
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Baixar Template
          </Button>
          <Button variant="outline" onClick={() => setLocation("/cto")} className="gap-2">
            <Radio className="w-4 h-4" />
            Ver CTOs
          </Button>
        </div>
      </div>

      {/* Upload */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">1. Selecionar arquivo CSV</CardTitle>
          <CardDescription>
            O arquivo deve usar ponto-e-vírgula (;) como separador. Use o template acima como referência.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-cyan-500/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            {fileName ? (
              <p className="text-sm font-medium text-foreground">{fileName}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Clique para selecionar ou arraste o arquivo CSV</p>
            )}
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>
        </CardContent>
      </Card>

      {/* Colunas esperadas */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Colunas do CSV
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Coluna</th>
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Obrigatório</th>
                  <th className="text-left py-2 text-muted-foreground font-medium">Descrição / Valores aceitos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {[
                  { col: "nome", req: true, desc: "Nome da CTO (ex: CTO-01)" },
                  { col: "endereco", req: false, desc: "Endereço físico" },
                  { col: "capacidade", req: false, desc: "Número de portas (padrão: 8)" },
                  { col: "portas_usadas", req: false, desc: "Portas já em uso (padrão: 0)" },
                  { col: "status", req: false, desc: "ativo | manutencao | inativo (padrão: ativo)" },
                  { col: "lat", req: false, desc: "Latitude decimal (ex: -23.5505)" },
                  { col: "lng", req: false, desc: "Longitude decimal (ex: -46.6333)" },
                  { col: "observacoes", req: false, desc: "Observações livres" },
                ].map(({ col, req, desc }) => (
                  <tr key={col}>
                    <td className="py-2 pr-4 font-mono text-xs text-cyan-400">{col}</td>
                    <td className="py-2 pr-4">
                      {req
                        ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Obrigatório</Badge>
                        : <Badge variant="outline" className="text-xs">Opcional</Badge>
                      }
                    </td>
                    <td className="py-2 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {rows.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>2. Pré-visualização ({rows.length} linha{rows.length !== 1 ? "s" : ""})</span>
              <div className="flex gap-2">
                {validRows.length > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <CheckCircle className="w-3 h-3 mr-1" />{validRows.length} válida{validRows.length !== 1 ? "s" : ""}
                  </Badge>
                )}
                {errorRows.length > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <XCircle className="w-3 h-3 mr-1" />{errorRows.length} erro{errorRows.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Nome</th>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Endereço</th>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Cap.</th>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Situação</th>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Lat</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Lng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map((row, i) => (
                    <tr key={i} className={row._error ? "bg-red-500/5" : ""}>
                      <td className="py-1.5 pr-3">
                        {row._error
                          ? <span title={row._error}><XCircle className="w-4 h-4 text-red-400" /></span>
                          : <CheckCircle className="w-4 h-4 text-emerald-400" />
                        }
                      </td>
                      <td className="py-1.5 pr-3 font-medium">{row.name || <span className="text-muted-foreground italic">—</span>}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground max-w-[200px] truncate">{row.address || "—"}</td>
                      <td className="py-1.5 pr-3">{row.capacity}</td>
                      <td className="py-1.5 pr-3">
                        <Badge
                          className={`text-xs ${
                            row.status === "active" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            row.status === "maintenance" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}
                        >
                          {row.status === "active" ? "Ativo" : row.status === "maintenance" ? "Manutenção" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{row.lat ?? "—"}</td>
                      <td className="py-1.5 font-mono text-xs">{row.lng ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorRows.length > 0 && (
              <div className="mt-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-sm text-amber-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  {errorRows.length} linha{errorRows.length !== 1 ? "s" : ""} com erro serão ignoradas.
                  Apenas as {validRows.length} linha{validRows.length !== 1 ? "s" : ""} válidas serão importadas.
                </span>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <Button
                onClick={handleImport}
                disabled={validRows.length === 0 || importing}
                className="gap-2"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar {validRows.length} CTO{validRows.length !== 1 ? "s" : ""}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setRows([]); setFileName(""); setResult(null); if (fileRef.current) fileRef.current.value = ""; }}
              >
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {result && (
        <Card className={`border ${result.errors.length === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {result.created > 0
                ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                : <XCircle className="w-5 h-5 text-red-400" />
              }
              <span className="font-medium">
                {result.created} CTO{result.created !== 1 ? "s" : ""} importada{result.created !== 1 ? "s" : ""} com sucesso
              </span>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm text-amber-400 font-medium">{result.errors.length} erro(s):</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground font-mono">{e}</p>
                ))}
              </div>
            )}
            {result.created > 0 && (
              <Button size="sm" onClick={() => setLocation("/cto")} className="mt-2 gap-2">
                <Radio className="w-4 h-4" />
                Ver CTOs importadas
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
