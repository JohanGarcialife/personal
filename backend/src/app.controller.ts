import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { BinanceService } from './binance/binance.service';
import { GeminiService } from './gemini/gemini.service';
import { RiskService } from './risk/risk.service';
import { StrategyService } from './strategy/strategy.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly binanceService: BinanceService,
    private readonly geminiService: GeminiService,
    private readonly riskService: RiskService,
    private readonly strategyService: StrategyService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('binance/balance')
  async getBalance() {
    try {
      const balance = await this.binanceService.getBalance();
      return {
        success: true,
        data: balance,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('binance/test-trade')
  async testTrade(@Query('symbol') symbol = 'BNB/USDT') {
    try {
      // 1. Obtener balance actual
      const balanceBefore = await this.binanceService.getBalance();
      
      // 2. Obtener precio actual para calcular stop loss y take profit
      const currentPrice = await this.binanceService.getTickerPrice(symbol);
      
      // Configurar modo de margen a aislado y apalancamiento a 5x
      await this.binanceService.setMarginMode(symbol, 'isolated');
      await this.binanceService.setLeverage(symbol, 5);

      // 3. Definir parámetros
      // Para BNB/USDT en testnet, el tamaño mínimo suele ser 0.01 o 0.1. Usaremos 0.05 BNB (unos $30 USD nocional, con 5x apalancamiento requiere $6 USD de margen)
      const amount = 0.05; 
      const side = 'buy'; // LONG
      
      // SL a 1% de distancia, TP a 2% de distancia
      const stopLossPrice = parseFloat((currentPrice * 0.99).toFixed(2));
      const takeProfitPrice = parseFloat((currentPrice * 1.02).toFixed(2));

      // 4. Cancelar órdenes previas abiertas de este símbolo para evitar conflictos
      await this.binanceService.cancelAllOrders(symbol);

      // 5. Abrir la posición de mercado (LONG)
      const entryOrder = await this.binanceService.openMarketPosition(symbol, side, amount);

      // 6. Colocar Stop Loss y Take Profit
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
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('gemini/test-analyze')
  async testAnalyze(@Query('symbol') symbol = 'BTC/USDT') {
    try {
      // Prompt maestro simplificado de prueba
      const promptMaster = `
- Solo abre posiciones en pares altamente líquidos (ej: BTC/USDT, ETH/USDT, BNB/USDT).
- NUNCA abras posiciones con más del 2% de riesgo por operación.
- El RSI debe estar sobrevendido (<35) para LONG o sobrecomprado (>65) para SHORT para confirmar divergencias fuertes.
- Si las EMAs 20 y 50 están muy juntas, opera con cautela.
- Define siempre Stop Loss y Take Profit lógicos en base a soportes y resistencias visuales (1:2 ratio de riesgo/beneficio mínimo).
`;

      // Escenario mockeado para testear el razonamiento de la IA
      const mockMarketContext = {
        price: 65000,
        balance: 1000,
        indicators: {
          rsi: 28, // Sobrevendido
          macd: { macd: -5.4, signal: -7.2, histogram: 1.8 }, // Histograma cruzando al alza
          ema20: 64800,
          ema50: 65200,
        },
        recentKlines: [
          [1700000000000, 65200, 65300, 64900, 65000, 10.5], // [time, open, high, low, close, volume]
          [1700000060000, 65000, 65100, 64800, 64950, 12.3],
          [1700000120000, 64950, 65050, 64750, 65000, 15.1],
        ],
      };

      const decision = await this.geminiService.analyzeMarket(
        symbol,
        mockMarketContext,
        promptMaster,
      );

      // Si la decisión es abrir una posición (LONG o SHORT), la evaluamos con el motor de riesgos
      let riskValidation = null;
      if (decision.decision === 'OPEN_LONG' || decision.decision === 'OPEN_SHORT') {
        const side = decision.decision === 'OPEN_LONG' ? 'buy' : 'sell';
        const balance = { total: 1000, free: 800 }; // Escenario mock de balance
        riskValidation = this.riskService.validateTradeProposal(
          symbol,
          side,
          {
            leverage: decision.leverage,
            entryPriceTarget: decision.entryPriceTarget,
            stopLoss: decision.stopLoss,
            takeProfit: decision.takeProfit,
          },
          balance,
        );
      }

      return {
        success: true,
        data: {
          geminiDecision: decision,
          riskValidation,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('strategy/execute')
  async executeStrategy() {
    try {
      await this.strategyService.executeCycle();
      return {
        success: true,
        message: 'Ciclo de estrategia de simulación ejecutado con éxito. Revisa los logs de NestJS y Supabase para ver las órdenes.',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('binance/positions')
  async getPositions() {
    try {
      const positions = await this.binanceService.getOpenPositions();
      return {
        success: true,
        data: positions,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('binance/close')
  async closePosition(@Query('symbol') symbol: string) {
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
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
