import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface TradingDecision {
    decision: 'OPEN_LONG' | 'OPEN_SHORT' | 'HOLD' | 'CLOSE_POSITION';
    leverage: number;
    entryPriceTarget: number;
    stopLoss: number;
    takeProfit: number;
    confidenceScore: number;
    analysisReasoning: string;
}
export declare class GeminiService implements OnModuleInit {
    private configService;
    private readonly logger;
    private apiKey;
    private flashModelName;
    private proModelName;
    constructor(configService: ConfigService);
    onModuleInit(): void;
    private getTradingDecisionSchema;
    analyzeMarket(symbol: string, marketContext: {
        price: number;
        balance: number;
        indicators: {
            rsi: number;
            macd: {
                macd: number;
                signal: number;
                histogram: number;
            };
            ema20: number;
            ema50: number;
        };
        recentKlines: any[];
        openPosition?: any;
    }, promptMaster: string): Promise<TradingDecision>;
    analyzeMacroSentiment(marketOverview: string): Promise<string>;
}
