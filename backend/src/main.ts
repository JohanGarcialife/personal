import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dns from 'dns';

// Forzar a Node.js a priorizar IPv4 sobre IPv6 en resoluciones DNS (corrige 'fetch failed' en Railway)
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Habilitar CORS para que el frontend de Next.js pueda consultar la API
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();
