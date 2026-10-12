import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(isoString?: string | null): string {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    }).format(d)
  } catch {
    return isoString
  }
}

export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return ''
  try {
    const now = Date.now()
    const d = new Date(isoString).getTime()
    const diffSec = Math.floor((now - d) / 1000)
    if (diffSec < 60) return 'Just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}h ago`
    const diffDays = Math.floor(diffHour / 24)
    return `${diffDays}d ago`
  } catch {
    return ''
  }
}

export function formatCost(cost?: number | null): string {
  if (cost === undefined || cost === null) return '—'
  if (cost === 0) return '$0.00'
  if (cost >= 1) return `$${cost.toFixed(3)}`
  if (cost >= 0.01) return `$${cost.toFixed(4)}`
  if (cost >= 0.0001) return `$${cost.toFixed(5)}`
  return '<$0.0001'
}

export function formatTokens(tokens?: number | null): string {
  if (tokens === undefined || tokens === null) return ''
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}

