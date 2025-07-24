import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { links } from '@/database/schema'
import { eq } from 'drizzle-orm'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import type {
  ApiResponse,
  BatchOperationResponse,
  CloudflareEnv,
  Variables,
} from '@/types'
import { useDrizzle } from '@/lib/db'
import { notDeleted, withNotDeleted, softDelete } from '@/lib/db-utils'
import { generateRandomHash, getDefaultExpiresAt } from '@/utils'
import {
  isDeletedQuerySchema,
  createUrlRequestSchema,
  updateUrlRequestSchema,
  deleteUrlRequestSchema,
} from '@/utils/url.validator'

export const apiRoutes = new Hono<{ Bindings: CloudflareEnv; Variables: Variables }>()

// POST /api/page
apiRoutes.post('/page', async (c) => {
  logger.info('POST /api/page - Creating page')

  try {
    const db = useDrizzle(c)
    logger.debug('Database connection established for page creation')

    return c.json<ApiResponse>({
      code: 0,
      message: 'ok',
      data: {
        db: !!db,
      },
    })
  } catch (error) {
    logger.error('Error in POST /api/page', error)
    throw error
  }
})

// GET /api/url
apiRoutes.get('/url', zValidator('query', isDeletedQuerySchema), async (c) => {
  const { isDeleted } = c.req.valid('query')
  logger.info(`GET /api/url - Fetching URLs with isDeleted filter: ${isDeleted}`)

  try {
    const db = useDrizzle(c)
    logger.debug('Database connection established for URL retrieval')

    let allLinks

    if (typeof isDeleted !== 'undefined') {
      logger.debug(`Querying links with isDeleted = ${isDeleted}`)
      allLinks = await db
        ?.select()
        .from(links)
        .where(eq(links.isDeleted, Number(isDeleted)))
    } else {
      logger.debug('Querying active links (not deleted)')
      allLinks = await db?.select().from(links).where(notDeleted(links))
    }

    // @ts-ignore
    logger.info(`Retrieved ${allLinks?.length || 0} links from database`)
    logger.debug('Retrieved links data:', allLinks)

    return c.json<ApiResponse>({
      code: 0,
      message: 'ok',
      data: allLinks || [],
    })
  } catch (error) {
    logger.error('Error retrieving URLs from database', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
        data: [],
      },
      500
    )
  }
})

// POST /api/url
apiRoutes.post('/url', zValidator('json', createUrlRequestSchema), async (c) => {
  logger.info('POST /api/url - Creating new URLs')

  try {
    const db = useDrizzle(c)
    const { records } = c.req.valid('json')

    const url = new URL(c.req.url)
    const domain = url.hostname

    logger.info(`Processing ${records.length} URL records for creation`)

    const results = await Promise.all(
      records.map(async (record, index) => {
        let shortCode = record.hash || generateRandomHash()

        let hash = bytesToHex(sha256(`${domain}:${shortCode}`))

        const expiresAt = record.expiresAt || getDefaultExpiresAt()

        logger.debug(`Processing record ${index + 1}/${records.length} - shortCode: ${shortCode}, hash: ${hash}`)

        try {
          const existingRecord = await db
            ?.select()
            .from(links)
            .where(eq(links.hash, hash))
            .get()

          if (existingRecord) {
            if (!record.hash) {
              let attempts = 0
              while (attempts < 5) {
                shortCode = generateRandomHash()
                hash = bytesToHex(sha256(`${domain}:${shortCode}`))
                
                const duplicateCheck = await db
                  ?.select()
                  .from(links)
                  .where(eq(links.hash, hash))
                  .get()

                if (!duplicateCheck) {
                  break
                }
                attempts++
              }

              if (attempts >= 5) {
                logger.warn(`Failed to generate unique hash after 5 attempts for URL: ${record.url}`)
                return {
                  hash: shortCode,
                  success: false,
                  error: 'Failed to generate unique short code',
                }
              }
            } else {
              logger.warn(`Short code already exists: ${shortCode}`)
              return {
                hash: shortCode,
                success: false,
                error: 'Short code already exists',
              }
            }
          }

          await db?.insert(links).values({
            url: record.url,
            userId: record.userId || '',
            expiresAt,
            hash,
            attribute: record.attribute,
          })

          logger.debug(`Successfully created link with shortCode: ${shortCode}, hash: ${hash}`)
          return {
            hash: shortCode,
            shortUrl: `https://${domain}/${shortCode}`,
            success: true,
            url: record.url,
            expiresAt,
          }
        } catch (error) {
          logger.warn(`Failed to create link with shortCode: ${shortCode}`, error)
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown creation error'
          return {
            hash: shortCode,
            success: false,
            error: errorMessage,
          }
        }
      })
    )

    const successes = results.filter((result) => result.success)
    const failures = results.filter((result) => !result.success)

    logger.info(`URL creation completed - Successes: ${successes.length}, Failures: ${failures.length}`)

    return c.json<ApiResponse<BatchOperationResponse>>({
      code: 0,
      message: 'ok',
      data: {
        successes,
        failures,
      },
    })
  } catch (error) {
    logger.error('Error in URL creation process', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
        data: null,
      },
      500
    )
  }
})

// PUT /api/url
apiRoutes.put('/url', zValidator('json', updateUrlRequestSchema), async (c) => {
  logger.info('PUT /api/url - Updating URLs')

  try {
    const db = useDrizzle(c)
    const { records } = c.req.valid('json')

    logger.info(`Processing ${records.length} URL records for update`)

    const results = await Promise.all(
      records.map(async (record, index) => {
        logger.debug(`Processing update for record ${index + 1}/${records.length} - hash: ${record.hash}`)

        try {
          const existingRecord = await db
            ?.select()
            .from(links)
            .where(withNotDeleted(links, eq(links.hash, record.hash)))
            .get()

          if (!existingRecord) {
            logger.warn(`Record not found or already deleted for hash: ${record.hash}`)
            return {
              hash: record.hash,
              success: false,
              error: 'Record not found or already deleted',
            }
          }

          const updateData = {
            url: record.url,
            userId: record.userId,
            expiresAt: record.expiresAt,
            attribute: record.attribute,
          }

          const fieldsToUpdate = Object.fromEntries(
            Object.entries(updateData).filter(([, value]) => value !== undefined)
          )

          if (Object.keys(fieldsToUpdate).length > 0) {
            logger.debug(`Updating fields for hash ${record.hash}: ${Object.keys(fieldsToUpdate)}`)

            await db
              ?.update(links)
              .set(fieldsToUpdate)
              .where(withNotDeleted(links, eq(links.hash, record.hash)))
              .execute()

            logger.debug(`Successfully updated link with hash: ${record.hash}`)
            return {
              hash: record.hash,
              success: true,
            }
          }

          logger.warn(`No fields to update for hash: ${record.hash}`)
          return {
            hash: record.hash,
            success: false,
            error: 'No fields to update',
          }
        } catch (error) {
          logger.error(`Error updating record with hash ${record.hash}`, error)
          return {
            hash: record.hash,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown update error',
          }
        }
      })
    )

    const successes = results.filter((result) => result.success)
    const failures = results.filter((result) => !result.success)

    logger.info(`URL update completed - Successes: ${successes.length}, Failures: ${failures.length}`)

    if (failures.length > 0) {
      logger.warn(`Some URL updates failed: ${failures.map((f) => ({ hash: f.hash, error: f.error }))}`)
    }

    return c.json<ApiResponse<BatchOperationResponse>>({
      code: 0,
      message: 'ok',
      data: {
        successes,
        failures,
      },
    })
  } catch (error) {
    logger.error('Error in URL update process', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
        data: null,
      },
      500
    )
  }
})

// DELETE /api/url
apiRoutes.delete('/url', zValidator('json', deleteUrlRequestSchema), async (c) => {
  logger.info('DELETE /api/url - Soft deleting URLs')

  try {
    const db = useDrizzle(c)
    const { hashList } = c.req.valid('json')

    logger.info(`Processing ${hashList.length} URLs for soft deletion`)
    logger.debug('Hash list for deletion:', hashList)

    const results = await Promise.all(
      hashList.map(async (hash, index) => {
        logger.debug(`Processing deletion ${index + 1}/${hashList.length} - hash: ${hash}`)

        try {
          const record = await db
            ?.select()
            .from(links)
            .where(withNotDeleted(links, eq(links.hash, hash)))
            .get()

          if (record) {
            await db
              ?.update(links)
              .set(softDelete())
              .where(eq(links.hash, hash))
              .execute()

            logger.debug(`Successfully soft deleted link with hash: ${hash}`)
            return {
              hash,
              success: true,
            }
          } else {
            logger.warn(`Record not found or already deleted for hash: ${hash}`)
            return {
              hash,
              success: false,
              error: 'Record not found or already deleted',
            }
          }
        } catch (error) {
          logger.error(`Error soft deleting record with hash ${hash}`, error)
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown deletion error'
          return {
            hash,
            success: false,
            error: errorMessage,
          }
        }
      })
    )

    const successes = results.filter((result) => result.success)
    const failures = results.filter((result) => !result.success)

    logger.info(`URL deletion completed - Successes: ${successes.length}, Failures: ${failures.length}`)

    if (failures.length > 0) {
      logger.warn(`Some URL deletions failed: ${failures.map((f) => ({ hash: f.hash, error: f.error }))}`)
    }

    return c.json<ApiResponse<BatchOperationResponse>>({
      code: 0,
      message: 'ok',
      data: {
        successes,
        failures,
      },
    })
  } catch (error) {
    logger.error('Error in URL deletion process', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'

    return c.json(
      {
        code: 500,
        message: errorMessage,
        data: null,
      },
      500
    )
  }
})
