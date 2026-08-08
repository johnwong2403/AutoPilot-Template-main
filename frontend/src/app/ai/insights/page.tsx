'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import {
  AlertCircle as CriticalIcon,
  AlertTriangle as WarningIcon,
  Lightbulb as RecommendationIcon,
  Sparkles as SparklesIcon,
  Loader2 as LoaderIcon,
  TrendingUp as ConfidenceIcon,
  Activity as SummaryIcon,
  Layers as PatternsIcon,
  Zap as ActionsIcon,
  X as XIcon,
} from 'lucide-react'

interface RawInsight {
  id: string
  type: string
  title: string
  description: string
  severity: string
  action_path?: string | null
  source_summary?: Record<string, unknown> | null
  generated_at: string
}

interface InsightsSummary {
  ai_confidence: number
  positive_signals: number
}

const tabs = [
  { id: 'summary', label: 'Summary', icon: SummaryIcon },
  { id: 'patterns', label: 'Patterns', icon: PatternsIcon },
  { id: 'actions', label: 'Actions', icon: ActionsIcon },
]

const severityStyles: Record<string, { bg: string; border: string; badge: string; icon: React.ElementType }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-l-red-500', badge: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400', icon: CriticalIcon },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-l-amber-400', badge: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400', icon: WarningIcon },
  info: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-l-indigo-400', badge: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400', icon: RecommendationIcon },
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
  value: string | number
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

function InsightCard({
  insight,
  onDismiss,
  onAction,
}: {
  insight: RawInsight
  onDismiss: (id: string) => void
  onAction: (path: string) => void
}) {
  const style = severityStyles[insight.severity] || severityStyles.info
  const Icon = style.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn('relative rounded-2xl border-l-4 p-5', style.bg, style.border)}
    >
      <button
        onClick={() => onDismiss(insight.id)}
        className="absolute right-4 top-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <XIcon className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.badge)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{insight.title}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.badge)}>
              {insight.severity}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {insight.type} · {new Date(insight.generated_at).toLocaleDateString()}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{insight.description}</p>

          {insight.source_summary && Object.keys(insight.source_summary).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs">
              {Object.entries(insight.source_summary).map(([key, value]) => (
                <span key={key} className="text-slate-500 dark:text-slate-400">
                  <span className="text-slate-400 dark:text-slate-500">{key.replace(/_/g, ' ')}: </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{String(value)}</span>
                </span>
              ))}
            </div>
          )}

          {insight.action_path && (
            <button
              onClick={() => onAction(insight.action_path!)}
              className="mt-4 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
            >
              <ActionsIcon className="h-3 w-3" />
              {insight.action_path}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function AIInsightsPage() {
  const [activeTab, setActiveTab] = useState('summary')
  const [insights, setInsights] = useState<RawInsight[]>([])
  const [summary, setSummary] = useState<InsightsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [insightsData, summaryData] = await Promise.all([
        apiClient<RawInsight[]>('/api/insights'),
        apiClient<InsightsSummary>('/api/insights/summary'),
      ])
      setInsights(insightsData)
      setSummary(summaryData)
    } catch (err) {
      console.error('Failed to load insights', err)
      setError('Could not load insights.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setError(null)
    try {
      await apiClient('/api/insights/generate', { method: 'POST' })
      await fetchAll()
    } catch (err) {
      console.error('Failed to generate insights', err)
      setError('Could not generate new insights.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleDismiss = useCallback((id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const handleAction = useCallback(
    (path: string) => {
      router.push(path)
    },
    [router]
  )

  const criticalCount = insights.filter((i) => i.severity === 'critical').length
  const warningCount = insights.filter((i) => i.severity === 'warning').length
  // Fixed: was `i.severity === 'info'`, which also matched `pattern`-type
  // insights (they carry severity "info" too) and made this number
  // disagree with the Actions tab, which filters strictly on
  // `type === 'recommendation'`. Now both use the same criterion.
  const recommendationCount = insights.filter((i) => i.type === 'recommendation').length

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">AI Insights</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            AI-powered analysis of your data. Discover patterns, anomalies, and optimization opportunities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 shadow-sm">
              <ConfidenceIcon className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">AI Confidence</p>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{summary.ai_confidence}%</p>
              </div>
            </div>
          )}
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/50 transition-transform hover:scale-105 disabled:opacity-60"
          >
            {isAnalyzing ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                Run Analysis
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<CriticalIcon className="h-5 w-5 text-red-600 dark:text-red-400" />}
          iconBg="bg-red-50 dark:bg-red-950"
          label="Critical Issues"
          value={criticalCount}
        />
        <StatCard
          icon={<WarningIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-50 dark:bg-amber-950"
          label="Warnings"
          value={warningCount}
        />
        <StatCard
          icon={<RecommendationIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-950"
          label="Recommendations"
          value={recommendationCount}
        />
      </div>

      <div className="inline-flex items-center gap-1 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-1 backdrop-blur-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeInsightTab"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-500 shadow-md"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <LoaderIcon className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : activeTab === 'summary' ? (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">All Insights</h2>
              <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
                {insights.length} insight{insights.length !== 1 ? 's' : ''} generated from your data analysis.
              </p>

              {insights.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-950 dark:to-blue-950">
                    <RecommendationIcon className="h-8 w-8 text-indigo-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">No insights yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-slate-400 dark:text-slate-500">
                    Run an analysis to discover patterns, anomalies, and recommendations.
                  </p>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="mt-6 flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Generate Insights
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence>
                    {insights.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={handleDismiss}
                        onAction={handleAction}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : activeTab === 'patterns' ? (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Detected Patterns</h2>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                Pattern-type insights from your live data will appear here as they are detected.
              </p>
              <div className="mt-4 space-y-4">
                <AnimatePresence>
                  {insights
                    .filter((i) => i.type === 'pattern')
                    .map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={handleDismiss}
                        onAction={handleAction}
                      />
                    ))}
                </AnimatePresence>
                {insights.filter((i) => i.type === 'pattern').length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No patterns detected yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recommended Actions</h2>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                Recommendation-type insights with a suggested next step.
              </p>
              <div className="mt-4 space-y-4">
                <AnimatePresence>
                  {insights
                    .filter((i) => i.type === 'recommendation')
                    .map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={handleDismiss}
                        onAction={handleAction}
                      />
                    ))}
                </AnimatePresence>
                {insights.filter((i) => i.type === 'recommendation').length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No recommended actions yet.</p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}