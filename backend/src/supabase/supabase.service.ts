import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase_url_here')) {
      this.logger.error('SUPABASE_URL o SUPABASE_KEY no están correctamente configurados.');
      return;
    }

    this.logger.log('Inicializando cliente de Supabase...');
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  /**
   * Retorna el cliente oficial de Supabase para consultas directas
   */
  getClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Obtiene la configuración activa del bot
   */
  async getSettings(): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('bot_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        this.logger.error('Error al obtener configuraciones de Supabase:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      this.logger.error('Excepción al obtener configuraciones:', err.message);
      return null;
    }
  }

  /**
   * Guarda una decisión e historial de prompts de Gemini
   */
  async logGeminiDecision(symbol: string, promptPayload: any, decision: string, rawResponse: any, responseTimeMs: number): Promise<void> {
    try {
      const { error } = await this.client
        .from('gemini_logs')
        .insert({
          symbol,
          prompt_payload: promptPayload,
          decision,
          raw_response: rawResponse,
          response_time_ms: responseTimeMs,
        });

      if (error) {
        this.logger.error('Error al guardar log de Gemini en Supabase:', error.message);
      }
    } catch (err) {
      this.logger.error('Excepción al guardar log de Gemini:', err.message);
    }
  }

  /**
   * Guarda el log de apertura de una operación
   */
  async logTradeOpen(
    symbol: string,
    side: 'buy' | 'sell',
    entryPrice: number,
    amount: number,
    leverage: number,
    stopLoss: number,
    takeProfit: number,
    entryOrderId: string,
  ): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from('trade_logs')
        .insert({
          symbol,
          side,
          entry_price: entryPrice,
          amount,
          leverage,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          status: 'OPEN',
          entry_order_id: entryOrderId,
        })
        .select('id')
        .single();

      if (error) {
        this.logger.error('Error al abrir registro de trade en Supabase:', error.message);
        return null;
      }
      return data.id;
    } catch (err) {
      this.logger.error('Excepción al registrar apertura de trade:', err.message);
      return null;
    }
  }

  /**
   * Actualiza el log de una operación al cerrarse
   */
  async logTradeClose(
    id: string,
    pnl: number,
    slOrderId?: string,
    tpOrderId?: string,
    exitTrigger?: string,
  ): Promise<void> {
    try {
      const { error } = await this.client
        .from('trade_logs')
        .update({
          status: 'CLOSED',
          pnl,
          sl_order_id: slOrderId,
          tp_order_id: tpOrderId,
          closed_at: new Date().toISOString(),
          exit_trigger: exitTrigger || 'MANUAL_CLOSE',
        })
        .eq('id', id);

      if (error) {
        this.logger.error(`Error al cerrar registro de trade ${id} en Supabase:`, error.message);
      }
    } catch (err) {
      this.logger.error(`Excepción al registrar cierre de trade ${id}:`, err.message);
    }
  }
}
