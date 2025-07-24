// src/database/schema.ts
import { blob, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const trackingFields = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  isDeleted: integer('is_deleted').notNull().default(0),
}

export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    url: text('url').notNull(),
    userId: text('user_id').notNull(),
    expiresAt: integer('expires_at'),
    hash: text('hash').notNull(),
    attribute: blob('attribute'),
    ...trackingFields,
  },
  (table) => {
    return {
      sha1: uniqueIndex('links_hash').on(table.hash),
    }
  }
)

export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull(),
    template: text('template').notNull(),
    data: blob('data').notNull(),
    expiresAt: integer('expires_at'),
    hash: text('hash').notNull(),
    attribute: blob('attribute'),
    ...trackingFields,
  },
  (table) => {
    return {
      sha1: uniqueIndex('pages_hash').on(table.hash),
    }
  }
)
