import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BinanceModule } from './binance/binance.module';
import { GeminiModule } from './gemini/gemini.module';
import { RiskModule } from './risk/risk.module';
import { SupabaseModule } from './supabase/supabase.module';
import { StrategyModule } from './strategy/strategy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BinanceModule,
    GeminiModule,
    RiskModule,
    SupabaseModule,
    StrategyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
