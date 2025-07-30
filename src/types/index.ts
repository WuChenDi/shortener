export interface CloudflareEnv {
  AI: Ai
  SHORTENER_KV: KVNamespace
  ANALYTICS: AnalyticsEngineDataset

  // The Service runtime preset to use for deployment.
  DEPLOY_RUNTIME: 'cf' | 'node'
  // Database Type
  DB_TYPE: 'libsql' | 'd1'
  // LibSQL Configuration
  // The URL for connecting to the LibSQL database. Default is a local SQLite file.
  LIBSQL_URL: string
  // The authentication token for accessing the LibSQL
  LIBSQL_AUTH_TOKEN: string
  // The public key for JWT verification
  JWT_PUBKEY: string

  // ==================== AI Functional Configuration ====================
  // Whether to enable AI Slug generation
  ENABLE_AI_SLUG?: 'true' | 'false'
  // AI model name, defaults to the value in config file
  AI_MODEL?: keyof AiModels
  // Whether to enable AI result caching, 'true'/'false'
  AI_ENABLE_CACHE?: 'true' | 'false'
  // Maximum retry count for AI calls
  AI_MAX_RETRIES?: string
  // AI call timeout (milliseconds)
  AI_TIMEOUT?: string

  // ==================== Analytics Configuration ====================
  // Analytics sampling rate, '1.0' means 100%
  ANALYTICS_SAMPLE_RATE?: string
  // Whether to disable bot access analytics, 'true'/'false'
  DISABLE_BOT_ANALYTICS?: string
}

export interface Variables {
  auth: any
}

// Request interfaces
export interface CreateUrlRequest {
  records: CreateUrlRecord[]
}

export interface CreateUrlRecord {
  url: string
  expiresAt: number
  hash: string
  userId?: string
  attribute?: Blob
}

export interface UpdateUrlRequest {
  records: UpdateUrlRecord[]
}

export interface UpdateUrlRecord {
  hash: string
  url?: string
  expiresAt?: number
  userId?: string
  attribute?: Blob
}

export interface DeleteUrlRequest {
  hashList: string[]
}

// Response interfaces
export interface ApiResponse<T = any> {
  code: number
  message: string
  data?: T
}

export interface OperationResult {
  hash: string
  shortCode?: string
  success: boolean
  error?: string
  shortUrl?: string
  url?: string
  expiresAt?: number
}

export interface BatchOperationResponse {
  successes: OperationResult[]
  failures: OperationResult[]
}

// Service health check response
export interface ServiceHealthResponse {
  service: string
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  database?: 'connected' | 'disconnected'
  error?: string
}

export interface UrlData {
  id: number
  url: string
  userId: string
  expiresAt: number | null
  hash: string
  shortCode: string
  domain: string
  attribute: unknown
  createdAt: Date
  updatedAt: Date
  isDeleted: number
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIConfig {
  // Model configuration
  model: keyof AiModels
  systemPrompt: string
  examples: AIMessage[]

  // Performance configuration
  maxRetries: number
  timeout: number
  cacheExpiration: number // Cache expiration time (seconds)

  // Generation rules
  maxSlugLength: number
  slugPattern: RegExp
}

// AI Slug generation response
export interface AISlugResponse {
  success: boolean
  slug: string
  confidence: number // 0-1 confidence level
  method: 'ai' | 'fallback' | 'cache' // Generation method
  cachedAt?: number // Cache timestamp
}

// AI batch processing result
export interface AIBatchResult {
  url: string
  result: AISlugResponse | null
  error: string | null
}

// AI batch processing response
export interface AIBatchResponse {
  results: AIBatchResult[]
  summary: {
    total: number
    success: number
    failed: number
  }
}

// AI suggestions response
export interface AISuggestionsResponse {
  url: string
  suggestions: AISlugResponse[]
}

// AI call options
export interface AIGenerateOptions {
  cache?: boolean
  fallback?: boolean
  maxRetries?: number
  timeout?: number
}

// AI cache data structure
export interface AICacheData extends AISlugResponse {
  cachedAt: number
}

// ==================== Analytics Related Type Definitions ====================

// Analytics data point
export interface AnalyticsDataPoint {
  // Basic information
  timestamp: number
  hash: string
  shortCode: string
  domain: string

  // Request information
  userAgent?: string
  referer?: string
  ip?: string
  country?: string
  city?: string

  // Device information
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'bot'
  browser?: string
  os?: string

  // Response information
  responseCode: number
  responseTime?: number

  // User identification
  userId?: string
  sessionId?: string

  // Flag information
  isBot?: boolean
  isCrawler?: boolean
}

// Analytics query parameters
export interface AnalyticsQuery {
  hash?: string
  shortCode?: string
  domain?: string
  userId?: string
  startTime?: number
  endTime?: number
  limit?: number
  offset?: number
  groupBy?: 'hour' | 'day' | 'week' | 'month'
}

// Analytics response data
export interface AnalyticsResponse {
  totalClicks: number
  uniqueClicks: number
  topCountries: Array<{ country: string; count: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  deviceTypes: Array<{ type: string; count: number }>
  timeSeriesData: Array<{ timestamp: number; clicks: number }>
}

// Analytics summary
export interface AnalyticsSummary {
  totalLinks: number
  totalClicks: number
  uniqueVisitors: number
  topPerformingLinks: Array<{
    hash: string
    shortCode: string
    url: string
    clicks: number
  }>
  recentActivity: Array<{
    timestamp: number
    shortCode: string
    country?: string
    clicks: number
  }>
}
