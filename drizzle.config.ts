/* eslint-disable node/prefer-global/process */

import { defineConfig } from 'drizzle-kit'

/**
 * Define environment variables with default values
 */
const {
  DB_TYPE = 'libsql',
  CLOUDFLARE_ACCOUNT_ID = '',
  CLOUDFLARE_DATABASE_ID = '',
  CLOUDFLARE_API_TOKEN = '',
  LIBSQL_URL = 'file:./web/database/data.db',
  LIBSQL_AUTH_TOKEN = undefined,
} = process.env

/**
 * Configure Cloudflare and LibSQL credentials
 */
const d1 = {
  accountId: CLOUDFLARE_ACCOUNT_ID,
  databaseId: CLOUDFLARE_DATABASE_ID,
  token: CLOUDFLARE_API_TOKEN,
}
const libsql = {
  url: LIBSQL_URL,
  authToken: LIBSQL_AUTH_TOKEN,
}

/**
 * Determine the database driver and credentials
 */
const driver = DB_TYPE === 'libsql' ? 'turso' : 'd1-http'
const dbCredentials = DB_TYPE === 'libsql' ? libsql : d1

// eslint-disable-next-line no-console
console.log('Using:', driver)
// eslint-disable-next-line no-console
console.log('DB Credentials:', dbCredentials)

const config =
  DB_TYPE === 'libsql'
    ? {
        dialect: 'turso',
        dbCredentials: libsql,
      } as const
    : {
        dialect: 'sqlite',
        driver: 'd1-http',
        dbCredentials: d1,
      } as const

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './src/database',
  ...config,
})
