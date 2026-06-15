'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, ChevronDown, ChevronUp, Brain, Clock, BarChart2 } from 'lucide-react';

interface GeminiLog {
  id: string;
  created_at: string;
  symbol: string;
  decision: string;
  prompt_payload: {
    price: number;
    balance: number;
    indicators: {
      rsi: number;
      ema20: number;
      ema50: number;
      macd: { macd: number; signal: number; histogram: number };
    };
  };
  raw_response: {
    decision: string;
    leverage?: number;
    entryPriceTarget?: number;
    stopLoss?: number;
    takeProfit?: number;
    confidenceScore?: number;
    analysisReasoning?: string;
  };
  response_time_ms: number;
}

export default function GeminiLogs() {
  const [logs, setLogs] = useState<GeminiLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const { data, error } = await supabase
          .from('gemini_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Error al obtener logs de Gemini:', error.message);
          return;
        }

        if (data) {
          setLogs(data);
        }
      } catch (err) {
        console.error('Excepción al cargar logs de Gemini:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchLogs();

    // Suscripción en tiempo real a nuevas decisiones de Gemini
    const channel = supabase
      .channel('realtime_gemini_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gemini_logs' },
        (payload: any) => {
          if (payload.new) {
            setLogs((prevLogs) => {
              const updated = [payload.new as GeminiLog, ...prevLogs];
              return updated.slice(0, 10); // Mantener solo los últimos 10
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'OPEN_LONG':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
            OPEN LONG
          </span>
        );
      case 'OPEN_SHORT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm">
            OPEN SHORT
          </span>
        );
      case 'CLOSE_POSITION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm">
            CLOSE POSITION
          </span>
        );
      case 'HOLD':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            HOLD / ESPERA
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#111827] rounded-xl border border-border-color p-5 text-slate-400 font-mono text-xs flex items-center justify-center py-20">
        <span>Cargando análisis de IA...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-xl border border-border-color p-5 shadow-md flex-1">
      <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
        <Brain size={18} className="text-yellow-500" />
        <span>Decision & Analysis Feed (Gemini AI Brain)</span>
      </h2>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
          <Terminal size={32} className="text-slate-600" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-400">Sin decisiones registradas</p>
            <p className="text-xs text-slate-500 mt-1">
              Las decisiones de la IA aparecerán aquí conforme el bot ejecute sus ciclos periódicos.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const indicators = log.prompt_payload?.indicators;
            const reasoning = log.raw_response?.analysisReasoning;
            const confidence = log.raw_response?.confidenceScore;
            
            return (
              <div
                key={log.id}
                className={`border rounded-lg transition duration-200 ${
                  isExpanded
                    ? 'border-yellow-500/30 bg-[#0d1321]/80'
                    : 'border-slate-800 bg-[#0d1321]/30 hover:border-slate-700/80 hover:bg-[#0d1321]/50'
                }`}
              >
                {/* Cabecera del log */}
                <div
                  onClick={() => toggleExpand(log.id)}
                  className="p-3.5 flex items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-slate-200 font-mono">
                      {log.symbol?.split(':')[0]}
                    </span>
                    {getDecisionBadge(log.decision)}
                    {confidence !== undefined && (
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        Conf: {(confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                      <Clock size={11} />
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                      {log.response_time_ms}ms
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </div>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-800/80 text-xs space-y-3.5">
                    {/* Indicadores técnicos */}
                    {indicators && (
                      <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/50">
                        <div className="flex items-center gap-1.5 mb-2 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <BarChart2 size={13} className="text-yellow-500/80" />
                          <span>Métricas Técnicas del Ciclo</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px] text-slate-300">
                          <div>
                            <span className="text-slate-500">Precio Ref:</span>{' '}
                            <span className="font-bold text-slate-200">${log.prompt_payload.price?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">RSI (14):</span>{' '}
                            <span className={`font-bold ${indicators.rsi >= 70 ? 'text-rose-400' : indicators.rsi <= 30 ? 'text-emerald-400' : 'text-slate-200'}`}>
                              {indicators.rsi?.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">EMA (20/50):</span>{' '}
                            <span className="font-bold text-slate-200">
                              {indicators.ema20?.toFixed(1)} / {indicators.ema50?.toFixed(1)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">MACD Hist:</span>{' '}
                            <span className={`font-bold ${indicators.macd?.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {indicators.macd?.histogram?.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Razonamiento AI */}
                    <div>
                      <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                        Razonamiento del Cerebro IA:
                      </h4>
                      <p className="text-slate-300 font-sans leading-relaxed text-xs whitespace-pre-line bg-slate-900/30 p-3 rounded-lg border border-slate-800/40">
                        {reasoning || 'No se proporcionó razonamiento estructurado.'}
                      </p>
                    </div>

                    {/* Parámetros de Operación (si aplica) */}
                    {(log.decision === 'OPEN_LONG' || log.decision === 'OPEN_SHORT') && log.raw_response && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-2 border-t border-slate-800/50">
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/35">
                          <div className="text-[9px] uppercase font-bold text-slate-500">Apalancamiento</div>
                          <div className="font-mono text-sm font-bold text-slate-200">{log.raw_response.leverage}x</div>
                        </div>
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/35">
                          <div className="text-[9px] uppercase font-bold text-slate-500">Precio Objetivo</div>
                          <div className="font-mono text-sm font-bold text-slate-200">${log.raw_response.entryPriceTarget?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/35">
                          <div className="text-[9px] uppercase font-bold text-rose-500/80">Stop Loss (SL)</div>
                          <div className="font-mono text-sm font-bold text-rose-400">${log.raw_response.stopLoss?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="bg-slate-900/40 p-2 rounded border border-slate-800/35">
                          <div className="text-[9px] uppercase font-bold text-emerald-500/80">Take Profit (TP)</div>
                          <div className="font-mono text-sm font-bold text-emerald-400">${log.raw_response.takeProfit?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
