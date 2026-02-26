import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Zap, QrCode } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const STATUS_LABEL: Record<string, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  faulty: "Com Falha",
};

const STATUS_COLOR: Record<string, string> = {
  free: "bg-green-100 text-green-800 border-green-200",
  occupied: "bg-blue-100 text-blue-800 border-blue-200",
  reserved: "bg-yellow-100 text-yellow-800 border-yellow-200",
  faulty: "bg-red-100 text-red-800 border-red-200",
};

const POWER_TYPE_LABEL: Record<string, string> = {
  ac: "CA (Corrente Alternada)",
  dc: "CC (Corrente Contínua)",
};

const POWER_SOURCE_LABEL: Record<string, string> = {
  rectifier: "Retificadora",
  inverter: "Inversora",
  ups: "No-Break (UPS)",
  grid: "Rede Elétrica",
  other: "Outra",
};

function OccupancyBar({ rate }: { rate: number }) {
  const color =
    rate >= 95 ? "bg-red-500" :
    rate >= 80 ? "bg-orange-500" :
    rate >= 70 ? "bg-yellow-500" :
    "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-medium w-10 text-right">{rate}%</span>
    </div>
  );
}

export default function RoomReport() {
  const { id } = useParams<{ id: string }>();
  const roomId = parseInt(id ?? "0", 10);
  const [expandedEquipments, setExpandedEquipments] = useState<Set<number>>(new Set());
  const [qrEquipment, setQrEquipment] = useState<{ id: number; name: string } | null>(null);

  const { data: report, isLoading } = trpc.reports.byRoom.useQuery(
    { roomId },
    { enabled: !!roomId }
  );

  const toggleEquipment = (id: number) => {
    setExpandedEquipments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (report) setExpandedEquipments(new Set(report.equipments.map(e => e.id)));
  };

  const handlePrint = () => {
    expandAll();
    setTimeout(() => window.print(), 300);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-2">Sala não encontrada</p>
          <p className="text-gray-400">Verifique o QR Code e tente novamente.</p>
        </div>
      </div>
    );
  }

  const generatedAt = new Date(report.generatedAt);

  return (
    <>
      {/* Estilos de impressão */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          body { font-size: 11px; }
          .print-table th, .print-table td { padding: 4px 6px !important; font-size: 10px; }
          .page-header { border-bottom: 2px solid #1e40af; margin-bottom: 16px; padding-bottom: 8px; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 print:bg-white">
        {/* Cabeçalho */}
        <div className="bg-blue-900 text-white print:bg-white print:text-black page-header">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-200 print:text-gray-500 text-sm font-medium uppercase tracking-wide mb-1">
                  FiberDoc — Relatório de Ocupação
                </p>
                <h1 className="text-3xl font-bold">{report.roomName}</h1>
                {report.roomLocation && (
                  <p className="text-blue-200 print:text-gray-600 mt-1">{report.roomLocation}</p>
                )}
                <p className="text-blue-300 print:text-gray-400 text-sm mt-2">
                  Gerado em: {generatedAt.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="no-print flex gap-2">
                <Button variant="outline" size="sm" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={expandAll}>
                  Expandir Todos
                </Button>
                <Button size="sm" className="bg-white text-blue-900 hover:bg-blue-50" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir / PDF
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* Resumo geral */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Equipamentos", value: report.totalEquipments, color: "text-blue-700" },
              { label: "Total de Portas", value: report.totalPorts, color: "text-gray-700" },
              { label: "Portas Livres", value: report.freePorts, color: "text-green-700" },
              { label: "Portas Ocupadas", value: report.occupiedPorts, color: "text-blue-700" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <p className={`text-3xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Barra de ocupação global */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Ocupação Global da Sala</span>
                <span className={`text-sm font-bold ${
                  report.occupancyRate >= 95 ? "text-red-600" :
                  report.occupancyRate >= 80 ? "text-orange-600" :
                  "text-green-600"
                }`}>{report.occupancyRate}%</span>
              </div>
              <OccupancyBar rate={report.occupancyRate} />
            </CardContent>
          </Card>

          {/* Lista de equipamentos */}
          <div className="space-y-4">
            {report.equipments.map((equip) => {
              const isExpanded = expandedEquipments.has(equip.id);
              return (
                <Card key={equip.id} className="overflow-hidden">
                  <CardHeader
                    className="pb-3 cursor-pointer hover:bg-gray-50 print:cursor-default"
                    onClick={() => toggleEquipment(equip.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base">{equip.name}</CardTitle>
                          <Badge variant="outline" className="text-xs">{equip.type}</Badge>
                          {equip.rack && (
                            <Badge variant="outline" className="text-xs bg-gray-50">
                              Rack: {equip.rack}{equip.rackPosition ? ` — U${equip.rackPosition}` : ""}
                            </Badge>
                          )}
                        </div>
                        {(equip.manufacturer || equip.model) && (
                          <p className="text-xs text-gray-500 mt-1">
                            {[equip.manufacturer, equip.model].filter(Boolean).join(" — ")}
                          </p>
                        )}

                        {/* Dados de energia */}
                        {(equip.powerType || equip.powerSource) && (
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {equip.powerType && (
                              <span className="flex items-center gap-1 text-xs text-gray-600">
                                <Zap className="h-3 w-3 text-yellow-500" />
                                {POWER_TYPE_LABEL[equip.powerType] ?? equip.powerType}
                              </span>
                            )}
                            {equip.powerSource && (
                              <span className="flex items-center gap-1 text-xs text-gray-600">
                                <Zap className="h-3 w-3 text-orange-500" />
                                {POWER_SOURCE_LABEL[equip.powerSource] ?? equip.powerSource}
                                {equip.powerSourceLabel ? `: ${equip.powerSourceLabel}` : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-right shrink-0 min-w-[140px]">
                        <OccupancyBar rate={equip.occupancyRate} />
                        <p className="text-xs text-gray-500 mt-1">
                          {equip.occupiedPorts}/{equip.totalPorts} portas
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-2 no-print">
                          <button
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                            title="QR Code deste equipamento"
                            onClick={(e) => { e.stopPropagation(); setQrEquipment({ id: equip.id, name: equip.name }); }}
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            <span>QR</span>
                          </button>
                          <span className="text-xs text-blue-600">
                            {isExpanded ? "▲ Recolher" : "▼ Ver portas"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Tabela de portas */}
                  {(isExpanded || false) && (
                    <CardContent className="pt-0">
                      <div className="overflow-x-auto">
                        <table className="print-table w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
                              <th className="text-left px-3 py-2 border border-gray-200">Porta</th>
                              <th className="text-left px-3 py-2 border border-gray-200">Etiqueta</th>
                              <th className="text-left px-3 py-2 border border-gray-200">Tipo</th>
                              <th className="text-left px-3 py-2 border border-gray-200">Velocidade</th>
                              <th className="text-left px-3 py-2 border border-gray-200">Status</th>
                              <th className="text-left px-3 py-2 border border-gray-200">Observações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {equip.ports.map((port, idx) => (
                              <tr key={port.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                <td className="px-3 py-2 border border-gray-200 font-mono font-medium">
                                  {port.portNumber}
                                </td>
                                <td className="px-3 py-2 border border-gray-200 text-gray-600">
                                  {port.label ?? "—"}
                                </td>
                                <td className="px-3 py-2 border border-gray-200 uppercase text-xs">
                                  {port.type}
                                </td>
                                <td className="px-3 py-2 border border-gray-200 text-xs">
                                  {port.speed ?? "—"}
                                </td>
                                <td className="px-3 py-2 border border-gray-200">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLOR[port.status] ?? "bg-gray-100 text-gray-700"}`}>
                                    {STATUS_LABEL[port.status] ?? port.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 border border-gray-200 text-xs text-gray-500">
                                  {port.notes ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

           {/* Rodapé */}
          <div className="text-center text-xs text-gray-400 py-4 border-t">
            FiberDoc — Sistema de Documentação de Fibras e Equipamentos •{" "}
            {generatedAt.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>

      {/* Dialog QR Code do Equipamento */}
      <Dialog open={qrEquipment !== null} onOpenChange={() => setQrEquipment(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              QR Code — {qrEquipment?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrEquipment && (
              <>
                <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <QRCodeSVG
                    value={`${window.location.origin}/mobile?eq=${qrEquipment.id}`}
                    size={200}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Escaneie para abrir este equipamento diretamente no app mobile
                </p>
                <p className="text-xs font-mono text-gray-400 break-all text-center">
                  {window.location.origin}/mobile?eq={qrEquipment.id}
                </p>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const win = window.open("", "_blank");
                      if (!win) return;
                      win.document.write(`
                        <html><head><title>QR Code — ${qrEquipment.name}</title>
                        <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;gap:12px;}
                        h2{font-size:16px;margin:0;} p{font-size:11px;color:#666;margin:0;} @media print{button{display:none}}</style>
                        </head><body>
                        <h2>${qrEquipment.name}</h2>
                        <div id="qr"></div>
                        <p>${window.location.origin}/mobile?eq=${qrEquipment.id}</p>
                        <button onclick="window.print()">Imprimir</button>
                        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
                        <script>QRCode.toCanvas(document.createElement('canvas'),'${window.location.origin}/mobile?eq=${qrEquipment.id}',{width:200},function(err,canvas){if(!err)document.getElementById('qr').appendChild(canvas);});<\/script>
                        </body></html>
                      `);
                      win.document.close();
                    }}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => window.open(`${window.location.origin}/mobile?eq=${qrEquipment.id}`, "_blank")}
                  >
                    Abrir no Mobile
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
