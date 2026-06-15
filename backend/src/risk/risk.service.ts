import { Injectable, Logger } from '@nestjs/common';

export interface RiskConfig {
  allowedSymbols: string[];
  maxLeverage: number;
  maxRiskPerTradePercent: number; // Por ejemplo, 1% o 2% del balance
  maxMarginUsagePercent: number; // Por ejemplo, 20% del balance libre para una sola posición
  minRiskToRewardRatio: number; // Por ejemplo, 1.5
}

export interface RiskValidationResult {
  isValid: boolean;
  reason?: string;
  calculatedAmount?: number; // Cantidad final calculada en moneda base
  calculatedLeverage?: number; // Apalancamiento ajustado final
  marginRequired?: number; // Margen requerido estimado
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  // Configuración de riesgos por defecto (puede ser guardada dinámicamente en Supabase)
  private defaultConfig: RiskConfig = {
    allowedSymbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT'],
    maxLeverage: 10,
    maxRiskPerTradePercent: 2, // Arriesgar máximo el 2% del capital total
    maxMarginUsagePercent: 25, // No comprometer más del 25% del capital libre como margen en una sola orden
    minRiskToRewardRatio: 1.2, // Ratio mínimo riesgo/beneficio
  };

  /**
   * Valida una propuesta de trade generada por Gemini y calcula el tamaño exacto de la orden
   */
  validateTradeProposal(
    symbol: string,
    side: 'buy' | 'sell',
    proposal: {
      leverage: number;
      entryPriceTarget: number;
      stopLoss: number;
      takeProfit: number;
    },
    accountBalance: { total: number; free: number },
    customConfig?: Partial<RiskConfig>,
  ): RiskValidationResult {
    const config = { ...this.defaultConfig, ...customConfig };

    this.logger.log(`Iniciando evaluación de riesgos para propuesta en ${symbol} (${side.toUpperCase()})`);

    // 1. Validar par permitido
    if (!config.allowedSymbols.includes(symbol)) {
      return {
        isValid: false,
        reason: `El símbolo ${symbol} no está en la lista de pares permitidos: ${config.allowedSymbols.join(', ')}`,
      };
    }

    const { entryPriceTarget, stopLoss, takeProfit, leverage } = proposal;

    // 2. Validar consistencia matemática de SL y TP
    if (side === 'buy') {
      if (stopLoss >= entryPriceTarget) {
        return {
          isValid: false,
          reason: `Consistencia rota para LONG: El Stop Loss (${stopLoss}) debe ser menor que el precio de entrada (${entryPriceTarget})`,
        };
      }
      if (takeProfit <= entryPriceTarget) {
        return {
          isValid: false,
          reason: `Consistencia rota para LONG: El Take Profit (${takeProfit}) debe ser mayor que el precio de entrada (${entryPriceTarget})`,
        };
      }
    } else {
      if (stopLoss <= entryPriceTarget) {
        return {
          isValid: false,
          reason: `Consistencia rota para SHORT: El Stop Loss (${stopLoss}) debe ser mayor que el precio de entrada (${entryPriceTarget})`,
        };
      }
      if (takeProfit >= entryPriceTarget) {
        return {
          isValid: false,
          reason: `Consistencia rota para SHORT: El Take Profit (${takeProfit}) debe ser menor que el precio de entrada (${entryPriceTarget})`,
        };
      }
    }

    // 3. Validar Ratio de Riesgo-Beneficio (Risk-to-Reward Ratio)
    const riskPriceDiff = Math.abs(entryPriceTarget - stopLoss);
    const rewardPriceDiff = Math.abs(entryPriceTarget - takeProfit);
    
    if (riskPriceDiff === 0) {
      return { isValid: false, reason: 'El Stop Loss no puede ser igual al precio de entrada.' };
    }
    
    const riskToRewardRatio = rewardPriceDiff / riskPriceDiff;
    if (riskToRewardRatio < config.minRiskToRewardRatio) {
      return {
        isValid: false,
        reason: `Ratio Riesgo/Beneficio insuficiente. Propuesto: ${riskToRewardRatio.toFixed(2)}, Requerido: ${config.minRiskToRewardRatio}`,
      };
    }

    // 4. Validar distancia del Stop Loss (para evitar ruidos o pérdidas masivas rápidas)
    const stopLossDistancePercent = riskPriceDiff / entryPriceTarget;
    if (stopLossDistancePercent < 0.003) { // 0.3% mínimo
      return {
        isValid: false,
        reason: `El Stop Loss está demasiado cerca del precio de entrada (${(stopLossDistancePercent * 100).toFixed(2)}%). Distancia mínima permitida: 0.3%`,
      };
    }

    // 5. Ajustar Apalancamiento al límite máximo duro
    const adjustedLeverage = Math.min(leverage, config.maxLeverage);
    if (adjustedLeverage !== leverage) {
      this.logger.warn(`Apalancamiento propuesto de ${leverage}x fue limitado a ${adjustedLeverage}x por políticas de riesgo.`);
    }

    // 6. Cálculo del Tamaño de Posición (Position Sizing) en USD
    // Pérdida máxima tolerada en USD
    const maxLossAmountUsd = accountBalance.total * (config.maxRiskPerTradePercent / 100);
    
    // Nocional de posición requerido en USD para cumplir la regla del riesgo máximo
    let positionSizeUsd = maxLossAmountUsd / stopLossDistancePercent;

    // Margen real requerido estimado para esta posición
    let estimatedMarginRequired = positionSizeUsd / adjustedLeverage;

    // Límite de margen: No usar más de un porcentaje del balance libre disponible
    const maxMarginAllowed = accountBalance.free * (config.maxMarginUsagePercent / 100);
    
    if (estimatedMarginRequired > maxMarginAllowed) {
      this.logger.warn(
        `Margen requerido estimado ($${estimatedMarginRequired.toFixed(2)}) supera el límite permitido ($${maxMarginAllowed.toFixed(2)}, ${config.maxMarginUsagePercent}\% del balance libre). Ajustando tamaño de posición.`,
      );
      // Ajustar hacia abajo la posición para cumplir con el límite del margen libre
      estimatedMarginRequired = maxMarginAllowed;
      positionSizeUsd = estimatedMarginRequired * adjustedLeverage;
    }

    // 7. Calcular la cantidad en la moneda base
    const calculatedAmount = parseFloat((positionSizeUsd / entryPriceTarget).toFixed(5));

    // Validar que la cantidad calculada sea razonable (no sea cero por redondeo)
    if (calculatedAmount <= 0) {
      return {
        isValid: false,
        reason: `El tamaño de posición calculado en moneda base es demasiado pequeño (0). Revisa el balance o la distancia al Stop Loss.`,
      };
    }

    this.logger.log(
      `Propuesta VALIDADA. Tamaño Posición Nocional: $${positionSizeUsd.toFixed(2)} USD. Margen: $${estimatedMarginRequired.toFixed(2)} USD. Cantidad Base: ${calculatedAmount}`,
    );

    return {
      isValid: true,
      calculatedAmount,
      calculatedLeverage: adjustedLeverage,
      marginRequired: estimatedMarginRequired,
    };
  }
}

