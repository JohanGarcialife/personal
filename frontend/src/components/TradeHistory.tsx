'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { History, TrendingUp, TrendingDown, Clock, HelpCircle } from 'lucide-react';

interface TradeLog {
  id: string;
  created_at: string;
  symbol: string;
  side: string; // 'buy' (LONG) o 'sell' (SHORT)
  entry_price: number;
  amount: number;
  leverage: number;
  stop_loss: number;
  take_profit: number;
  status: string; // 'OPEN', 'CLOSED', 'CANCELLED'
  pnl: number | null;
  closed_at: string | null;
  exit_trigger: string | null; // 'SL_HIT', 'TP_HIT', 'MANUAL_CLOSE', 'AI_CLOSE'
}

export default function TradeHistory() {
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data, error } = await supabase
          .from('trade_logs')
          .select('*')
          .eq('status', 'CLOSED')
          .order('closed_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Error al obtener historial de trades:', error.message);
          return;
        }

        if (data) {
          setTrades(data);
        }
      } catch (err) {
        console.error('Excepción al cargar historial de trades:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();

    // Polling fallback cada 15 segundos en caso de que Realtime de Supabase falle
    const interval = setInterval(() => {
      fetchHistory();
    }, 15000);

    // Suscripción en tiempo real para trade_logs
    const channel = supabase
      .channel('realtime_trade_history')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_logs' },
        (payload: any) => {
          // Si es un trade cerrado, refrescar o insertar
          if (payload.new && payload.new.status === 'CLOSED') {
            setTrades((prevTrades) => {
              // Filtrar duplicados por si acaso
              const filtered = prevTrades.filter((t) => t.id !== payload.new.id);
              const updated = [payload.new as TradeLog, ...filtered];
              return updated.slice(0, 10);
            });
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const getExitTriggerBadge = (trigger: string | null) => {
    if (!trigger) return <span className="text-slate-500 font-mono text-[10px]">-</span>;
    switch (trigger) {
      case 'TP_HIT':
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            TAKE PROFIT (TP)
          </span>
        );
      case 'SL_HIT':
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            STOP LOSS (SL)
          </span>
        );
      case 'MANUAL_CLOSE':
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            MANUAL
          </span>
        );
      case 'AI_CLOSE':
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            IA CLOSE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            {trigger}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#111827] rounded-xl border border-border-color p-5 text-slate-400 font-mono text-xs flex items-center justify-center py-20">
        <span>Cargando historial de operaciones...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-xl border border-border-color p-5 shadow-md flex-1">
      <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
        <History size={18} className="text-yellow-500" />
        <span>Historial de Operaciones Cerradas (Últimas 10)</span>
      </h2>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
          <Clock size={32} className="text-slate-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-400">Sin operaciones cerradas aún</p>
            <p className="text-xs text-slate-500 mt-1">
              Las operaciones completadas por el bot aparecerán en esta sección.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                <th className="py-3 px-2">Fecha Cierre</th>
                <th className="py-3 px-2">Símbolo</th>
                <th className="py-3 px-2">Lado</th>
                <th className="py-3 px-2 text-right">Apalanc.</th>
                <th className="py-3 px-2 text-right">Tamaño</th>
                <th className="py-3 px-2 text-right">Entrada</th>
                <th className="py-3 px-2 text-right">SL / TP</th>
                <th className="py-3 px-2 text-center">Gatillo Salida</th>
                <th className="py-3 px-2 text-right font-mono">PnL Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {trades.map((trade) => {
                const isLong = (trade.side || '').toLowerCase() === 'buy' || (trade.side || '').toLowerCase() === 'long';
                const pnl = Number(trade.pnl || 0);
                const entryPrice = Number(trade.entry_price || 0);
                const amount = Number(trade.amount || 0);
                const leverage = Number(trade.leverage || 1);
                const entryVal = entryPrice * amount;
                const margin = leverage > 0 ? entryVal / leverage : entryVal;
                const roe = margin > 0 ? (pnl / margin) * 100 : 0;
                
                return (
                  <tr key={trade.id} className="text-xs text-slate-300 hover:bg-slate-900/30 transition">
                    <td className="py-3 px-2 font-mono text-[11px] text-slate-400">
                      {trade.closed_at ? new Date(trade.closed_at).toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-2 font-bold text-slate-200 font-mono">
                      {trade.symbol ? trade.symbol.split(':')[0] : '-'}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          isLong
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-mono">{leverage}x</td>
                    <td className="py-3 px-2 text-right font-mono">{amount.toFixed(3)}</td>
                    <td className="py-3 px-2 text-right font-mono">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-2 text-right font-mono text-slate-400">
                      <div className="text-[11px]">
                        {trade.stop_loss ? `$${Number(trade.stop_loss).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'} (SL)
                      </div>
                      <div className="text-[11px] text-emerald-500/90">
                        {trade.take_profit ? `$${Number(trade.take_profit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'} (TP)
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      {getExitTriggerBadge(trade.exit_trigger)}
                    </td>
                    <td className={`py-3 px-2 text-right font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {pnl >= 0 ? '+' : ''}
                      {pnl.toFixed(2)} USDT
                      <span className="text-[10px] font-normal block text-slate-500 font-mono">
                        ({roe >= 0 ? '+' : ''}
                        {roe.toFixed(2)}% ROE)
                      </span>
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
