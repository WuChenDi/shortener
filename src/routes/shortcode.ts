import { Hono } from 'hono'
import { links } from '@/database/schema'
import { eq } from 'drizzle-orm'
import { useDrizzle, withNotDeleted } from '@/lib'
import { generateHashFromDomainAndCode, generateOgPageHtml } from '@/utils'
import type { CloudflareEnv, Variables, ServiceHealthResponse, UrlData } from '@/types'
import pkg from '@/../package.json'

export const shortCodeRoutes = new Hono<{
  Bindings: CloudflareEnv
  Variables: Variables
}>()

// GET / - Service health check and info
shortCodeRoutes.get('/', async (c) => {
  logger.info(`[${c.get('requestId')}] Service health check requested`)

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
      service: pkg.name,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: pkg.version
    }

    logger.info('Service health check completed', {
      status: serviceInfo.status,
      dbStatus: dbStatus
    })

    return c.json(serviceInfo)
  } catch (error) {
    logger.error('Error during health check', error)

    const errorResponse: ServiceHealthResponse = {
      service: pkg.name,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: pkg.version,
      error: error instanceof Error ? error.message : 'Unknown error',
    }

    return c.json(errorResponse, 500)
  }
})

// GET /:shortCode
shortCodeRoutes.get('/:shortCode', async (c) => {
  const shortCode = c.req.param('shortCode')
  const userAgent = c.req.header('user-agent') || ''

  logger.info(`[${c.get('requestId')}] Processing shortcode redirect request: ${shortCode}`)
  logger.debug(`User agent: ${userAgent}`)

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

    const hash = generateHashFromDomainAndCode(domain, shortCode)
    logger.debug(`Generated hash for lookup: ${hash}`)

    // Caching strategy: Check KV cache first
    const cacheKey = `url:${hash}`
    let urlData: UrlData | null = null
    
    if (c.env.SHORTENER_KV) {
      try {
        const cached = await c.env.SHORTENER_KV.get(cacheKey, 'json')
        if (cached) {
          urlData = cached as UrlData
          logger.debug(`Cache hit for shortcode: ${shortCode}`)
        } else {
          logger.debug(`Cache miss for shortcode: ${shortCode}`)
        }
      } catch (cacheError) {
        logger.warn('Cache read error, falling back to database', cacheError)
      }
    }

    // If cache miss, query the database
    if (!urlData) {
      urlData = await db
        ?.select()
        .from(links)
        .where(withNotDeleted(links, eq(links.hash, hash)))
        .limit(1)
        .get() || null

      // If found, write to cache
      if (urlData && c.env.SHORTENER_KV) {
        try {
          await c.env.SHORTENER_KV.put(cacheKey, JSON.stringify(urlData), {
            expirationTtl: 3600 // Cache for 1 hour
          })
          logger.debug(`Cached URL data for shortcode: ${shortCode}`)
        } catch (cacheError) {
          logger.warn('Cache write error', cacheError)
        }
      }
    }

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
      
      // delete cache if expired
      if (c.env.SHORTENER_KV) {
        try {
          await c.env.SHORTENER_KV.delete(cacheKey)
        } catch (cacheError) {
          logger.warn('Cache delete error', cacheError)
        }
      }
      
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
      domain,
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

  logger.info(`[${c.get('requestId')}] Processing OG page request for shortcode: ${shortCode}`)

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
    const hash = generateHashFromDomainAndCode(domain, shortCode)

    logger.debug(`OG page lookup - domain: ${domain}, hash: ${hash}`)

    // Caching strategy: Check OG page cache first
    const ogCacheKey = `og:${hash}`
    let cachedHtml: string | null = null
    
    if (c.env.SHORTENER_KV) {
      try {
        cachedHtml = await c.env.SHORTENER_KV.get(ogCacheKey)
        if (cachedHtml) {
          logger.debug(`OG page cache hit for shortcode: ${shortCode}`)
          return c.html(cachedHtml)
        }
      } catch (cacheError) {
        logger.warn('OG cache read error', cacheError)
      }
    }

    // Query the database
    const urlData: UrlData | undefined = await db
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

    if (c.env.SHORTENER_KV) {
      try {
        await c.env.SHORTENER_KV.put(ogCacheKey, html, {
          expirationTtl: 3600 // Cache for 1 hour
        })
        logger.debug(`Cached OG page for shortcode: ${shortCode}`)
      } catch (cacheError) {
        logger.warn('OG cache write error', cacheError)
      }
    }

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
