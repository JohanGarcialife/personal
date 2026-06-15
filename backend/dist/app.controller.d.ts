import { AppService } from './app.service';
import { BinanceService } from './binance/binance.service';
import { GeminiService } from './gemini/gemini.service';
import { RiskService } from './risk/risk.service';
import { StrategyService } from './strategy/strategy.service';
export declare class AppController {
    private readonly appService;
    private readonly binanceService;
    private readonly geminiService;
    private readonly riskService;
    private readonly strategyService;
    constructor(appService: AppService, binanceService: BinanceService, geminiService: GeminiService, riskService: RiskService, strategyService: StrategyService);
    getHello(): string;
    getBalance(): Promise<{
        success: boolean;
        data: {
            total: number;
            free: number;
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    testTrade(symbol?: string): Promise<{
        success: boolean;
        message: string;
        data: {
            currentPrice: number;
            amount: number;
            stopLossPrice: number;
            takeProfitPrice: number;
            entryOrder: any;
            exitOrders: {
                stopLossOrder: any;
                takeProfitOrder: any;
            };
            balanceBefore: {
                total: number;
                free: number;
            };
            balanceAfter: {
                total: number;
                free: number;
            };
        };
        error?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        error: any;
        stack: any;
        message?: undefined;
        data?: undefined;
    }>;
    testAnalyze(symbol?: string): Promise<{
        success: boolean;
        data: {
            geminiDecision: import("./gemini/gemini.service").TradingDecision;
            riskValidation: import("./risk/risk.service").RiskValidationResult | null;
        };
        error?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        error: any;
        stack: any;
        data?: undefined;
    }>;
    executeStrategy(): Promise<{
        success: boolean;
        message: string;
        error?: undefined;
        stack?: undefined;
    } | {
        success: boolean;
        error: any;
        stack: any;
        message?: undefined;
    }>;
    getPositions(): Promise<{
        success: boolean;
        data: any[];
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    closePosition(symbol: string): Promise<{
        success: boolean;
        message: string;
        data: any;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        data?: undefined;
    }>;
}
