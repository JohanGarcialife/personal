'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save, AlertCircle, Plus, X } from 'lucide-react';

export default function SettingsPanel() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [maxRisk, setMaxRisk] = useState<number>(1.0);
  const [maxMargin, setMaxMargin] = useState<number>(20.0);
  const [minRR, setMinRR] = useState<number>(1.5);
  const [maxLeverage, setMaxLeverage] = useState<number>(5);
  const [promptMaster, setPromptMaster] = useState<string>('');
  const [allowedSymbols, setAllowedSymbols] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [availableSymbols, setAvailableSymbols] = useState<string[]>([
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT'
  ]);
  const [newSymbolInput, setNewSymbolInput] = useState<string>('');

  // Cargar configuración de Supabase
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from('bot_settings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          console.error('Error al cargar configuraciones:', error.message);
          return;
        }

        if (data) {
          setSettingsId(data.id);
          setMaxRisk(parseFloat(data.max_risk_per_trade_percent?.toString() || '1.0'));
          setMaxMargin(parseFloat(data.max_margin_usage_percent?.toString() || '20.0'));
          setMinRR(parseFloat(data.min_risk_to_reward_ratio?.toString() || '1.5'));
          setMaxLeverage(parseInt(data.max_leverage?.toString() || '5'));
          setPromptMaster(data.prompt_master || '');
          
          const loadedSymbolsRaw: string[] = data.allowed_symbols || [];
          const activeSymbols = loadedSymbolsRaw.filter((s) => !s.startsWith('-'));
          const allSymbolsParsed = loadedSymbolsRaw.map((s) => s.startsWith('-') ? s.slice(1) : s);
          
          setAllowedSymbols(activeSymbols);

          // Combinar símbolos cargados con los disponibles por defecto
          setAvailableSymbols((prev) => {
            return Array.from(new Set([...prev, ...allSymbolsParsed]));
          });
        }
      } catch (err) {
        console.error('Excepción al cargar settings:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Manejar cambio en los checkboxes de símbolos permitidos
  const handleSymbolChange = (symbol: string) => {
    if (allowedSymbols.includes(symbol)) {
      setAllowedSymbols(allowedSymbols.filter((s) => s !== symbol));
    } else {
      setAllowedSymbols([...allowedSymbols, symbol]);
    }
  };

  // Eliminar un par del listado disponible
  const handleDeleteSymbol = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar que el clic en el botón active/desactive
    setAvailableSymbols(availableSymbols.filter((s) => s !== symbol));
    setAllowedSymbols(allowedSymbols.filter((s) => s !== symbol));
  };

  // Agregar un par personalizado
  const handleAddCustomSymbol = () => {
    const sym = newSymbolInput.trim().toUpperCase();
    if (!sym) return;

    if (!sym.includes('/') || sym.length < 5) {
      alert('Formato inválido. Debe ser como BTC/USDT');
      return;
    }

    if (!availableSymbols.includes(sym)) {
      setAvailableSymbols([...availableSymbols, sym]);
    }
    if (!allowedSymbols.includes(sym)) {
      setAllowedSymbols([...allowedSymbols, sym]);
    }
    setNewSymbolInput('');
  };

  // Guardar configuraciones en la base de datos
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsId || isSaving) return;
    setIsSaving(true);
    setMessage(null);

    try {
      // Mapear los símbolos disponibles: los no seleccionados se guardan con prefijo '-'
      const symbolsToSave = availableSymbols.map((sym) => {
        return allowedSymbols.includes(sym) ? sym : `-${sym}`;
      });

      const { error } = await supabase
        .from('bot_settings')
        .update({
          max_risk_per_trade_percent: maxRisk,
          max_margin_usage_percent: maxMargin,
          min_risk_to_reward_ratio: minRR,
          max_leverage: maxLeverage,
          prompt_master: promptMaster,
          allowed_symbols: symbolsToSave,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settingsId);

      if (error) {
        setMessage({ type: 'error', text: `Error al guardar: ${error.message}` });
      } else {
        setMessage({ type: 'success', text: '✓ Configuración guardada con éxito.' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `Excepción: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#111827] rounded-xl border border-border-color p-5 text-slate-400 font-mono text-xs flex items-center justify-center py-24">
        <span>Cargando configuraciones de riesgo...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] rounded-xl border border-border-color p-5 shadow-md flex-1">
      <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 mb-4">
        <Settings size={18} className="text-yellow-500" />
        <span>Gestión de Riesgo e Instrucciones IA</span>
      </h2>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Parámetros en Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Apalancamiento Máximo */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Apalancamiento Máximo ({maxLeverage}x)
            </label>
            <input
              type="range"
              min="1"
              max="25"
              step="1"
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(parseInt(e.target.value))}
              className="w-full accent-yellow-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>1x</span>
              <span>10x</span>
              <span>25x</span>
            </div>
          </div>

          {/* Riesgo Máximo por Operación */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Riesgo por Operación ({maxRisk.toFixed(1)}% del Capital)
            </label>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={maxRisk}
              onChange={(e) => setMaxRisk(parseFloat(e.target.value))}
              className="w-full accent-yellow-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>0.1%</span>
              <span>2.5%</span>
              <span>5.0%</span>
            </div>
          </div>

          {/* Margen Máximo a Comprometer */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Margen Máximo de Posición ({maxMargin.toFixed(0)}% del Balance Libre)
            </label>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={maxMargin}
              onChange={(e) => setMaxMargin(parseFloat(e.target.value))}
              className="w-full accent-yellow-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>5%</span>
              <span>25%</span>
              <span>50%</span>
            </div>
          </div>

          {/* Ratio R:R Mínimo */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Ratio Riesgo/Beneficio Mínimo (1:{minRR.toFixed(1)})
            </label>
            <input
              type="number"
              min="1.0"
              max="5.0"
              step="0.1"
              value={minRR}
              onChange={(e) => setMinRR(parseFloat(e.target.value))}
              className="w-full bg-[#0d1321] border border-border-color rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-yellow-500/50"
            />
          </div>
        </div>

        {/* Selección de Monedas */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
            Pares Autorizados a Operar
          </label>
          <div className="flex flex-wrap gap-2.5">
            {availableSymbols.map((symbol) => {
              const isChecked = allowedSymbols.includes(symbol);
              return (
                <div
                  key={symbol}
                  onClick={() => handleSymbolChange(symbol)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition border flex items-center gap-1.5 cursor-pointer ${
                    isChecked
                      ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30'
                      : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-400'
                  }`}
                >
                  <span>{symbol}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSymbol(symbol, e)}
                    className="hover:bg-slate-800/80 p-0.5 rounded-full text-slate-500 hover:text-rose-400 transition cursor-pointer"
                    title={`Eliminar ${symbol}`}
                  >
                    <X size={10} className="stroke-[3]" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Agregar nuevos pares */}
          <div className="flex items-center gap-2 max-w-[240px] pt-1">
            <input
              type="text"
              value={newSymbolInput}
              onChange={(e) => setNewSymbolInput(e.target.value)}
              placeholder="Añadir par (ej: DOT/USDT)"
              className="flex-1 bg-[#0d1321] border border-border-color rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-500/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomSymbol();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddCustomSymbol}
              className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 p-1.5 rounded-lg transition cursor-pointer"
              title="Añadir nuevo par"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Prompt Maestro de la IA */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <span>Instrucciones Maestras del Prompt (Gemini AI Brain)</span>
            <span className="text-[10px] text-slate-500 normal-case font-normal">(Modifica el comportamiento y estrategia de la IA)</span>
          </label>
          <textarea
            value={promptMaster}
            onChange={(e) => setPromptMaster(e.target.value)}
            rows={5}
            placeholder="Introduce las reglas que la IA debe seguir para tomar decisiones de compra o venta..."
            className="w-full bg-[#0d1321] border border-border-color rounded-lg px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-yellow-500/50 leading-relaxed"
          />
        </div>

        {/* Botón guardar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertCircle size={14} className="text-yellow-500/70" />
            <span>El bot aplica las configuraciones al instante en el siguiente ciclo.</span>
          </div>
          <div className="flex items-center gap-3">
            {message && (
              <span
                className={`text-xs font-semibold font-mono ${
                  message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {message.text}
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 px-4 py-2 rounded-lg font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              {isSaving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
