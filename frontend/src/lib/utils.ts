import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function getGradeColor(grade: string): string {
  const g = grade.toUpperCase()
  if (g === 'A+') return 'text-emerald-400'
  if (g === 'A') return 'text-green-400'
  if (g === 'B') return 'text-blue-400'
  if (g === 'C') return 'text-yellow-400'
  if (g === 'D') return 'text-orange-400'
  if (g === 'E') return 'text-red-400'
  return 'text-red-600'
}

export function getGradeBg(grade: string): string {
  const g = grade.toUpperCase()
  if (g === 'A+') return 'bg-emerald-500'
  if (g === 'A') return 'bg-green-500'
  if (g === 'B') return 'bg-blue-500'
  if (g === 'C') return 'bg-yellow-500'
  if (g === 'D') return 'bg-orange-500'
  if (g === 'E') return 'bg-red-500'
  return 'bg-red-800'
}

export function getRatingColor(rating: 'good' | 'needs-improvement' | 'poor'): string {
  if (rating === 'good') return 'text-emerald-400'
  if (rating === 'needs-improvement') return 'text-yellow-400'
  return 'text-red-400'
}

export function getRatingBg(rating: 'good' | 'needs-improvement' | 'poor'): string {
  if (rating === 'good') return 'bg-emerald-500/20 border-emerald-500/30'
  if (rating === 'needs-improvement') return 'bg-yellow-500/20 border-yellow-500/30'
  return 'bg-red-500/20 border-red-500/30'
}

export function getImpactColor(impact: 'high' | 'medium' | 'low'): string {
  if (impact === 'high') return 'text-red-400'
  if (impact === 'medium') return 'text-yellow-400'
  return 'text-blue-400'
}

export function getImpactBadge(impact: 'high' | 'medium' | 'low'): string {
  if (impact === 'high') return 'bg-red-500/20 text-red-400 border border-red-500/30'
  if (impact === 'medium') return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
  return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    carbon: '🌿', performance: '⚡', security: '🔒',
    accessibility: '♿', seo: '🔍', analytics: '📊',
    advertising: '📢', tracking: '👁', chat: '💬',
    payment: '💳', cms: '📝', 'js-framework': '⚛️',
    'ui-framework': '🎨', hosting: '☁️', cdn: '🌐',
    fonts: '🔤', maps: '🗺️', video: '🎥',
    apm: '🔬', auth: '🔑', crm: '👥',
  }
  return icons[category] ?? '🔧'
}

export function scoreToPercentBar(score: number): number {
  return Math.min(100, Math.max(0, score))
}

export function formatCo2(grams: number): string {
  if (grams < 0.001) return `${(grams * 1000000).toFixed(2)} µg`
  if (grams < 1) return `${(grams * 1000).toFixed(2)} mg`
  if (grams < 1000) return `${grams.toFixed(2)} g`
  return `${(grams / 1000).toFixed(3)} kg`
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export function truncateUrl(url: string, maxLength = 60): string {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength) + '…'
}

export function getDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function getResourceTypeColor(type: string): string {
  const colors: Record<string, string> = {
    html: '#60A5FA', javascript: '#FBBF24', css: '#A78BFA',
    images: '#34D399', fonts: '#F472B6', video: '#FB923C',
    xhr: '#38BDF8', other: '#6B7280',
  }
  return colors[type] ?? '#6B7280'
}

const PHASE_NAMES: Record<number, string> = {
  0: 'Pre-flight validation',
  1: 'HTTP & DNS analysis',
  2: 'Static HTML analysis',
  3: 'Browser rendering',
  4: 'Performance audit',
  5: 'Technology detection',
  6: 'Carbon calculation',
  7: 'Scoring & aggregation',
}

export function getPhaseName(phase: number): string {
  return PHASE_NAMES[phase] ?? `Phase ${phase}`
}
