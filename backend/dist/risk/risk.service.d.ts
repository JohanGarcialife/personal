export interface RiskConfig {
    allowedSymbols: string[];
    maxLeverage: number;
    maxRiskPerTradePercent: number;
    maxMarginUsagePercent: number;
    minRiskToRewardRatio: number;
}
export interface RiskValidationResult {
    isValid: boolean;
    reason?: string;
    calculatedAmount?: number;
    calculatedLeverage?: number;
    marginRequired?: number;
}
export declare class RiskService {
    private readonly logger;
    private defaultConfig;
    validateTradeProposal(symbol: string, side: 'buy' | 'sell', proposal: {
        leverage: number;
        entryPriceTarget: number;
        stopLoss: number;
        takeProfit: number;
    }, accountBalance: {
        total: number;
        free: number;
    }, customConfig?: Partial<RiskConfig>): RiskValidationResult;
}
