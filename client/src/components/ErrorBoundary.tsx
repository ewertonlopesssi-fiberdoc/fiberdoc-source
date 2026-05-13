import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
  autoRecovering: boolean;
}

// Erros do Leaflet que podem ser recuperados automaticamente
const LEAFLET_RECOVERABLE_ERRORS = [
  "removeChild",
  "NotFoundError",
  "The node to be removed is not a child",
  "O nó a ser removido não é filho",
];

function isLeafletError(error: Error): boolean {
  const msg = (error?.message ?? "") + (error?.stack ?? "");
  return LEAFLET_RECOVERABLE_ERRORS.some(e => msg.includes(e));
}

class ErrorBoundary extends Component<Props, State> {
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, autoRecovering: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Para erros do Leaflet, marcar para auto-recovery
    if (isLeafletError(error)) {
      return { hasError: true, error, autoRecovering: true };
    }
    return { hasError: true, error, autoRecovering: false };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary] Erro capturado:", error, info);
    // Auto-recovery para erros do Leaflet: recarregar após 1s
    if (isLeafletError(error)) {
      console.warn("[ErrorBoundary] Erro do Leaflet detectado, recarregando automaticamente...");
      this.recoveryTimer = setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.autoRecovering) {
        // Tela de recuperação automática para erros do Leaflet
        return (
          <div className="flex items-center justify-center min-h-screen p-8 bg-background">
            <div className="flex flex-col items-center w-full max-w-2xl p-8">
              <div className="animate-spin mb-6">
                <RotateCcw size={48} className="text-primary" />
              </div>
              <h2 className="text-xl mb-2">Recuperando o mapa...</h2>
              <p className="text-muted-foreground text-sm">Um erro temporário foi detectado. A página será recarregada automaticamente.</p>
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />
            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
