import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown, Check, Radio, Box, Cable, Milestone, Codesandbox, MapPin, Layers, Signal, X } from "lucide-react";

// ─── Sub-componente: Menu de Adicionar Elemento ─────────────────────────────
// Extraído da IIFE para evitar o Erro React #185 (Too many re-renders)
// causado pelo Radix UI DropdownMenu dentro de uma IIFE que recriava o componente a cada render
interface AddElementDropdownProps {
  addingMode: "ceo" | "cto" | null;
  addingRouteMode: boolean;
  addingOltMode: boolean;
  addingDgoMode: boolean;
  addingPoleMode: boolean;
  addingReserveMode: boolean;
  addingPoiMode: boolean;
  setAddingMode: React.Dispatch<React.SetStateAction<"ceo" | "cto" | null>>;
  setAddingRouteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAddingOltMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAddingDgoMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAddingPoleMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAddingReserveMode: React.Dispatch<React.SetStateAction<boolean>>;
  setAddingPoiMode: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteFrom: React.Dispatch<React.SetStateAction<any>>;
}
export default function AddElementDropdown({
  addingMode, addingRouteMode, addingOltMode, addingDgoMode, addingPoleMode, addingReserveMode, addingPoiMode,
  setAddingMode, setAddingRouteMode, setAddingOltMode, setAddingDgoMode, setAddingPoleMode, setAddingReserveMode, setAddingPoiMode, setRouteFrom
}: AddElementDropdownProps) {
  const anyAddingActive = addingMode !== null || addingRouteMode || addingOltMode || addingDgoMode || addingPoleMode || addingReserveMode || addingPoiMode;
  const activeLabel = addingMode === "ceo" ? "CEO" : addingMode === "cto" ? "CTO" : addingRouteMode ? "Cabo" : addingOltMode ? "OLT" : addingDgoMode ? "DGO" : addingPoleMode ? "Poste" : addingReserveMode ? "Reserva" : addingPoiMode ? "POI" : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={anyAddingActive ? "default" : "outline"}
          className={`h-7 gap-1 text-xs font-medium ${
            anyAddingActive
              ? "bg-emerald-600 hover:bg-emerald-700 border-emerald-500 text-white"
              : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
          }`}
          title="Adicionar elemento ao mapa"
        >
          <Plus className="w-3 h-3" />
          {anyAddingActive ? `Adicionando: ${activeLabel}` : "Adicionar"}
          {!anyAddingActive && <ChevronDown className="w-3 h-3 ml-0.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground py-1">Selecione o tipo de elemento</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingMode === "ceo" ? "bg-primary/10 text-primary font-medium" : "" }`}
            onClick={() => { setAddingMode(v => v === "ceo" ? null : "ceo"); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Radio className="w-3.5 h-3.5 text-blue-400" />
            <span className="flex-1">CEO</span>
            <span className="text-[10px] text-muted-foreground">Caixa de Emenda</span>
            {addingMode === "ceo" && <Check className="w-3 h-3 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingMode === "cto" ? "bg-primary/10 text-primary font-medium" : "" }`}
            onClick={() => { setAddingMode(v => v === "cto" ? null : "cto"); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Box className="w-3.5 h-3.5 text-green-400" />
            <span className="flex-1">CTO</span>
            <span className="text-[10px] text-muted-foreground">Caixa Terminal</span>
            {addingMode === "cto" && <Check className="w-3 h-3 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingOltMode ? "bg-amber-500/10 text-amber-400 font-medium" : "" }`}
            onClick={() => { setAddingOltMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Signal className="w-3.5 h-3.5 text-amber-400" />
            <span className="flex-1">OLT</span>
            <span className="text-[10px] text-muted-foreground">Equipamento OLT</span>
            {addingOltMode && <Check className="w-3 h-3 text-amber-400" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingDgoMode ? "bg-orange-500/10 text-orange-400 font-medium" : "" }`}
            onClick={() => { setAddingDgoMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <span className="flex-1">DGO</span>
            <span className="text-[10px] text-muted-foreground">Distribuidor Geral</span>
            {addingDgoMode && <Check className="w-3 h-3 text-orange-400" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingPoleMode ? "bg-slate-500/10 text-slate-400 font-medium" : "" }`}
            onClick={() => { setAddingPoleMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Milestone className="w-3.5 h-3.5 text-slate-400" />
            <span className="flex-1">Poste</span>
            <span className="text-[10px] text-muted-foreground">Poste de rede</span>
            {addingPoleMode && <Check className="w-3 h-3 text-slate-400" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingReserveMode ? "bg-cyan-500/10 text-cyan-400 font-medium" : "" }`}
            onClick={() => { setAddingReserveMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingPoiMode(false); }}
          >
            <Codesandbox className="w-3.5 h-3.5 text-cyan-400" />
            <span className="flex-1">Reserva Técnica</span>
            <span className="text-[10px] text-muted-foreground">Ponto de reserva</span>
            {addingReserveMode && <Check className="w-3 h-3 text-cyan-400" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingPoiMode ? "bg-indigo-500/10 text-indigo-400 font-medium" : "" }`}
            onClick={() => { setAddingPoiMode(v => !v); setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); }}
          >
            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
            <span className="flex-1">POI</span>
            <span className="text-[10px] text-muted-foreground">Ponto de Interesse</span>
            {addingPoiMode && <Check className="w-3 h-3 text-indigo-400" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className={`text-xs gap-2 cursor-pointer ${ addingRouteMode ? "bg-cyan-500/10 text-cyan-400 font-medium" : "" }`}
            onClick={() => { setAddingRouteMode(v => !v); setRouteFrom(null); setAddingMode(null); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
          >
            <Cable className="w-3.5 h-3.5 text-cyan-400" />
            <span className="flex-1">Cabo / Rota</span>
            <span className="text-[10px] text-muted-foreground">Traçar cabo no mapa</span>
            {addingRouteMode && <Check className="w-3 h-3 text-cyan-400" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {anyAddingActive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs gap-2 cursor-pointer text-red-400 hover:text-red-300"
              onClick={() => { setAddingMode(null); setAddingRouteMode(false); setAddingOltMode(false); setAddingDgoMode(false); setAddingPoleMode(false); setAddingReserveMode(false); setAddingPoiMode(false); }}
            >
              <X className="w-3.5 h-3.5" />
              Cancelar modo de adição
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

