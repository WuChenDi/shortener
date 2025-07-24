import { Hono } from 'hono'
import { links } from '@/database/schema'
import { eq } from 'drizzle-orm'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import type { CloudflareEnv, Variables, ServiceHealthResponse } from '@/types'
import { useDrizzle } from '@/lib/db'
import { withNotDeleted } from '@/lib/db-utils'

export const shortCodeRoutes = new Hono<{
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

// GET / - Service health check and info
shortCodeRoutes.get('/', async (c) => {
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

    const serviceInfo: ServiceHealthResponse = {
      service: '@cdlab/shortener',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }

    logger.info('Service health check completed', {
      status: serviceInfo.status,
      dbStatus: dbStatus
    })

    return c.json(serviceInfo)
  } catch (error) {
    logger.error('Error during health check', error)

    const errorResponse: ServiceHealthResponse = {
      service: '@cdlab/shortener',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    return c.json(errorResponse, 500)
  }
})

// GET /:shortCode
shortCodeRoutes.get('/:shortCode', async (c) => {
  const shortCode = c.req.param('shortCode')
  const userAgent = c.req.header('user-agent') || ''

  logger.info(`Processing shortcode redirect request: ${shortCode}`)
  logger.debug(`User agent: ${userAgent}`)

  try {
    const db = useDrizzle(c)
    const url = new URL(c.req.url)
    const domain = url.hostname

    logger.debug(`Request domain: ${domain}`)

    // Check for social media crawlers
    if (userAgent.includes('facebookexternalhit') || userAgent.includes('twitterbot')) {
      logger.info(`Social media crawler detected, redirecting to OG page: ${shortCode}`)
      return c.redirect(`/u/${shortCode}/og`, 302)
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

// GET /:shortCode/og
shortCodeRoutes.get('/:shortCode/og', async (c) => {
  const shortCode = c.req.param('shortCode')

  logger.info(`Processing OG page request for shortcode: ${shortCode}`)

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
