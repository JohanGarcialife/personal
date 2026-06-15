import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ccxt from 'ccxt';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class BinanceService implements OnModuleInit {
  private readonly logger = new Logger(BinanceService.name);
  private client: ccxt.binanceusdm;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('BINANCE_API_KEY');
    const secret = this.configService.get<string>('BINANCE_API_SECRET');
    const useTestnet = this.configService.get<string>('BINANCE_USE_TESTNET') === 'true';

    this.logger.log(`Inicializando cliente de Binance Futures. Testnet: ${useTestnet}`);

    const config: any = {
      apiKey: apiKey,
      secret: secret,
      enableRateLimit: true,
      options: {
        defaultType: 'future',
      },
    };

    this.client = new ccxt.binanceusdm(config);

    if (useTestnet) {
      this.logger.log('Habilitando Demo Trading (Simulación de Binance) en el cliente CCXT.');
      this.client.enableDemoTrading(true);
    }
  }

  /**
   * Obtiene la instancia cruda de CCXT para operaciones complejas directas
   */
  getClient(): ccxt.binanceusdm {
    return this.client;
  }

  /**
   * Normaliza un símbolo estándar (ej: BTC/USDT) al formato requerido por CCXT en Binance Futures (ej: BTC/USDT:USDT)
   */
  private resolveSymbol(symbol: string): string {
    if (symbol && !symbol.includes(':') && symbol.endsWith('/USDT')) {
      return `${symbol}:USDT`;
    }
    return symbol;
  }

  /**
   * Obtiene el balance total y disponible de USDT en futuros
   */
  async getBalance(): Promise<{ total: number; free: number }> {
    try {
      const balance = await this.client.fetchBalance();
      const usdt = balance['USDT'];
      if (!usdt) {
        return { total: 0, free: 0 };
      }
      return {
        total: parseFloat(usdt.total?.toString() || '0'),
        free: parseFloat(usdt.free?.toString() || '0'),
      };
    } catch (error) {
      this.logger.error('Error al obtener balance de Binance Futures', error.stack);
      throw error;
    }
  }

  /**
   * Obtiene el precio actual de un par (ej. BTC/USDT)
   */
  async getTickerPrice(symbol: string): Promise<number> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      const ticker = await this.client.fetchTicker(resolvedSymbol);
      return ticker.last ? parseFloat(ticker.last.toString()) : 0;
    } catch (error) {
      this.logger.error(`Error al obtener precio de ticker para ${resolvedSymbol} (original: ${symbol})`, error.stack);
      throw error;
    }
  }

  /**
   * Obtiene las últimas velas (OHLCV) de un par
   */
  async getKlines(symbol: string, timeframe = '15m', limit = 50): Promise<ccxt.OHLCV[]> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      return await this.client.fetchOHLCV(resolvedSymbol, timeframe, undefined, limit);
    } catch (error) {
      this.logger.error(`Error al obtener klines para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Configura el apalancamiento para un símbolo específico
   */
  async setLeverage(symbol: string, leverage: number): Promise<any> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      this.logger.log(`Configurando apalancamiento a ${leverage}x para ${resolvedSymbol}`);
      return await this.client.setLeverage(leverage, resolvedSymbol);
    } catch (error) {
      if (error.message && error.message.includes('No need to change leverage')) {
        return;
      }
      this.logger.error(`Error al configurar apalancamiento para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Configura el modo de margen a AISLADO (ISOLATED) o CRUZADO (CROSSED)
   */
  async setMarginMode(symbol: string, mode: 'isolated' | 'crossed' = 'isolated'): Promise<any> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      this.logger.log(`Configurando modo de margen a ${mode.toUpperCase()} para ${resolvedSymbol}`);
      return await this.client.setMarginMode(mode.toUpperCase(), resolvedSymbol);
    } catch (error) {
      if (error.message && (error.message.includes('No need to change margin type') || error.message.includes('margin type no change'))) {
        return;
      }
      this.logger.error(`Error al configurar modo de margen para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Abre una posición de mercado (LONG o SHORT)
   */
  async openMarketPosition(symbol: string, side: 'buy' | 'sell', amount: number): Promise<any> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      this.logger.log(`Abriendo posición MARKET ${side.toUpperCase()} para ${resolvedSymbol}. Cantidad: ${amount}`);
      return await this.client.createOrder(resolvedSymbol, 'market', side, amount);
    } catch (error) {
      this.logger.error(`Error al abrir posición mercado para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Coloca órdenes condicionales de Stop Loss y Take Profit
   */
  async setExitOrders(
    symbol: string,
    side: 'buy' | 'sell',
    stopLossPrice: number,
    takeProfitPrice: number,
  ): Promise<{ stopLossOrder: any; takeProfitOrder: any }> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    const exitSide = side === 'buy' ? 'sell' : 'buy';
    try {
      this.logger.log(`Configurando salidas para ${resolvedSymbol}. SL: ${stopLossPrice}, TP: ${takeProfitPrice}`);

      const stopLossOrder = await this.client.createOrder(
        resolvedSymbol,
        'STOP_MARKET',
        exitSide,
        undefined as any,
        undefined,
        {
          stopPrice: stopLossPrice,
          closePosition: true,
        },
      );

      const takeProfitOrder = await this.client.createOrder(
        resolvedSymbol,
        'TAKE_PROFIT_MARKET',
        exitSide,
        undefined as any,
        undefined,
        {
          stopPrice: takeProfitPrice,
          closePosition: true,
        },
      );

      return { stopLossOrder, takeProfitOrder };
    } catch (error) {
      this.logger.error(`Error al configurar órdenes de salida para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Obtiene las posiciones de futuros actualmente abiertas
   */
  async getOpenPositions(): Promise<any[]> {
    try {
      const positions = await this.client.fetchPositions();
      return positions.filter(
        (pos) => parseFloat(pos.contracts?.toString() || '0') > 0 || parseFloat(pos.info?.positionAmt || '0') !== 0,
      );
    } catch (error) {
      this.logger.error('Error al obtener posiciones abiertas', error.stack);
      throw error;
    }
  }

  /**
   * Cancela todas las órdenes pendientes de un símbolo específico
   */
  async cancelAllOrders(symbol: string): Promise<any> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      this.logger.log(`Cancelando todas las órdenes pendientes para ${resolvedSymbol}`);
      return await this.client.cancelAllOrders(resolvedSymbol);
    } catch (error) {
      this.logger.error(`Error al cancelar órdenes para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }

  /**
   * Cierra una posición abierta mediante una orden de mercado inversa
   */
  async closeMarketPosition(symbol: string): Promise<any> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    try {
      this.logger.log(`Solicitud de cierre de posición de mercado para ${resolvedSymbol}`);
      
      const positions = await this.client.fetchPositions();
      const pos = positions.find(
        (p) => p.symbol === resolvedSymbol || p.symbol === symbol
      );

      if (!pos) {
        throw new Error(`No se encontró ninguna posición abierta para el par ${symbol}`);
      }

      const positionAmt = parseFloat(pos.info?.positionAmt || '0');
      const amount = Math.abs(positionAmt);
      
      if (amount === 0) {
        throw new Error(`La posición para ${symbol} ya está cerrada.`);
      }

      const side: 'buy' | 'sell' = positionAmt > 0 ? 'sell' : 'buy';
      this.logger.log(`Cerrando posición ${positionAmt > 0 ? 'LONG' : 'SHORT'} para ${resolvedSymbol}. Cantidad: ${amount}`);
      
      // Cancelar todas las órdenes pendientes asociadas para evitar SL/TP huérfanos
      await this.cancelAllOrders(resolvedSymbol);

      // Lanzar orden de mercado en la dirección contraria
      const closeOrder = await this.client.createOrder(resolvedSymbol, 'market', side, amount);

      // Si existe un registro de trade activo en Supabase, lo marcamos como cerrado
      try {
        const { data: openTrades } = await this.supabaseService.getClient()
          .from('trade_logs')
          .select('id')
          .eq('symbol', symbol)
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false })
          .limit(1);

        if (openTrades && openTrades.length > 0) {
          await this.supabaseService.logTradeClose(openTrades[0].id, 0, undefined, undefined, 'MANUAL_CLOSE');
        }
      } catch (dbErr) {
        this.logger.warn(`No se pudo actualizar trade_logs en Supabase: ${dbErr.message}`);
      }

      return closeOrder;
    } catch (error) {
      this.logger.error(`Error al cerrar posición de mercado para ${resolvedSymbol}`, error.stack);
      throw error;
    }
  }
}
