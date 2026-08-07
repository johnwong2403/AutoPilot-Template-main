'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  CheckCircle2 as CheckCircleIcon,
  XCircle as XCircleIcon,
  RefreshCw as RefreshIcon,
  Globe as SystemsIcon,
  ShieldCheck as HealthyIcon,
  AlertTriangle as UnhealthyIcon,
  ChevronDown as ChevronIcon,
} from 'lucide-react'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

interface Integration {
  name: string
  category: 'system_of_record' | 'channel'
  usage: string
  status: 'healthy' | 'unhealthy'
  detail: string
  checked_at: string
}

interface DataManagerStatus {
  integrations: Integration[]
  summary: {
    total: number
    healthy: number
    unhealthy: number
  }
}

function categoryLabel(category: Integration['category']) {
  return category === 'system_of_record' ? 'System of Record' : 'Channel'
}

function getLogoUrl(name: string): string {
  const key = name.toLowerCase().replace(/\s+/g, '')
  const logoMap: Record<string, string> = {
    supabase: 'https://cdn.simpleicons.org/supabase/3ECF8E',
    slack: 'https://www.google.com/s2/favicons?domain=slack.com&sz=64',
    typeform: 'https://www.google.com/s2/favicons?domain=typeform.com&sz=64',
    supervityauto: '/supervity-favicon.png',
  }
  return logoMap[key] || `https://cdn.simpleicons.org/${key}`
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
  valueColor?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className={`mt-3 text-3xl font-bold ${valueColor || 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  )
}

function IntegrationRow({ item }: { item: Integration }) {
  const [expanded, setExpanded] = useState(false)
  const isHealthy = item.status === 'healthy'
  const isSupervity = item.name.toLowerCase().includes('supervity')

  return (
    <motion.div variants={itemVariants}>
      <div
        className={cn(
          'rounded-2xl border-l-4 bg-white dark:bg-slate-900 shadow-sm',
          isHealthy ? 'border-l-emerald-500' : 'border-l-red-500'
        )}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-4 p-5 text-left"
        >
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border p-2 shadow-sm',
              isSupervity ? 'bg-black' : 'bg-white',
              isHealthy ? 'border-indigo-100 dark:border-indigo-900' : 'border-red-100 dark:border-red-900'
            )}
          >
            <img
              src={getLogoUrl(item.name)}
              alt={`${item.name} logo`}
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</h3>
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {categoryLabel(item.category)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{item.usage}</p>
            <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
              {isHealthy ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                  {item.detail}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <XCircleIcon className="h-3.5 w-3.5 text-red-500" />
                  {item.detail}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
                isHealthy
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
              )}
            >
              {isHealthy ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
              {isHealthy ? 'Healthy' : 'Unhealthy'}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date(item.checked_at).toLocaleString()}
            </span>
          </div>

          <ChevronIcon
            className={cn(
              'h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600 transition-transform',
              expanded && 'rotate-180'
            )}
          />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Category</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-slate-200">{categoryLabel(item.category)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Status</dt>
                    <dd className={cn('mt-0.5 font-medium', isHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {item.status}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Last Checked</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-slate-200">
                      {new Date(item.checked_at).toLocaleString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">What it&rsquo;s used for</dt>
                    <dd className="mt-0.5 text-slate-700 dark:text-slate-200">{item.usage}</dd>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Latest Health Check Result</dt>
                    <dd className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">{item.detail}</dd>
                  </div>
                </dl>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default function DataManagerPage() {
  const [data, setData] = useState<DataManagerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await apiClient<DataManagerStatus>('/api/data-manager/status')
      setData(result)
    } catch (err) {
      console.error('Failed to load Data Manager status', err)
      setError('Could not reach one or more integrations. Try refreshing.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            Data Manager
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Live registry of every system this operation is connected to.
          </p>
        </div>
        <button
          onClick={() => loadStatus(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
        >
          <RefreshIcon className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<SystemsIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-950"
          label="Total Integrations"
          value={data?.summary.total ?? '—'}
        />
        <StatCard
          icon={<HealthyIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950"
          label="Healthy"
          value={data?.summary.healthy ?? '—'}
          valueColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={<UnhealthyIcon className="h-5 w-5 text-red-600 dark:text-red-400" />}
          iconBg="bg-red-50 dark:bg-red-950"
          label="Unhealthy"
          value={data?.summary.unhealthy ?? '—'}
          valueColor="text-red-600 dark:text-red-400"
        />
      </motion.div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <motion.div variants={itemVariants} className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Connected Systems</h2>
        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Checking integration health...</p>
        ) : !data || data.integrations.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-center text-sm text-slate-400 dark:text-slate-500 shadow-sm">
            No integrations configured yet.
          </div>
        ) : (
          data.integrations.map((item) => (
            <IntegrationRow key={item.name} item={item} />
          ))
        )}
      </motion.div>
    </motion.div>
  )
}