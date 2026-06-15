"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StrategyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyService = void 0;
const common_1 = require("@nestjs/common");
const binance_service_1 = require("../binance/binance.service");
const gemini_service_1 = require("../gemini/gemini.service");
const risk_service_1 = require("../risk/risk.service");
const supabase_service_1 = require("../supabase/supabase.service");
const technicalindicators_1 = require("technicalindicators");
let StrategyService = StrategyService_1 = class StrategyService {
    binanceService;
    geminiService;
    riskService;
    supabaseService;
    logger = new common_1.Logger(StrategyService_1.name);
    intervalId;
    constructor(binanceService, geminiService, riskService, supabaseService) {
        this.binanceService = binanceService;
        this.geminiService = geminiService;
        this.riskService = riskService;
        this.supabaseService = supabaseService;
    }
    onModuleInit() {
        this.logger.log('Inicializando ciclo de ejecución automatizado de la Estrategia...');
        setTimeout(() => {
            this.executeCycle().catch((err) => {
                this.logger.error('Error durante la ejecución del ciclo inicial de estrategia', err.stack);
            });
        }, 10000);
        this.intervalId = setInterval(() => {
            this.executeCycle().catch((err) => {
                this.logger.error('Error durante la ejecución del ciclo periódico de estrategia', err.stack);
            });
        }, 300000);
    }
    async executeCycle() {
        this.logger.log('--- Iniciando Ciclo de Trading Automatizado ---');
        const settings = await this.supabaseService.getSettings();
        if (!settings) {
            this.logger.warn('No se pudo cargar la configuración de Supabase. Omitiendo ciclo.');
            return;
        }
        if (!settings.is_active) {
            this.logger.log('El Bot está desactivado (Kill Switch = Off). Omitiendo ciclo.');
            return;
        }
        const { allowed_symbols: allowedSymbols, max_risk_per_trade_percent: maxRiskPerTradePercent, max_margin_usage_percent: maxMarginUsagePercent, min_risk_to_reward_ratio: minRiskToRewardRatio, max_leverage: maxLeverage, prompt_master: promptMaster, } = settings;
        let balance;
        try {
            balance = await this.binanceService.getBalance();
            this.logger.log(`Balance obtenido: Total = ${balance.total} USDT | Libre = ${balance.free} USDT`);
        }
        catch (error) {
            this.logger.error('Error al consultar balance. Cancelando ciclo.', error.stack);
            return;
        }
        let openPositions = [];
        try {
            openPositions = await this.binanceService.getOpenPositions();
            this.logger.log(`Posiciones abiertas actuales: ${openPositions.length}`);
        }
        catch (error) {
            this.logger.error('Error al obtener posiciones abiertas. Cancelando ciclo.', error.stack);
            return;
        }
        for (const symbol of allowedSymbols) {
            try {
                this.logger.log(`[${symbol}] Analizando par...`);
                const hasPosition = openPositions.some((pos) => {
                    const posSymbol = pos.symbol;
                    return posSymbol === symbol || posSymbol.startsWith(symbol + ':');
                });
                if (hasPosition) {
                    this.logger.log(`[${symbol}] Ya existe una posición abierta. Omitiendo nueva entrada.`);
                    continue;
                }
                const klines = await this.binanceService.getKlines(symbol, '15m', 50);
                if (klines.length < 30) {
                    this.logger.warn(`[${symbol}] No hay suficientes velas para calcular indicadores (${klines.length}).`);
                    continue;
                }
                const closePrices = klines.map((k) => parseFloat(k[4]?.toString() || '0'));
                const currentPrice = closePrices[closePrices.length - 1] || 0;
                const rsiValues = technicalindicators_1.RSI.calculate({ values: closePrices, period: 14 });
                const currentRsi = rsiValues[rsiValues.length - 1] || 50;
                const ema20Values = technicalindicators_1.EMA.calculate({ values: closePrices, period: 20 });
                const currentEma20 = ema20Values[ema20Values.length - 1] || currentPrice;
                const ema50Values = technicalindicators_1.EMA.calculate({ values: closePrices, period: 50 });
                const currentEma50 = ema50Values[ema50Values.length - 1] || currentPrice;
                const macdValues = technicalindicators_1.MACD.calculate({
                    values: closePrices,
                    fastPeriod: 12,
                    slowPeriod: 26,
                    signalPeriod: 9,
                    SimpleMAOscillator: false,
                    SimpleMASignal: false,
                });
                const currentMacdInfo = macdValues[macdValues.length - 1] || { MACD: 0, signal: 0, histogram: 0 };
                const indicators = {
                    rsi: parseFloat(currentRsi.toFixed(2)),
                    ema20: parseFloat(currentEma20.toFixed(2)),
                    ema50: parseFloat(currentEma50.toFixed(2)),
                    macd: {
                        macd: parseFloat((currentMacdInfo.MACD || 0).toFixed(4)),
                        signal: parseFloat((currentMacdInfo.signal || 0).toFixed(4)),
                        histogram: parseFloat((currentMacdInfo.histogram || 0).toFixed(4)),
                    },
                };
                const recentKlinesData = klines.slice(-5).map((k) => [
                    k[0] ?? 0,
                    parseFloat(k[1]?.toString() || '0'),
                    parseFloat(k[2]?.toString() || '0'),
                    parseFloat(k[3]?.toString() || '0'),
                    parseFloat(k[4]?.toString() || '0'),
                    parseFloat(k[5]?.toString() || '0'),
                ]);
                const marketContext = {
                    price: currentPrice,
                    balance: balance.total,
                    indicators,
                    recentKlines: recentKlinesData,
                };
                const startTime = Date.now();
                this.logger.log(`[${symbol}] Enviando análisis técnico a Gemini...`);
                const iaResponse = await this.geminiService.analyzeMarket(symbol, marketContext, promptMaster);
                const latency = Date.now() - startTime;
                this.logger.log(`[${symbol}] Respuesta recibida de Gemini. Decisión: ${iaResponse.decision} en ${latency}ms`);
                await this.supabaseService.logGeminiDecision(symbol, marketContext, iaResponse.decision, iaResponse, latency);
                if (iaResponse.decision !== 'OPEN_LONG' && iaResponse.decision !== 'OPEN_SHORT') {
                    this.logger.log(`[${symbol}] La IA decidió HOLD o no operar. Fin del análisis.`);
                    continue;
                }
                const side = iaResponse.decision === 'OPEN_LONG' ? 'buy' : 'sell';
                const riskValidation = this.riskService.validateTradeProposal(symbol, side, {
                    leverage: iaResponse.leverage,
                    entryPriceTarget: iaResponse.entryPriceTarget,
                    stopLoss: iaResponse.stopLoss,
                    takeProfit: iaResponse.takeProfit,
                }, balance, {
                    allowedSymbols,
                    maxLeverage,
                    maxRiskPerTradePercent: parseFloat(maxRiskPerTradePercent.toString()),
                    maxMarginUsagePercent: parseFloat(maxMarginUsagePercent.toString()),
                    minRiskToRewardRatio: parseFloat(minRiskToRewardRatio.toString()),
                });
                if (!riskValidation.isValid) {
                    this.logger.warn(`[${symbol}] Operación RECHAZADA por el Motor de Riesgos. Razón: ${riskValidation.reason}`);
                    continue;
                }
                const { calculatedAmount, calculatedLeverage } = riskValidation;
                this.logger.log(`[${symbol}] Operación APROBADA. Ejecutando: ${side.toUpperCase()} | Cantidad: ${calculatedAmount} | Apalancamiento: ${calculatedLeverage}x`);
                await this.binanceService.setMarginMode(symbol, 'isolated');
                await this.binanceService.setLeverage(symbol, calculatedLeverage);
                await this.binanceService.cancelAllOrders(symbol);
                const entryOrder = await this.binanceService.openMarketPosition(symbol, side, calculatedAmount);
                this.logger.log(`[${symbol}] Orden de mercado colocada exitosamente. ID: ${entryOrder.id}`);
                const exitOrders = await this.binanceService.setExitOrders(symbol, side, iaResponse.stopLoss, iaResponse.takeProfit);
                this.logger.log(`[${symbol}] Órdenes de SL (${iaResponse.stopLoss}) y TP (${iaResponse.takeProfit}) colocadas.`);
                await this.supabaseService.logTradeOpen(symbol, side, iaResponse.entryPriceTarget, calculatedAmount, calculatedLeverage, iaResponse.stopLoss, iaResponse.takeProfit, entryOrder.id);
                this.logger.log(`[${symbol}] Ciclo de trade ejecutado y guardado en base de datos con éxito.`);
            }
            catch (error) {
                this.logger.error(`Error procesando ciclo de trading para ${symbol}`, error.stack);
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        this.logger.log('--- Fin del Ciclo de Trading ---');
    }
};
exports.StrategyService = StrategyService;
exports.StrategyService = StrategyService = StrategyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [binance_service_1.BinanceService,
        gemini_service_1.GeminiService,
        risk_service_1.RiskService,
        supabase_service_1.SupabaseService])
], StrategyService);
//# sourceMappingURL=strategy.service.js.map