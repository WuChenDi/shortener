import type { CloudflareEnv, AnalyticsDataPoint, AnalyticsOverview } from '@/types'

/**
 * Analytics Engine field mappings (Updated for single index support)
 * This maps the Analytics Engine blob/double fields to our data structure
 */
export const ANALYTICS_FIELD_MAPPING = {
  // Indexes (only 1 index supported)
  index1: 'linkId', // Link ID for efficient querying

  // Blobs (string data) - limit 16 blobs
  blob1: 'userId', // User ID (moved from index)
  blob2: 'shortCode', // Short code
  blob3: 'domain', // Domain
  blob4: 'targetUrl', // Target URL
  blob5: 'userAgent', // User agent string
  blob6: 'ip', // IP address
  blob7: 'referer', // Referrer hostname
  blob8: 'country', // Country name
  blob9: 'region', // Region name
  blob10: 'city', // City name
  blob11: 'timezone', // Timezone
  blob12: 'language', // Language code
  blob13: 'os', // Operating system
  blob14: 'browser', // Browser name
  blob15: 'browserVersion', // Browser version
  blob16: 'deviceType', // Device type (desktop/mobile/tablet)
  blob17: 'deviceModel', // Device model
  blob18: 'colo', // Cloudflare colo

  // Doubles (numeric data) - limit 16 doubles
  double1: 'latitude', // Latitude
  double2: 'longitude', // Longitude
  double3: 'timestamp', // Timestamp (milliseconds)
} as const

/**
 * Convert analytics data to Analytics Engine format
 */
export function toAnalyticsEngineFormat(data: AnalyticsDataPoint) {
  return {
    indexes: [data.linkId.toString()], // Only linkId as index
    blobs: [
      data.userId, // blob1
      data.shortCode, // blob2
      data.domain, // blob3
      data.targetUrl, // blob4
      data.userAgent, // blob5
      data.ip, // blob6
      data.referer, // blob7
      data.country, // blob8
      data.region, // blob9
      data.city, // blob10
      data.timezone, // blob11
      data.language, // blob12
      data.os, // blob13
      data.browser, // blob14
      data.browserVersion, // blob15
      data.deviceType, // blob16
      data.deviceModel, // blob17
      data.colo, // blob18
    ],
    doubles: [
      data.latitude, // double1
      data.longitude, // double2
      data.timestamp, // double3
    ],
  }
}

/**
 * Execute SQL query against Cloudflare Analytics Engine
 */
export async function executeAnalyticsQuery(
  env: CloudflareEnv,
  sql: string
): Promise<any[]> {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Cloudflare Analytics Engine credentials not configured')
  }

  logger.debug('Executing Analytics Engine query', { sql: sql.substring(0, 200) + '...' })

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/sql',
      },
      body: sql,
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Analytics Engine query failed', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      sql: sql.substring(0, 200),
    })
    throw new Error(`Analytics query failed: ${response.status} ${errorText}`)
  }

  const result = await response.json()
  logger.debug('Analytics Engine query completed', {
    resultCount: Array.isArray(result) ? result.length : 'unknown',
  })

  return Array.isArray(result) ? result : []
}

/**
 * Build WHERE clause for analytics queries (Updated for single index)
 */
export function buildAnalyticsWhereClause(filters: {
  linkId?: string
  userId?: string
  shortCode?: string
  domain?: string
  country?: string
  startTime?: number
  endTime?: number
}): string {
  const conditions: string[] = []

  if (filters.linkId) {
    conditions.push(`index1 = '${sanitizeSqlInput(filters.linkId)}'`)
  }

  if (filters.userId) {
    conditions.push(`blob1 = '${sanitizeSqlInput(filters.userId)}'`) // userId is now blob1
  }

  if (filters.shortCode) {
    conditions.push(`blob2 = '${sanitizeSqlInput(filters.shortCode)}'`) // shortCode is now blob2
  }

  if (filters.domain) {
    conditions.push(`blob3 = '${sanitizeSqlInput(filters.domain)}'`) // domain is now blob3
  }

  if (filters.country) {
    conditions.push(`blob8 = '${sanitizeSqlInput(filters.country)}'`) // country is now blob8
  }

  if (filters.startTime) {
    conditions.push(`double3 >= ${filters.startTime}`) // timestamp is double3
  }

  if (filters.endTime) {
    conditions.push(`double3 <= ${filters.endTime}`) // timestamp is double3
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
}

/**
 * Get time format string for different intervals
 */
export function getTimeFormat(interval: string): string {
  switch (interval) {
    case 'hour':
      return '%Y-%m-%d %H:00:00'
    case 'day':
      return '%Y-%m-%d'
    case 'week':
      return '%Y-W%V'
    case 'month':
      return '%Y-%m'
    default:
      return '%Y-%m-%d'
  }
}

/**
 * Validate analytics query parameters
 */
export function validateAnalyticsQuery(query: any): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validate date range
  if (query.startTime && query.endTime) {
    if (query.startTime >= query.endTime) {
      errors.push('startTime must be less than endTime')
    }

    // Limit to 1 year maximum
    const maxRange = 365 * 24 * 60 * 60 * 1000 // 1 year in milliseconds
    if (query.endTime - query.startTime > maxRange) {
      errors.push('Date range cannot exceed 1 year')
    }
  }

  // Validate limit
  if (query.limit && (query.limit < 1 || query.limit > 10000)) {
    errors.push('limit must be between 1 and 10000')
  }

  // Validate offset
  if (query.offset && query.offset < 0) {
    errors.push('offset cannot be negative')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Calculate analytics summary statistics
 */
export async function getAnalyticsSummary(
  env: CloudflareEnv,
  filters: {
    linkId?: string
    userId?: string
    startTime?: number
    endTime?: number
  } = {}
): Promise<AnalyticsOverview> {
  const whereClause = buildAnalyticsWhereClause(filters)

  const sql = `
    SELECT 
      COUNT(*) as totalClicks,
      COUNT(DISTINCT blob5) as uniqueVisitors,
      COUNT(DISTINCT blob1) as uniqueLinks,
      COUNT(DISTINCT blob7) as uniqueCountries
    FROM analytics_dataset 
    ${whereClause}
  `

  const result = await executeAnalyticsQuery(env, sql)

  return (
    result[0] || {
      totalClicks: 0,
      uniqueVisitors: 0,
      uniqueLinks: 0,
      uniqueCountries: 0,
    }
  )
}

/**
 * Get real-time analytics (last 24 hours)
 */
export async function getRealTimeAnalytics(env: CloudflareEnv) {
  const last24h = Date.now() - 24 * 60 * 60 * 1000
  const datasetName = getDatasetName(env)

  const sql = `
    SELECT 
      blob2 as shortCode,
      blob4 as targetUrl,
      blob8 as country,
      blob16 as deviceType,
      double3 as timestamp,
      COUNT(*) as clicks
    FROM ${datasetName} 
    WHERE double3 >= ${last24h}
    ORDER BY double3 DESC
    LIMIT 100
  `

  const result = await executeAnalyticsQuery(env, sql)

  return {
    activeVisitors: new Set(result.map((r) => r.blob6)).size, // Unique IPs
    clicksLast24h: result.length,
    recentClicks: result.slice(0, 20).map((r) => ({
      timestamp: r.timestamp,
      shortCode: r.shortCode,
      country: r.country,
      device: r.deviceType,
    })),
  }
}

/**
 * Get the correct dataset name for Analytics Engine queries
 */
export function getDatasetName(env: CloudflareEnv): string {
  // Use configured dataset name or fall back to default
  return env.ANALYTICS_DATASET || 'shortener_analytics'
}

/**
 * Sanitize SQL input to prevent injection
 */
export function sanitizeSqlInput(input: string): string {
  return input.replace(/['"]/g, '').replace(/[;\-]/g, '')
}

/**
 * Get popular time periods for analytics
 */
export function getPopularTimePeriods() {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  return {
    today: {
      start: new Date().setHours(0, 0, 0, 0),
      end: now,
    },
    yesterday: {
      start: new Date().setHours(0, 0, 0, 0) - day,
      end: new Date().setHours(0, 0, 0, 0),
    },
    last7days: {
      start: now - 7 * day,
      end: now,
    },
    last30days: {
      start: now - 30 * day,
      end: now,
    },
    thisMonth: {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
      end: now,
    },
    lastMonth: {
      start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime(),
      end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).getTime(),
    },
  }
}
