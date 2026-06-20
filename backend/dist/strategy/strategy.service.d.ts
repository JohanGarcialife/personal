import { OnModuleInit } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { GeminiService } from '../gemini/gemini.service';
import { RiskService } from '../risk/risk.service';
import { SupabaseService } from '../supabase/supabase.service';
export declare class StrategyService implements OnModuleInit {
    private readonly binanceService;
    private readonly geminiService;
    private readonly riskService;
    private readonly supabaseService;
    private readonly logger;
    private intervalId;
    constructor(binanceService: BinanceService, geminiService: GeminiService, riskService: RiskService, supabaseService: SupabaseService);
    onModuleInit(): void;
    private scheduleNextHourlyCycle;
    executeCycle(): Promise<void>;
}
