import { z } from 'zod'

export const urlRecordSchema = z.object({
  url: z.url('Please provide a valid URL (e.g., https://example.com)')
    .min(1, 'URL cannot be empty'),
  hash: z.string()
    .min(1, 'Hash cannot be empty')
    .max(50, 'Hash must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Hash can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  expiresAt: z.number()
    .int('Expiration time must be a valid timestamp')
    .positive('Expiration time must be in the future')
    .optional(),
  userId: z.string()
    .max(100, 'User ID must be less than 100 characters')
    .optional(),
  attribute: z.any().optional(),
})

export const updateUrlRecordSchema = z.object({
  hash: z.string()
    .min(1, 'Hash is required for updates')
    .max(50, 'Hash must be less than 50 characters'),
  url: z.string()
    .url('Please provide a valid URL (e.g., https://example.com)')
    .optional(),
  userId: z.string()
    .max(100, 'User ID must be less than 100 characters')
    .optional(),
  expiresAt: z.number()
    .int('Expiration time must be a valid timestamp')
    .positive('Expiration time must be in the future')
    .optional(),
  attribute: z.any().optional(),
})

export const createUrlRequestSchema = z.object({
  records: z.array(urlRecordSchema)
    .min(1, 'At least one URL record is required')
    .max(100, 'Cannot process more than 100 records at once'),
})

export const updateUrlRequestSchema = z.object({
  records: z.array(updateUrlRecordSchema)
    .min(1, 'At least one record is required for update')
    .max(100, 'Cannot process more than 100 records at once'),
})

export const deleteUrlRequestSchema = z.object({
  hashList: z.array(
    z.string()
      .min(1, 'Hash cannot be empty')
      .max(50, 'Hash must be less than 50 characters')
  )
    .min(1, 'At least one hash is required for deletion')
    .max(100, 'Cannot delete more than 100 records at once'),
})

export const queryUrlSchema = z.object({
  isDeleted: z.string()
    .transform((val) => val === '1' || val === 'true')
    .optional(),
  userId: z.string().optional(),
  limit: z.string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(1).max(1000))
    .optional(),
  offset: z.string()
    .transform((val) => parseInt(val))
    .pipe(z.number().min(0))
    .optional(),
})

export const isDeletedQuerySchema = z.object({
  isDeleted: z.string().optional(),
})
