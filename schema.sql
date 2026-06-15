-- Esquema SQL inicial para base de datos Supabase (PostgreSQL)
-- Puedes pegar este script directamente en el editor SQL de Supabase.

-- Habilitar extensión para UUIDs si no está activa
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Configuración Dinámica del Bot
CREATE TABLE IF NOT EXISTS bot_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT false, -- Kill Switch (On/Off)
    allowed_symbols TEXT[] NOT NULL DEFAULT '{"BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"}',
    max_risk_per_trade_percent NUMERIC NOT NULL DEFAULT 1.0, -- Riesgo del capital por trade
    max_margin_usage_percent NUMERIC NOT NULL DEFAULT 20.0, -- Máximo margen a comprometer
    min_risk_to_reward_ratio NUMERIC NOT NULL DEFAULT 1.5, -- Mínimo R:R permitido
    max_leverage INT NOT NULL DEFAULT 5, -- Límite máximo de apalancamiento
    prompt_master TEXT NOT NULL DEFAULT 'Solo abre posiciones en velas de 15m cuando el RSI muestre claras divergencias y el MACD confirme la fuerza de la tendencia. Fija siempre un Stop Loss en el soporte/resistencia más cercano y un Take Profit que mantenga un ratio 1:2 mínimo.'
);

-- Insertar configuración por defecto inicial
INSERT INTO bot_settings (is_active) 
VALUES (false)
ON CONFLICT DO NOTHING;

-- 2. Tabla de Historial de Posiciones y Órdenes (PnL)
CREATE TABLE IF NOT EXISTS trade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL, -- 'buy' (LONG) o 'sell' (SHORT)
    entry_price NUMERIC NOT NULL,
    amount NUMERIC NOT NULL,
    leverage INT NOT NULL,
    stop_loss NUMERIC NOT NULL,
    take_profit NUMERIC NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED', 'CANCELLED'
    pnl NUMERIC, -- Profit and Loss final en USD/USDT
    entry_order_id VARCHAR(100), -- ID de orden retornado por Binance
    sl_order_id VARCHAR(100), -- ID de la orden de Stop Loss en Binance
    tp_order_id VARCHAR(100), -- ID de la orden de Take Profit en Binance
    closed_at TIMESTAMPTZ,
    exit_trigger VARCHAR(50) -- 'SL_HIT', 'TP_HIT', 'MANUAL_CLOSE', 'AI_CLOSE'
);

-- Crear índices para búsquedas rápidas en el dashboard
CREATE INDEX IF NOT EXISTS idx_trade_logs_status ON trade_logs(status);
CREATE INDEX IF NOT EXISTS idx_trade_logs_symbol ON trade_logs(symbol);

-- 3. Tabla de Logs de Decisiones de Gemini
CREATE TABLE IF NOT EXISTS gemini_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    symbol VARCHAR(20) NOT NULL,
    prompt_payload JSONB NOT NULL, -- Contexto técnico y balance que le enviamos a la IA
    decision VARCHAR(20) NOT NULL, -- 'OPEN_LONG', 'OPEN_SHORT', 'HOLD', 'CLOSE_POSITION'
    raw_response JSONB NOT NULL, -- Objeto JSON de decisión completo de Gemini
    response_time_ms INT NOT NULL -- Latencia en milisegundos
);

CREATE INDEX IF NOT EXISTS idx_gemini_logs_symbol ON gemini_logs(symbol);

-- Función para actualizar la columna updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para bot_settings
CREATE OR REPLACE TRIGGER update_bot_settings_updated_at
    BEFORE UPDATE ON bot_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
