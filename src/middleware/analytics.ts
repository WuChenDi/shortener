import type { MiddlewareHandler } from 'hono'
import { UAParser } from 'ua-parser-js'
import type { CloudflareEnv, Variables, UrlData } from '@/types'

export interface AnalyticsData {
  // Indexes (for efficient querying)
  linkId: number
  userId: string

  // Blobs (string data)
  shortCode: string
  domain: string
  targetUrl: string
  userAgent: string
  ip: string
  referer: string
  country: string
  region: string
  city: string
  timezone: string
  language: string
  os: string
  browser: string
  browserVersion: string
  deviceType: string
  deviceModel: string
  colo: string

  // Doubles (numeric data)
  latitude: number
  longitude: number
  timestamp: number
}

/**
 * Extract analytics data from request context
 */
export function extractAnalyticsData(c: any, urlData: UrlData): AnalyticsData {
  const request = c.req
  const cf = c.env?.cf || c.req?.cf || {}

  // Parse user agent
  const userAgent = request.header('user-agent') || ''
  const uaParser = new UAParser(userAgent)
  const uaResult = uaParser.getResult()

  // Extract geo and request info
  const ip =
    request.header('cf-connecting-ip') ||
    request.header('x-forwarded-for') ||
    request.header('x-real-ip') ||
    '0.0.0.0'

  const referer = request.header('referer') || ''
  const acceptLanguage = request.header('accept-language') || ''
  const language = acceptLanguage.split(',')[0]?.split('-')[0] || 'en'

  // Format region and city names
  const countryName = cf.country || 'Unknown'
  const regionName = cf.region ? `${cf.region}, ${countryName}` : countryName
  const cityName = cf.city ? `${cf.city}, ${countryName}` : countryName

  // Parse referer hostname safely
  let refererHostname = 'direct'
  try {
    if (referer && referer !== '') {
      refererHostname = new URL(referer).hostname
    }
  } catch {
    refererHostname = 'direct'
  }

  return {
    // Indexes
    linkId: urlData.id || 0,
    userId: urlData.userId || 'anonymous',

    // Blobs
    shortCode: urlData.shortCode || 'unknown',
    domain: urlData.domain || 'unknown',
    targetUrl: urlData.url || 'unknown',
    userAgent,
    ip,
    referer: refererHostname,
    country: countryName,
    region: regionName,
    city: cityName,
    timezone: cf.timezone || 'UTC',
    language,
    os: uaResult.os?.name || 'Unknown',
    browser: uaResult.browser?.name || 'Unknown',
    browserVersion: uaResult.browser?.version || '0',
    deviceType: uaResult.device?.type || 'desktop',
    deviceModel: uaResult.device?.model || 'Unknown',
    colo: cf.colo || 'Unknown',

    // Doubles
    latitude: Number(cf.latitude) || 0,
    longitude: Number(cf.longitude) || 0,
    timestamp: Date.now(),
  }
}

/**
 * Write analytics data to Cloudflare Analytics Engine
 */
export async function writeAnalytics(
  env: CloudflareEnv,
  data: AnalyticsData
): Promise<void> {
  try {
    if (!env.ANALYTICS) {
      logger.warn('Analytics Engine not configured')
      return
    }

    // Check if bot traffic should be tracked
    const disableBotAnalytics = env.DISABLE_BOT_ANALYTICS === 'true'
    const isBot =
      data.userAgent.toLowerCase().includes('bot') ||
      data.userAgent.toLowerCase().includes('crawler') ||
      data.userAgent.toLowerCase().includes('spider')

    if (disableBotAnalytics && isBot) {
      logger.debug('Bot traffic excluded from analytics', { userAgent: data.userAgent })
      return
    }

    // Apply sampling rate
    const sampleRate = Number(env.ANALYTICS_SAMPLE_RATE || '1.0')
    if (Math.random() > sampleRate) {
      logger.debug('Request sampled out of analytics', { sampleRate })
      return
    }

    // Ensure all required fields are present and not null
    const safeData = {
      linkId: data.linkId || 0,
      userId: data.userId || 'anonymous',
      shortCode: data.shortCode || 'unknown',
      domain: data.domain || 'unknown',
      targetUrl: data.targetUrl || 'unknown',
      userAgent: data.userAgent || 'unknown',
      ip: data.ip || '0.0.0.0',
      referer: data.referer || 'direct',
      country: data.country || 'Unknown',
      region: data.region || 'Unknown',
      city: data.city || 'Unknown',
      timezone: data.timezone || 'UTC',
      language: data.language || 'en',
      os: data.os || 'Unknown',
      browser: data.browser || 'Unknown',
      browserVersion: data.browserVersion || '0',
      deviceType: data.deviceType || 'desktop',
      deviceModel: data.deviceModel || 'Unknown',
      colo: data.colo || 'Unknown',
      latitude: Number(data.latitude) || 0,
      longitude: Number(data.longitude) || 0,
      timestamp: Number(data.timestamp) || Date.now(),
    }

    // Write to Analytics Engine
    await env.ANALYTICS.writeDataPoint({
      indexes: [safeData.linkId.toString()], // Only use linkId as index
      blobs: [
        safeData.userId, // Move userId to first blob
        safeData.shortCode,
        safeData.domain,
        safeData.targetUrl,
        safeData.userAgent,
        safeData.ip,
        safeData.referer,
        safeData.country,
        safeData.region,
        safeData.city,
        safeData.timezone,
        safeData.language,
        safeData.os,
        safeData.browser,
        safeData.browserVersion,
        safeData.deviceType,
        safeData.deviceModel,
        safeData.colo,
      ],
      doubles: [safeData.latitude, safeData.longitude, safeData.timestamp],
    })

    logger.debug('Analytics data written successfully', {
      linkId: safeData.linkId,
      shortCode: safeData.shortCode,
      country: safeData.country,
      browser: safeData.browser,
    })
  } catch (error) {
    logger.error('Failed to write analytics data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      linkId: data.linkId,
      shortCode: data.shortCode,
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

/**
 * Analytics middleware to be used in shortcode routes
 */
export const analyticsMiddleware: MiddlewareHandler<{
  Bindings: CloudflareEnv
  Variables: Variables
}> = async (c, next) => {
  // Store start time for performance tracking
  c.set('startTime', Date.now())

  await next()

  // Only record analytics for successful redirects
  const urlData = c.get('urlData') as UrlData | undefined
  if (urlData && c.res.status === 302) {
    try {
      const analyticsData = extractAnalyticsData(c, urlData)
      await writeAnalytics(c.env, analyticsData)
    } catch (error) {
      // Don't let analytics errors affect the redirect
      logger.error('Analytics middleware error', error)
    }
  }
}

/**
 * Helper function to check if request is from a bot
 */
export function isBot(userAgent: string): boolean {
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'facebook',
    'twitter',
    'linkedin',
    'telegram',
    'whatsapp',
    'discord',
    'slack',
    'googlebot',
    'bingbot',
    'yahoobot',
    'facebookexternalhit',
    'twitterbot',
    'linkedinbot',
  ]

  const ua = userAgent.toLowerCase()
  return botPatterns.some((pattern) => ua.includes(pattern))
}
