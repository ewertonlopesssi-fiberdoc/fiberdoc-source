import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Download, Upload, RefreshCw, Trash2, Clock, Calendar,
  CheckCircle, XCircle, Shield, HardDrive, AlertTriangle,
  CloudUpload, History, Settings2, PackageOpen, Zap,
} from "lucide-react";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00`,
}));

const DAY_OF_WEEK_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `Dia ${i + 1}`,
}));

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default function Backup() {
  const { isAdmin } = useRole();
  const utils = trpc.useUtils();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: schedule, isLoading: scheduleLoading } = trpc.backup.getSchedule.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.backup.getHistory.useQuery();

  // ── Local schedule form state ─────────────────────────────────────────────
  const [enabled, setEnabled] = useState<boolean>(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [hour, setHour] = useState<string>("2");
  const [dayOfWeek, setDayOfWeek] = useState<string>("1");
  const [dayOfMonth, setDayOfMonth] = useState<string>("1");
  const [retentionDays, setRetentionDays] = useState<string>("30");
  const [scheduleInitialized, setScheduleInitialized] = useState(false);

  // Sync form with fetched schedule
  if (schedule && !scheduleInitialized) {
    setEnabled(schedule.enabled);
    setFrequency(schedule.frequency);
    setHour(String(schedule.hour));
    if (schedule.dayOfWeek != null) setDayOfWeek(String(schedule.dayOfWeek));
    if (schedule.dayOfMonth != null) setDayOfMonth(String(schedule.dayOfMonth));
    setRetentionDays(String(schedule.retentionDays));
    setScheduleInitialized(true);
  }

  // ── Restore state ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restoreFile, setRestoreFile] = useState<any>(null);

  // ── Update upload state ───────────────────────────────────────────────────
  const updateInputRef = useRef<HTMLInputElement>(null);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateUploading, setUpdateUploading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string | null>(null);
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const [updateDone, setUpdateDone] = useState(false);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const exportMutation = trpc.backup.export.useQuery(undefined, { enabled: false });

  const runManualMutation = trpc.backup.runManual.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Backup gerado: ${result.filename} (${formatBytes(result.fileSizeBytes)})`);
      } else {
        toast.error(`Erro no backup: ${result.error}`);
      }
      utils.backup.getHistory.invalidate();
    },
    onError: () => toast.error("Erro ao gerar backup"),
  });

  const saveScheduleMutation = trpc.backup.saveSchedule.useMutation({
    onSuccess: (result) => {
      toast.success(`Agendamento salvo! Próximo backup: ${formatDate(result.nextRunAt)}`);
      utils.backup.getSchedule.invalidate();
    },
    onError: () => toast.error("Erro ao salvar agendamento"),
  });

  const restoreMutation = trpc.backup.restore.useMutation({
    onSuccess: (result) => {
      toast.success(`Restauração concluída: ${result.restored} registros importados, ${result.skipped} ignorados`);
      setRestorePreview(null);
      setRestoreFile(null);
    },
    onError: (e) => toast.error(`Erro na restauração: ${e.message}`),
  });

  const deleteHistoryMutation = trpc.backup.deleteHistory.useMutation({
    onSuccess: () => {
      toast.success("Entrada removida do histórico");
      utils.backup.getHistory.invalidate();
    },
    onError: () => toast.error("Erro ao remover entrada"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDownloadLocal = async () => {
    try {
      const result = await exportMutation.refetch();
      if (!result.data) return;
      const json = JSON.stringify(result.data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      a.download = `fiberdoc-backup-${now}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup baixado com sucesso!");
    } catch {
      toast.error("Erro ao exportar backup");
    }
  };

  const handleRunManual = () => {
    runManualMutation.mutate();
  };

  const handleSaveSchedule = () => {
    saveScheduleMutation.mutate({
      enabled,
      frequency,
      hour: parseInt(hour),
      dayOfWeek: frequency === "weekly" ? parseInt(dayOfWeek) : null,
      dayOfMonth: frequency === "monthly" ? parseInt(dayOfMonth) : null,
      retentionDays: parseInt(retentionDays),
    });
  };

  const handleUpdateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".tar.gz") && !file.name.endsWith(".gz")) {
      toast.error("Selecione um arquivo .tar.gz de atualização");
      return;
    }
    setUpdateFile(file);
    setUpdateLog([]);
    setUpdateDone(false);
    setUpdateProgress(null);
  };

  const handleApplyUpdate = async () => {
    if (!updateFile) return;
    const confirmed = window.confirm(
      `⚠️ Confirmar atualização?\n\nArquivo: ${updateFile.name}\n\nO sistema será reiniciado após a instalação. Certifique-se de ter feito um backup antes.`
    );
    if (!confirmed) return;
    setUpdateUploading(true);
    setUpdateLog([]);
    setUpdateDone(false);
    setUpdateProgress("Enviando arquivo...");
    try {
      const formData = new FormData();
      formData.append("update", updateFile);
      const uploadRes = await fetch("/api/system/update", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Erro ao enviar arquivo");
      setUpdateProgress("Aplicando atualização...");
      // Acompanhar progresso via SSE
      const evtSource = new EventSource("/api/system/update-status");
      evtSource.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (Array.isArray(data.log)) setUpdateLog(data.log);
          if (data.step) setUpdateProgress(data.step);
          if (!data.running) {
            evtSource.close();
            if (data.error) {
              toast.error(`Erro na atualização: ${data.error}`);
              setUpdateProgress(`Erro: ${data.error}`);
            } else {
              toast.success("Atualização aplicada! O sistema será reiniciado.");
              setUpdateProgress("Concluído! Aguarde o sistema reiniciar...");
              setUpdateDone(true);
            }
            setUpdateUploading(false);
          }
        } catch {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setUpdateUploading(false);
        setUpdateProgress("Conexão encerrada — o sistema pode estar reiniciando.");
        setUpdateDone(true);
      };
    } catch (err: any) {
      toast.error(err.message);
      setUpdateProgress(null);
      setUpdateUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setRestorePreview(parsed);
        setRestoreFile(parsed);
      } catch {
        toast.error("Arquivo JSON inválido");
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = () => {
    if (!restoreFile) return;
    restoreMutation.mutate({ backup: restoreFile });
  };

  if (!isAdmin) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Acesso restrito a administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup & Atualização</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie backups dos dados e atualizações do sistema com segurança.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Backup Manual ─────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              Backup Manual
            </CardTitle>
            <CardDescription>
              Gere um backup agora e baixe localmente ou salve no armazenamento em nuvem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleDownloadLocal}
              disabled={exportMutation.isFetching}
            >
              <Download className="w-4 h-4" />
              {exportMutation.isFetching ? "Exportando..." : "Baixar JSON localmente"}
            </Button>
            <Button
              className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={handleRunManual}
              disabled={runManualMutation.isPending}
            >
              <CloudUpload className="w-4 h-4" />
              {runManualMutation.isPending ? "Gerando backup..." : "Gerar e salvar backup"}
            </Button>
            <p className="text-xs text-muted-foreground">
              O backup fica registrado no histórico abaixo. Se a nuvem não estiver configurada, é salvo localmente no servidor.
            </p>
          </CardContent>
        </Card>

        {/* ── Agendamento ───────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-violet-400" />
              Agendamento Automático
            </CardTitle>
            <CardDescription>
              Configure backups automáticos periódicos salvos na nuvem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {scheduleLoading ? (
              <div className="text-sm text-muted-foreground">Carregando configuração...</div>
            ) : (
              <>
                {/* Ativar/desativar */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="schedule-enabled" className="text-sm font-medium">
                    Agendamento ativo
                  </Label>
                  <Switch
                    id="schedule-enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                  />
                </div>

                <Separator />

                {/* Frequência */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Frequência</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Hora */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hora de execução</Label>
                  <Select value={hour} onValueChange={setHour}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-48">
                      {HOUR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dia da semana (weekly) */}
                {frequency === "weekly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Dia da semana</Label>
                    <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OF_WEEK_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Dia do mês (monthly) */}
                {frequency === "monthly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Dia do mês</Label>
                    <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        {DAY_OF_MONTH_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Retenção */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Manter backups por (dias)</Label>
                  <Select value={retentionDays} onValueChange={setRetentionDays}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 dias</SelectItem>
                      <SelectItem value="14">14 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                      <SelectItem value="60">60 dias</SelectItem>
                      <SelectItem value="90">90 dias</SelectItem>
                      <SelectItem value="365">1 ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Próxima execução */}
                {schedule?.nextRunAt && (
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    Próximo backup: <span className="text-foreground font-medium">{formatDate(schedule.nextRunAt)}</span>
                  </div>
                )}

                <Button
                  className="w-full gap-2"
                  onClick={handleSaveSchedule}
                  disabled={saveScheduleMutation.isPending}
                >
                  <Settings2 className="w-4 h-4" />
                  {saveScheduleMutation.isPending ? "Salvando..." : "Salvar agendamento"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Histórico de Backups ──────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="w-4 h-4 text-emerald-400" />
              Histórico de Backups
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => utils.backup.getHistory.invalidate()}
            >
              <RefreshCw className="w-3 h-3" />
              Atualizar
            </Button>
          </div>
          <CardDescription>
            Backups salvos na nuvem — clique em Download para baixar qualquer versão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Carregando histórico...</div>
          ) : !history || history.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center gap-2">
              <HardDrive className="w-8 h-8 opacity-30" />
              Nenhum backup registrado ainda. Use "Gerar e salvar na nuvem" para criar o primeiro.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {entry.status === "success" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)} · {formatBytes(entry.fileSizeBytes ?? 0)} · {entry.totalRecords ?? 0} registros
                      </p>
                      {entry.errorMessage && (
                        <p className="text-xs text-red-400 mt-0.5">{entry.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {entry.trigger === "scheduled" ? "Auto" : "Manual"}
                    </Badge>
                    {(entry.fileUrl || (entry as any).localPath) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-cyan-400 hover:text-cyan-300"
                        title={(entry as any).localPath ? "Baixar backup (armazenado localmente no servidor)" : "Baixar backup da nuvem"}
                        asChild
                      >
                        <a
                          href={entry.fileUrl || `/api/backup/download/${entry.filename}`}
                          download={entry.filename}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => deleteHistoryMutation.mutate({ id: entry.id })}
                      disabled={deleteHistoryMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Restaurar Backup ──────────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-amber-400" />
            Restaurar Backup
          </CardTitle>
          <CardDescription>
            Importe um arquivo JSON de backup. Os dados existentes são preservados (merge seguro).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-500/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Clique para selecionar um arquivo <span className="text-foreground font-medium">.json</span> de backup
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {restorePreview && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Preview do backup selecionado</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">Versão:</div>
                <div>{restorePreview.version}</div>
                <div className="text-muted-foreground">Gerado em:</div>
                <div>{formatDate(restorePreview.generatedAt)}</div>
              </div>
              {restorePreview.counts && (
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(restorePreview.counts as Record<string, number>).map(([key, count]) => (
                    <div key={key} className="rounded bg-muted/30 px-2 py-1 text-xs text-center">
                      <div className="font-medium">{count}</div>
                      <div className="text-muted-foreground capitalize">{key}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRestore}
                  disabled={restoreMutation.isPending}
                >
                  <RefreshCw className="w-4 h-4" />
                  {restoreMutation.isPending ? "Restaurando..." : "Confirmar Restauração"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setRestorePreview(null); setRestoreFile(null); }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Atualizar Sistema (Upload Local) ─────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageOpen className="w-4 h-4 text-emerald-400" />
            Atualizar Sistema
          </CardTitle>
          <CardDescription>
            Faça upload de um arquivo <span className="font-mono text-xs">.tar.gz</span> de atualização para instalar uma nova versão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Aviso */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Gere um backup completo antes de atualizar. O sistema reiniciará automaticamente após a instalação.</span>
          </div>

          {/* Drop zone */}
          <input
            ref={updateInputRef}
            type="file"
            accept=".tar.gz,.gz"
            className="hidden"
            onChange={handleUpdateFileChange}
          />
          {!updateFile ? (
            <button
              type="button"
              onClick={() => updateInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center gap-3 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors cursor-pointer"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Clique para selecionar o arquivo de atualização</p>
                <p className="text-xs text-muted-foreground mt-1">Formato: <span className="font-mono">fiberdoc-update-*.tar.gz</span></p>
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              {/* Arquivo selecionado */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <PackageOpen className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{updateFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(updateFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                {!updateUploading && (
                  <button
                    onClick={() => { setUpdateFile(null); setUpdateLog([]); setUpdateDone(false); setUpdateProgress(null); }}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    Trocar
                  </button>
                )}
              </div>

              {/* Log de progresso */}
              {(updateProgress || updateLog.length > 0) && (
                <div className="rounded-lg bg-black/40 border border-border/30 p-3 space-y-1 max-h-40 overflow-y-auto">
                  {updateProgress && (
                    <p className={`text-xs font-medium ${updateDone ? "text-emerald-400" : "text-cyan-400"}`}>
                      {updateDone ? "✓ " : "⟳ "}{updateProgress}
                    </p>
                  )}
                  {updateLog.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono">{line}</p>
                  ))}
                </div>
              )}

              {/* Botão de aplicar */}
              {!updateDone && (
                <Button
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleApplyUpdate}
                  disabled={updateUploading}
                >
                  {updateUploading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Instalando...</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Instalar Atualização</>
                  )}
                </Button>
              )}

              {updateDone && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm text-emerald-300">Atualização concluída! O sistema está reiniciando.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Atualização do Sistema ────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4 text-blue-400" />
            Atualização Segura do Sistema
          </CardTitle>
          <CardDescription>
            Como aplicar melhorias e correções sem perder nenhum dado cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              { step: "1", text: "Gere um backup completo (botão acima) antes de qualquer atualização." },
              { step: "2", text: "O banco de dados é independente do código — atualizações de interface nunca apagam seus dados." },
              { step: "3", text: "Após a atualização, o sistema reinicia automaticamente com a nova versão." },
              { step: "4", text: "Se algo não funcionar como esperado, use Restaurar Backup para recuperar o estado anterior dos dados." },
            ].map(({ step, text }) => (
              <li key={step} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center">
                  {step}
                </span>
                <span className="text-muted-foreground">{text}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
