'use client';

import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import PositionsList from '../components/PositionsList';
import SettingsPanel from '../components/SettingsPanel';
import GeminiLogs from '../components/GeminiLogs';
import TradeHistory from '../components/TradeHistory';
import PerformanceStats from '../components/PerformanceStats';
import { AlertTriangle, TrendingUp, DollarSign, Activity, FileText } from 'lucide-react';

interface Position {
  symbol: string;
  cleanSymbol?: string;
  side: string;
  contracts: number;
  entryPrice: number;
  markPrice: number;
  initialMargin: number;
  leverage?: number;
  unrealizedPnl: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export default function Home() {
  const [balance, setBalance] = useState<{ total: number; free: number }>({ total: 0, free: 0 });
  const [positions, setPositions] = useState<Position[]>([]);
  
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(true);
  const [isLoadingPositions, setIsLoadingPositions] = useState<boolean>(true);
  
  const [backendError, setBackendError] = useState<string | null>(null);

  // Fetch balance from backend
  const fetchBalance = async () => {
    setIsLoadingBalance(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/binance/balance`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success && data.data) {
        setBalance({
          total: data.data.total || 0,
          free: data.data.free || 0
        });
        setBackendError(null);
      } else {
        console.error('Error al obtener balance:', data.error);
        setBackendError(`Backend Error: ${data.error}`);
      }
    } catch (err: any) {
      console.error('Excepción al conectar con backend para balance:', err);
      setBackendError('Error de conexión con el backend NestJS (¿está encendido en el puerto 3001?)');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Fetch positions from backend
  const fetchPositions = async () => {
    setIsLoadingPositions(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/binance/positions`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success && Array.isArray(data.data)) {
        setPositions(data.data);
        setBackendError(null);
      } else {
        console.error('Error al obtener posiciones:', data.error);
        setBackendError(`Backend Error: ${data.error}`);
      }
    } catch (err: any) {
      console.error('Excepción al conectar con backend para posiciones:', err);
      setBackendError('Error de conexión con el backend NestJS (¿está encendido en el puerto 3001?)');
    } finally {
      setIsLoadingPositions(false);
    }
  };

  // Refresh both
  const handleRefreshAll = async () => {
    await Promise.all([fetchBalance(), fetchPositions()]);
  };

  // Initial load and periodic polling
  useEffect(() => {
    handleRefreshAll();

    // Poll every 10 seconds to keep dashboard updated with live prices and balance
    const interval = setInterval(() => {
      fetchBalance();
      fetchPositions();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Calculate total unrealized PnL (normalized field from backend)
  const totalUnrealizedPnL = positions.reduce((acc, pos) => acc + (pos.unrealizedPnl ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-[#f1f5f9]">
      {/* Header */}
      <Header
        balance={balance}
        onRefreshBalance={fetchBalance}
        isLoadingBalance={isLoadingBalance}
      />

      {/* Backend Error Banner */}
      {backendError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 text-rose-400 px-6 py-2.5 flex items-center gap-3 text-xs font-mono">
          <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          <span>{backendError}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        
        {/* Live Stats Overview Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Balance Total */}
          <div className="bg-[#111827] rounded-xl border border-border-color p-4 shadow-sm flex items-center gap-4">
            <div className="bg-yellow-500/10 p-2.5 rounded-lg border border-yellow-500/20">
              <DollarSign size={20} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Balance Total</p>
              <h3 className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                {isLoadingBalance ? '---' : `$${balance.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </h3>
            </div>
          </div>

          {/* Card 2: Margen Disponible */}
          <div className="bg-[#111827] rounded-xl border border-border-color p-4 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
              <TrendingUp size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Balance Disponible</p>
              <h3 className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                {isLoadingBalance ? '---' : `$${balance.free.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </h3>
            </div>
          </div>

          {/* Card 3: PnL No Realizado */}
          <div className="bg-[#111827] rounded-xl border border-border-color p-4 shadow-sm flex items-center gap-4">
            <div className={`p-2.5 rounded-lg border ${
              totalUnrealizedPnL >= 0 
                ? 'bg-emerald-500/10 border-emerald-500/20' 
                : 'bg-rose-500/10 border-rose-500/20'
            }`}>
              <Activity size={20} className={totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PnL No Realizado</p>
              <h3 className={`text-lg font-bold font-mono mt-0.5 ${
                totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {isLoadingPositions ? '---' : `${totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)} USDT`}
              </h3>
            </div>
          </div>

          {/* Card 4: Posiciones Abiertas */}
          <div className="bg-[#111827] rounded-xl border border-border-color p-4 shadow-sm flex items-center gap-4">
            <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
              <FileText size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Posiciones Abiertas</p>
              <h3 className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                {isLoadingPositions ? '---' : positions.length}
              </h3>
            </div>
          </div>
        </div>

        {/* Rendimiento y Estadísticas */}
        <PerformanceStats totalBalance={balance.total} />

        {/* Row 2: Positions List and Settings Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 h-full flex flex-col">
            <PositionsList
              positions={positions}
              onRefreshPositions={fetchPositions}
              isLoading={isLoadingPositions}
            />
          </div>
          <div className="lg:col-span-5 h-full flex flex-col">
            <SettingsPanel />
          </div>
        </div>

        {/* Row 3: Gemini Logs and Trade History */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GeminiLogs />
          <TradeHistory />
        </div>

      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border-color bg-[#090d16]/80 text-center text-[10px] text-slate-500 font-mono mt-auto">
        &copy; {new Date().getFullYear()} CriptoBot AG-1. Conectado a Binance Futures Demo.
      </footer>
    </div>
  );
}
