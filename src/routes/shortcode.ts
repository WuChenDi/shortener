import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { links } from '@/database/schema'
import { eq } from 'drizzle-orm'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import type { CloudflareEnv, Variables } from '@/types'
import { useDrizzle, withNotDeleted } from '@/lib'

export const shortCodeRoutes = new OpenAPIHono<{
  Bindings: CloudflareEnv
  Variables: Variables
}>()

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function generateOgPageHtml(targetUrl: string): string {
  const escapedUrl = escapeHtml(targetUrl)

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@cdlab/shortener</title>
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:type" content="website" />
    <meta name="robots" content="noindex, nofollow" />
    <script>
      window.location.replace('${escapedUrl}');
    </script>
    <noscript>
      <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
    </noscript>
  </head>
  <body>
    <p>Redirecting to <a href="${escapedUrl}">${escapedUrl}</a>...</p>
  </body>
</html>`
}

// OpenAPI schemas
const ServiceHealthResponseSchema = z.object({
  service: z.string().openapi({ 
    description: 'Service name',
    example: '@cdlab/shortener'
  }),
  status: z.enum(['healthy', 'unhealthy']).openapi({ 
    description: 'Service status' 
  }),
  timestamp: z.string().openapi({ 
    description: 'Response timestamp',
    example: '2024-01-01T00:00:00.000Z'
  }),
  version: z.string().openapi({ 
    description: 'Service version',
    example: '1.0.0'
  }),
  database: z.enum(['connected', 'disconnected']).optional().openapi({ 
    description: 'Database connection status' 
  }),
  error: z.string().optional().openapi({ 
    description: 'Error message if unhealthy' 
  }),
})

// GET / - Service health check route
const healthCheckRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Service health check',
  description: 'Check the health status of the URL shortener service',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ServiceHealthResponseSchema,
        },
      },
      description: 'Service is healthy',
    },
    500: {
      content: {
        'application/json': {
          schema: ServiceHealthResponseSchema,
        },
      },
      description: 'Service is unhealthy',
    },
  },
})

shortCodeRoutes.openapi(healthCheckRoute, async (c) => {
  logger.info('Service health check requested')

  try {
    const db = useDrizzle(c)
    let dbStatus: 'connected' | 'disconnected' = 'disconnected'

    try {
      // Simple database connectivity test
      await db?.select().from(links).limit(1)
      dbStatus = 'connected'
      logger.debug('Database connectivity test passed')
    } catch (dbError) {
      dbStatus = 'disconnected'
      logger.warn('Database connectivity test failed', dbError)
    }

    const serviceInfo = {
      service: '@cdlab/shortener',
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: dbStatus,
    }

    logger.info('Service health check completed', {
      status: serviceInfo.status,
      dbStatus: dbStatus
    })

    return c.json(serviceInfo)
  } catch (error) {
    logger.error('Error during health check', error)

    const errorResponse = {
      service: '@cdlab/shortener',
      status: 'unhealthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    return c.json(errorResponse, 500)
  }
})

// GET /:shortCode - Redirect route
const redirectRoute = createRoute({
  method: 'get',
  path: '/{shortCode}',
  tags: ['Shortcode'],
  summary: 'Redirect short code',
  description: 'Redirect a short code to its original URL. Social media crawlers are redirected to OG page.',
  request: {
    params: z.object({
      shortCode: z.string().openapi({
        description: 'The short code to redirect',
        example: 'abc123',
      }),
    }),
  },
  responses: {
    302: {
      description: 'Redirect to original URL',
      headers: z.object({
        Location: z.string().openapi({
          description: 'The original URL to redirect to',
        }),
      }),
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            code: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Short code not found or expired',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({
            code: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Internal server error',
    },
  },
})

shortCodeRoutes.openapi(redirectRoute, async (c) => {
  const { shortCode } = c.req.valid('param')
  const userAgent = c.req.header('user-agent') || ''

  logger.info(`Processing shortcode redirect request: ${shortCode}`)
  logger.debug(`User agent: ${userAgent}`)

  // Skip common browser requests that are not shortcodes
  if (shortCode === 'favicon.ico' ||
      shortCode === 'robots.txt' ||
      shortCode === 'sitemap.xml' ||
      shortCode.includes('.')) {
    logger.debug(`Skipping non-shortcode request: ${shortCode}`)
    return c.json(
      {
        code: 404,
        message: 'Not Found',
      },
      404
    )
  }

  try {
    const db = useDrizzle(c)
    const url = new URL(c.req.url)
    const domain = url.hostname

    logger.debug(`Request domain: ${domain}`)

    // Check for social media crawlers
    if (userAgent.includes('facebookexternalhit') || userAgent.includes('twitterbot')) {
      logger.info(`Social media crawler detected, redirecting to OG page: ${shortCode}`)
      return c.redirect(`/${shortCode}/og`, 302)
    }

    const hash = bytesToHex(sha256(`${domain}:${shortCode}`))
    logger.debug(`Generated hash for lookup: ${hash}`)

    const urlData = await db
      ?.select()
      .from(links)
      .where(withNotDeleted(links, eq(links.hash, hash)))
      .limit(1)
      .get()

    if (!urlData) {
      logger.warn(`Shortcode not found: ${shortCode} (hash: ${hash})`)
      return c.json(
        {
          code: 404,
          message: 'Short code not found or expired',
        },
        404
      )
    }

    // Check expiration
    const isExpired = urlData.expiresAt && Date.now() > urlData.expiresAt
    if (isExpired) {
      logger.warn(`Shortcode expired: ${shortCode}`, {
        expiresAt: urlData.expiresAt,
        currentTime: Date.now(),
        expired: isExpired,
      })
      return c.json(
        {
          code: 404,
          message: 'Short code not found or expired',
        },
        404
      )
    }

    logger.info(`Redirecting shortcode ${shortCode} to: ${urlData.url}`)
    logger.debug('Redirect details:', {
      shortCode,
      hash,
      targetUrl: urlData.url,
      userId: urlData.userId,
      expiresAt: urlData.expiresAt,
    })

    return c.redirect(urlData.url, 302)
  } catch (error) {
    logger.error(`Error processing shortcode ${shortCode}`, error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
      },
      500
    )
  }
})

// GET /:shortCode/og - Open Graph page route
const ogPageRoute = createRoute({
  method: 'get',
  path: '/{shortCode}/og',
  tags: ['Shortcode'],
  summary: 'Open Graph page',
  description: 'Generate an Open Graph page for social media sharing that redirects to the original URL',
  request: {
    params: z.object({
      shortCode: z.string().openapi({
        description: 'The short code for OG page',
        example: 'abc123',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'text/html': {
          schema: z.string().openapi({
            description: 'HTML page with Open Graph meta tags',
          }),
        },
      },
      description: 'Open Graph HTML page',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({
            code: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Invalid short code',
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({
            code: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Short code not found or expired',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({
            code: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Internal server error',
    },
  },
})

shortCodeRoutes.openapi(ogPageRoute, async (c) => {
  const { shortCode } = c.req.valid('param')

  logger.info(`Processing OG page request for shortcode: ${shortCode}`)

  // Skip common browser requests that are not shortcodes
  if (shortCode === 'favicon.ico' || 
      shortCode === 'robots.txt' || 
      shortCode === 'sitemap.xml' ||
      shortCode.includes('.')) {
    logger.debug(`Skipping non-shortcode OG request: ${shortCode}`)
    return c.json(
      {
        code: 404,
        message: 'Not Found',
      },
      404
    )
  }

  try {
    if (!shortCode || shortCode.trim() === '') {
      logger.warn('OG page requested without valid shortcode')
      return c.json(
        {
          code: 400,
          message: 'Short code not provided or invalid',
        },
        400
      )
    }

    const db = useDrizzle(c)
    const url = new URL(c.req.url)
    const domain = url.hostname
    const hash = bytesToHex(sha256(`${domain}:${shortCode}`))

    logger.debug(`OG page lookup - domain: ${domain}, hash: ${hash}`)

    const urlData = await db
      ?.select()
      .from(links)
      .where(withNotDeleted(links, eq(links.hash, hash)))
      .get()

    if (!urlData) {
      logger.warn(`OG page - shortcode not found: ${shortCode}`)
      return c.json(
        {
          code: 404,
          message: 'Short code not found',
        },
        404
      )
    }

    if (urlData.expiresAt && Date.now() > urlData.expiresAt) {
      logger.warn(`OG page - shortcode expired: ${shortCode}`, {
        expiresAt: urlData.expiresAt,
        currentTime: Date.now(),
      })
      return c.json(
        {
          code: 404,
          message: 'Short code expired',
        },
        404
      )
    }

    const { url: targetUrl } = urlData
    logger.info(`Serving OG page for shortcode ${shortCode}, target: ${targetUrl}`)

    const html = generateOgPageHtml(targetUrl)

    logger.debug(`OG page HTML generated for shortcode: ${shortCode}`)
    return c.html(html)
  } catch (error) {
    logger.error(`Error processing OG page for shortcode ${shortCode}`, error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
      },
      500
    )
  }
})
