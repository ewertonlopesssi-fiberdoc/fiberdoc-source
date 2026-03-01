import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Settings, Upload, Palette, Monitor, Sun, Moon, Zap, Leaf, Waves, Bell, RefreshCw, CheckCircle2, XCircle, Clock, History, PackageOpen, Cpu, Plus, Pencil, Trash2, MapPin, LocateFixed, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const THEMES = [
  {
    id: "dark-blue",
    name: "Azul Escuro",
    description: "Tema padrão — fundo escuro com acentos em azul ciano",
    icon: Monitor,
    preview: { bg: "#0a0f1e", accent: "#00d4ff", card: "#0f1729" },
  },
  {
    id: "dark-green",
    name: "Verde Escuro",
    description: "Fundo escuro com acentos em verde esmeralda",
    icon: Leaf,
    preview: { bg: "#0a1a0f", accent: "#00e676", card: "#0f2318" },
  },
  {
    id: "dark-purple",
    name: "Roxo Escuro",
    description: "Fundo escuro com acentos em violeta",
    icon: Zap,
    preview: { bg: "#0f0a1e", accent: "#a855f7", card: "#160f2a" },
  },
  {
    id: "light",
    name: "Claro",
    description: "Tema claro com fundo branco e acentos em azul",
    icon: Sun,
    preview: { bg: "#f8fafc", accent: "#2563eb", card: "#ffffff" },
  },
  {
    id: "ocean",
    name: "Oceano",
    description: "Tons de azul profundo inspirados no oceano",
    icon: Waves,
    preview: { bg: "#0c1445", accent: "#38bdf8", card: "#111c5c" },
  },
  {
    id: "midnight",
    name: "Meia-noite",
    description: "Preto intenso com acentos em âmbar",
    icon: Moon,
    preview: { bg: "#0a0a0a", accent: "#f59e0b", card: "#141414" },
  },
];

// CSS variables por tema
const THEME_CSS: Record<string, string> = {
  "dark-blue": `
    --background: oklch(0.09 0.02 240);
    --foreground: oklch(0.95 0.01 240);
    --card: oklch(0.12 0.03 240);
    --card-foreground: oklch(0.95 0.01 240);
    --primary: oklch(0.75 0.18 200);
    --primary-foreground: oklch(0.1 0.02 240);
    --muted: oklch(0.18 0.02 240);
    --muted-foreground: oklch(0.6 0.02 240);
    --border: oklch(0.22 0.03 240);
    --accent: oklch(0.75 0.18 200);
    --accent-foreground: oklch(0.1 0.02 240);
    --sidebar-background: oklch(0.08 0.03 240);
    --sidebar-foreground: oklch(0.85 0.01 240);
    --sidebar-border: oklch(0.18 0.03 240);
    --sidebar-accent: oklch(0.14 0.04 240);
    --sidebar-accent-foreground: oklch(0.95 0.01 240);
    --sidebar-primary: oklch(0.75 0.18 200);
    --sidebar-primary-foreground: oklch(0.1 0.02 240);
  `,
  "dark-green": `
    --background: oklch(0.09 0.03 145);
    --foreground: oklch(0.95 0.01 145);
    --card: oklch(0.12 0.04 145);
    --card-foreground: oklch(0.95 0.01 145);
    --primary: oklch(0.75 0.2 145);
    --primary-foreground: oklch(0.1 0.02 145);
    --muted: oklch(0.18 0.03 145);
    --muted-foreground: oklch(0.6 0.02 145);
    --border: oklch(0.22 0.04 145);
    --accent: oklch(0.75 0.2 145);
    --accent-foreground: oklch(0.1 0.02 145);
    --sidebar-background: oklch(0.08 0.04 145);
    --sidebar-foreground: oklch(0.85 0.01 145);
    --sidebar-border: oklch(0.18 0.04 145);
    --sidebar-accent: oklch(0.14 0.05 145);
    --sidebar-accent-foreground: oklch(0.95 0.01 145);
    --sidebar-primary: oklch(0.75 0.2 145);
    --sidebar-primary-foreground: oklch(0.1 0.02 145);
  `,
  "dark-purple": `
    --background: oklch(0.09 0.03 290);
    --foreground: oklch(0.95 0.01 290);
    --card: oklch(0.12 0.04 290);
    --card-foreground: oklch(0.95 0.01 290);
    --primary: oklch(0.65 0.25 290);
    --primary-foreground: oklch(0.98 0.01 290);
    --muted: oklch(0.18 0.03 290);
    --muted-foreground: oklch(0.6 0.02 290);
    --border: oklch(0.22 0.04 290);
    --accent: oklch(0.65 0.25 290);
    --accent-foreground: oklch(0.98 0.01 290);
    --sidebar-background: oklch(0.08 0.04 290);
    --sidebar-foreground: oklch(0.85 0.01 290);
    --sidebar-border: oklch(0.18 0.04 290);
    --sidebar-accent: oklch(0.14 0.05 290);
    --sidebar-accent-foreground: oklch(0.95 0.01 290);
    --sidebar-primary: oklch(0.65 0.25 290);
    --sidebar-primary-foreground: oklch(0.98 0.01 290);
  `,
  "light": `
    --background: oklch(0.98 0.005 240);
    --foreground: oklch(0.15 0.02 240);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.15 0.02 240);
    --primary: oklch(0.5 0.2 240);
    --primary-foreground: oklch(0.98 0.005 240);
    --muted: oklch(0.94 0.01 240);
    --muted-foreground: oklch(0.5 0.02 240);
    --border: oklch(0.88 0.01 240);
    --accent: oklch(0.5 0.2 240);
    --accent-foreground: oklch(0.98 0.005 240);
    --sidebar-background: oklch(0.96 0.01 240);
    --sidebar-foreground: oklch(0.2 0.02 240);
    --sidebar-border: oklch(0.88 0.01 240);
    --sidebar-accent: oklch(0.92 0.02 240);
    --sidebar-accent-foreground: oklch(0.15 0.02 240);
    --sidebar-primary: oklch(0.5 0.2 240);
    --sidebar-primary-foreground: oklch(0.98 0.005 240);
  `,
  "ocean": `
    --background: oklch(0.1 0.06 240);
    --foreground: oklch(0.95 0.01 200);
    --card: oklch(0.13 0.07 240);
    --card-foreground: oklch(0.95 0.01 200);
    --primary: oklch(0.7 0.15 200);
    --primary-foreground: oklch(0.1 0.05 240);
    --muted: oklch(0.18 0.06 240);
    --muted-foreground: oklch(0.6 0.03 220);
    --border: oklch(0.22 0.07 240);
    --accent: oklch(0.7 0.15 200);
    --accent-foreground: oklch(0.1 0.05 240);
    --sidebar-background: oklch(0.09 0.07 240);
    --sidebar-foreground: oklch(0.85 0.01 200);
    --sidebar-border: oklch(0.18 0.07 240);
    --sidebar-accent: oklch(0.15 0.08 240);
    --sidebar-accent-foreground: oklch(0.95 0.01 200);
    --sidebar-primary: oklch(0.7 0.15 200);
    --sidebar-primary-foreground: oklch(0.1 0.05 240);
  `,
  "midnight": `
    --background: oklch(0.07 0 0);
    --foreground: oklch(0.95 0.01 60);
    --card: oklch(0.1 0 0);
    --card-foreground: oklch(0.95 0.01 60);
    --primary: oklch(0.75 0.18 75);
    --primary-foreground: oklch(0.1 0 0);
    --muted: oklch(0.16 0 0);
    --muted-foreground: oklch(0.55 0.01 60);
    --border: oklch(0.2 0 0);
    --accent: oklch(0.75 0.18 75);
    --accent-foreground: oklch(0.1 0 0);
    --sidebar-background: oklch(0.06 0 0);
    --sidebar-foreground: oklch(0.85 0.01 60);
    --sidebar-border: oklch(0.16 0 0);
    --sidebar-accent: oklch(0.13 0 0);
    --sidebar-accent-foreground: oklch(0.95 0.01 60);
    --sidebar-primary: oklch(0.75 0.18 75);
    --sidebar-primary-foreground: oklch(0.1 0 0);
  `,
};

function applyTheme(themeId: string) {
  const css = THEME_CSS[themeId];
  if (!css) return;
  let styleEl = document.getElementById("dynamic-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-theme";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `:root { ${css} } .dark { ${css} }`;
}

export default function SystemSettingsPage() {
  const { data: settings, refetch } = trpc.systemConfig.get.useQuery();
  const saveMutation = trpc.systemConfig.save.useMutation();
  const uploadLogoMutation = trpc.systemConfig.uploadLogo.useMutation();

  const [systemName, setSystemName] = useState<string>("");
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<{ base64: string; mimeType: string; filename: string } | null>(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // ─── Coordenadas padrão do mapa ──────────────────────────────────────────────
  const [mapDefaultLat, setMapDefaultLat] = useState("");
  const [mapDefaultLng, setMapDefaultLng] = useState("");
  const [mapDefaultZoom, setMapDefaultZoom] = useState("13");
  const [geoLoadingMap, setGeoLoadingMap] = useState(false);

  // ─── Atualização Remota ──────────────────────────────────────────────────────
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [isDraggingUpdate, setIsDraggingUpdate] = useState(false);
  const [updateRunning, setUpdateRunning] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateDone, setUpdateDone] = useState(false);
  const [versionInfo, setVersionInfo] = useState<{ version: string; buildDate: string; description: string } | null>(null);
  const [updateHistory, setUpdateHistory] = useState<Array<{ version: string; appliedAt: string; description: string }>>([]);
  const updateFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/system/version")
      .then((r) => r.json())
      .then((d) => {
        setVersionInfo(d.version);
        setUpdateHistory(d.history ?? []);
      })
      .catch(() => {});
  }, [updateDone]);

  const handleUpdateFile = (file: File) => {
    if (!file.name.endsWith(".zip")) { toast.error("Selecione um arquivo .zip"); return; }
    setUpdateFile(file);
    setUpdateError(null);
    setUpdateDone(false);
    setUpdateLog([]);
    setUpdateProgress(0);
  };

  const startUpdate = async () => {
    if (!updateFile) return;
    setUpdateRunning(true);
    setUpdateError(null);
    setUpdateLog([]);
    setUpdateProgress(0);

    const formData = new FormData();
    formData.append("update", updateFile);

    try {
      const res = await fetch("/api/system/update", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao iniciar atualização");

      // Acompanhar progresso via SSE
      const evtSource = new EventSource("/api/system/update-status");
      evtSource.onmessage = (e) => {
        const status = JSON.parse(e.data);
        setUpdateProgress(status.progress);
        setUpdateLog(status.log ?? []);
        if (!status.running) {
          evtSource.close();
          setUpdateRunning(false);
          if (status.error) {
            setUpdateError(status.error);
            toast.error("Erro na atualização: " + status.error);
          } else {
            setUpdateDone(true);
            setUpdateFile(null);
            toast.success("Sistema atualizado com sucesso!");
          }
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setUpdateRunning(false);
        setUpdateError("Conexão perdida com o servidor");
      };
    } catch (err: any) {
      setUpdateRunning(false);
      setUpdateError(err.message);
      toast.error(err.message);
    }
  };

  // ─── Telegram ────────────────────────────────────────────────────────────────
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const testTelegramMut = trpc.alerts.testTelegram.useMutation({
    onSuccess: () => toast.success("Mensagem de teste enviada com sucesso!"),
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });
  const saveTelegramMut = trpc.systemConfig.save.useMutation({
    onSuccess: () => toast.success("Configuração Telegram salva!"),
    onError: () => toast.error("Erro ao salvar configuração Telegram."),
  });

  // ─── Contas Tuya ─────────────────────────────────────────────────────────────
  const { data: tuyaAccounts = [], refetch: refetchAccounts } = trpc.tuyaAccounts.list.useQuery();
  const [tuyaOpen, setTuyaOpen] = useState(false);
  const [tuyaEditId, setTuyaEditId] = useState<number | null>(null);
  const [tuyaForm, setTuyaForm] = useState({ name: "", accessId: "", accessSecret: "", region: "us", notes: "" });
  const [testingAccountId, setTestingAccountId] = useState<number | null>(null);
  const createAccountMut = trpc.tuyaAccounts.create.useMutation({
    onSuccess: () => { refetchAccounts(); setTuyaOpen(false); toast.success("Conta Tuya criada!"); },
    onError: (e) => toast.error(e.message),
  });
  const updateAccountMut = trpc.tuyaAccounts.update.useMutation({
    onSuccess: () => { refetchAccounts(); setTuyaOpen(false); toast.success("Conta Tuya atualizada!"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteAccountMut = trpc.tuyaAccounts.delete.useMutation({
    onSuccess: () => { refetchAccounts(); toast.success("Conta removida!"); },
    onError: (e) => toast.error(e.message),
  });
  const testAccountMut = trpc.tuyaAccounts.testConnection.useMutation({
    onSuccess: () => { setTestingAccountId(null); toast.success("Conexão Tuya OK! Credenciais válidas."); },
    onError: (e) => { setTestingAccountId(null); toast.error(`Falha: ${e.message}`); },
  });
  function openCreateAccount() { setTuyaEditId(null); setTuyaForm({ name: "", accessId: "", accessSecret: "", region: "us", notes: "" }); setTuyaOpen(true); }
  function openEditAccount(a: typeof tuyaAccounts[0]) { setTuyaEditId(a.id); setTuyaForm({ name: a.name, accessId: a.accessId, accessSecret: a.accessSecret, region: a.region, notes: a.notes ?? "" }); setTuyaOpen(true); }
  function saveAccount() {
    if (!tuyaForm.name || !tuyaForm.accessId || !tuyaForm.accessSecret) { toast.error("Preencha nome, Access ID e Secret"); return; }
    if (tuyaEditId) updateAccountMut.mutate({ id: tuyaEditId, ...tuyaForm, region: tuyaForm.region as any });
    else createAccountMut.mutate({ ...tuyaForm, region: tuyaForm.region as any });
  }

  // Sync state with loaded settings
  const [initialized, setInitialized] = useState(false);
  if (settings && !initialized) {
    setSystemName(settings.systemName ?? "FiberDoc");
    setSelectedTheme(settings.theme ?? "dark-blue");
    setAlertThreshold(parseInt((settings as any).capacityAlertThreshold ?? "80", 10) || 80);
    setTelegramToken((settings as any).telegram_bot_token ?? "");
    setTelegramChatId((settings as any).telegram_chat_id ?? "");
    setMapDefaultLat((settings as any).mapDefaultLat ?? "");
    setMapDefaultLng((settings as any).mapDefaultLng ?? "");
    setMapDefaultZoom((settings as any).mapDefaultZoom ?? "13");
    setInitialized(true);
  }

  const handleLogoFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setLogoPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      setLogoFile({ base64, mimeType: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleLogoFile(file);
  };

  const handleSave = async () => {
    try {
      let logoUrl = settings?.logoUrl;
      if (logoFile) {
        const res = await uploadLogoMutation.mutateAsync(logoFile);
        logoUrl = res.url;
      }
      const mapLat = parseFloat(mapDefaultLat);
      const mapLng = parseFloat(mapDefaultLng);
      const mapZoom = parseInt(mapDefaultZoom);
      await saveMutation.mutateAsync({
        systemName,
        theme: selectedTheme,
        capacityAlertThreshold: alertThreshold,
        ...(logoUrl ? { logoUrl } : {}),
        ...(!isNaN(mapLat) ? { mapDefaultLat: mapLat } : {}),
        ...(!isNaN(mapLng) ? { mapDefaultLng: mapLng } : {}),
        ...(!isNaN(mapZoom) ? { mapDefaultZoom: mapZoom } : {}),
      });
      applyTheme(selectedTheme);
      await refetch();
      setLogoFile(null);
      toast.success("Configurações salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configurações.");
    }
  };

  const currentLogo = logoPreview ?? settings?.logoUrl ?? null;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configurações do Sistema</h1>
            <p className="text-sm text-muted-foreground">Personalize nome, logomarca e aparência do sistema</p>
          </div>
        </div>

        {/* Nome do Sistema */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Identidade do Sistema</CardTitle>
            <CardDescription>Nome exibido no menu lateral e na aba do navegador</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="systemName">Nome do Sistema</Label>
              <Input
                id="systemName"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="FiberDoc"
                className="max-w-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Logomarca */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Logomarca</CardTitle>
            <CardDescription>Imagem exibida no topo do menu lateral (PNG, SVG ou JPG recomendado)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              {/* Preview */}
              <div className="flex-shrink-0">
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden">
                  {currentLogo ? (
                    <img src={currentLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Upload className="h-6 w-6 mx-auto mb-1" />
                      <span className="text-xs">Logo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload area */}
              <div className="flex-1">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                  onDragLeave={() => setIsDraggingLogo(false)}
                  onDrop={handleLogoDrop}
                  onClick={() => logoInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all text-center",
                    isDraggingLogo
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-muted/20"
                  )}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, SVG, JPG — recomendado 200×200px</p>
                  {logoFile && (
                    <p className="text-xs text-primary mt-2 font-medium">✓ {logoFile.filename} selecionado</p>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoFile(file);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Threshold de Alertas de Capacidade */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Alertas de Capacidade
            </CardTitle>
            <CardDescription>Percentual de ocupação de portas a partir do qual o equipamento aparece como alerta no Dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Threshold de Alerta</Label>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${
                    alertThreshold >= 95 ? "text-red-400 bg-red-400/10" :
                    alertThreshold >= 85 ? "text-orange-400 bg-orange-400/10" :
                    "text-amber-400 bg-amber-400/10"
                  }`}>{alertThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={99}
                  step={5}
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50%</span>
                  <span>75%</span>
                  <span>99%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Equipamentos com ≥ {alertThreshold}% de portas ocupadas serão exibidos no card de alertas do Dashboard.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seletor de Temas */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Tema Visual
            </CardTitle>
            <CardDescription>Escolha a aparência do sistema. A mudança é aplicada imediatamente.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {THEMES.map((theme) => {
                const Icon = theme.icon;
                const isSelected = selectedTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setSelectedTheme(theme.id);
                      applyTheme(theme.id);
                    }}
                    className={cn(
                      "relative rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.02]",
                      isSelected
                        ? "border-primary shadow-lg shadow-primary/20"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    {/* Color preview */}
                    <div
                      className="w-full h-10 rounded-lg mb-3 flex items-center justify-center gap-1 overflow-hidden"
                      style={{ backgroundColor: theme.preview.bg }}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                      <div className="w-8 h-2 rounded-full opacity-60" style={{ backgroundColor: theme.preview.card }} />
                      <div className="w-4 h-2 rounded-full opacity-40" style={{ backgroundColor: theme.preview.accent }} />
                    </div>

                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium text-foreground">{theme.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-tight">{theme.description}</p>

                    {isSelected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ─── Atualização Remota ─── */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PackageOpen className="h-4 w-4" />
              Atualização do Sistema
            </CardTitle>
            <CardDescription>
              Envie um pacote .zip com os arquivos atualizados para aplicar uma nova versão sem acesso SSH
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Versão atual */}
            {versionInfo && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <PackageOpen className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Versão atual: <span className="text-primary font-mono">{versionInfo.version}</span></p>
                  <p className="text-xs text-muted-foreground">{versionInfo.description} — build {versionInfo.buildDate}</p>
                </div>
              </div>
            )}

            {/* Upload area */}
            {!updateRunning && !updateDone && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingUpdate(true); }}
                onDragLeave={() => setIsDraggingUpdate(false)}
                onDrop={(e) => { e.preventDefault(); setIsDraggingUpdate(false); const f = e.dataTransfer.files[0]; if (f) handleUpdateFile(f); }}
                onClick={() => updateFileRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all text-center",
                  isDraggingUpdate ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/20"
                )}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Arraste ou clique para selecionar o pacote</p>
                <p className="text-xs text-muted-foreground mt-1">Apenas arquivos .zip gerados pelo FiberDoc</p>
                {updateFile && (
                  <p className="text-xs text-primary mt-2 font-medium">✓ {updateFile.name} ({(updateFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                )}
              </div>
            )}
            <input ref={updateFileRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpdateFile(f); }} />

            {/* Botão iniciar */}
            {updateFile && !updateRunning && !updateDone && (
              <Button onClick={startUpdate} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Aplicar Atualização
              </Button>
            )}

            {/* Progresso */}
            {updateRunning && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Aplicando atualização...
                  </span>
                  <span className="font-mono text-primary">{updateProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${updateProgress}%` }} />
                </div>
                {updateLog.length > 0 && (
                  <div className="bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-0.5">
                    {updateLog.map((line, i) => <div key={i} className="text-muted-foreground">{line}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Sucesso */}
            {updateDone && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">Atualização aplicada com sucesso!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Em ambientes de produção o serviço será reiniciado automaticamente.</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setUpdateDone(false); setUpdateLog([]); }}>
                  Nova atualização
                </Button>
              </div>
            )}

            {/* Erro */}
            {updateError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400">Falha na atualização</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{updateError}</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setUpdateError(null); setUpdateFile(null); }}>
                  Tentar novamente
                </Button>
              </div>
            )}

            {/* Histórico */}
            {updateHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Histórico de Atualizações
                </p>
                <div className="space-y-1.5">
                  {updateHistory.slice(0, 5).map((h, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/30">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs font-mono text-foreground">v{h.version}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-48">{h.description}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(h.appliedAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Telegram */}
        <Card className="border-border/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-400" />
              Notificações via Telegram
            </CardTitle>
            <CardDescription>
              Configure um bot do Telegram para receber alertas SNMP. Crie um bot em <a href="https://t.me/BotFather" target="_blank" rel="noopener" className="text-primary underline">@BotFather</a> e obtenha o token. Para o Chat ID, envie uma mensagem ao bot e acesse <code className="font-mono text-xs">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telegramToken">Bot Token</Label>
                <Input
                  id="telegramToken"
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="123456789:AABBcc..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Obtido em @BotFather ao criar o bot</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegramChatId">Chat ID</Label>
                <Input
                  id="telegramChatId"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="-100123456789 ou 123456789"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">ID do chat ou grupo que receberá os alertas</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                disabled={testTelegramMut.isPending || !telegramToken || !telegramChatId}
                onClick={() => testTelegramMut.mutate({ botToken: telegramToken, chatId: telegramChatId })}
              >
                <Bell className="h-3.5 w-3.5" />
                {testTelegramMut.isPending ? "Enviando..." : "Enviar mensagem de teste"}
              </Button>
              <Button
                size="sm"
                className="gap-2"
                disabled={saveTelegramMut.isPending}
                onClick={() => saveTelegramMut.mutate({
                  telegram_bot_token: telegramToken,
                  telegram_chat_id: telegramChatId,
                } as any)}
              >
                {saveTelegramMut.isPending ? "Salvando..." : "Salvar configuração Telegram"}
              </Button>
            </div>
            {(telegramToken || telegramChatId) && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Bell className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                <p className="text-xs text-blue-400">
                  Telegram configurado. Alertas SNMP serão enviados automaticamente quando os thresholds forem ultrapassados.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contas Tuya IoT */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> Contas Tuya IoT
                </CardTitle>
                <CardDescription>Gerencie múltiplas contas da plataforma Tuya para monitorar sensores de diferentes projetos</CardDescription>
              </div>
              <Button size="sm" onClick={openCreateAccount}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova Conta
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tuyaAccounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Cpu className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma conta Tuya cadastrada</p>
                <p className="text-xs mt-1">Adicione as credenciais da API Tuya para monitorar sensores IoT</p>
                <p className="text-xs mt-3 text-muted-foreground/70">
                  Obtenha as credenciais em <a href="https://iot.tuya.com" target="_blank" rel="noopener" className="text-primary underline">iot.tuya.com</a> → Cloud → Criar Projeto
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tuyaAccounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                    <Cpu className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.region.toUpperCase()} · ID: <span className="font-mono">{a.accessId.slice(0, 8)}…</span>
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm" variant="outline"
                        disabled={testingAccountId === a.id}
                        onClick={() => { setTestingAccountId(a.id); testAccountMut.mutate({ accessId: a.accessId, accessSecret: a.accessSecret, region: a.region as any }); }}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${testingAccountId === a.id ? "animate-spin" : ""}`} />
                        Testar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditAccount(a)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`Remover conta "${a.name}"?`)) deleteAccountMut.mutate({ id: a.id }); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de conta Tuya */}
        <Dialog open={tuyaOpen} onOpenChange={setTuyaOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{tuyaEditId ? "Editar Conta Tuya" : "Nova Conta Tuya"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nome da conta *</Label>
                <Input placeholder="Ex: Conta Principal, Cliente ABC" value={tuyaForm.name} onChange={(e) => setTuyaForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Access ID (Client ID) *</Label>
                <Input placeholder="Ex: p7xxxxxxxxxxxxxxxxxx" value={tuyaForm.accessId} onChange={(e) => setTuyaForm((p) => ({ ...p, accessId: e.target.value }))} className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Access Secret *</Label>
                <Input type="password" placeholder="Client Secret" value={tuyaForm.accessSecret} onChange={(e) => setTuyaForm((p) => ({ ...p, accessSecret: e.target.value }))} className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Região</Label>
                <Select value={tuyaForm.region} onValueChange={(v) => setTuyaForm((p) => ({ ...p, region: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">América (us)</SelectItem>
                    <SelectItem value="eu">Europa (eu)</SelectItem>
                    <SelectItem value="cn">China (cn)</SelectItem>
                    <SelectItem value="in">Índia (in)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea placeholder="Projeto, cliente, descrição..." value={tuyaForm.notes} onChange={(e) => setTuyaForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTuyaOpen(false)}>Cancelar</Button>
                <Button onClick={saveAccount} disabled={createAccountMut.isPending || updateAccountMut.isPending}>
                  {tuyaEditId ? "Salvar" : "Criar conta"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* Posição Padrão do Mapa */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-400" />
              Posição Padrão do Mapa
            </CardTitle>
            <CardDescription>Coordenadas que o mapa de infraestrutura usa ao abrir. Clique em "Usar Minha Localização" para capturar a posição atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Latitude</Label>
                <Input value={mapDefaultLat} onChange={e => setMapDefaultLat(e.target.value)} placeholder="Ex: -7.8144" className="font-mono text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Longitude</Label>
                <Input value={mapDefaultLng} onChange={e => setMapDefaultLng(e.target.value)} placeholder="Ex: -37.9248" className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Zoom padrão (1–20)</Label>
              <Input type="number" min={1} max={20} value={mapDefaultZoom} onChange={e => setMapDefaultZoom(e.target.value)} className="w-24 font-mono text-sm" />
            </div>
            <Button
              type="button" variant="outline"
              className="w-full gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              disabled={geoLoadingMap}
              onClick={() => {
                if (!navigator.geolocation) { toast.error("GPS não disponível neste dispositivo."); return; }
                setGeoLoadingMap(true);
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setMapDefaultLat(pos.coords.latitude.toFixed(7));
                    setMapDefaultLng(pos.coords.longitude.toFixed(7));
                    setGeoLoadingMap(false);
                    toast.success("Localização capturada! Clique em Salvar para aplicar.");
                  },
                  (err) => {
                    setGeoLoadingMap(false);
                    if (err.code === 1) toast.error("Permissão de GPS negada.");
                    else toast.error("Não foi possível obter a localização.");
                  },
                  { enableHighAccuracy: true, timeout: 10000 }
                );
              }}
            >
              {geoLoadingMap ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              {geoLoadingMap ? "Obtendo localização..." : "Usar Minha Localização"}
            </Button>
          </CardContent>
        </Card>

        {/* Botão Salvar */}
        <div className="flex justify-end gap-3 pb-6">
          <Button
            variant="outline"
            onClick={() => {
              setInitialized(false);
              setLogoPreview(null);
              setLogoFile(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || uploadLogoMutation.isPending}
          >
            {saveMutation.isPending || uploadLogoMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
