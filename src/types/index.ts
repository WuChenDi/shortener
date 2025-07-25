export interface CloudflareEnv {
  SHORTENER_KV: KVNamespace
  JWT_PUBKEY: string
  CDN_URL: string
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
