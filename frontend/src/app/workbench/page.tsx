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
  ShieldCheck as ShieldCheckIcon,
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

// ============================================================================
// Confidential Disclosures — a deliberately separate, gated queue for
// sensitive pulse-survey comments (x_confidential = true in Peakon_
// Engagement). Never merged with the normal exception queue, never
// surfaced on the Dashboard or AI Insights. Matches the brief's
// requirement that a sensitive disclosure "must never appear on a
// dashboard and must reach the right person confidentially."
// ============================================================================

interface ConfidentialDisclosure {
  Response_ID: string
  Employee_ID?: string
  employee_name?: string | null
  Survey_Round?: string
  Milestone?: string
  Driver?: string
  Score?: number
  Comment?: string
  Submitted_At?: string
  manager_response_days?: number
}

function ConfidentialQueue() {
  const [unlocked, setUnlocked] = useState(false)
  const [disclosures, setDisclosures] = useState<ConfidentialDisclosure[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleUnlock = () => {
    setUnlocked(true)
    setLoading(true)
    apiClient<{ disclosures: ConfidentialDisclosure[] }>('/api/onboarding/confidential-disclosures')
      .then((data) => setDisclosures(data.disclosures || []))
      .catch((err) => {
        console.error('Failed to load confidential disclosures', err)
        setDisclosures([])
      })
      .finally(() => setLoading(false))
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950">
          <ConflictIcon className="h-6 w-6 text-red-500 rotate-90" />
        </div>
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">Restricted — Confidential Disclosures</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400 dark:text-slate-500">
            This queue contains sensitive pulse-survey comments. It never appears on the Dashboard or
            AI Insights, and is only visible to an authorized reviewer.
          </p>
        </div>
        <Button onClick={handleUnlock} className="bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600">
          <ShieldCheckIcon className="mr-2 h-4 w-4" />
          I am authorized — Unlock queue
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading confidential disclosures...</p>
      ) : !disclosures || disclosures.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 text-center text-sm text-slate-400 dark:text-slate-500 shadow-sm">
          No confidential disclosures right now.
        </div>
      ) : (
        disclosures.map((d) => (
          <div
            key={d.Response_ID}
            className="rounded-2xl border-l-4 border-l-red-400 bg-white dark:bg-slate-900 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {d.employee_name || d.Employee_ID || 'Unknown employee'}
                  {d.Employee_ID && d.employee_name && (
                    <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">({d.Employee_ID})</span>
                  )}
                </h3>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {d.Driver && <span>{d.Driver} · </span>}
                  {d.Milestone && <span>{d.Milestone} · </span>}
                  {d.Submitted_At && <span>{new Date(d.Submitted_At).toLocaleString()}</span>}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400">
                Confidential
              </span>
            </div>
            {d.Comment && (
              <p className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-200">
                &ldquo;{d.Comment}&rdquo;
              </p>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export default function WorkbenchPage() {
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [resolved, setResolved] = useState<Exception[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<ExceptionCategory | 'All'>('All')
  const [activeTab, setActiveTab] = useState<'exceptions' | 'confidential'>('exceptions')

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

      {/* Tab switcher: Exception Queue vs Confidential Disclosures */}
      <motion.div variants={itemVariants} className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('exceptions')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'exceptions'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          Exception Queue
        </button>
        <button
          onClick={() => setActiveTab('confidential')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'confidential'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          )}
        >
          <ShieldCheckIcon className="h-3.5 w-3.5" />
          Confidential
        </button>
      </motion.div>

      {activeTab === 'confidential' ? (
        <ConfidentialQueue />
      ) : (
        <>
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
        </>
      )}
    </motion.div>
  )
}