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
var GeminiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let GeminiService = GeminiService_1 = class GeminiService {
    configService;
    logger = new common_1.Logger(GeminiService_1.name);
    apiKey;
    flashModelName;
    proModelName;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        this.apiKey = this.configService.get('GEMINI_API_KEY') || '';
        this.flashModelName = this.configService.get('GEMINI_FLASH_MODEL') || 'gemini-2.0-flash';
        this.proModelName = this.configService.get('GEMINI_PRO_MODEL') || 'gemini-2.0-pro-exp-02-05';
        this.logger.log(`Inicializando Gemini API vía HTTP nativo. Modelos: Flash [${this.flashModelName}], Pro [${this.proModelName}]`);
        if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') {
            this.logger.warn('GEMINI_API_KEY no configurada o es la de ejemplo. Las llamadas a Gemini fallarán.');
        }
    }
    getTradingDecisionSchema() {
        return {
            type: 'OBJECT',
            properties: {
                decision: {
                    type: 'STRING',
                    description: 'La acción de trading a tomar.',
                    enum: ['OPEN_LONG', 'OPEN_SHORT', 'HOLD', 'CLOSE_POSITION'],
                },
                leverage: {
                    type: 'INTEGER',
                    description: 'Apalancamiento recomendado para la posición (1 a 10).',
                },
                entryPriceTarget: {
                    type: 'NUMBER',
                    description: 'Precio de entrada sugerido (precio actual del mercado).',
                },
                stopLoss: {
                    type: 'NUMBER',
                    description: 'Precio para colocar la orden de Stop Loss.',
                },
                takeProfit: {
                    type: 'NUMBER',
                    description: 'Precio para colocar la orden de Take Profit.',
                },
                confidenceScore: {
                    type: 'NUMBER',
                    description: 'Nivel de confianza en la predicción (0.0 a 1.0).',
                },
                analysisReasoning: {
                    type: 'STRING',
                    description: 'Razón técnica, soporte, resistencia e indicadores que justifican la decisión.',
                },
            },
            required: [
                'decision',
                'leverage',
                'entryPriceTarget',
                'stopLoss',
                'takeProfit',
                'confidenceScore',
                'analysisReasoning',
            ],
        };
    }
    async analyzeMarket(symbol, marketContext, promptMaster) {
        if (!this.apiKey) {
            throw new Error('La API Key de Gemini no está configurada.');
        }
        try {
            const modelName = this.flashModelName;
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
            const systemInstruction = `Eres un bot de trading de criptomonedas cuantitativo de nivel institucional.
Tus reglas de oro son:
1. NUNCA operes sin Stop Loss y Take Profit.
2. NUNCA arriesgues más de lo permitido en el prompt master.
3. Evalúa con base en análisis técnico riguroso.
4. Genera salidas estrictamente en formato JSON utilizando el esquema provisto.`;
            const promptContent = `
=== REGLAS Y ESTRATEGIA (PROMPT MAESTRO) ===
${promptMaster}

=== ESTADO ACTUAL DEL MERCADO Y CUENTA ===
Par de Trading: ${symbol}
Precio Actual del Par: ${marketContext.price} USD
Saldo Disponible en Cuenta: ${marketContext.balance} USDT

Indicadores Técnicos Calculados Locales:
- RSI (14 períodos): ${marketContext.indicators.rsi.toFixed(2)}
- EMA 20: ${marketContext.indicators.ema20.toFixed(2)}
- EMA 50: ${marketContext.indicators.ema50.toFixed(2)}
- MACD Line: ${marketContext.indicators.macd.macd.toFixed(4)}
- MACD Signal: ${marketContext.indicators.macd.signal.toFixed(4)}
- MACD Histogram: ${marketContext.indicators.macd.histogram.toFixed(4)}

Posición Abierta Actual en el Par:
${marketContext.openPosition ? JSON.stringify(marketContext.openPosition) : 'NINGUNA'}

Velas Recientes (OHLCV - Historial de precios):
${JSON.stringify(marketContext.recentKlines)}

Analiza los datos y toma la decisión de trading. Genera tu respuesta estructurada.
`;
            const body = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: promptContent,
                            },
                        ],
                    },
                ],
                systemInstruction: {
                    parts: [
                        {
                            text: systemInstruction,
                        },
                    ],
                },
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: this.getTradingDecisionSchema(),
                    temperature: 0.1,
                },
            };
            this.logger.log(`Enviando consulta HTTP directa a Gemini Flash (${modelName}) para ${symbol}...`);
            let attempts = 0;
            const maxAttempts = 3;
            const baseDelayMs = 2000;
            while (attempts < maxAttempts) {
                try {
                    attempts++;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(body),
                    });
                    if (!response.ok) {
                        const errText = await response.text();
                        if ((response.status === 503 || response.status === 429) && attempts < maxAttempts) {
                            const delay = baseDelayMs * attempts;
                            this.logger.warn(`Gemini API retornó error ${response.status} para ${symbol}. Reintentando en ${delay}ms (Intento ${attempts}/${maxAttempts})...`);
                            await new Promise((resolve) => setTimeout(resolve, delay));
                            continue;
                        }
                        throw new Error(`Error de API de Gemini HTTP (${response.status}): ${errText}`);
                    }
                    const resJson = await response.json();
                    const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!responseText) {
                        throw new Error('Gemini retornó una estructura de respuesta inesperada o vacía.');
                    }
                    this.logger.debug(`Respuesta de Gemini recibida por HTTP: ${responseText}`);
                    const decision = JSON.parse(responseText.trim());
                    return decision;
                }
                catch (error) {
                    if (attempts >= maxAttempts) {
                        this.logger.error(`Error al analizar mercado con Gemini Flash (HTTP) para ${symbol} tras ${maxAttempts} intentos`, error.stack);
                        throw error;
                    }
                    const delay = baseDelayMs * attempts;
                    this.logger.warn(`Error de red/petición en análisis de ${symbol} (Intento ${attempts}/${maxAttempts}): ${error.message}. Reintentando en ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
            throw new Error(`Fallo el análisis de ${symbol} tras superar el límite de reintentos.`);
        }
        catch (error) {
            throw error;
        }
    }
    async analyzeMacroSentiment(marketOverview) {
        if (!this.apiKey) {
            throw new Error('La API Key de Gemini no está configurada.');
        }
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.proModelName}:generateContent?key=${this.apiKey}`;
            const prompt = `Analiza la siguiente información general del mercado de criptomonedas y proporciona un resumen ejecutivo del sentimiento macro (Alcista, Bajista, Lateral) junto con los niveles clave de soporte y resistencia que el bot debería tener en cuenta para operar en marcos de tiempo más pequeños.
      
Información del Mercado:
${marketOverview}`;
            const body = {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                },
            };
            this.logger.log(`Enviando análisis de sentimiento macro HTTP a Gemini Pro (${this.proModelName})...`);
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Error de API de Gemini Pro HTTP (${response.status}): ${errText}`);
            }
            const resJson = await response.json();
            const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                throw new Error('Gemini Pro retornó una respuesta vacía.');
            }
            return responseText;
        }
        catch (error) {
            this.logger.error('Error al analizar sentimiento macro con Gemini Pro (HTTP)', error.stack);
            throw error;
        }
    }
};
exports.GeminiService = GeminiService;
exports.GeminiService = GeminiService = GeminiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeminiService);
//# sourceMappingURL=gemini.service.js.map