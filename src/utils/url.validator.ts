import { z } from 'zod'

export const urlRecordSchema = z.object({
  url: z.string()
    .url('Please provide a valid URL (e.g., https://example.com)')
    .min(1, 'URL cannot be empty')
    .openapi({
      description: 'The URL to shorten',
      example: 'https://example.com/very/long/path',
    }),
  hash: z.string()
    .min(1, 'Hash cannot be empty')
    .max(50, 'Hash must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Hash can only contain letters, numbers, hyphens, and underscores')
    .optional()
    .openapi({
      description: 'Custom short code (optional). If not provided, a random one will be generated.',
      example: 'my-custom-code',
    }),
  expiresAt: z.number()
    .int('Expiration time must be a valid timestamp')
    .positive('Expiration time must be in the future')
    .optional()
    .openapi({
      description: 'Expiration timestamp in milliseconds (optional). If not provided, defaults to 1 hour from creation.',
      example: 1704067200000,
    }),
  userId: z.string()
    .max(100, 'User ID must be less than 100 characters')
    .optional()
    .openapi({
      description: 'User ID who created the link (optional)',
      example: 'user123',
    }),
  attribute: z.any()
    .optional()
    .openapi({
      description: 'Additional attributes as JSON (optional)',
      example: { tags: ['marketing', 'campaign'], priority: 'high' },
    }),
})

export const updateUrlRecordSchema = z.object({
  hash: z.string()
    .min(1, 'Hash is required for updates')
    .max(50, 'Hash must be less than 50 characters')
    .openapi({
      description: 'Hash of the record to update',
      example: 'abc123def456',
    }),
  url: z.string()
    .url('Please provide a valid URL (e.g., https://example.com)')
    .optional()
    .openapi({
      description: 'New URL (optional)',
      example: 'https://newdomain.com/updated/path',
    }),
  userId: z.string()
    .max(100, 'User ID must be less than 100 characters')
    .optional()
    .openapi({
      description: 'New user ID (optional)',
      example: 'newuser456',
    }),
  expiresAt: z.number()
    .int('Expiration time must be a valid timestamp')
    .positive('Expiration time must be in the future')
    .optional()
    .openapi({
      description: 'New expiration timestamp in milliseconds (optional)',
      example: 1704153600000,
    }),
  attribute: z.any()
    .optional()
    .openapi({
      description: 'New attributes as JSON (optional)',
      example: { tags: ['updated', 'modified'], priority: 'medium' },
    }),
})

export const createUrlRequestSchema = z.object({
  records: z.array(urlRecordSchema)
    .min(1, 'At least one URL record is required')
    .max(100, 'Cannot process more than 100 records at once')
    .openapi({
      description: 'Array of URL records to create',
      example: [
        {
          url: 'https://example.com/page1',
          hash: 'custom1',
          userId: 'user123',
        },
        {
          url: 'https://example.com/page2',
          expiresAt: 1704067200000,
        },
      ],
    }),
}).openapi({
  description: 'Request to create one or more shortened URLs',
})

export const updateUrlRequestSchema = z.object({
  records: z.array(updateUrlRecordSchema)
    .min(1, 'At least one record is required for update')
    .max(100, 'Cannot process more than 100 records at once')
    .openapi({
      description: 'Array of URL records to update',
      example: [
        {
          hash: 'abc123def456',
          url: 'https://updated-example.com/new-page',
          userId: 'newuser789',
        },
      ],
    }),
}).openapi({
  description: 'Request to update one or more shortened URLs',
})

export const deleteUrlRequestSchema = z.object({
  hashList: z.array(
    z.string()
      .min(1, 'Hash cannot be empty')
      .max(50, 'Hash must be less than 50 characters')
      .openapi({
        description: 'Hash of the record to delete',
        example: 'abc123def456',
      })
  )
    .min(1, 'At least one hash is required for deletion')
    .max(100, 'Cannot delete more than 100 records at once')
    .openapi({
      description: 'Array of hashes to soft delete',
      example: ['abc123def456', 'xyz789uvw012'],
    }),
}).openapi({
  description: 'Request to soft delete one or more shortened URLs',
})

export const queryUrlSchema = z.object({
  isDeleted: z.string()
    .transform((val) => val === '1' || val === 'true')
    .optional()
    .openapi({
      description: 'Filter by deletion status. "1" or "true" for deleted records, "0" or "false" for active records',
      example: '0',
    }),
  userId: z.string()
    .optional()
    .openapi({
      description: 'Filter by user ID',
      example: 'user123',
    }),
  limit: z.string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(1000))
    .optional()
    .openapi({
      description: 'Maximum number of records to return (1-1000)',
      example: '50',
    }),
  offset: z.string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(0))
    .optional()
    .openapi({
      description: 'Number of records to skip for pagination',
      example: '0',
    }),
}).openapi({
  description: 'Query parameters for filtering URLs',
})

// Additional validation schemas for responses
export const operationResultSchema = z.object({
  hash: z.string().openapi({
    description: 'Hash of the processed record',
    example: 'abc123def456',
  }),
  success: z.boolean().openapi({
    description: 'Whether the operation succeeded',
    example: true,
  }),
  error: z.string().optional().openapi({
    description: 'Error message if operation failed',
    example: 'Record not found',
  }),
  shortUrl: z.string().optional().openapi({
    description: 'Generated short URL (for create operations)',
    example: 'https://short.ly/abc123',
  }),
  url: z.string().optional().openapi({
    description: 'Original URL (for create operations)',
    example: 'https://example.com/original/path',
  }),
  expiresAt: z.number().optional().openapi({
    description: 'Expiration timestamp (for create operations)',
    example: 1704067200000,
  }),
})

export const batchOperationResponseSchema = z.object({
  successes: z.array(operationResultSchema).openapi({
    description: 'Successfully processed records',
  }),
  failures: z.array(operationResultSchema).openapi({
    description: 'Failed to process records',
  }),
}).openapi({
  description: 'Batch operation result',
})

// Validation helpers
export function validateUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function validateHash(hash: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(hash) && hash.length <= 50
}

export function validateTimestamp(timestamp: number): boolean {
  return Number.isInteger(timestamp) && timestamp > Date.now()
}

// Custom error messages for better UX
export const ValidationErrors = {
  INVALID_URL: 'Please provide a valid URL starting with http:// or https://',
  INVALID_HASH: 'Hash can only contain letters, numbers, hyphens, and underscores',
  HASH_TOO_LONG: 'Hash must be less than 50 characters',
  EXPIRED_TIMESTAMP: 'Expiration time must be in the future',
  EMPTY_RECORDS: 'At least one record is required',
  TOO_MANY_RECORDS: 'Cannot process more than 100 records at once',
  USERID_TOO_LONG: 'User ID must be less than 100 characters',
} as const
