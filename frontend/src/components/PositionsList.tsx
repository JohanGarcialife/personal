'use client';

import React, { useState } from 'react';
import { Play, TrendingUp, TrendingDown, XCircle, RefreshCw } from 'lucide-react';

interface Position {
  symbol: string;
  side: string; // 'long' o 'short'
  contracts: number;
  entryPrice: number;
  markPrice: number;
  initialMargin: number;
  unrealizedProfit: number;
  percentage?: number;
}

interface PositionsListProps {
  positions: Position[];
  onRefreshPositions: () => Promise<void>;
  isLoading: boolean;
}

export default function PositionsList({ positions, onRefreshPositions, isLoading }: PositionsListProps) {
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);

  // Cerrar posición de mercado manualmente
  const handleClosePosition = async (symbol: string) => {
    if (closingSymbol) return;
    setClosingSymbol(symbol);
    setCloseMessage(null);

    // CCXT normaliza símbolos con sufijos, nosotros queremos enviar el par limpio o tal cual
    // Ej: BTC/USDT:USDT -> Enviaremos el símbolo a cerrar
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/binance/close?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json();

      if (data.success) {
        setCloseMessage(`✓ Posición ${symbol} cerrada con éxito.`);
        await onRefreshPositions();
      } else {
        setCloseMessage(`✗ Error al cerrar: ${data.error}`);
      }
    } catch (err) {
      setCloseMessage('✗ Error de comunicación con el servidor.');
    } finally {
      setClosingSymbol(null);
      setTimeout(() => setCloseMessage(null), 5000);
    }
  };

  return (
    <div className="bg-[#111827] rounded-xl border border-border-color p-5 flex-1 shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <TrendingUp size={18} className="text-yellow-500" />
          <span>Posiciones Activas ({positions.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {closeMessage && (
            <span className="text-[10px] text-slate-400 font-mono">{closeMessage}</span>
          )}
          <button
            onClick={onRefreshPositions}
            disabled={isLoading || !!closingSymbol}
            className="text-slate-400 hover:text-slate-200 transition p-1.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading && positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 font-mono text-sm">
          <RefreshCw size={24} className="animate-spin text-yellow-500" />
          <span>Consultando posiciones en Binance...</span>
        </div>
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
          <XCircle size={32} className="text-slate-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-400">Sin posiciones abiertas</p>
            <p className="text-xs text-slate-500 mt-1">El bot abrirá posiciones automáticamente según la señal de Gemini.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                <th className="py-3 px-2">Símbolo</th>
                <th className="py-3 px-2">Tipo</th>
                <th className="py-3 px-2 text-right">Tamaño</th>
                <th className="py-3 px-2 text-right">Entrada</th>
                <th className="py-3 px-2 text-right">Precio Marca</th>
                <th className="py-3 px-2 text-right">Margen</th>
                <th className="py-3 px-2 text-right font-mono">PnL (ROE %)</th>
                <th className="py-3 px-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {positions.map((pos) => {
                const isLong = (pos.side || '').toLowerCase() === 'long' || parseFloat((pos as any).info?.positionAmt || '0') > 0;
                const normalizedSide = isLong ? 'LONG' : 'SHORT';
                const pnl = pos.unrealizedProfit ?? 0;
                const margin = pos.initialMargin || parseFloat((pos as any).info?.initialMargin || '0') || 0;
                const roe = margin > 0 ? (pnl / margin) * 100 : 0;
                const contracts = pos.contracts || Math.abs(parseFloat((pos as any).info?.positionAmt || '0')) || 0;
                const entryPrice = pos.entryPrice || 0;
                const markPrice = pos.markPrice || 0;
                
                return (
                  <tr key={pos.symbol} className="text-xs text-slate-300 hover:bg-slate-900/30 transition">
                    <td className="py-3.5 px-2 font-bold text-slate-200 font-mono">
                      {pos.symbol ? pos.symbol.split(':')[0] : '-'}
                    </td>
                    <td className="py-3.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isLong
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {normalizedSide}
                      </span>
                    </td>
                    <td className="py-3.5 px-2 text-right font-mono">{contracts.toFixed(3)}</td>
                    <td className="py-3.5 px-2 text-right font-mono">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-slate-400">${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-slate-400">${margin.toFixed(2)}</td>
                    <td className={`py-3.5 px-2 text-right font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pnl >= 0 ? '+' : ''}
                      {pnl.toFixed(2)} USDT ({roe >= 0 ? '+' : ''}
                      {roe.toFixed(2)}%)
                    </td>
                    <td className="py-3.5 px-2 text-center">
                      <button
                        onClick={() => handleClosePosition(pos.symbol)}
                        disabled={!!closingSymbol}
                        className="bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 px-3 py-1 rounded border border-rose-500/20 hover:border-transparent text-[10px] font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {closingSymbol === pos.symbol ? 'Cerrando...' : 'Cerrar Mercado'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
