'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  FileText as EventsIcon,
  Play as TriggeredIcon,
  UserCheck as ApprovedIcon,
  UserX as RejectedIcon,
  Download as ExportIcon,
  RefreshCw as RefreshIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Search as SearchIcon,
} from 'lucide-react'

interface Evaluation {
  id: string
  policy_id: string
  policy_name: string
  employee_id: string | null
  result: string
  action_taken: string | null
  evaluated_at: string
  status: string
  reviewer_note: string | null
  reviewed_at: string | null
}

interface PaginatedResponse {
  items: Evaluation[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

interface Stats {
  total_events: number
  triggered: number
  approved: number
  rejected: number
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

function statusBadge(evaluation: Evaluation) {
  if (evaluation.result !== 'triggered') {
    return { label: 'Passed', className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' }
  }
  if (evaluation.status === 'approved') {
    return { label: 'Approved', className: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' }
  }
  if (evaluation.status === 'rejected') {
    return { label: 'Rejected', className: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400' }
  }
  return { label: 'Pending Review', className: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400' }
}

export default function AuditPage() {
  const [data, setData] = useState<PaginatedResponse | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const loadPage = useCallback(async (pageNum: number, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        page_size: String(pageSize),
      })
      if (statusFilter) params.append('status', statusFilter)

      const result = await apiClient<PaginatedResponse>(
        `/api/policies/evaluations/paginated?${params}`
      )
      setData(result)
    } catch (err) {
      console.error('Failed to load audit trail', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [pageSize, statusFilter])

  const loadStats = useCallback(async () => {
    try {
      const result = await apiClient<Stats>('/api/policies/evaluations/stats')
      setStats(result)
    } catch (err) {
      console.error('Failed to load audit stats', err)
    }
  }, [])

  useEffect(() => {
    loadPage(page)
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  const handleExport = async () => {
    setExporting(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const response = await fetch(`${apiUrl}${basePath}/api/policies/evaluations/export`)
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit_trail_export.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      setExporting(false)
    }
  }

  const filteredItems = (data?.items || []).filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.policy_name?.toLowerCase().includes(q) ||
      item.employee_id?.toLowerCase().includes(q) ||
      item.action_taken?.toLowerCase().includes(q)
    )
  })

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Audit Trail</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Complete history of every policy evaluation and human decision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60"
          >
            <ExportIcon className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            onClick={() => {
              loadPage(page, true)
              loadStats()
            }}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 disabled:opacity-60"
          >
            <RefreshIcon className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<EventsIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          iconBg="bg-indigo-50 dark:bg-indigo-950"
          label="Total Events"
          value={stats?.total_events ?? 0}
        />
        <StatCard
          icon={<TriggeredIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-50 dark:bg-blue-950"
          label="Triggered"
          value={stats?.triggered ?? 0}
        />
        <StatCard
          icon={<ApprovedIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950"
          label="Approved"
          value={stats?.approved ?? 0}
        />
        <StatCard
          icon={<RejectedIcon className="h-5 w-5 text-red-600 dark:text-red-400" />}
          iconBg="bg-red-50 dark:bg-red-950"
          label="Rejected"
          value={stats?.rejected ?? 0}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search by policy name, employee, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 focus:border-indigo-300 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="n/a">Passed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            Loading audit trail...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            No events found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Event</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Action</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Employee</th>
                  <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {filteredItems.map((item) => {
                  const badge = statusBadge(item)
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{item.policy_name}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-500 dark:text-slate-400" title={item.action_taken || ''}>
                        {item.action_taken || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', badge.className)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {item.employee_id || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
                        {new Date(item.evaluated_at).toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Showing {(data.page - 1) * data.page_size + 1}–
              {Math.min(data.page * data.page_size, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <PrevIcon className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                Page {data.page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <NextIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}