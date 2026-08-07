'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import apiClient from '@/lib/api-client'
import { useTheme } from '@/context/ThemeContext'
import { Avatar } from '@/components/ui/avatar'
import {
  Bell as NotificationsIcon,
  Lock as SecurityIcon,
  Link2 as IntegrationsIcon,
  Sliders as PreferencesIcon,
  ChevronRight as ChevronIcon,
  Moon as DarkModeIcon,
  Mail as EmailIcon,
  RefreshCw as AutoRefreshIcon,
  Pencil as EditIcon,
} from 'lucide-react'

interface UserSettings {
  user_email: string
  dark_mode: boolean
  email_alerts: boolean
  auto_refresh: boolean
  updated_at: string
}

const settingsSections = [
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Manage how you receive notifications',
    icon: NotificationsIcon,
    iconBg: 'bg-blue-50 dark:bg-blue-950',
    iconColor: 'text-blue-600 dark:text-blue-400',
    detail: 'Email alerts, in-app notifications, and digest frequency.',
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Password, 2FA, and session management',
    icon: SecurityIcon,
    iconBg: 'bg-violet-50 dark:bg-violet-950',
    iconColor: 'text-violet-600 dark:text-violet-400',
    detail: 'Managed through your organization\'s auth provider (AUTH_BYPASS in dev mode).',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connected apps and services',
    icon: IntegrationsIcon,
    iconBg: 'bg-emerald-50 dark:bg-emerald-950',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    detail: 'See real-time integration health on the Data Manager page.',
    linkTo: '/data-manager',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    description: 'Language, timezone, and display settings',
    icon: PreferencesIcon,
    iconBg: 'bg-amber-50 dark:bg-amber-950',
    iconColor: 'text-amber-600 dark:text-amber-400',
    detail: 'Timezone: Asia/Kuala_Lumpur · Language: English',
  },
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-gradient-to-r from-indigo-600 to-blue-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function SectionCard({
  section,
  expanded,
  onToggle,
}: {
  section: (typeof settingsSections)[number]
  expanded: boolean
  onToggle: () => void
}) {
  const Icon = section.icon
  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-5 text-left">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${section.iconBg}`}>
          <Icon className={`h-5 w-5 ${section.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{section.title}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">{section.description}</p>
        </div>
        <ChevronIcon className={`h-4 w-4 text-slate-300 dark:text-slate-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {section.detail}
          {section.linkTo && (
            <a href={section.linkTo} className="ml-2 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              View →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const { isDark, setDark } = useTheme()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const userEmail = session?.user?.email

  const loadSettings = useCallback(async () => {
    if (!userEmail) return
    setLoading(true)
    try {
      const data = await apiClient<UserSettings>(`/api/settings/${encodeURIComponent(userEmail)}`)
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings', err)
    } finally {
      setLoading(false)
    }
  }, [userEmail])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (settings && settings.dark_mode !== isDark) {
      setSettings({ ...settings, dark_mode: isDark })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  const handleToggle = async (field: keyof Pick<UserSettings, 'email_alerts' | 'auto_refresh'>, value: boolean) => {
    if (!userEmail || !settings) return
    setSettings({ ...settings, [field]: value })
    setSaving(true)
    try {
      const updated = await apiClient<UserSettings>(`/api/settings/${encodeURIComponent(userEmail)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      setSettings(updated)
    } catch (err) {
      console.error('Failed to save setting', err)
      setSettings((prev) => (prev ? { ...prev, [field]: !value } : prev))
    } finally {
      setSaving(false)
    }
  }

  const handleDarkModeToggle = async (value: boolean) => {
    setSaving(true)
    try {
      await setDark(value)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Manage your account and application preferences.</p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">Profile</h2>
        <div className="flex items-center gap-4">
          <Avatar
            src={session?.user?.image}
            fallback={session?.user?.name || session?.user?.email || '?'}
            size="lg"
            showRing
          />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{session?.user?.name || 'User'}</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500">{session?.user?.email}</p>
          </div>
          <button className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <EditIcon className="h-4 w-4" />
            Edit Profile
          </button>
        </div>
      </div>

      {/* Section cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            expanded={expandedSection === section.id}
            onToggle={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
          />
        ))}
      </div>

      {/* Quick Settings — real, persisted */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Quick Settings</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Saved to your account — persists across sessions.</p>
          </div>
          {saving && <span className="text-xs text-slate-400 dark:text-slate-500">Saving…</span>}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading your preferences...</p>
        ) : settings ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <DarkModeIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Dark Mode</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Switch theme</p>
                </div>
              </div>
              <Toggle checked={isDark} onChange={handleDarkModeToggle} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <EmailIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Email Alerts</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Receive email updates</p>
                </div>
              </div>
              <Toggle checked={settings.email_alerts} onChange={(v) => handleToggle('email_alerts', v)} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <AutoRefreshIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Auto Refresh</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Keep data up to date</p>
                </div>
              </div>
              <Toggle checked={settings.auto_refresh} onChange={(v) => handleToggle('auto_refresh', v)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Could not load preferences.</p>
        )}
      </div>
    </motion.div>
  )
}