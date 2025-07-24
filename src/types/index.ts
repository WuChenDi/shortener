export interface CloudflareEnv {
  KV: KVNamespace
  JWT_PUBKEY: string
  CDN_URL: string
}

export interface Variables {
  auth: any
}
