'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, Calendar, BarChart2, Award, Zap } from 'lucide-react';

interface TradeLog {
  pnl: number;
  closed_at: string;
}

interface PerformancePeriod {
  pnl: number;
  count: number;
  pct: number;
}

export default function PerformanceStats({ totalBalance }: { totalBalance: number }) {
  const [stats24h, setStats24h] = useState<PerformancePeriod>({ pnl: 0, count: 0, pct: 0 });
  const [stats7d, setStats7d] = useState<PerformancePeriod>({ pnl: 0, count: 0, pct: 0 });
  const [stats14d, setStats14d] = useState<PerformancePeriod>({ pnl: 0, count: 0, pct: 0 });
  const [stats30d, setStats30d] = useState<PerformancePeriod>({ pnl: 0, count: 0, pct: 0 });
  const [statsAll, setStatsAll] = useState<PerformancePeriod>({ pnl: 0, count: 0, pct: 0 });
  const [chartPath, setChartPath] = useState<string>('');
  const [chartPoints, setChartPoints] = useState<{ x: number; y: number }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const calculateStats = (trades: TradeLog[]) => {
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;

    const filterAndSum = (days: number | null) => {
      const filtered = trades.filter((t) => {
        if (!t.closed_at) return false;
        if (days === null) return true;
        const diff = now.getTime() - new Date(t.closed_at).getTime();
        return diff <= days * msInDay;
      });

      const pnlSum = filtered.reduce((sum, t) => sum + (t.pnl || 0), 0);
      
      // Calcular rendimiento porcentual aproximado en base al balance total actual
      const initialCapital = totalBalance - pnlSum;
      const pct = initialCapital > 0 ? (pnlSum / initialCapital) * 100 : 0;

      return {
        pnl: pnlSum,
        count: filtered.length,
        pct: pct,
      };
    };

    setStats24h(filterAndSum(1));
    setStats7d(filterAndSum(7));
    setStats14d(filterAndSum(14));
    setStats30d(filterAndSum(30));
    setStatsAll(filterAndSum(null));

    // Generar datos para el gráfico de PnL Acumulado (Últimos 30 días)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * msInDay);
    const sortedTrades30d = trades
      .filter((t) => t.closed_at && new Date(t.closed_at) >= thirtyDaysAgo)
      .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime());

    if (sortedTrades30d.length === 0) {
      // Gráfico plano si no hay operaciones
      setChartPath('M 0 20 L 100 20');
      setChartPoints([]);
      return;
    }

    let cumPnL = 0;
    const points = sortedTrades30d.map((t, idx) => {
      cumPnL += t.pnl;
      return {
        val: cumPnL,
        time: new Date(t.closed_at).getTime(),
      };
    });

    // Añadir punto de partida a 0
    const startPoint = { val: 0, time: thirtyDaysAgo.getTime() };
    const allPoints = [startPoint, ...points];

    const minTime = thirtyDaysAgo.getTime();
    const maxTime = now.getTime();
    const timeRange = maxTime - minTime || 1;

    const pnlValues = allPoints.map((p) => p.val);
    const minPnL = Math.min(...pnlValues, 0);
    const maxPnL = Math.max(...pnlValues, 0);
    const pnlRange = maxPnL - minPnL || 1;

    // Escalar puntos a SVG viewBox (100 de ancho, 40 de alto)
    const scaledPoints = allPoints.map((p) => {
      const x = ((p.time - minTime) / timeRange) * 100;
      // Invertir Y porque el origen 0 en SVG está arriba
      const y = 35 - ((p.val - minPnL) / pnlRange) * 30; // Dejar 5px de padding arriba y abajo
      return { x, y };
    });

    setChartPoints(scaledPoints);

    // Crear path bezier o línea simple
    let path = `M ${scaledPoints[0].x.toFixed(1)} ${scaledPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < scaledPoints.length; i++) {
      path += ` L ${scaledPoints[i].x.toFixed(1)} ${scaledPoints[i].y.toFixed(1)}`;
    }
    setChartPath(path);
  };

  useEffect(() => {
    async function loadTrades() {
      try {
        const { data, error } = await supabase
          .from('trade_logs')
          .select('pnl, closed_at')
          .eq('status', 'CLOSED')
          .order('closed_at', { ascending: false });

        if (error) {
          console.error('Error al cargar trades para estadísticas:', error.message);
          return;
        }

        if (data) {
          calculateStats(data as TradeLog[]);
        }
      } catch (err) {
        console.error('Excepción al calcular estadísticas:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadTrades();

    // Suscripción real-time para actualizar las estadísticas al instante si un trade se cierra
    const channel = supabase
      .channel('realtime_perf_stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trade_logs' },
        async () => {
          // Volver a cargar para recalculación limpia
          const { data } = await supabase
            .from('trade_logs')
            .select('pnl, closed_at')
            .eq('status', 'CLOSED');
          if (data) {
            calculateStats(data as TradeLog[]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [totalBalance]);

  const renderCard = (title: string, period: PerformancePeriod) => {
    const isPositive = period.pnl > 0;
    const isNegative = period.pnl < 0;

    return (
      <div className="bg-[#0d1321]/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-700/60 transition duration-200">
        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center justify-between">
          <span>{title}</span>
          <span className="font-mono text-slate-500 lowercase text-[9px]">({period.count} trades)</span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className={`text-base font-bold font-mono tracking-tight ${
            isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-400'
          }`}>
            {isPositive ? '+' : ''}
            {period.pnl.toFixed(2)} USDT
          </span>
          <span className={`text-[10px] font-bold font-mono ${
            isPositive ? 'text-emerald-400/85' : isNegative ? 'text-rose-400/85' : 'text-slate-500'
          }`}>
            ({isPositive ? '+' : ''}{period.pct.toFixed(2)}%)
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          {isPositive ? (
            <TrendingUp size={12} className="text-emerald-400" />
          ) : isNegative ? (
            <TrendingDown size={12} className="text-rose-400" />
          ) : (
            <div className="h-1.5 w-1.5 rounded-full bg-slate-600"></div>
          )}
          <span className={`text-[9px] font-semibold ${
            isPositive ? 'text-emerald-400/70' : isNegative ? 'text-rose-400/70' : 'text-slate-500'
          }`}>
            {isPositive ? 'Rendimiento Positivo' : isNegative ? 'Rendimiento Negativo' : 'Sin actividad'}
          </span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-[#111827] rounded-xl border border-border-color p-5 text-slate-400 font-mono text-xs flex items-center justify-center py-12">
        <span>Calculando métricas de rendimiento...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-xl border border-border-color p-5 shadow-md flex flex-col md:flex-row gap-6 w-full">
      {/* Panel Izquierdo: Métricas en Períodos */}
      <div className="flex-1 space-y-4">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Award size={18} className="text-yellow-500" />
          <span>Rendimiento por Períodos</span>
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-3.5">
          {renderCard('Últimas 24h', stats24h)}
          {renderCard('Últimos 7 días', stats7d)}
          {renderCard('Últimos 14 días', stats14d)}
          {renderCard('Últimos 30 días', stats30d)}
        </div>
      </div>

      {/* Panel Derecho: Historial Acumulado y Gráfico */}
      <div className="flex-1 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-800/60 pt-4 md:pt-0 md:pl-6">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-3">
            <BarChart2 size={18} className="text-yellow-500" />
            <span>Retorno de Inversión Histórico (30D)</span>
          </h2>
          <div className="flex justify-between items-baseline bg-[#0d1321]/30 border border-slate-800/40 p-3 rounded-lg mb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500">PnL Neto Total (Todos)</span>
              <div className={`text-lg font-extrabold font-mono mt-0.5 ${
                statsAll.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {statsAll.pnl >= 0 ? '+' : ''}
                {statsAll.pnl.toFixed(2)} USDT
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-500">ROI Global</span>
              <div className={`text-sm font-bold font-mono mt-0.5 ${
                statsAll.pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {statsAll.pct >= 0 ? '+' : ''}
                {statsAll.pct.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico SVG de curva de rendimiento */}
        <div className="relative flex-1 min-h-[100px] bg-[#0d1321]/40 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between overflow-hidden">
          <div className="flex justify-between text-[9px] font-mono text-slate-500 select-none z-10">
            <span>Gráfico de PnL Acumulado</span>
            <span className="flex items-center gap-1">
              <Zap size={10} className="text-yellow-500" />
              Tiempo real
            </span>
          </div>

          <div className="relative w-full h-[65px] mt-2">
            {chartPoints.length > 0 ? (
              <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stats30d.pnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={stats30d.pnl >= 0 ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Relleno de degradado */}
                <path
                  d={`${chartPath} L 100 40 L 0 40 Z`}
                  fill="url(#chart-grad)"
                />
                {/* Línea principal */}
                <path
                  d={chartPath}
                  fill="none"
                  stroke={stats30d.pnl >= 0 ? '#10b981' : '#f43f5e'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Puntos clave */}
                {chartPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="1.2"
                    className={stats30d.pnl >= 0 ? 'fill-emerald-400' : 'fill-rose-400'}
                  />
                ))}
              </svg>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">
                Esperando operaciones cerradas para trazar...
              </div>
            )}
          </div>

          <div className="flex justify-between text-[8px] font-mono text-slate-600 select-none border-t border-slate-800/40 pt-1.5 mt-1">
            <span>Hace 30 días</span>
            <span>Hoy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
