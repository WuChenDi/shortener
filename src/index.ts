import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as accesslog } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import { jwtMiddleware } from '@/middleware/jwt'
import { apiRoutes } from '@/routes/api'
import { shortCodeRoutes } from '@/routes/shortcode'
import type { CloudflareEnv, Variables } from '@/types'
import './global'

const app = new Hono<{ Bindings: CloudflareEnv; Variables: Variables }>()

export const customLogger = (message: string, ...rest: string[]) => {
  logger.info(`[ACCESS] ${message}`, ...rest)
}

// Global middleware
app.use(accesslog(customLogger))
app.use('*', prettyJSON())
app.use('*', requestId())
app.use('*', cors())

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

logger.info('Hono application initialization completed')

export default app
