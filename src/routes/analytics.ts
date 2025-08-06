import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { getDatasetName, analyticsQuerySchema, timeSeriesQuerySchema } from '@/utils'
import type { CloudflareEnv, Variables, ApiResponse } from '@/types'

export const analyticsRoutes = new Hono<{
  Bindings: CloudflareEnv
  Variables: Variables
}>()

// GET /api/analytics/overview
analyticsRoutes.get('/overview', zValidator('query', analyticsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const requestId = c.get('requestId')

  logger.info(`[${requestId}] Analytics overview requested`, query)

  try {
    if (!c.env.ANALYTICS) {
      return c.json<ApiResponse>(
        {
          code: 503,
          message: 'Analytics Engine not available',
        },
        503
      )
    }

    // Build SQL query for overview stats
    const whereConditions = buildWhereConditions(query)
    const datasetName = getDatasetName(c.env)
    const sql = `
      SELECT 
        COUNT(*) as totalClicks,
        COUNT(DISTINCT blob6) as uniqueVisitors,
        COUNT(DISTINCT blob2) as uniqueLinks,
        COUNT(DISTINCT blob8) as uniqueCountries
      FROM ${datasetName} 
      ${whereConditions}
    `

    logger.debug('Executing overview query', { sql })
    const result = await executeQuery(c.env, sql)

    return c.json<ApiResponse>({
      code: 0,
      message: 'success',
      data: result[0] || {
        totalClicks: 0,
        uniqueVisitors: 0,
        uniqueLinks: 0,
        uniqueCountries: 0,
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Analytics overview failed`, error)
    return c.json<ApiResponse>(
      {
        code: 500,
        message: 'Failed to fetch analytics overview',
      },
      500
    )
  }
})

// GET /api/analytics/timeseries
analyticsRoutes.get(
  '/timeseries',
  zValidator('query', timeSeriesQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const requestId = c.get('requestId')

    logger.info(`[${requestId}] Analytics timeseries requested`, query)

    try {
      if (!c.env.ANALYTICS) {
        return c.json<ApiResponse>(
          {
            code: 503,
            message: 'Analytics Engine not available',
          },
          503
        )
      }

      const intervalFormat = getIntervalFormat(query.interval)
      const whereConditions = buildWhereConditions(query)
      const datasetName = getDatasetName(c.env)

      const sql = `
      SELECT 
        formatDateTime(FROM_UNIXTIME(double3/1000), '${intervalFormat}', '${query.timezone}') as timeLabel,
        COUNT(*) as clicks,
        COUNT(DISTINCT blob6) as uniqueVisitors
      FROM ${datasetName} 
      ${whereConditions}
      GROUP BY timeLabel
      ORDER BY timeLabel
      LIMIT ${query.limit}
    `

      logger.debug('Executing timeseries query', { sql })
      const result = await executeQuery(c.env, sql)

      return c.json<ApiResponse>({
        code: 0,
        message: 'success',
        data: result,
      })
    } catch (error) {
      logger.error(`[${requestId}] Analytics timeseries failed`, error)
      return c.json<ApiResponse>(
        {
          code: 500,
          message: 'Failed to fetch analytics timeseries',
        },
        500
      )
    }
  }
)

// GET /api/analytics/top-countries
analyticsRoutes.get(
  '/top-countries',
  zValidator('query', analyticsQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const requestId = c.get('requestId')

    logger.info(`[${requestId}] Top countries analytics requested`, query)

    try {
      if (!c.env.ANALYTICS) {
        return c.json<ApiResponse>(
          {
            code: 503,
            message: 'Analytics Engine not available',
          },
          503
        )
      }

      const whereConditions = buildWhereConditions(query)
      const datasetName = getDatasetName(c.env)
      const sql = `
      SELECT 
        blob8 as country,
        COUNT(*) as clicks,
        COUNT(DISTINCT blob6) as uniqueVisitors
      FROM ${datasetName} 
      ${whereConditions}
      GROUP BY country
      ORDER BY clicks DESC
      LIMIT ${query.limit}
    `

      logger.debug('Executing top countries query', { sql })
      const result = await executeQuery(c.env, sql)

      return c.json<ApiResponse>({
        code: 0,
        message: 'success',
        data: result,
      })
    } catch (error) {
      logger.error(`[${requestId}] Top countries analytics failed`, error)
      return c.json<ApiResponse>(
        {
          code: 500,
          message: 'Failed to fetch top countries analytics',
        },
        500
      )
    }
  }
)

// GET /api/analytics/top-referrers
analyticsRoutes.get(
  '/top-referrers',
  zValidator('query', analyticsQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    const requestId = c.get('requestId')

    logger.info(`[${requestId}] Top referrers analytics requested`, query)

    try {
      if (!c.env.ANALYTICS) {
        return c.json<ApiResponse>(
          {
            code: 503,
            message: 'Analytics Engine not available',
          },
          503
        )
      }

      const whereConditions = buildWhereConditions(query)
      const datasetName = getDatasetName(c.env)
      const sql = `
      SELECT 
        blob7 as referrer,
        COUNT(*) as clicks,
        COUNT(DISTINCT blob6) as uniqueVisitors
      FROM ${datasetName} 
      ${whereConditions}
      AND blob7 != 'direct'
      GROUP BY referrer
      ORDER BY clicks DESC
      LIMIT ${query.limit}
    `

      logger.debug('Executing top referrers query', { sql })
      const result = await executeQuery(c.env, sql)

      return c.json<ApiResponse>({
        code: 0,
        message: 'success',
        data: result,
      })
    } catch (error) {
      logger.error(`[${requestId}] Top referrers analytics failed`, error)
      return c.json<ApiResponse>(
        {
          code: 500,
          message: 'Failed to fetch top referrers analytics',
        },
        500
      )
    }
  }
)

// GET /api/analytics/devices
analyticsRoutes.get('/devices', zValidator('query', analyticsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const requestId = c.get('requestId')

  logger.info(`[${requestId}] Device analytics requested`, query)

  try {
    if (!c.env.ANALYTICS) {
      return c.json<ApiResponse>(
        {
          code: 503,
          message: 'Analytics Engine not available',
        },
        503
      )
    }

    const whereConditions = buildWhereConditions(query)
    const datasetName = getDatasetName(c.env)
    const sql = `
      SELECT 
        blob16 as deviceType,
        blob13 as os,
        blob14 as browser,
        COUNT(*) as clicks,
        COUNT(DISTINCT blob6) as uniqueVisitors
      FROM ${datasetName} 
      ${whereConditions}
      GROUP BY deviceType, os, browser
      ORDER BY clicks DESC
      LIMIT ${query.limit}
    `

    logger.debug('Executing devices query', { sql })
    const result = await executeQuery(c.env, sql)

    return c.json<ApiResponse>({
      code: 0,
      message: 'success',
      data: result,
    })
  } catch (error) {
    logger.error(`[${requestId}] Device analytics failed`, error)
    return c.json<ApiResponse>(
      {
        code: 500,
        message: 'Failed to fetch device analytics',
      },
      500
    )
  }
})

// GET /api/analytics/link/:shortCode
analyticsRoutes.get(
  '/link/:shortCode',
  zValidator('query', timeSeriesQuerySchema),
  async (c) => {
    const shortCode = c.req.param('shortCode')
    const query = c.req.valid('query')
    const requestId = c.get('requestId')

    logger.info(`[${requestId}] Link specific analytics requested`, {
      shortCode,
      ...query,
    })

    try {
      if (!c.env.ANALYTICS) {
        return c.json<ApiResponse>(
          {
            code: 503,
            message: 'Analytics Engine not available',
          },
          503
        )
      }

      const intervalFormat = getIntervalFormat(query.interval)
      const whereConditions = buildWhereConditions({ ...query, shortCode })
      const datasetName = getDatasetName(c.env)

      // Get overview stats for this link
      const overviewSql = `
      SELECT 
        COUNT(*) as totalClicks,
        COUNT(DISTINCT blob6) as uniqueVisitors,
        MIN(double3) as firstClick,
        MAX(double3) as lastClick
      FROM ${datasetName} 
      ${whereConditions}
    `

      // Get timeseries data for this link
      const timeseriesSql = `
      SELECT 
        formatDateTime(FROM_UNIXTIME(double3/1000), '${intervalFormat}', '${query.timezone}') as timeLabel,
        COUNT(*) as clicks,
        COUNT(DISTINCT blob6) as uniqueVisitors
      FROM ${datasetName} 
      ${whereConditions}
      GROUP BY timeLabel
      ORDER BY timeLabel
      LIMIT ${query.limit}
    `

      // Get top countries for this link
      const countriesSql = `
      SELECT 
        blob8 as country,
        COUNT(*) as clicks
      FROM ${datasetName} 
      ${whereConditions}
      GROUP BY country
      ORDER BY clicks DESC
      LIMIT 10
    `

      logger.debug('Executing link analytics queries', {
        overviewSql,
        timeseriesSql,
        countriesSql,
      })

      const [overview, timeseries, countries] = await Promise.all([
        executeQuery(c.env, overviewSql),
        executeQuery(c.env, timeseriesSql),
        executeQuery(c.env, countriesSql),
      ])

      return c.json<ApiResponse>({
        code: 0,
        message: 'success',
        data: {
          shortCode,
          overview: overview[0] || { totalClicks: 0, uniqueVisitors: 0 },
          timeseries,
          topCountries: countries,
        },
      })
    } catch (error) {
      logger.error(`[${requestId}] Link analytics failed`, error)
      return c.json<ApiResponse>(
        {
          code: 500,
          message: 'Failed to fetch link analytics',
        },
        500
      )
    }
  }
)

// Helper functions
function buildWhereConditions(query: any): string {
  const conditions: string[] = ['1=1']

  if (query.linkId) {
    conditions.push(`index1 = '${query.linkId}'`)
  }

  if (query.userId) {
    conditions.push(`index2 = '${query.userId}'`)
  }

  if (query.shortCode) {
    conditions.push(`blob1 = '${query.shortCode}'`)
  }

  if (query.domain) {
    conditions.push(`blob2 = '${query.domain}'`)
  }

  if (query.country) {
    conditions.push(`blob7 = '${query.country}'`)
  }

  if (query.startTime) {
    conditions.push(`double3 >= ${query.startTime}`)
  }

  if (query.endTime) {
    conditions.push(`double3 <= ${query.endTime}`)
  }

  return conditions.length > 1 ? `WHERE ${conditions.join(' AND ')}` : ''
}

function getIntervalFormat(interval: string): string {
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

async function executeQuery(env: CloudflareEnv, sql: string): Promise<any[]> {
  logger.debug('Executing Analytics Engine query', { sql })

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

  logger.info('response', { ...response })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Analytics query failed: ${response.status} ${error}`)
  }

  return response.json()

  // const result = await response.json()
  // return result.data || []
}
