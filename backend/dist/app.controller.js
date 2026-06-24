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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const binance_service_1 = require("./binance/binance.service");
const gemini_service_1 = require("./gemini/gemini.service");
const risk_service_1 = require("./risk/risk.service");
const strategy_service_1 = require("./strategy/strategy.service");
let AppController = class AppController {
    appService;
    binanceService;
    geminiService;
    riskService;
    strategyService;
    constructor(appService, binanceService, geminiService, riskService, strategyService) {
        this.appService = appService;
        this.binanceService = binanceService;
        this.geminiService = geminiService;
        this.riskService = riskService;
        this.strategyService = strategyService;
    }
    getHello() {
        return this.appService.getHello();
    }
    async getBalance() {
        try {
            const balance = await this.binanceService.getBalance();
            return {
                success: true,
                data: balance,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async testTrade(symbol = 'BNB/USDT') {
        try {
            const balanceBefore = await this.binanceService.getBalance();
            const currentPrice = await this.binanceService.getTickerPrice(symbol);
            await this.binanceService.setMarginMode(symbol, 'isolated');
            await this.binanceService.setLeverage(symbol, 5);
            const amount = 0.05;
            const side = 'buy';
            const stopLossPrice = parseFloat((currentPrice * 0.99).toFixed(2));
            const takeProfitPrice = parseFloat((currentPrice * 1.02).toFixed(2));
            await this.binanceService.cancelAllOrders(symbol);
            const entryOrder = await this.binanceService.openMarketPosition(symbol, side, amount);
            const exitOrders = await this.binanceService.setExitOrders(symbol, side, stopLossPrice, takeProfitPrice);
            const balanceAfter = await this.binanceService.getBalance();
            return {
                success: true,
                message: `Posición LONG abierta exitosamente en ${symbol}`,
                data: {
                    currentPrice,
                    amount,
                    stopLossPrice,
                    takeProfitPrice,
                    entryOrder,
                    exitOrders,
                    balanceBefore,
                    balanceAfter,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                stack: error.stack,
            };
        }
    }
    async testAnalyze(symbol = 'BTC/USDT') {
        try {
            const promptMaster = `
- Solo abre posiciones en pares altamente líquidos (ej: BTC/USDT, ETH/USDT, BNB/USDT).
- NUNCA abras posiciones con más del 2% de riesgo por operación.
- El RSI debe estar sobrevendido (<35) para LONG o sobrecomprado (>65) para SHORT para confirmar divergencias fuertes.
- Si las EMAs 20 y 50 están muy juntas, opera con cautela.
- Define siempre Stop Loss y Take Profit lógicos en base a soportes y resistencias visuales (1:2 ratio de riesgo/beneficio mínimo).
`;
            const mockMarketContext = {
                price: 65000,
                balance: 1000,
                indicators: {
                    rsi: 28,
                    macd: { macd: -5.4, signal: -7.2, histogram: 1.8 },
                    ema20: 64800,
                    ema50: 65200,
                },
                recentKlines: [
                    [1700000000000, 65200, 65300, 64900, 65000, 10.5],
                    [1700000060000, 65000, 65100, 64800, 64950, 12.3],
                    [1700000120000, 64950, 65050, 64750, 65000, 15.1],
                ],
            };
            const decision = await this.geminiService.analyzeMarket(symbol, mockMarketContext, promptMaster);
            let riskValidation = null;
            if (decision.decision === 'OPEN_LONG' || decision.decision === 'OPEN_SHORT') {
                const side = decision.decision === 'OPEN_LONG' ? 'buy' : 'sell';
                const balance = { total: 1000, free: 800 };
                riskValidation = this.riskService.validateTradeProposal(symbol, side, {
                    leverage: decision.leverage,
                    entryPriceTarget: decision.entryPriceTarget,
                    stopLoss: decision.stopLoss,
                    takeProfit: decision.takeProfit,
                }, balance);
            }
            return {
                success: true,
                data: {
                    geminiDecision: decision,
                    riskValidation,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                stack: error.stack,
            };
        }
    }
    async executeStrategy() {
        try {
            this.strategyService.executeCycle().catch((err) => {
            });
            return {
                success: true,
                message: 'Ciclo de análisis manual iniciado en segundo plano con éxito.',
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                stack: error.stack,
            };
        }
    }
    async getPositions() {
        try {
            const positions = await this.binanceService.getOpenPositions();
            return {
                success: true,
                data: positions,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async closePosition(symbol) {
        try {
            if (!symbol) {
                throw new Error('Símbolo es requerido. Ejemplo: ?symbol=BTC/USDT');
            }
            const closeOrder = await this.binanceService.closeMarketPosition(symbol);
            return {
                success: true,
                message: `Posición para ${symbol} cerrada con éxito.`,
                data: closeOrder,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Get)('binance/balance'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Get)('binance/test-trade'),
    __param(0, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "testTrade", null);
__decorate([
    (0, common_1.Get)('gemini/test-analyze'),
    __param(0, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "testAnalyze", null);
__decorate([
    (0, common_1.Get)('strategy/execute'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "executeStrategy", null);
__decorate([
    (0, common_1.Get)('binance/positions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getPositions", null);
__decorate([
    (0, common_1.Get)('binance/close'),
    __param(0, (0, common_1.Query)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "closePosition", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        binance_service_1.BinanceService,
        gemini_service_1.GeminiService,
        risk_service_1.RiskService,
        strategy_service_1.StrategyService])
], AppController);
//# sourceMappingURL=app.controller.js.map