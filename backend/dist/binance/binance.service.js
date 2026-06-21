"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BinanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ccxt = __importStar(require("ccxt"));
const supabase_service_1 = require("../supabase/supabase.service");
let BinanceService = BinanceService_1 = class BinanceService {
    configService;
    supabaseService;
    logger = new common_1.Logger(BinanceService_1.name);
    client;
    constructor(configService, supabaseService) {
        this.configService = configService;
        this.supabaseService = supabaseService;
    }
    onModuleInit() {
        const apiKey = this.configService.get('BINANCE_API_KEY');
        const secret = this.configService.get('BINANCE_API_SECRET');
        const useTestnet = this.configService.get('BINANCE_USE_TESTNET') === 'true';
        this.logger.log(`Inicializando cliente de Binance Futures. Testnet: ${useTestnet}`);
        const config = {
            apiKey: apiKey,
            secret: secret,
            enableRateLimit: true,
            options: {
                defaultType: 'future',
            },
        };
        this.client = new ccxt.binanceusdm(config);
        if (useTestnet) {
            this.logger.log('Habilitando Demo Trading (Simulación de Binance) en el cliente CCXT.');
            this.client.enableDemoTrading(true);
        }
    }
    getClient() {
        return this.client;
    }
    resolveSymbol(symbol) {
        if (symbol && !symbol.includes(':') && symbol.endsWith('/USDT')) {
            return `${symbol}:USDT`;
        }
        return symbol;
    }
    async getBalance() {
        try {
            const balance = await this.client.fetchBalance();
            const usdt = balance['USDT'];
            if (!usdt) {
                return { total: 0, free: 0 };
            }
            return {
                total: parseFloat(usdt.total?.toString() || '0'),
                free: parseFloat(usdt.free?.toString() || '0'),
            };
        }
        catch (error) {
            this.logger.error('Error al obtener balance de Binance Futures', error.stack);
            throw error;
        }
    }
    async getTickerPrice(symbol) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            const ticker = await this.client.fetchTicker(resolvedSymbol);
            return ticker.last ? parseFloat(ticker.last.toString()) : 0;
        }
        catch (error) {
            this.logger.error(`Error al obtener precio de ticker para ${resolvedSymbol} (original: ${symbol})`, error.stack);
            throw error;
        }
    }
    async getKlines(symbol, timeframe = '15m', limit = 50) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            return await this.client.fetchOHLCV(resolvedSymbol, timeframe, undefined, limit);
        }
        catch (error) {
            this.logger.error(`Error al obtener klines para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async setLeverage(symbol, leverage) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            this.logger.log(`Configurando apalancamiento a ${leverage}x para ${resolvedSymbol}`);
            return await this.client.setLeverage(leverage, resolvedSymbol);
        }
        catch (error) {
            if (error.message && error.message.includes('No need to change leverage')) {
                return;
            }
            this.logger.error(`Error al configurar apalancamiento para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async setMarginMode(symbol, mode = 'isolated') {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            this.logger.log(`Configurando modo de margen a ${mode.toUpperCase()} para ${resolvedSymbol}`);
            return await this.client.setMarginMode(mode.toUpperCase(), resolvedSymbol);
        }
        catch (error) {
            if (error.message && (error.message.includes('No need to change margin type') || error.message.includes('margin type no change'))) {
                return;
            }
            this.logger.error(`Error al configurar modo de margen para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async openMarketPosition(symbol, side, amount) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            this.logger.log(`Abriendo posición MARKET ${side.toUpperCase()} para ${resolvedSymbol}. Cantidad: ${amount}`);
            return await this.client.createOrder(resolvedSymbol, 'market', side, amount);
        }
        catch (error) {
            this.logger.error(`Error al abrir posición mercado para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async setExitOrders(symbol, side, stopLossPrice, takeProfitPrice) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        const exitSide = side === 'buy' ? 'sell' : 'buy';
        try {
            this.logger.log(`Configurando salidas para ${resolvedSymbol}. SL: ${stopLossPrice}, TP: ${takeProfitPrice}`);
            const stopLossOrder = await this.client.createOrder(resolvedSymbol, 'STOP_MARKET', exitSide, undefined, undefined, {
                stopPrice: stopLossPrice,
                closePosition: true,
            });
            const takeProfitOrder = await this.client.createOrder(resolvedSymbol, 'TAKE_PROFIT_MARKET', exitSide, undefined, undefined, {
                stopPrice: takeProfitPrice,
                closePosition: true,
            });
            return { stopLossOrder, takeProfitOrder };
        }
        catch (error) {
            this.logger.error(`Error al configurar órdenes de salida para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async getOpenPositions() {
        try {
            const positions = await this.client.fetchPositions();
            const openPositions = positions.filter((pos) => Math.abs(parseFloat(pos.info?.positionAmt || '0')) > 0);
            const normalized = [];
            for (const pos of openPositions) {
                const unrealizedPnl = parseFloat(pos.unrealizedPnl?.toString() || '0') ||
                    parseFloat(pos.info?.unrealizedProfit || '0') ||
                    0;
                const positionAmt = parseFloat(pos.info?.positionAmt || '0');
                const contracts = Math.abs(positionAmt);
                const side = positionAmt > 0 ? 'long' : 'short';
                const entryPrice = parseFloat(pos.entryPrice?.toString() || pos.info?.entryPrice || '0');
                const markPrice = parseFloat(pos.markPrice?.toString() || pos.info?.markPrice || '0');
                const initialMargin = parseFloat(pos.initialMargin?.toString() || pos.info?.initialMargin || '0');
                const leverage = parseFloat(pos.leverage?.toString() || pos.info?.leverage || '1');
                const cleanSymbol = pos.symbol.split(':')[0];
                const entry = {
                    symbol: pos.symbol,
                    cleanSymbol,
                    side,
                    contracts,
                    entryPrice,
                    markPrice,
                    initialMargin,
                    leverage,
                    unrealizedPnl,
                    stopLoss: null,
                    takeProfit: null,
                };
                try {
                    const { data: activeTrade } = await this.supabaseService.getClient()
                        .from('trade_logs')
                        .select('stop_loss, take_profit')
                        .eq('symbol', cleanSymbol)
                        .eq('status', 'OPEN')
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (activeTrade && activeTrade.length > 0) {
                        entry.stopLoss = activeTrade[0].stop_loss;
                        entry.takeProfit = activeTrade[0].take_profit;
                    }
                }
                catch (dbErr) {
                    this.logger.warn(`No se pudo enriquecer posición ${pos.symbol} con SL/TP: ${dbErr.message}`);
                }
                normalized.push(entry);
            }
            return normalized;
        }
        catch (error) {
            this.logger.error('Error al obtener posiciones abiertas', error.stack);
            throw error;
        }
    }
    async cancelAllOrders(symbol) {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            this.logger.log(`Cancelando todas las órdenes pendientes para ${resolvedSymbol}`);
            return await this.client.cancelAllOrders(resolvedSymbol);
        }
        catch (error) {
            this.logger.error(`Error al cancelar órdenes para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
    async closeMarketPosition(symbol, exitTrigger = 'MANUAL_CLOSE') {
        const resolvedSymbol = this.resolveSymbol(symbol);
        try {
            this.logger.log(`Solicitud de cierre de posición de mercado para ${resolvedSymbol} (Trigger: ${exitTrigger})`);
            const positions = await this.client.fetchPositions();
            const pos = positions.find((p) => p.symbol === resolvedSymbol || p.symbol === symbol);
            if (!pos) {
                throw new Error(`No se encontró ninguna posición abierta para el par ${symbol}`);
            }
            const positionAmt = parseFloat(pos.info?.positionAmt || '0');
            const amount = Math.abs(positionAmt);
            if (amount === 0) {
                throw new Error(`La posición para ${symbol} ya está cerrada.`);
            }
            const side = positionAmt > 0 ? 'sell' : 'buy';
            this.logger.log(`Cerrando posición ${positionAmt > 0 ? 'LONG' : 'SHORT'} para ${resolvedSymbol}. Cantidad: ${amount}`);
            await this.cancelAllOrders(resolvedSymbol);
            const closeOrder = await this.client.createOrder(resolvedSymbol, 'market', side, amount);
            try {
                const { data: openTrades } = await this.supabaseService.getClient()
                    .from('trade_logs')
                    .select('id')
                    .eq('symbol', symbol)
                    .eq('status', 'OPEN')
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (openTrades && openTrades.length > 0) {
                    await this.supabaseService.logTradeClose(openTrades[0].id, 0, undefined, undefined, exitTrigger);
                }
            }
            catch (dbErr) {
                this.logger.warn(`No se pudo actualizar trade_logs en Supabase: ${dbErr.message}`);
            }
            return closeOrder;
        }
        catch (error) {
            this.logger.error(`Error al cerrar posición de mercado para ${resolvedSymbol}`, error.stack);
            throw error;
        }
    }
};
exports.BinanceService = BinanceService;
exports.BinanceService = BinanceService = BinanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        supabase_service_1.SupabaseService])
], BinanceService);
//# sourceMappingURL=binance.service.js.map