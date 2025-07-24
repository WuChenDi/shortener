import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as accesslog } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { jwtMiddleware } from '@/middleware/jwt'
import { apiRoutes } from '@/routes/api'
import { shortCodeRoutes } from '@/routes/shortcode'
import type { CloudflareEnv, Variables } from '@/types'
import './global'

const app = new OpenAPIHono<{ Bindings: CloudflareEnv; Variables: Variables }>()

export const customLogger = (message: string, ...rest: string[]) => {
  logger.info(`[ACCESS] ${message}`, ...rest)
}

// Global middleware
app.use(accesslog(customLogger))
app.use('*', prettyJSON())
app.use('*', cors())

// Swagger UI setup - Before applying JWT middleware
app.get('/ui', swaggerUI({ 
  url: '/doc'
}))

// Handle favicon.ico to prevent it from being treated as a shortcode
app.get('/favicon.ico', (c) => {
  return new Response(null, { status: 204 })
})

// Handle robots.txt
app.get('/robots.txt', (c) => {
  return c.text('User-agent: *\nDisallow: /api/\nDisallow: /ui\nDisallow: /doc')
})

// OpenAPI JSON endpoint
app.get('/doc', (c) => {
  const spec = {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: '@cdlab/shortener API',
      description: 'A URL shortening service with JWT authentication',
    },
    servers: [
      {
        url: '/',
        description: 'Current server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication. Enter your JWT token without the "Bearer " prefix.',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            code: { type: 'integer', description: 'Response code (0 for success)' },
            message: { type: 'string', description: 'Response message' },
            data: { description: 'Response data' },
          },
          required: ['code', 'message'],
        },
        CreateUrlRequest: {
          type: 'object',
          properties: {
            records: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string', format: 'uri', description: 'The URL to shorten' },
                  hash: { type: 'string', description: 'Custom short code (optional)' },
                  expiresAt: { type: 'integer', description: 'Expiration timestamp (optional)' },
                  userId: { type: 'string', description: 'User ID (optional)' },
                  attribute: { description: 'Additional attributes (optional)' },
                },
                required: ['url'],
              },
              minItems: 1,
              description: 'Array of URL records to create',
            },
          },
          required: ['records'],
        },
        UpdateUrlRequest: {
          type: 'object',
          properties: {
            records: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  hash: { type: 'string', description: 'Hash of the record to update' },
                  url: { type: 'string', format: 'uri', description: 'New URL (optional)' },
                  userId: { type: 'string', description: 'New user ID (optional)' },
                  expiresAt: { type: 'integer', description: 'New expiration timestamp (optional)' },
                  attribute: { description: 'New attributes (optional)' },
                },
                required: ['hash'],
              },
              minItems: 1,
            },
          },
          required: ['records'],
        },
        DeleteUrlRequest: {
          type: 'object',
          properties: {
            hashList: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Array of hashes to delete',
            },
          },
          required: ['hashList'],
        },
      },
    },
    paths: {
      '/': {
        get: {
          tags: ['Health'],
          summary: 'Service health check',
          description: 'Check the health status of the URL shortener service',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      service: { type: 'string', example: '@cdlab/shortener' },
                      status: { type: 'string', enum: ['healthy', 'unhealthy'] },
                      timestamp: { type: 'string', format: 'date-time' },
                      version: { type: 'string', example: '1.0.0' },
                      database: { type: 'string', enum: ['connected', 'disconnected'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/page': {
        post: {
          tags: ['Links'],
          summary: 'Create a page',
          description: 'Create a new page (placeholder endpoint). Requires JWT authentication.',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'Page creation response',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
      },
      '/api/url': {
        get: {
          tags: ['Links'],
          summary: 'Get URLs',
          description: 'Retrieve URLs with optional filtering by deletion status. Requires JWT authentication.',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'isDeleted',
              in: 'query',
              description: 'Filter by deletion status (0 = active, 1 = deleted)',
              required: false,
              schema: { type: 'string', example: '0' },
            },
          ],
          responses: {
            '200': {
              description: 'List of URLs',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Links'],
          summary: 'Create URLs',
          description: 'Create new shortened URLs. Requires JWT authentication.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUrlRequest' },
                example: {
                  records: [
                    {
                      url: 'https://example.com/very/long/path',
                      hash: 'custom123',
                      userId: 'user001',
                      expiresAt: 1704067200000,
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'URLs creation result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Links'],
          summary: 'Update URLs',
          description: 'Update existing shortened URLs. Requires JWT authentication.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateUrlRequest' },
                example: {
                  records: [
                    {
                      hash: 'custom123',
                      url: 'https://updated-example.com/new-path',
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'URLs update result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Links'],
          summary: 'Delete URLs',
          description: 'Soft delete URLs by hash. Requires JWT authentication.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteUrlRequest' },
                example: {
                  hashList: ['custom123', 'another-hash'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'URLs deletion result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
      },
      '/{shortCode}': {
        get: {
          tags: ['Shortcode'],
          summary: 'Redirect short code',
          description: 'Redirect a short code to its original URL. Social media crawlers are redirected to OG page.',
          parameters: [
            {
              name: 'shortCode',
              in: 'path',
              required: true,
              description: 'The short code to redirect',
              schema: { type: 'string', example: 'abc123' },
            },
          ],
          responses: {
            '302': {
              description: 'Redirect to original URL',
              headers: {
                Location: {
                  description: 'The original URL to redirect to',
                  schema: { type: 'string', format: 'uri' },
                },
              },
            },
            '404': {
              description: 'Short code not found or expired',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      code: { type: 'integer' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/{shortCode}/og': {
        get: {
          tags: ['Shortcode'],
          summary: 'Open Graph page',
          description: 'Generate an Open Graph page for social media sharing that redirects to the original URL',
          parameters: [
            {
              name: 'shortCode',
              in: 'path',
              required: true,
              description: 'The short code for OG page',
              schema: { type: 'string', example: 'abc123' },
            },
          ],
          responses: {
            '200': {
              description: 'Open Graph HTML page',
              content: {
                'text/html': {
                  schema: { type: 'string' },
                },
              },
            },
            '404': {
              description: 'Short code not found or expired',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      code: { type: 'integer' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Health', description: 'Service health endpoints' },
      { name: 'Links', description: 'URL shortening operations' },
      { name: 'Shortcode', description: 'Shortcode redirection' },
    ],
  }

  return c.json(spec)
})

// JWT middleware for API routes
app.use('/api/*', jwtMiddleware)

// Routes
app.route('/api', apiRoutes)
app.route('/', shortCodeRoutes)

// Global error handler
app.onError((err, c) => {
  logger.error('Global error handler invoked', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    userAgent: c.req.header('user-agent'),
  })

  if (err instanceof HTTPException) {
    logger.warn(`HTTP Exception: ${err.status} - ${err.message}`, {
      status: err.status,
      path: c.req.path,
      method: c.req.method,
    })

    return c.json(
      {
        statusCode: err.status,
        message: err.message,
        stack: isDebug ? err.stack?.split('\n') : undefined,
      },
      err.status
    )
  }

  logger.error('Unhandled server error', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  })

  return c.json(
    {
      statusCode: 500,
      message: 'Internal Server Error',
      stack: isDebug ? err.stack?.split('\n') : undefined,
    },
    500
  )
})

// 404 handler
app.notFound((c) => {
  logger.warn(`404 - Route not found: ${c.req.method} ${c.req.path}`, {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent'),
    referer: c.req.header('referer'),
  })

  return c.json(
    {
      statusCode: 404,
      message: 'Not Found',
    },
    404
  )
})

logger.info('Hono application with Swagger UI initialization completed')
logger.info('Swagger UI available at: /ui')
logger.info('OpenAPI spec available at: /doc')

export default app
