import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Download, Upload, ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle,
  Database, HardDrive, FileJson, ArrowUpCircle, Info, Clock, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BackupData = {
  version: string;
  generatedAt: string;
  counts: Record<string, number>;
  data: {
    rooms: any[];
    equipments: any[];
    equipmentSlots: any[];
    ports: any[];
    fibers: any[];
    connections: any[];
    maintenanceHistory: any[];
    ceos: any[];
    ceoTubes: any[];
    ceoVias: any[];
    [key: string]: any[];
  };
};

const ENTITY_LABELS: Record<string, string> = {
  rooms: "Salas / Locais",
  equipments: "Equipamentos",
  equipmentSlots: "Slots",
  ports: "Portas",
  fibers: "Fibras Ópticas",
  connections: "Conexões",
  maintenanceHistory: "Histórico",
  ceos: "CEOs",
  ceoTubes: "Tubos / Splitters",
  ceoVias: "Vias",
};

export default function Backup() {
  const { isAdmin } = useRole();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [restoreDialog, setRestoreDialog] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    restored: Record<string, number>;
    skipped: Record<string, number>;
    errors: string[];
  } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const utils = trpc.useUtils();

  const exportQuery = trpc.backup.export.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  const restoreMutation = trpc.backup.restore.useMutation({
    onSuccess: (result) => {
      setRestoreResult(result);
      setRestoreDialog(false);
      utils.backup.export.invalidate();
      toast.success("Backup restaurado com sucesso!");
    },
    onError: (e) => toast.error(`Erro na restauração: ${e.message}`),
  });

  async function handleExport() {
    setIsExporting(true);
    try {
      const result = await utils.backup.export.fetch();
      const json = JSON.stringify(result, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      a.href = url;
      a.download = `fiberdoc-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado com sucesso!");
    } catch (e: any) {
      toast.error(`Erro ao exportar: ${e?.message ?? e}`);
    } finally {
      setIsExporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setParsedBackup(null);
    setRestoreResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json.version || !json.data || !json.generatedAt) {
          throw new Error("Arquivo inválido: não é um backup FiberDoc.");
        }
        setParsedBackup(json);
      } catch (err: any) {
        setParseError(err?.message ?? "Erro ao ler o arquivo.");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function handleRestore() {
    if (!parsedBackup) return;
    restoreMutation.mutate({ backup: parsedBackup });
  }

  const totalRecords = parsedBackup
    ? Object.values(parsedBackup.counts).reduce((a, b) => a + b, 0)
    : 0;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Esta página é acessível apenas para administradores.
        </p>
        <Button variant="outline" onClick={() => setLocation("/")} className="border-border/50">
          Voltar ao Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Backup & Atualização</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie backups dos dados e atualizações seguras do sistema
        </p>
      </div>

      {/* ── SEÇÃO: BACKUP ──────────────────────────────────────────────── */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <HardDrive className="h-4 w-4 text-emerald-400" />
            </div>
            Exportar Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Gera um arquivo <strong className="text-foreground">JSON completo</strong> com todos os dados cadastrados:
            salas, equipamentos, slots, portas, fibras, conexões, CEOs, tubos, vias e histórico de manutenções.
            O arquivo pode ser usado para restaurar os dados em qualquer momento.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isExporting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isExporting ? "Exportando..." : "Baixar Backup JSON"}
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileJson className="h-3.5 w-3.5" />
              Formato: <code className="text-foreground/70">fiberdoc-backup-YYYY-MM-DD.json</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SEÇÃO: RESTAURAÇÃO ─────────────────────────────────────────── */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Upload className="h-4 w-4 text-blue-400" />
            </div>
            Restaurar Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300/80">
              A restauração usa <strong>merge seguro</strong>: registros existentes são atualizados e novos são inseridos.
              Nenhum dado atual é apagado. Recomendamos fazer um backup antes de restaurar.
            </p>
          </div>

          {/* Upload area */}
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              "border-border/40 hover:border-primary/40 hover:bg-primary/5",
              parsedBackup && "border-emerald-500/40 bg-emerald-500/5"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
            {parsedBackup ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400" />
                <p className="font-medium text-emerald-400">Arquivo carregado com sucesso</p>
                <p className="text-xs text-muted-foreground">
                  Clique para selecionar outro arquivo
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <FileJson className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Clique para selecionar o arquivo de backup <code className="text-foreground/60">.json</code>
                </p>
              </div>
            )}
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{parseError}</p>
            </div>
          )}

          {/* Preview do backup */}
          {parsedBackup && (
            <div className="rounded-xl border border-border/40 bg-background/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Preview do Backup</span>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    v{parsedBackup.version}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(parsedBackup.generatedAt).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(parsedBackup.counts).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-border/30 bg-card px-3 py-2">
                    <span className="text-xs text-muted-foreground">{ENTITY_LABELS[key] ?? key}</span>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                      {count}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Total de registros</span>
                  <span className="font-semibold text-foreground">{totalRecords}</span>
                </div>
                <Progress value={100} className="h-1.5" />
              </div>
              <div className="px-4 pb-4">
                <Button
                  onClick={() => setRestoreDialog(true)}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="h-4 w-4" />
                  Restaurar este Backup
                </Button>
              </div>
            </div>
          )}

          {/* Resultado da restauração */}
          {restoreResult && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Restauração Concluída</span>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(restoreResult.restored).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-border/30 bg-card px-3 py-2">
                    <span className="text-xs text-muted-foreground">{ENTITY_LABELS[key] ?? key}</span>
                    <span className="text-xs font-semibold text-emerald-400">+{count}</span>
                  </div>
                ))}
              </div>
              {restoreResult.errors.length > 0 && (
                <div className="px-4 pb-4">
                  <p className="text-xs text-amber-400 mb-1">{restoreResult.errors.length} avisos:</p>
                  <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 max-h-24 overflow-y-auto">
                    {restoreResult.errors.map((e, i) => (
                      <p key={i} className="text-[10px] text-amber-300/70 font-mono">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SEÇÃO: ATUALIZAÇÃO ─────────────────────────────────────────── */}
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="h-7 w-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <ArrowUpCircle className="h-4 w-4 text-violet-400" />
            </div>
            Atualização do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-5">
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-300/80">
              As atualizações do FiberDoc são aplicadas via <strong>Publicação</strong> na plataforma Manus.
              O banco de dados <strong>nunca é apagado</strong> durante uma atualização — apenas o código da aplicação é substituído.
              Os dados cadastrados (equipamentos, fibras, CEOs, etc.) são preservados integralmente.
            </p>
          </div>

          {/* Passos */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Fluxo seguro de atualização
            </p>
            {[
              {
                step: "1",
                icon: HardDrive,
                color: "text-emerald-400",
                bg: "bg-emerald-500/10 border-emerald-500/20",
                title: "Faça um backup",
                desc: "Antes de qualquer atualização, exporte um backup completo usando o botão acima. Guarde o arquivo JSON em local seguro.",
              },
              {
                step: "2",
                icon: Package,
                color: "text-blue-400",
                bg: "bg-blue-500/10 border-blue-500/20",
                title: "Melhorias são desenvolvidas",
                desc: "As melhorias, correções ou novos módulos são desenvolvidos e testados neste ambiente de desenvolvimento pelo time técnico.",
              },
              {
                step: "3",
                icon: ArrowUpCircle,
                color: "text-violet-400",
                bg: "bg-violet-500/10 border-violet-500/20",
                title: "Publicação via Manus",
                desc: "O time técnico cria um novo checkpoint e clica em \"Publicar\" na plataforma Manus. O código novo é implantado automaticamente.",
              },
              {
                step: "4",
                icon: Database,
                color: "text-cyan-400",
                bg: "bg-cyan-500/10 border-cyan-500/20",
                title: "Dados preservados",
                desc: "O banco de dados não é alterado durante a publicação. Todos os registros cadastrados (equipamentos, fibras, CEOs, portas) permanecem intactos.",
              },
              {
                step: "5",
                icon: CheckCircle2,
                color: "text-emerald-400",
                bg: "bg-emerald-500/10 border-emerald-500/20",
                title: "Verificação pós-atualização",
                desc: "Após a publicação, acesse o sistema e verifique se os dados estão corretos. Se necessário, use o backup exportado no passo 1 para restaurar.",
              },
            ].map(({ step, icon: Icon, color, bg, title, desc }) => (
              <div key={step} className="flex items-start gap-3">
                <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground/50">PASSO {step}</span>
                    <span className="text-sm font-medium text-foreground">{title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border/40 bg-background/50 p-3 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Garantia de segurança:</strong> o banco de dados MySQL/TiDB é gerenciado
              separadamente do código da aplicação. Publicações e rollbacks de código nunca afetam os dados cadastrados.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de restauração */}
      <Dialog open={restoreDialog} onOpenChange={setRestoreDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Restauração</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Esta operação irá mesclar os dados do backup com os dados atuais do sistema.
              Registros existentes serão atualizados e novos serão inseridos. Nenhum dado atual será apagado.
            </DialogDescription>
          </DialogHeader>
          {parsedBackup && (
            <div className="rounded-lg border border-border/40 bg-background/50 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                Backup de <strong className="text-foreground">
                  {new Date(parsedBackup.generatedAt).toLocaleString("pt-BR")}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Total de registros: <strong className="text-foreground">{totalRecords}</strong>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog(false)} className="border-border/50">
              Cancelar
            </Button>
            <Button
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              {restoreMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {restoreMutation.isPending ? "Restaurando..." : "Confirmar Restauração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
