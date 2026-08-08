'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  X as XIcon,
  Check as CheckIcon,
  AlertTriangle as AlertTriangleIcon,
  ExternalLink as ExternalLinkIcon,
  Hourglass as PendingIcon,
  ShieldCheck as ResolvedIcon,
  ThumbsUp as ApprovedIcon,
  HelpCircle as LowConfidenceIcon,
  GitMerge as ConflictIcon,
  FileWarning as MissingDataIcon,
  Flame as HighStakesIcon,
  Sparkles as NovelIcon,
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

interface Exception {
  id: string
  policy_id: string
  policy_name: string
  employee_id: string | null
  result: string
  action_taken: string | null
  context?: Record<string, unknown> | null
  evaluated_at?: string
  status: string
  reviewer_note?: string | null
  reviewed_at?: string | null
}

// ============================================================================
// Exception Category — maps every exception to one of the five categories
// the Round 2 brief defines (Low Confidence, Policy Conflict, Missing Data,
// High Stakes, Novel Scenario). Derived client-side from existing fields —
// no backend change required.
// ============================================================================

type ExceptionCategory =
  | 'Missing Data'
  | 'High Stakes'
  | 'Policy Conflict'
  | 'Low Confidence'
  | 'Novel Scenario'

const ALL_CATEGORIES: ExceptionCategory[] = [
  'Missing Data',
  'High Stakes',
  'Policy Conflict',
  'Low Confidence',
  'Novel Scenario',
]

const CATEGORY_STYLES: Record<
  ExceptionCategory,
  { icon: React.ReactNode; className: string; activeClassName: string }
> = {
  'Missing Data': {
    icon: <MissingDataIcon className="h-3 w-3" />,
    className:
      'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    activeClassName: 'border-slate-500 bg-slate-600 text-white dark:bg-slate-600',
  },
  'High Stakes': {
    icon: <HighStakesIcon className="h-3 w-3" />,
    className:
      'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400',
    activeClassName: 'border-red-500 bg-red-600 text-white',
  },
  'Policy Conflict': {
    icon: <ConflictIcon className="h-3 w-3" />,
    className:
      'border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400',
    activeClassName: 'border-purple-500 bg-purple-600 text-white',
  },
  'Low Confidence': {
    icon: <LowConfidenceIcon className="h-3 w-3" />,
    className:
      'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-400',
    activeClassName: 'border-yellow-500 bg-yellow-600 text-white',
  },
  'Novel Scenario': {
    icon: <NovelIcon className="h-3 w-3" />,
    className:
      'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400',
    activeClassName: 'border-blue-500 bg-blue-600 text-white',
  },
}

function categorizeException(item: Exception): ExceptionCategory {
  const policyName = (item.policy_name || '').toLowerCase()
  const actionTaken = (item.action_taken || '').toLowerCase()
  const contextStr = JSON.stringify(item.context || {}).toLowerCase()

  if (
    policyName.includes('missing') ||
    contextStr.includes('missing') ||
    contextStr.includes('"null"') ||
    contextStr.includes(':null')
  ) {
    return 'Missing Data'
  }
  if (contextStr.includes('confidence')) {
    return 'Low Confidence'
  }
  if (policyName.includes('conflict') || actionTaken.includes('conflict')) {
    return 'Policy Conflict'
  }
  if (
    policyName.includes('risk') ||
    actionTaken.includes('escalate') ||
    contextStr.includes('risk_score')
  ) {
    return 'High Stakes'
  }
  return 'Novel Scenario'
}

function CategoryBadge({ category }: { category: ExceptionCategory }) {
  const style = CATEGORY_STYLES[category]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        style.className
      )}
    >
      {style.icon}
      {category}
    </span>
  )
}

function CategoryFilterBar({
  exceptions,
  activeFilter,
  onSelect,
}: {
  exceptions: Exception[]
  activeFilter: ExceptionCategory | 'All'
  onSelect: (cat: ExceptionCategory | 'All') => void
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { All: exceptions.length }
    for (const cat of ALL_CATEGORIES) map[cat] = 0
    for (const item of exceptions) {
      const cat = categorizeException(item)
      map[cat] = (map[cat] || 0) + 1
    }
    return map
  }, [exceptions])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect('All')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
          activeFilter === 'All'
            ? 'border-indigo-500 bg-indigo-600 text-white'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
        )}
      >
        All
        <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5">{counts.All}</span>
      </button>
      {ALL_CATEGORIES.map((cat) => {
        const style = CATEGORY_STYLES[cat]
        const isActive = activeFilter === cat
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              isActive ? style.activeClassName : style.className
            )}
          >
            {style.icon}
            {cat}
            <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5">{counts[cat] || 0}</span>
          </button>
        )
      })}
    </div>
  )
}

function formatContext(context?: Record<string, unknown> | null) {
  if (!context) return []
  return Object.entries(context).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }))
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

function ExceptionCard({
  item,
  onResolve,
  resolvingId,
}: {
  item: Exception
  onResolve: (id: string, status: 'approved' | 'rejected', note: string) => void
  resolvingId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const isResolving = resolvingId === item.id
  const category = categorizeException(item)

  return (
    <motion.div variants={itemVariants}>
      <div className="rounded-2xl border-l-4 border-l-amber-400 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
              <AlertTriangleIcon className="h-4 w-4 text-amber-500" />
              {item.policy_name}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Employee: {item.employee_id || 'Unknown'}
              {item.evaluated_at && (
                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                  · {new Date(item.evaluated_at).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-full border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Pending Review
            </span>
            <CategoryBadge category={category} />
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              AI Recommendation
            </p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {item.action_taken || 'No action specified'}
            </p>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {expanded ? '▼' : '▶'} Full context
          </button>

          {expanded && (
            <div className="space-y-1 rounded-xl border border-slate-100 dark:border-slate-800 p-3 text-sm">
              {formatContext(item.context).length > 0 ? (
                formatContext(item.context).map((row) => (
                  <div key={row.key} className="flex justify-between gap-4">
                    <span className="text-slate-400 dark:text-slate-500">{row.key}</span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{row.value}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 dark:text-slate-500">No additional context recorded.</p>
              )}
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reviewer note (optional)"
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-sm text-slate-700 dark:text-slate-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
            rows={2}
          />

          <div className="flex gap-3">
            <Button
              onClick={() => onResolve(item.id, 'approved', note)}
              disabled={isResolving}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600"
            >
              <CheckIcon className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button
              onClick={() => onResolve(item.id, 'rejected', note)}
              disabled={isResolving}
              variant="outline"
              className="flex-1"
            >
              <XIcon className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function WorkbenchPage() {
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [resolved, setResolved] = useState<Exception[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<ExceptionCategory | 'All'>('All')

  const loadExceptions = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient<Exception[]>('/api/policies/exceptions')
      setExceptions(data.filter((e) => e.status === 'pending'))
      setResolved(data.filter((e) => e.status !== 'pending'))
    } catch (err) {
      console.error('Failed to load exceptions', err)
      setError('Could not load exception queue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExceptions()
  }, [])

  const handleResolve = async (
    id: string,
    status: 'approved' | 'rejected',
    note: string
  ) => {
    setResolvingId(id)
    try {
      await apiClient(`/api/policies/exceptions/${id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_note: note || null }),
      })
      await loadExceptions()
    } catch (err) {
      console.error('Failed to resolve exception', err)
      setError('Could not save your decision. Try again.')
    } finally {
      setResolvingId(null)
    }
  }

  const filteredExceptions = useMemo(() => {
    if (categoryFilter === 'All') return exceptions
    return exceptions.filter((item) => categorizeException(item) === categoryFilter)
  }, [exceptions, categoryFilter])

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
            Workbench
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Policy exceptions awaiting human review.
          </p>
        </div>
        <a href="https://auto.supervity.ai/u/alpha/agent/workflow/019fc5b7-db5c-7000-9f3d-8d2b06584dc3?tab=Audit+Trail" target="_blank" rel="noopener noreferrer">
          <Button className="bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600">
            <ExternalLinkIcon className="mr-2 h-4 w-4" />
            Review in Supervity Auto
          </Button>
        </a>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<PendingIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-950"
          label="Pending"
          value={exceptions.length}
        />
        <StatCard
          icon={<ResolvedIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950"
          label="Resolved"
          value={resolved.length}
        />
        <StatCard
          icon={<ApprovedIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-50 dark:bg-violet-950"
          label="Approved"
          value={resolved.filter((r) => r.status === 'approved').length}
        />
      </motion.div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Exception Queue</h2>
        </div>

        {!loading && exceptions.length > 0 && (
          <CategoryFilterBar
            exceptions={exceptions}
            activeFilter={categoryFilter}
            onSelect={setCategoryFilter}
          />
        )}

        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading exception queue...</p>
        ) : exceptions.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-center text-sm text-slate-400 dark:text-slate-500 shadow-sm">
            No pending exceptions. Run an onboarding cycle from the Dashboard to generate one.
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-center text-sm text-slate-400 dark:text-slate-500 shadow-sm">
            No exceptions in the &ldquo;{categoryFilter}&rdquo; category right now.
          </div>
        ) : (
          filteredExceptions.map((item) => (
            <ExceptionCard
              key={item.id}
              item={item}
              onResolve={handleResolve}
              resolvingId={resolvingId}
            />
          ))
        )}
      </motion.div>

      {resolved.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recently Resolved</h2>
          <div className="space-y-2">
            {resolved.slice(0, 5).map((item) => {
              const category = categorizeException(item)
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.policy_name}</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      {item.employee_id || 'Unknown'}
                    </span>
                    <CategoryBadge category={category} />
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-1 text-xs font-semibold',
                      item.status === 'approved'
                        ? 'border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                        : 'border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400'
                    )}
                  >
                    {item.status}
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}