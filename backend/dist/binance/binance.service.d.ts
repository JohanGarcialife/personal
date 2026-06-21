import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ccxt from 'ccxt';
import { SupabaseService } from '../supabase/supabase.service';
export declare class BinanceService implements OnModuleInit {
    private configService;
    private supabaseService;
    private readonly logger;
    private client;
    constructor(configService: ConfigService, supabaseService: SupabaseService);
    onModuleInit(): void;
    getClient(): ccxt.binanceusdm;
    resolveSymbol(symbol: string): string;
    getBalance(): Promise<{
        total: number;
        free: number;
    }>;
    getTickerPrice(symbol: string): Promise<number>;
    getKlines(symbol: string, timeframe?: string, limit?: number): Promise<ccxt.OHLCV[]>;
    setLeverage(symbol: string, leverage: number): Promise<any>;
    setMarginMode(symbol: string, mode?: 'isolated' | 'crossed'): Promise<any>;
    openMarketPosition(symbol: string, side: 'buy' | 'sell', amount: number): Promise<any>;
    setExitOrders(symbol: string, side: 'buy' | 'sell', stopLossPrice: number, takeProfitPrice: number): Promise<{
        stopLossOrder: any;
        takeProfitOrder: any;
    }>;
    getOpenPositions(): Promise<any[]>;
    cancelAllOrders(symbol: string): Promise<any>;
    closeMarketPosition(symbol: string, exitTrigger?: string): Promise<any>;
}
