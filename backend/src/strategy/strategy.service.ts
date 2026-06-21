import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BinanceService } from '../binance/binance.service';
import { GeminiService } from '../gemini/gemini.service';
import { RiskService } from '../risk/risk.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RSI, EMA, MACD } from 'technicalindicators';

@Injectable()
export class StrategyService implements OnModuleInit {
  private readonly logger = new Logger(StrategyService.name);
  private intervalId: NodeJS.Timeout;

  constructor(
    private readonly binanceService: BinanceService,
    private readonly geminiService: GeminiService,
    private readonly riskService: RiskService,
    private readonly supabaseService: SupabaseService,
  ) {}

  onModuleInit() {
    this.logger.log('Inicializando ciclo de ejecución automatizado de la Estrategia...');
    
    // Ejecutar un ciclo inicial a los 10 segundos del arranque
    setTimeout(() => {
      this.executeCycle().catch((err) => {
        this.logger.error('Error durante la ejecución del ciclo inicial de estrategia', err.stack);
      });
    }, 10000);

    // Programar el ciclo periódico al inicio de la siguiente hora
    this.scheduleNextHourlyCycle();
  }

  /**
   * Calcula el tiempo restante hasta la próxima hora en punto y programa el siguiente ciclo.
   * Auto-corrige cualquier desfase temporal en cada iteración de manera recursiva.
   */
  private scheduleNextHourlyCycle() {
    const now = new Date();
    const msInHour = 3600000;
    
    const msPassedInCurrentHour = 
      (now.getMinutes() * 60 * 1000) + 
      (now.getSeconds() * 1000) + 
      now.getMilliseconds();
      
    const msUntilNextHour = msInHour - msPassedInCurrentHour;
    
    const targetHour = (now.getHours() + 1) % 24;
    const targetHourFormatted = targetHour.toString().padStart(2, '0');
    
    this.logger.log(
      `Próximo ciclo periódico programado en ${Math.round(msUntilNextHour / 1000 / 60)} minutos (exactamente a las ${targetHourFormatted}:00:00)`
    );

    this.intervalId = setTimeout(() => {
      this.executeCycle().catch((err) => {
        this.logger.error('Error durante la ejecución del ciclo periódico de estrategia', err.stack);
      });

      // Programar recursivamente la siguiente hora
      this.scheduleNextHourlyCycle();
    }, msUntilNextHour);
  }

  /**
   * Sincroniza las posiciones de la base de datos que se cerraron en Binance
   * (por ejemplo, al tocar Stop Loss, Take Profit o cierre manual fuera del bot)
   */
  async syncClosedPositions(openPositions: any[]): Promise<void> {
    try {
      this.logger.log('Iniciando sincronización de posiciones cerradas...');
      
      const { data: dbOpenTrades, error: dbError } = await this.supabaseService.getClient()
        .from('trade_logs')
        .select('*')
        .eq('status', 'OPEN');

      if (dbError) {
        this.logger.error('Error al obtener trades OPEN de Supabase:', dbError.message);
        return;
      }

      if (!dbOpenTrades || dbOpenTrades.length === 0) {
        return;
      }

      // Símbolos con posiciones abiertas reales en Binance
      const openSymbols = openPositions.map((pos) => pos.symbol.split(':')[0]);

      for (const dbTrade of dbOpenTrades) {
        const cleanSymbol = dbTrade.symbol.split(':')[0];

        // Si la posición sigue abierta en Binance, no sincronizar
        if (openSymbols.includes(cleanSymbol)) {
          continue;
        }

        this.logger.log(`[${cleanSymbol}] Detectada posición cerrada en Binance (ID DB: ${dbTrade.id}). Sincronizando...`);

        try {
          const resolvedSymbol = this.binanceService.resolveSymbol(dbTrade.symbol);
          const binanceTrades = await this.binanceService.getClient().fetchMyTrades(resolvedSymbol, undefined, 20);
          
          const tradeCreatedAt = new Date(dbTrade.created_at).getTime();
          const closingTrades = binanceTrades.filter((t) => {
            const tTime = t.timestamp || 0;
            const pnl = parseFloat(t.info?.realizedPnl || '0');
            // Trades posteriores a la apertura con PNL realizado no nulo
            return tTime >= (tradeCreatedAt - 60000) && pnl !== 0;
          });

          if (closingTrades.length > 0) {
            let totalPnL = 0;
            let lastClosedAt: number | null = null;

            for (const ct of closingTrades) {
              totalPnL += parseFloat(ct.info?.realizedPnl || '0');
              const ctTime = ct.timestamp || 0;
              if (!lastClosedAt || ctTime > lastClosedAt) {
                lastClosedAt = ctTime;
              }
            }

            await this.supabaseService.logTradeClose(
              dbTrade.id,
              totalPnL,
              undefined,
              undefined,
              'LIMIT_OR_STOP_ORDER'
            );

            // Actualizar la fecha de cierre exacta si la tenemos
            if (lastClosedAt) {
              await this.supabaseService.getClient()
                .from('trade_logs')
                .update({ closed_at: new Date(lastClosedAt).toISOString() })
                .eq('id', dbTrade.id);
            }

            this.logger.log(`[${cleanSymbol}] Posición sincronizada como CERRADA con PNL: ${totalPnL} USDT.`);
          } else {
            // Cierre preventivo con PNL 0 si no se encuentran trades en Binance
            await this.supabaseService.logTradeClose(
              dbTrade.id,
              0,
              undefined,
              undefined,
              'UNKNOWN_CLOSE'
            );
            this.logger.log(`[${cleanSymbol}] Posición cerrada sin trades de PNL encontrados en Binance. Marcada como CERRADA con PNL 0.`);
          }
        } catch (syncErr) {
          this.logger.error(`Error al sincronizar par ${cleanSymbol}:`, syncErr.stack);
        }
      }
    } catch (error) {
      this.logger.error('Error general en sincronización de posiciones cerradas:', error.stack);
    }
  }

  /**
   * Ejecuta un ciclo completo de análisis, consulta a la IA y trading de simulación
   */
  async executeCycle(): Promise<void> {
    this.logger.log('--- Iniciando Ciclo de Trading Automatizado ---');

    // 1. Obtener configuraciones dinámicas desde Supabase
    const settings = await this.supabaseService.getSettings();
    if (!settings) {
      this.logger.warn('No se pudo cargar la configuración de Supabase. Omitiendo ciclo.');
      return;
    }

    // Verificar Kill Switch
    if (!settings.is_active) {
      this.logger.log('El Bot está desactivado (Kill Switch = Off). Omitiendo ciclo.');
      return;
    }

    const {
      allowed_symbols: allowedSymbols,
      max_risk_per_trade_percent: maxRiskPerTradePercent,
      max_margin_usage_percent: maxMarginUsagePercent,
      min_risk_to_reward_ratio: minRiskToRewardRatio,
      max_leverage: maxLeverage,
      prompt_master: promptMaster,
    } = settings;

    // 2. Consultar balance disponible en Binance Futures Demo
    let balance: { total: number; free: number };
    try {
      balance = await this.binanceService.getBalance();
      this.logger.log(`Balance obtenido: Total = ${balance.total} USDT | Libre = ${balance.free} USDT`);
    } catch (error) {
      this.logger.error('Error al consultar balance. Cancelando ciclo.', error.stack);
      return;
    }

    // 3. Consultar posiciones abiertas actuales en Binance
    let openPositions: any[] = [];
    try {
      openPositions = await this.binanceService.getOpenPositions();
      this.logger.log(`Posiciones abiertas actuales: ${openPositions.length}`);
      
      // Sincronizar posiciones cerradas en la base de datos antes de analizar
      await this.syncClosedPositions(openPositions);
    } catch (error) {
      this.logger.error('Error al obtener posiciones abiertas. Cancelando ciclo.', error.stack);
      return;
    }

    // 4. Analizar cada símbolo permitido
    for (const symbol of allowedSymbols) {
      try {
        this.logger.log(`[${symbol}] Analizando par...`);

        // Obtener velas (klines) - 50 velas de 1 hora
        const klines = await this.binanceService.getKlines(symbol, '1h', 50);
        if (klines.length < 30) {
          this.logger.warn(`[${symbol}] No hay suficientes velas para calcular indicadores (${klines.length}).`);
          continue;
        }

        // Extraer precios de cierre
        const closePrices = klines.map((k) => parseFloat(k[4]?.toString() || '0'));
        const currentPrice = closePrices[closePrices.length - 1] || 0;

        // Calcular indicadores técnicos
        const rsiValues = RSI.calculate({ values: closePrices, period: 14 });
        const currentRsi = rsiValues[rsiValues.length - 1] || 50;

        const ema20Values = EMA.calculate({ values: closePrices, period: 20 });
        const currentEma20 = ema20Values[ema20Values.length - 1] || currentPrice;

        const ema50Values = EMA.calculate({ values: closePrices, period: 50 });
        const currentEma50 = ema50Values[ema50Values.length - 1] || currentPrice;

        const macdValues = MACD.calculate({
          values: closePrices,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        const currentMacdInfo = macdValues[macdValues.length - 1] || { MACD: 0, signal: 0, histogram: 0 };

        const indicators = {
          rsi: parseFloat(currentRsi.toFixed(2)),
          ema20: parseFloat(currentEma20.toFixed(2)),
          ema50: parseFloat(currentEma50.toFixed(2)),
          macd: {
            macd: parseFloat((currentMacdInfo.MACD || 0).toFixed(4)),
            signal: parseFloat((currentMacdInfo.signal || 0).toFixed(4)),
            histogram: parseFloat((currentMacdInfo.histogram || 0).toFixed(4)),
          },
        };

        // 5. Formar el contexto técnico básico para Gemini
        const recentKlinesData = klines.slice(-5).map((k) => [
          k[0] ?? 0, // timestamp
          parseFloat(k[1]?.toString() || '0'), // open
          parseFloat(k[2]?.toString() || '0'), // high
          parseFloat(k[3]?.toString() || '0'), // low
          parseFloat(k[4]?.toString() || '0'), // close
          parseFloat(k[5]?.toString() || '0'), // volume
        ]);

        const marketContext = {
          price: currentPrice,
          balance: balance.total,
          indicators,
          recentKlines: recentKlinesData,
          openPosition: undefined as any
        };

        // Comprobar si ya existe una posición abierta para este par en Binance
        const openPosition = openPositions.find((pos) => {
          const posSymbol = pos.symbol;
          return posSymbol === symbol || posSymbol.startsWith(symbol + ':');
        });

        const startTime = Date.now();

        if (openPosition) {
          this.logger.log(`[${symbol}] Ya existe una posición abierta. Analizando gestión de posición por IA...`);

          // Obtener el registro de trade activo desde la DB para conocer SL/TP originales
          const cleanSymbol = symbol.split(':')[0];
          let activeTrade: any = null;
          try {
            const { data } = await this.supabaseService.getClient()
              .from('trade_logs')
              .select('*')
              .eq('symbol', cleanSymbol)
              .eq('status', 'OPEN')
              .order('created_at', { ascending: false })
              .limit(1);

            if (data && data.length > 0) {
              activeTrade = data[0];
            }
          } catch (dbErr) {
            this.logger.warn(`No se pudo obtener el trade activo de Supabase: ${dbErr.message}`);
          }

          // Enriquecer el contexto con la posición actual
          marketContext.openPosition = {
            side: openPosition.side,
            entryPrice: openPosition.entryPrice,
            markPrice: openPosition.markPrice,
            contracts: openPosition.contracts,
            stopLoss: activeTrade ? activeTrade.stop_loss : null,
            takeProfit: activeTrade ? activeTrade.take_profit : null,
          };

          this.logger.log(`[${symbol}] Enviando análisis de posición activa a Gemini...`);
          const iaResponse = await this.geminiService.analyzeMarket(symbol, marketContext, promptMaster);
          const latency = Date.now() - startTime;

          // Registrar la decisión de gestión en Supabase
          await this.supabaseService.logGeminiDecision(
            symbol,
            marketContext,
            iaResponse.decision,
            iaResponse,
            latency,
          );

          if (iaResponse.decision === 'CLOSE_POSITION') {
            this.logger.log(`[${symbol}] La IA decidió CERRAR la posición. Ejecutando cierre...`);
            await this.binanceService.closeMarketPosition(symbol, 'AI_CLOSE');
          } else if (activeTrade && iaResponse.decision === 'HOLD') {
            // Analizar trailing stop loss o take profit propuesto
            const currentSL = activeTrade.stop_loss;
            const currentTP = activeTrade.take_profit;
            const proposedSL = iaResponse.stopLoss;
            const proposedTP = iaResponse.takeProfit;

            const isLong = (openPosition.side || '').toLowerCase() === 'long';
            let shouldUpdate = false;
            let updateReason = '';

            // Validar trailing stop (debe ir en dirección favorable del trade)
            if (proposedSL && proposedSL !== currentSL) {
              if (isLong && proposedSL > currentSL && proposedSL < openPosition.markPrice) {
                shouldUpdate = true;
                updateReason += `Subir SL de ${currentSL} a ${proposedSL} (Trailing). `;
              }
              if (!isLong && proposedSL < currentSL && proposedSL > openPosition.markPrice) {
                shouldUpdate = true;
                updateReason += `Bajar SL de ${currentSL} a ${proposedSL} (Trailing). `;
              }
            }

            // Validar TP ajustado
            if (proposedTP && proposedTP !== currentTP) {
              if (isLong && proposedTP > openPosition.entryPrice) {
                shouldUpdate = true;
                updateReason += `Ajustar TP de ${currentTP} a ${proposedTP}. `;
              }
              if (!isLong && proposedTP < openPosition.entryPrice) {
                shouldUpdate = true;
                updateReason += `Ajustar TP de ${currentTP} a ${proposedTP}. `;
              }
            }

            if (shouldUpdate) {
              this.logger.log(`[${symbol}] Actualizando SL/TP por recomendación de IA. Razón: ${updateReason}`);
              
              // Cancelar órdenes anteriores y configurar nuevas
              await this.binanceService.cancelAllOrders(symbol);
              const side: 'buy' | 'sell' = isLong ? 'buy' : 'sell';
              const newSL = proposedSL || currentSL;
              const newTP = proposedTP || currentTP;
              
              await this.binanceService.setExitOrders(symbol, side, newSL, newTP);

              // Actualizar base de datos
              await this.supabaseService.getClient()
                .from('trade_logs')
                .update({
                  stop_loss: newSL,
                  take_profit: newTP,
                  updated_at: new Date().toISOString()
                })
                .eq('id', activeTrade.id);

              this.logger.log(`[${symbol}] SL/TP actualizados con éxito en Binance y Base de Datos.`);
            } else {
              this.logger.log(`[${symbol}] Manteniendo niveles actuales de SL/TP.`);
            }
          }

          // Continuar con el siguiente símbolo
          continue;
        }

        // Si no hay posición, procesar análisis técnico de nueva entrada
        this.logger.log(`[${symbol}] Enviando análisis de mercado para nueva entrada a Gemini...`);
        const iaResponse = await this.geminiService.analyzeMarket(symbol, marketContext, promptMaster);
        const latency = Date.now() - startTime;

        this.logger.log(`[${symbol}] Respuesta recibida de Gemini. Decisión: ${iaResponse.decision} en ${latency}ms`);

        // Registrar respuesta de la IA en Supabase
        await this.supabaseService.logGeminiDecision(
          symbol,
          marketContext,
          iaResponse.decision,
          iaResponse,
          latency,
        );

        // 7. Evaluar decisión
        if (iaResponse.decision !== 'OPEN_LONG' && iaResponse.decision !== 'OPEN_SHORT') {
          this.logger.log(`[${symbol}] La IA decidió HOLD o no operar. Fin del análisis.`);
          continue;
        }

        const side: 'buy' | 'sell' = iaResponse.decision === 'OPEN_LONG' ? 'buy' : 'sell';

        // 8. Filtrar propuesta por el Motor de Riesgos
        const riskValidation = this.riskService.validateTradeProposal(
          symbol,
          side,
          {
            leverage: iaResponse.leverage,
            entryPriceTarget: iaResponse.entryPriceTarget,
            stopLoss: iaResponse.stopLoss,
            takeProfit: iaResponse.takeProfit,
          },
          balance,
          {
            allowedSymbols,
            maxLeverage,
            maxRiskPerTradePercent: parseFloat(maxRiskPerTradePercent.toString()),
            maxMarginUsagePercent: parseFloat(maxMarginUsagePercent.toString()),
            minRiskToRewardRatio: parseFloat(minRiskToRewardRatio.toString()),
          },
        );

        if (!riskValidation.isValid) {
          this.logger.warn(`[${symbol}] Operación RECHAZADA por el Motor de Riesgos. Razón: ${riskValidation.reason}`);
          continue;
        }

        // 9. Ejecutar la operación en Binance Futures Demo
        const { calculatedAmount, calculatedLeverage } = riskValidation;
        this.logger.log(`[${symbol}] Operación APROBADA. Ejecutando: ${side.toUpperCase()} | Cantidad: ${calculatedAmount} | Apalancamiento: ${calculatedLeverage}x`);

        // Configurar apalancamiento y tipo de margen
        await this.binanceService.setMarginMode(symbol, 'isolated');
        await this.binanceService.setLeverage(symbol, calculatedLeverage!);

        // Cancelar órdenes abiertas previas en el símbolo para evitar conflictos
        await this.binanceService.cancelAllOrders(symbol);

        // Colocar orden de mercado de entrada
        const entryOrder = await this.binanceService.openMarketPosition(symbol, side, calculatedAmount!);
        this.logger.log(`[${symbol}] Orden de mercado colocada exitosamente. ID: ${entryOrder.id}`);

        // Colocar órdenes condicionales de salida (Stop Loss y Take Profit)
        const exitOrders = await this.binanceService.setExitOrders(
          symbol,
          side,
          iaResponse.stopLoss,
          iaResponse.takeProfit,
        );
        this.logger.log(`[${symbol}] Órdenes de SL (${iaResponse.stopLoss}) y TP (${iaResponse.takeProfit}) colocadas.`);

        // 10. Registrar la transacción en Supabase
        await this.supabaseService.logTradeOpen(
          symbol,
          side,
          iaResponse.entryPriceTarget,
          calculatedAmount!,
          calculatedLeverage!,
          iaResponse.stopLoss,
          iaResponse.takeProfit,
          entryOrder.id,
        );

        this.logger.log(`[${symbol}] Ciclo de trade ejecutado y guardado en base de datos con éxito.`);

      } catch (error) {
        this.logger.error(`Error procesando ciclo de trading para ${symbol}`, error.stack);
      }

      // Pausa de 3 segundos entre símbolos para evitar saturar la cuota (rate limit) de Gemini Free Tier
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    this.logger.log('--- Fin del Ciclo de Trading ---');
  }
}
