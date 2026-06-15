import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Builds the OpenAPI document for the backbone API (§14 API-Skizze). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Paketlagerdispo Backend API')
    .setDescription(
      'Digitale Belegverteilung – modular monolith backbone. ' +
        'Status state machine (§7), RBAC (§5/§16.1), audit event log (§7.2), ' +
        'and the case pool/lifecycle (§14.2).',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'OIDC access token' },
      'bearer',
    )
    .addTag('me', 'Employee self-service (own packages only, §16.1)')
    .addTag('cases', 'Employee package-handling lifecycle')
    .addTag('teamlead', 'Teamlead pool steering & issue resolution')
    .addTag('live', 'SSE live status streams')
    .addTag('health', 'Liveness & readiness probes')
    .build();

  return SwaggerModule.createDocument(app, config);
}

/** Builds the document and mounts the Swagger UI + JSON at the given path. */
export function setupSwagger(app: INestApplication, path: string): OpenAPIObject {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(path, app, document, { jsonDocumentUrl: `${path}/json` });
  return document;
}
