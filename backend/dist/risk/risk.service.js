"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RiskService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
const common_1 = require("@nestjs/common");
let RiskService = RiskService_1 = class RiskService {
    logger = new common_1.Logger(RiskService_1.name);
    defaultConfig = {
        allowedSymbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT'],
        maxLeverage: 10,
        maxRiskPerTradePercent: 2,
        maxMarginUsagePercent: 25,
        minRiskToRewardRatio: 1.2,
    };
    validateTradeProposal(symbol, side, proposal, accountBalance, customConfig) {
        const config = { ...this.defaultConfig, ...customConfig };
        this.logger.log(`Iniciando evaluación de riesgos para propuesta en ${symbol} (${side.toUpperCase()})`);
        if (!config.allowedSymbols.includes(symbol)) {
            return {
                isValid: false,
                reason: `El símbolo ${symbol} no está en la lista de pares permitidos: ${config.allowedSymbols.join(', ')}`,
            };
        }
        const { entryPriceTarget, stopLoss, takeProfit, leverage } = proposal;
        if (side === 'buy') {
            if (stopLoss >= entryPriceTarget) {
                return {
                    isValid: false,
                    reason: `Consistencia rota para LONG: El Stop Loss (${stopLoss}) debe ser menor que el precio de entrada (${entryPriceTarget})`,
                };
            }
            if (takeProfit <= entryPriceTarget) {
                return {
                    isValid: false,
                    reason: `Consistencia rota para LONG: El Take Profit (${takeProfit}) debe ser mayor que el precio de entrada (${entryPriceTarget})`,
                };
            }
        }
        else {
            if (stopLoss <= entryPriceTarget) {
                return {
                    isValid: false,
                    reason: `Consistencia rota para SHORT: El Stop Loss (${stopLoss}) debe ser mayor que el precio de entrada (${entryPriceTarget})`,
                };
            }
            if (takeProfit >= entryPriceTarget) {
                return {
                    isValid: false,
                    reason: `Consistencia rota para SHORT: El Take Profit (${takeProfit}) debe ser menor que el precio de entrada (${entryPriceTarget})`,
                };
            }
        }
        const riskPriceDiff = Math.abs(entryPriceTarget - stopLoss);
        const rewardPriceDiff = Math.abs(entryPriceTarget - takeProfit);
        if (riskPriceDiff === 0) {
            return { isValid: false, reason: 'El Stop Loss no puede ser igual al precio de entrada.' };
        }
        const riskToRewardRatio = rewardPriceDiff / riskPriceDiff;
        if (riskToRewardRatio < config.minRiskToRewardRatio) {
            return {
                isValid: false,
                reason: `Ratio Riesgo/Beneficio insuficiente. Propuesto: ${riskToRewardRatio.toFixed(2)}, Requerido: ${config.minRiskToRewardRatio}`,
            };
        }
        const stopLossDistancePercent = riskPriceDiff / entryPriceTarget;
        if (stopLossDistancePercent < 0.003) {
            return {
                isValid: false,
                reason: `El Stop Loss está demasiado cerca del precio de entrada (${(stopLossDistancePercent * 100).toFixed(2)}%). Distancia mínima permitida: 0.3%`,
            };
        }
        const adjustedLeverage = Math.min(leverage, config.maxLeverage);
        if (adjustedLeverage !== leverage) {
            this.logger.warn(`Apalancamiento propuesto de ${leverage}x fue limitado a ${adjustedLeverage}x por políticas de riesgo.`);
        }
        const maxLossAmountUsd = accountBalance.total * (config.maxRiskPerTradePercent / 100);
        let positionSizeUsd = maxLossAmountUsd / stopLossDistancePercent;
        let estimatedMarginRequired = positionSizeUsd / adjustedLeverage;
        const maxMarginAllowed = accountBalance.free * (config.maxMarginUsagePercent / 100);
        if (estimatedMarginRequired > maxMarginAllowed) {
            this.logger.warn(`Margen requerido estimado ($${estimatedMarginRequired.toFixed(2)}) supera el límite permitido ($${maxMarginAllowed.toFixed(2)}, ${config.maxMarginUsagePercent}\% del balance libre). Ajustando tamaño de posición.`);
            estimatedMarginRequired = maxMarginAllowed;
            positionSizeUsd = estimatedMarginRequired * adjustedLeverage;
        }
        const calculatedAmount = parseFloat((positionSizeUsd / entryPriceTarget).toFixed(5));
        if (calculatedAmount <= 0) {
            return {
                isValid: false,
                reason: `El tamaño de posición calculado en moneda base es demasiado pequeño (0). Revisa el balance o la distancia al Stop Loss.`,
            };
        }
        this.logger.log(`Propuesta VALIDADA. Tamaño Posición Nocional: $${positionSizeUsd.toFixed(2)} USD. Margen: $${estimatedMarginRequired.toFixed(2)} USD. Cantidad Base: ${calculatedAmount}`);
        return {
            isValid: true,
            calculatedAmount,
            calculatedLeverage: adjustedLeverage,
            marginRequired: estimatedMarginRequired,
        };
    }
};
exports.RiskService = RiskService;
exports.RiskService = RiskService = RiskService_1 = __decorate([
    (0, common_1.Injectable)()
], RiskService);
//# sourceMappingURL=risk.service.js.map