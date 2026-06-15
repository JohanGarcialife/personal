import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { GeminiModule } from '../gemini/gemini.module';
import { RiskModule } from '../risk/risk.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { StrategyService } from './strategy.service';

@Module({
  imports: [BinanceModule, GeminiModule, RiskModule, SupabaseModule],
  providers: [StrategyService],
  exports: [StrategyService],
})
export class StrategyModule {}
