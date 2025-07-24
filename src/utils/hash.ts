import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

export function generateRandomHash(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function generateHashFromDomainAndCode(domain: string, shortCode: string): string {
  return bytesToHex(sha256(`${domain}:${shortCode}`))
}

export function getDefaultExpiresAt(): number {
  const now = new Date()
  now.setHours(now.getHours() + 1)
  return now.getTime()
}

export function isExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return false
  return Date.now() > expiresAt
}
