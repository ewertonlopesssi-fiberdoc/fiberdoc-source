import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Download, Printer } from "lucide-react";

type Props = {
  equipmentId: number;
  equipmentName: string;
  equipmentType?: string;
  roomName?: string | null;
  /** Se true, renderiza apenas o botão de ícone pequeno (para tabelas/listas) */
  compact?: boolean;
};

export default function EquipmentQRCode({
  equipmentId,
  equipmentName,
  equipmentType,
  roomName,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);

  // URL deep-link para o app mobile — abre diretamente o equipamento
  const deepLink = `${window.location.origin}/mobile?eq=${equipmentId}`;

  function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const svgEl = document.getElementById(`qr-print-${equipmentId}`);
    if (!svgEl) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code — ${equipmentName}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: white; }
            .card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 24px; text-align: center; max-width: 320px; }
            h2 { font-size: 16px; font-weight: 700; margin: 12px 0 4px; color: #111; }
            p { font-size: 12px; color: #6b7280; margin: 2px 0; }
            .url { font-size: 9px; color: #9ca3af; margin-top: 8px; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="card">
            ${svgEl.outerHTML}
            <h2>${equipmentName}</h2>
            ${equipmentType ? `<p>${equipmentType}</p>` : ""}
            ${roomName ? `<p>${roomName}</p>` : ""}
            <p class="url">${deepLink}</p>
          </div>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function handleDownload() {
    const svgEl = document.getElementById(`qr-print-${equipmentId}`);
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qrcode-${equipmentName.replace(/\s+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {compact ? (
        <button
          onClick={() => setOpen(true)}
          title="Gerar QR Code"
          className="p-1 text-zinc-400 hover:text-cyan-400 transition-colors"
        >
          <QrCode className="w-4 h-4" />
        </button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5"
        >
          <QrCode className="w-4 h-4" />
          QR Code
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-cyan-400" />
              QR Code do Equipamento
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {/* QR Code */}
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <QRCodeSVG
                id={`qr-print-${equipmentId}`}
                value={deepLink}
                size={200}
                bgColor="#ffffff"
                fgColor="#0a0f1e"
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Informações */}
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-white">{equipmentName}</p>
              {equipmentType && <p className="text-xs text-zinc-400">{equipmentType}</p>}
              {roomName && <p className="text-xs text-zinc-500">{roomName}</p>}
            </div>

            {/* URL */}
            <div className="w-full bg-zinc-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-zinc-500 font-mono break-all text-center">{deepLink}</p>
            </div>

            <p className="text-xs text-zinc-500 text-center">
              Escaneie com o app FiberDoc Mobile para abrir diretamente este equipamento.
            </p>

            {/* Ações */}
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="flex-1 gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar SVG
              </Button>
              <Button
                size="sm"
                onClick={handlePrint}
                className="flex-1 gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-900"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
