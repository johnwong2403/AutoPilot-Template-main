'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import {
  ExternalLink as ExternalLinkIcon,
  RotateCcw as ResetIcon,
  Play as PlayIcon,
  Users as UsersIcon,
  Bot as BotIcon,
  ShieldAlert as ShieldIcon,
  UserCheck as EscalatedIcon,
  CheckCircle2 as CheckIcon,
  AlertTriangle as WarningIcon,
  User as UserIcon,
} from 'lucide-react'

const AUTO_AUDIT_TRAIL_URL =
  'https://auto.supervity.ai/u/alpha/agent/workflow/019fc5b7-db5c-7000-9f3d-8d2b06584dc3?tab=Audit+Trail'

interface LatestTask {
  Event_ID?: string
  Employee_ID?: string
  Business_Process?: string
  Step_Name?: string
  Status?: string
  Completed_Date?: string
  Due_Date?: string
  Assigned_To_Role?: string
  Milestone?: string
}

interface Worker {
  Employee_ID?: string
  Legal_Name?: string
  Preferred_Name?: string
  Full_Name?: string
  Name?: string
  Business_Title?: string
  Job_Profile?: string
  Job_Family?: string
  Email_Work?: string
  Hire_Date?: string
}

interface EmployeeSnapshot {
  status: string
  message?: string
  latest_task?: LatestTask | null
  worker?: Worker | null
}

interface PolicyEvalResult {
  policy_id: string
  policy_name: string
  employee_id: string | null
  result: string
  action_taken: string | null
}

interface ActivityRunStep {
  id?: string
  stepId?: string
  stepName?: string
  status?: string
  startedAt?: string
  completedAt?: string
}

interface RunState {
  id: string
  workflow_id: string | null
  status: 'running' | 'completed' | 'error' | string
  activity_runs: ActivityRunStep[]
  policy_results: PolicyEvalResult[]
  triggered_at: string
}

interface TimelineEvent {
  key: string
  icon: React.ReactNode
  label: string
  detail?: string
  time?: string
  tone: 'success' | 'warning' | 'info'
}

function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

function buildTimeline(runState: RunState | null): TimelineEvent[] {
  if (!runState) return []
  const events: TimelineEvent[] = []
  const t = new Date(runState.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  events.push({ key: 'started', icon: <CheckIcon className="h-4 w-4" />, label: 'Onboarding Cycle Started', detail: 'Orchestrator triggered', time: t, tone: 'success' })

  for (const step of runState.activity_runs) {
    const isCompleted = (step.status || '').toLowerCase() === 'completed'
    const stepTime = step.completedAt
      ? new Date(step.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : t
    events.push({
      key: `step-${step.id || step.stepId || step.stepName}`,
      icon: isCompleted ? <CheckIcon className="h-4 w-4" /> : <WarningIcon className="h-4 w-4" />,
      label: `${step.stepName || 'Operator step'} ${isCompleted ? 'Completed' : step.status || ''}`.trim(),
      time: stepTime,
      tone: isCompleted ? 'success' : 'warning',
    })
  }

  if (runState.policy_results.length > 0) {
    const triggered = runState.policy_results.filter((r) => r.result === 'triggered')
    for (const r of triggered) {
      events.push({
        key: `policy-${r.policy_id}`,
        icon: <WarningIcon className="h-4 w-4" />,
        label: `${r.policy_name} Triggered`,
        detail: r.action_taken || undefined,
        time: t,
        tone: 'warning',
      })
    }
    if (triggered.length > 0) {
      events.push({
        key: 'workbench-sent',
        icon: <UserIcon className="h-4 w-4" />,
        label: `${triggered.length} Exception${triggered.length > 1 ? 's' : ''} sent to Workbench`,
        detail: 'Pending human review',
        time: t,
        tone: 'info',
      })
    }
  }

  if (runState.status === 'running') {
    events.push({ key: 'waiting', icon: <WarningIcon className="h-4 w-4" />, label: 'Waiting on human review in Supervity Auto', time: '—', tone: 'warning' })
  }

  return events.slice(-8).reverse()
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

export default function HomePage() {
  const [runState, setRunState] = useState<RunState | null>(null)
  const [employeeSnapshot, setEmployeeSnapshot] = useState<EmployeeSnapshot | null>(null)
  const [triggerBusy, setTriggerBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastFetchedEmployeeId = useRef<string | null>(null)

  const pollRunState = useCallback(async () => {
    try {
      const state = await apiClient<RunState | null>('/api/onboarding/run-state')
      setRunState(state)
      return state
    } catch (err) {
      console.error('Failed to poll run state', err)
      return null
    }
  }, [])

  const fetchEmployeeSnapshot = useCallback(async (employeeId: string) => {
    if (lastFetchedEmployeeId.current === employeeId) return
    lastFetchedEmployeeId.current = employeeId
    try {
      const data = await apiClient<EmployeeSnapshot>(`/api/onboarding/employee/${employeeId}`)
      setEmployeeSnapshot(data)
    } catch (err) {
      console.error('Failed to load employee snapshot', err)
    }
  }, [])

  useEffect(() => {
    pollRunState()

    pollRef.current = setInterval(() => {
      pollRunState()
    }, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollRunState])

  useEffect(() => {
    const employeeId = runState?.policy_results?.[0]?.employee_id
    if (employeeId) {
      fetchEmployeeSnapshot(employeeId)
    } else if (!runState) {
      lastFetchedEmployeeId.current = null
      setEmployeeSnapshot(null)
    }
  }, [runState, fetchEmployeeSnapshot])

  const handleRunOrchestrator = async () => {
    setTriggerBusy(true)
    setTriggerError(null)
    try {
      const newRun = await apiClient<RunState>('/api/onboarding/trigger', {
        method: 'POST',
      })
      setRunState(newRun)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start onboarding cycle'
      setTriggerError(message)
    } finally {
      setTriggerBusy(false)
    }
  }

  const handleReset = async () => {
    setResetBusy(true)
    setTriggerError(null)
    try {
      await apiClient('/api/onboarding/run-state', { method: 'DELETE' })
      setRunState(null)
      setEmployeeSnapshot(null)
      lastFetchedEmployeeId.current = null
      setShowRaw(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset'
      setTriggerError(message)
    } finally {
      setResetBusy(false)
    }
  }

  const isRunning = runState?.status === 'running'
  const activityRuns = runState?.activity_runs || []
  const policyResults = runState?.policy_results || []
  const triggeredCount = policyResults.filter((r) => r.result === 'triggered').length
  const lastProcessedEmployeeId = policyResults[0]?.employee_id || null
  const timeline = buildTimeline(runState)

  const workerName =
    employeeSnapshot?.worker?.Legal_Name ||
    employeeSnapshot?.worker?.Preferred_Name ||
    employeeSnapshot?.worker?.Full_Name ||
    employeeSnapshot?.worker?.Name ||
    null

  const completedSteps = activityRuns.filter((s) => (s.status || '').toLowerCase() === 'completed').length
  const progressPct = activityRuns.length > 0 ? Math.round((completedSteps / activityRuns.length) * 100) : 0
  const ringCircumference = 2 * Math.PI * 42
  const ringOffset = ringCircumference * (1 - progressPct / 100)

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Greeting header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
            Onboarding &amp; Retention{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">
              Command Center
            </span>
            <span className="text-2xl">👋</span>
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Live view of the Orchestrator&rsquo;s work.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetBusy || isRunning}
        >
          <ResetIcon className="mr-2 h-4 w-4" />
          {resetBusy ? 'Resetting…' : 'Reset'}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<UsersIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-50 dark:bg-blue-950"
          label="Last Employee Processed"
          value={lastProcessedEmployeeId || 'No run yet'}
        />
        <StatCard
          icon={<BotIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950"
          label="Auto Operators Run"
          value={activityRuns.length > 0 ? `${activityRuns.length} steps` : '—'}
        />
        <StatCard
          icon={<ShieldIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-50 dark:bg-violet-950"
          label="Policies Evaluated"
          value={policyResults.length > 0 ? `${policyResults.length} / ${triggeredCount} triggered` : '0 / —'}
        />
        <StatCard
          icon={<EscalatedIcon className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
          iconBg="bg-rose-50 dark:bg-rose-950"
          label="Escalated to Human"
          value={triggeredCount > 0 ? 'Yes' : 'No'}
        />
      </div>

      {/* Run AI Workflow banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-500 p-6 text-white shadow-lg">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <BotIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-semibold">Run AI Workflow</p>
              <p className="text-sm text-white/80">
                Trigger the onboarding cycle, refresh data and evaluate policies.
              </p>
            </div>
          </div>
          <Button
            onClick={handleRunOrchestrator}
            disabled={triggerBusy || isRunning}
            className="bg-white text-indigo-700 hover:bg-white/90"
            size="lg"
          >
            <PlayIcon className="mr-2 h-4 w-4" />
            {isRunning ? 'Running…' : triggerBusy ? 'Starting…' : 'Start Orchestrator'}
          </Button>
        </div>
      </div>

      {triggerError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-700 dark:text-red-300">
          {triggerError}
        </div>
      )}

      {isRunning && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            ⏸ This run may be waiting on human review in Supervity Auto.
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Progress updates automatically every few seconds. The Dashboard will keep polling and
            update the moment it completes, even if you navigate away and come back.
          </p>
          <a href={AUTO_AUDIT_TRAIL_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              Review &amp; Approve in Supervity Auto
            </Button>
          </a>
        </div>
      )}

      {/* Recent Activity + Latest Employee Snapshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Recent Activity</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No run yet. Click &ldquo;Start Orchestrator&rdquo; to trigger the Orchestrator.
            </p>
          ) : (
            <div className="space-y-4">
              {timeline.map((event) => (
                <div key={event.key} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      event.tone === 'success'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                        : event.tone === 'warning'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {event.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{event.label}</p>
                    {event.detail && <p className="text-xs text-slate-400 dark:text-slate-500">{event.detail}</p>}
                  </div>
                  {event.time && <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{event.time}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest Employee Snapshot */}
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Latest Employee Snapshot</h2>

          {!lastProcessedEmployeeId ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No run yet. Employee details will appear here once the Orchestrator processes someone.
            </p>
          ) : (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-1 gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-400 text-lg font-bold text-white">
                  {(workerName || lastProcessedEmployeeId).slice(0, 2).toUpperCase()}
                </div>
                <dl className="grid flex-1 grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-400 dark:text-slate-500">Employee</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-100">
                    {workerName ? `${workerName} (${lastProcessedEmployeeId})` : lastProcessedEmployeeId}
                  </dd>
                  {employeeSnapshot?.worker?.Business_Title && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Title</dt>
                      <dd className="text-slate-700 dark:text-slate-200">{employeeSnapshot.worker.Business_Title}</dd>
                    </>
                  )}
                  {employeeSnapshot?.worker?.Job_Profile && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Role</dt>
                      <dd className="text-slate-700 dark:text-slate-200">{employeeSnapshot.worker.Job_Profile}</dd>
                    </>
                  )}
                  {employeeSnapshot?.worker?.Hire_Date && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Hire Date</dt>
                      <dd className="text-slate-700 dark:text-slate-200">
                        {employeeSnapshot.worker.Hire_Date}
                        {daysSince(employeeSnapshot.worker.Hire_Date) !== null && (
                          <span className="ml-2 text-slate-400 dark:text-slate-500">
                            ({daysSince(employeeSnapshot.worker.Hire_Date)} days ago)
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                  {employeeSnapshot?.latest_task?.Business_Process && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Process</dt>
                      <dd>
                        <span className="rounded-full bg-blue-50 dark:bg-blue-950 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
                          {employeeSnapshot.latest_task.Business_Process}
                        </span>
                      </dd>
                    </>
                  )}
                  {employeeSnapshot?.latest_task?.Step_Name && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Step</dt>
                      <dd className="text-slate-700 dark:text-slate-200">{employeeSnapshot.latest_task.Step_Name}</dd>
                    </>
                  )}
                  {employeeSnapshot?.latest_task?.Status && (
                    <>
                      <dt className="text-slate-400 dark:text-slate-500">Status</dt>
                      <dd>
                        <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {employeeSnapshot.latest_task.Status}
                        </span>
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {activityRuns.length > 0 && (
                <div className="flex shrink-0 flex-col items-center">
                  <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="url(#ringGradient)"
                      strokeWidth="8"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#4f46e5" />
                        <stop offset="100%" stopColor="#3b82f6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="-mt-16 flex flex-col items-center">
                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{progressPct}%</span>
                  </div>
                  <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">Completed</p>
                </div>
              )}
            </div>
          )}

          {activityRuns.length > 0 && (
            <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-1">
              {activityRuns.map((step, idx) => {
                const isCompleted = (step.status || '').toLowerCase() === 'completed'
                return (
                  <div key={step.id || idx} className="flex items-center">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                      }`}
                      title={step.stepName}
                    >
                      {isCompleted ? <CheckIcon className="h-3.5 w-3.5" /> : <WarningIcon className="h-3.5 w-3.5" />}
                    </div>
                    {idx < activityRuns.length - 1 && (
                      <div className={`h-px w-4 ${isCompleted ? 'bg-emerald-300' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Policy Evaluation Results */}
      {policyResults.length > 0 && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Policy Evaluation Results</h2>
          <div className="space-y-2">
            {policyResults.map((r) => (
              <div
                key={r.policy_id}
                className={`flex items-center justify-between rounded-xl border p-3 text-sm ${
                  r.result === 'triggered'
                    ? 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                }`}
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.policy_name}</span>
                <span className={r.result === 'triggered' ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}>
                  {r.result === 'triggered' ? `Triggered → ${r.action_taken}` : 'Passed'}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="mt-3 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            {showRaw ? '▼' : '▶'} View raw policy evaluation response
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-800 p-4 text-xs text-slate-700 dark:text-slate-300">
              {JSON.stringify(policyResults, null, 2)}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  )
}