"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const binance_service_1 = require("./binance/binance.service");
const gemini_service_1 = require("./gemini/gemini.service");
const supabase_service_1 = require("./supabase/supabase.service");
async function bootstrap() {
    console.log('Iniciando contexto de NestJS para prueba de conectividad...');
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const binanceService = app.get(binance_service_1.BinanceService);
    const geminiService = app.get(gemini_service_1.GeminiService);
    console.log('\n=============================================');
    console.log('   PRUEBA DE CONECTIVIDAD - BINANCE FUTURES   ');
    console.log('=============================================');
    try {
        const balance = await binanceService.getBalance();
        console.log('✓ Conexión exitosa a Binance Futures Testnet.');
        console.log(`  Balance Total: ${balance.total} USDT`);
        console.log(`  Balance Libre: ${balance.free} USDT`);
        console.log('Cargando mercados de Binance Futures...');
        const markets = await binanceService.getClient().loadMarkets();
        const symbols = Object.keys(markets);
        console.log('Símbolos disponibles (primeros 5):', symbols.slice(0, 5));
        const testSymbol = symbols.includes('BNB/USDT') ? 'BNB/USDT' : (symbols.includes('BNB/USDT:USDT') ? 'BNB/USDT:USDT' : symbols[0]);
        console.log(`\nObteniendo precio de ${testSymbol}...`);
        const bnbPrice = await binanceService.getTickerPrice(testSymbol);
        console.log(`  Precio actual de ${testSymbol}: $${bnbPrice} USD`);
    }
    catch (err) {
        console.error('✗ Falló la conexión a Binance Futures:', err.message);
    }
    console.log('\n=============================================');
    console.log('     PRUEBA DE CONECTIVIDAD - GEMINI API     ');
    console.log('=============================================');
    try {
        const promptMaster = 'Opera con un riesgo máximo del 1% por operación. Entra solo si hay confluencia.';
        const mockContext = {
            price: 65000,
            balance: 1000,
            indicators: {
                rsi: 28,
                macd: { macd: -1.2, signal: -1.8, histogram: 0.6 },
                ema20: 64800,
                ema50: 65200,
            },
            recentKlines: [
                [1700000000000, 65100, 65200, 64900, 65000, 5.2],
                [1700000060000, 65000, 65050, 64800, 64950, 4.8],
            ]
        };
        console.log('Enviando consulta estructurada a Gemini 3.5 Flash...');
        const decision = await geminiService.analyzeMarket('BTC/USDT', mockContext, promptMaster);
        console.log('✓ Respuesta recibida de Gemini estructurada con éxito.');
        console.log('  Decisión:', decision.decision);
        console.log('  Apalancamiento:', decision.leverage + 'x');
        console.log('  Precio entrada:', decision.entryPriceTarget);
        console.log('  Stop Loss:', decision.stopLoss);
        console.log('  Take Profit:', decision.takeProfit);
        console.log('  Razón:', decision.analysisReasoning);
    }
    catch (err) {
        console.error('✗ Falló la prueba de Gemini API:', err.message);
    }
    console.log('\n=============================================');
    console.log('    PRUEBA DE CONECTIVIDAD - SUPABASE DB    ');
    console.log('=============================================');
    try {
        const supabaseService = app.get(supabase_service_1.SupabaseService);
        console.log('Consultando configuraciones en bot_settings...');
        const settings = await supabaseService.getSettings();
        if (settings) {
            console.log('✓ Conexión exitosa a Supabase.');
            console.log('  Configuración activa obtenida:');
            console.log(`    is_active (Kill Switch): ${settings.is_active}`);
            console.log(`    max_risk_per_trade_percent: ${settings.max_risk_per_trade_percent}%`);
            console.log(`    allowed_symbols:`, settings.allowed_symbols);
        }
        else {
            console.log('⚠ No se obtuvieron registros de bot_settings (¿está vacía la tabla?).');
        }
        console.log('Probando inserción de log en gemini_logs...');
        await supabaseService.logGeminiDecision('BTC/USDT', { test: 'payload_context' }, 'HOLD', { decision: 'HOLD', reasoning: 'test' }, 120);
        console.log('✓ Registro de log de prueba insertado con éxito en gemini_logs.');
    }
    catch (err) {
        console.error('✗ Falló la prueba de Supabase:', err.message);
    }
    console.log('\nCerrando aplicación...');
    await app.close();
}
bootstrap().catch(err => {
    console.error('Error catastrófico en el bootstrap del test:', err);
});
//# sourceMappingURL=test-connection.js.map