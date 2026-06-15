'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Play, Square, RefreshCw, Cpu, Wallet } from 'lucide-react';

interface HeaderProps {
  balance: { total: number; free: number };
  onRefreshBalance: () => Promise<void>;
  isLoadingBalance: boolean;
}

export default function Header({ balance, onRefreshBalance, isLoadingBalance }: HeaderProps) {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isTriggeringCycle, setIsTriggeringCycle] = useState<boolean>(false);
  const [cycleMessage, setCycleMessage] = useState<string | null>(null);

  // Cargar configuración inicial del bot
  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from('bot_settings')
        .select('id, is_active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error al cargar settings:', error.message);
        return;
      }

      if (data && data.length > 0) {
        setIsActive(data[0].is_active);
        setSettingsId(data[0].id);
      }
    }

    loadSettings();

    // Suscripción en tiempo real a los cambios de configuración
    const channel = supabase
      .channel('realtime_bot_settings')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bot_settings' },
        (payload: any) => {
          if (payload.new) {
            setIsActive(payload.new.is_active);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Alternar el estado activo/inactivo (Kill Switch)
  const handleToggleActive = async () => {
    if (!settingsId || isUpdating) return;
    setIsUpdating(true);
    const newStatus = !isActive;

    try {
      const { error } = await supabase
        .from('bot_settings')
        .update({ is_active: newStatus })
        .eq('id', settingsId);

      if (error) {
        console.error('Error al alternar estado del bot:', error.message);
      } else {
        setIsActive(newStatus);
      }
    } catch (err) {
      console.error('Excepción al alternar estado del bot:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Disparar ciclo de análisis manual
  const handleTriggerCycle = async () => {
    if (isTriggeringCycle) return;
    setIsTriggeringCycle(true);
    setCycleMessage('Ejecutando análisis vela a vela...');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/strategy/execute`);
      const data = await res.json();
      
      if (data.success) {
        setCycleMessage('✓ Ciclo ejecutado con éxito.');
        await onRefreshBalance();
      } else {
        setCycleMessage(`✗ Error: ${data.error}`);
      }
    } catch (err) {
      setCycleMessage('✗ Error de conexión con el backend.');
    } finally {
      setTimeout(() => setCycleMessage(null), 5000);
      setIsTriggeringCycle(false);
    }
  };

  return (
    <header className="border-b border-border-color bg-[#0d1321] px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
      {/* Título y estado */}
      <div className="flex items-center gap-4">
        <div className="bg-yellow-500 text-slate-950 p-2 rounded-lg font-bold flex items-center gap-1.5 shadow-lg shadow-yellow-500/10">
          <Cpu size={20} className="animate-pulse" />
          <span>AG-1</span>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wide text-slate-100 flex items-center gap-2">
            CRIPTOBOT <span className="text-yellow-500 font-mono text-sm px-2 py-0.5 rounded border border-yellow-500/20 bg-yellow-500/5">FUTURES</span>
          </h1>
          <p className="text-xs text-slate-400">Terminal de Trading Autónomo con IA</p>
        </div>
      </div>

      {/* Botones de acción y estado del bot */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Ejecutar ciclo manual */}
        <div className="flex flex-col items-end">
          <button
            onClick={handleTriggerCycle}
            disabled={isTriggeringCycle}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg font-medium text-sm transition border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={isTriggeringCycle ? 'animate-spin' : ''} />
            {isTriggeringCycle ? 'Analizando...' : 'Analizar Ahora'}
          </button>
          {cycleMessage && (
            <span className="text-[10px] text-slate-400 mt-1 font-mono">{cycleMessage}</span>
          )}
        </div>

        {/* Kill Switch Toggle */}
        <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-xl border border-border-color">
          <span className="text-sm font-medium text-slate-300">Estado del Bot:</span>
          <button
            onClick={handleToggleActive}
            disabled={isUpdating}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition uppercase cursor-pointer ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-emerald-500/5 shadow-md'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {isActive ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-status-pulse"></span>
                <span>Activo</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                <span>Apagado</span>
              </>
            )}
          </button>
          
          {/* Switch deslizable */}
          <button
            onClick={handleToggleActive}
            disabled={isUpdating}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
              isActive ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-200 ease-in-out ${
                isActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Balance */}
        <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-xl border border-border-color">
          <Wallet size={18} className="text-yellow-500" />
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Balance Demo</span>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-100 font-mono">
                {isLoadingBalance ? '---' : balance.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-yellow-500 font-bold">USDT</span>
              <button
                onClick={onRefreshBalance}
                disabled={isLoadingBalance}
                className="text-slate-400 hover:text-slate-200 transition p-0.5 rounded ml-1 cursor-pointer"
              >
                <RefreshCw size={12} className={isLoadingBalance ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
