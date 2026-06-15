import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
export declare class SupabaseService implements OnModuleInit {
    private configService;
    private readonly logger;
    private client;
    constructor(configService: ConfigService);
    onModuleInit(): void;
    getClient(): SupabaseClient;
    getSettings(): Promise<any>;
    logGeminiDecision(symbol: string, promptPayload: any, decision: string, rawResponse: any, responseTimeMs: number): Promise<void>;
    logTradeOpen(symbol: string, side: 'buy' | 'sell', entryPrice: number, amount: number, leverage: number, stopLoss: number, takeProfit: number, entryOrderId: string): Promise<string | null>;
    logTradeClose(id: string, pnl: number, slOrderId?: string, tpOrderId?: string, exitTrigger?: string): Promise<void>;
}
