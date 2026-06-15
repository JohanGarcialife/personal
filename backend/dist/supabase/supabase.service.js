"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SupabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const supabase_js_1 = require("@supabase/supabase-js");
let SupabaseService = SupabaseService_1 = class SupabaseService {
    configService;
    logger = new common_1.Logger(SupabaseService_1.name);
    client;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        const supabaseUrl = this.configService.get('SUPABASE_URL');
        const supabaseKey = this.configService.get('SUPABASE_KEY');
        if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase_url_here')) {
            this.logger.error('SUPABASE_URL o SUPABASE_KEY no están correctamente configurados.');
            return;
        }
        this.logger.log('Inicializando cliente de Supabase...');
        this.client = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
            },
        });
    }
    getClient() {
        return this.client;
    }
    async getSettings() {
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
        }
        catch (err) {
            this.logger.error('Excepción al obtener configuraciones:', err.message);
            return null;
        }
    }
    async logGeminiDecision(symbol, promptPayload, decision, rawResponse, responseTimeMs) {
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
        }
        catch (err) {
            this.logger.error('Excepción al guardar log de Gemini:', err.message);
        }
    }
    async logTradeOpen(symbol, side, entryPrice, amount, leverage, stopLoss, takeProfit, entryOrderId) {
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
        }
        catch (err) {
            this.logger.error('Excepción al registrar apertura de trade:', err.message);
            return null;
        }
    }
    async logTradeClose(id, pnl, slOrderId, tpOrderId, exitTrigger) {
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
        }
        catch (err) {
            this.logger.error(`Excepción al registrar cierre de trade ${id}:`, err.message);
        }
    }
};
exports.SupabaseService = SupabaseService;
exports.SupabaseService = SupabaseService = SupabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SupabaseService);
//# sourceMappingURL=supabase.service.js.map