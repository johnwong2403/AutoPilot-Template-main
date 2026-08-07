'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import apiClient from '@/lib/api-client'
import { Icons } from '@/components/ui/icons'
import { PolicyCard, type Policy } from '@/components/ai/policies/PolicyCard'
import { PolicyDetailModal } from '@/components/ai/policies/PolicyDetailModal'
import { PolicyEditModal } from '@/components/ai/policies/PolicyEditModal'
import { CreateWithAI } from '@/components/ai/policies/CreateWithAI'
import { PermissionMatrixTab } from '@/components/ai/policies/PermissionMatrixTab'
import { StructuredBuilder } from '@/components/ai/policies/StructuredBuilder'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

type TabType = 'policies' | 'create-ai' | 'structured' | 'matrix'
type FilterType = 'all' | 'active' | 'inactive' | 'logical' | 'natural_language'
type SortType = 'newest' | 'oldest' | 'priority' | 'name' | 'executions'

const TABS = [
  { id: 'policies' as TabType, label: 'Policies', Icon: Icons.layers },
  { id: 'create-ai' as TabType, label: 'Create with AI', Icon: Icons.sparkles },
  { id: 'structured' as TabType, label: 'Structured Builder', Icon: Icons.grid },
  { id: 'matrix' as TabType, label: 'Permission Matrix', Icon: Icons.table },
]

export default function AIPoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('policies')

  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [searchQuery, setSearchQuery] = useState('')

  const [structuredDSL, setStructuredDSL] = useState<{conditions: Array<{field: string; operator: string; value: string}>; actions: Array<{type: string; value?: string}>; match_mode: 'all' | 'any'} | null>(null)
  const [structuredName, setStructuredName] = useState('')
  const [isSavingStructured, setIsSavingStructured] = useState(false)

  const loadPolicies = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await apiClient<Array<Record<string, unknown>>>('/api/policies')
      const mapped: Policy[] = data.map((p, idx) => ({
        id: String(p.id),
        name: String(p.name || ''),
        description: String(p.description || ''),
        natural_language: String(p.condition || p.description || ''),
        summary: String(p.description || ''),
        policy_type: p.policy_type === 'structured' ? 'logical' : 'natural_language',
        dsl: null,
        refined_instruction: null,
        ai_instruction: String(p.condition || p.description || ''),
        entity_name: null,
        is_active: Boolean(p.is_active),
        priority: idx,
        tags: [String(p.policy_type || 'policy')],
        execution_count: 0,
        last_executed_at: null,
        created_at: String(p.created_at || new Date().toISOString()),
        updated_at: String(p.updated_at || new Date().toISOString()),
      }))
      setPolicies(mapped)
    } catch (err) {
      console.error('Failed to load policies', err)
      setPolicies([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPolicies()
  }, [loadPolicies])

  const handleCardClick = useCallback((policy: Policy) => {
    setSelectedPolicy(policy)
    setIsDetailModalOpen(true)
  }, [])

  const handleEditFromDetail = useCallback((policy: Policy) => {
    setEditingPolicy(policy)
    setIsEditModalOpen(true)
  }, [])

  const handleSavePolicy = useCallback(async () => {
    loadPolicies()
  }, [loadPolicies])

  const togglePolicyStatus = useCallback(async (id: string, isActive: boolean) => {
    try {
      await apiClient(`/api/policies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      setPolicies(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p))
    } catch (err) {
      console.error('Failed to toggle policy', err)
    }
  }, [])

  const deletePolicy = useCallback(async (id: string) => {
    setPolicies(prev => prev.filter(p => p.id !== id))
  }, [])

  const handlePolicyCreate = async (policyData: {
    name: string
    description: string
    naturalLanguage: string
    policyType: 'logical' | 'natural_language'
    dsl: unknown
    refinedInstruction: string | null
    entityName: string | null
    tags: string[]
    priority: number
  }) => {
    const newPolicy: Policy = {
      id: `user-${Date.now()}`,
      name: policyData.name,
      description: policyData.description,
      natural_language: policyData.naturalLanguage,
      summary: policyData.description,
      policy_type: policyData.policyType,
      dsl: policyData.dsl as Policy['dsl'],
      refined_instruction: policyData.refinedInstruction,
      ai_instruction: policyData.naturalLanguage,
      entity_name: policyData.entityName,
      is_active: true,
      priority: policyData.priority,
      tags: policyData.tags,
      execution_count: 0,
      last_executed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setPolicies(prev => [newPolicy, ...prev])
    setActiveTab('policies')
  }

  const filteredPolicies = policies
    .filter((policy) => {
      if (filter === 'active' && !policy.is_active) return false
      if (filter === 'inactive' && policy.is_active) return false
      if (filter === 'logical' && policy.policy_type !== 'logical') return false
      if (filter === 'natural_language' && policy.policy_type !== 'natural_language') return false

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          policy.name.toLowerCase().includes(query) ||
          policy.description.toLowerCase().includes(query) ||
          policy.natural_language.toLowerCase().includes(query) ||
          policy.tags.some((tag) => tag.toLowerCase().includes(query))
        )
      }

      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(a.created_at).getTime()
        case 'priority':
          return a.priority - b.priority
        case 'name':
          return a.name.localeCompare(b.name)
        case 'executions':
          return b.execution_count - a.execution_count
        default:
          return 0
      }
    })

  const stats = {
    total: policies.length,
    active: policies.filter((p) => p.is_active).length,
    structured: policies.filter((p) => p.policy_type === 'logical').length,
    natural: policies.filter((p) => p.policy_type === 'natural_language').length,
  }

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            AI Policies
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Define business rules in natural language. The AI determines the best format.
          </p>
        </div>
        <button
          onClick={() => setActiveTab('create-ai')}
          className={cn(
            'flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/50 transition-transform hover:scale-105',
            activeTab !== 'policies' && 'opacity-50'
          )}
        >
          <Icons.plus className="h-4 w-4" />
          Create Policy
        </button>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="inline-flex gap-1 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-1.5 backdrop-blur-sm">
          {TABS.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
              whileTap={{ scale: 0.98 }}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activePolicyTab"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-500 shadow-md"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <tab.Icon className="h-4 w-4" />
                {tab.label}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {activeTab === 'policies' && (
          <motion.div
            key="policies-tab"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { value: stats.total, label: 'Total Policies', icon: Icons.layers, bg: 'bg-indigo-50 dark:bg-indigo-950', color: 'text-indigo-600 dark:text-indigo-400' },
                { value: stats.active, label: 'Active', icon: Icons.check, bg: 'bg-emerald-50 dark:bg-emerald-950', color: 'text-emerald-600 dark:text-emerald-400' },
                { value: stats.structured, label: 'Structured', icon: Icons.grid, bg: 'bg-blue-50 dark:bg-blue-950', color: 'text-blue-600 dark:text-blue-400' },
                { value: stats.natural, label: 'Natural Language', icon: Icons.brain, bg: 'bg-violet-50 dark:bg-violet-950', color: 'text-violet-600 dark:text-violet-400' },
              ].map((stat) => (
                <motion.div
                  key={stat.label}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bg)}>
                      <stat.icon className={cn('h-5 w-5', stat.color)} />
                    </div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{stat.label}</p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-slate-800 dark:text-slate-100">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            <motion.div variants={itemVariants} className="flex flex-col gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search policies..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                />
              </div>

              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterType)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 focus:border-indigo-300 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="logical">Structured</option>
                <option value="natural_language">Natural Language</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 focus:border-indigo-300 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="priority">Priority</option>
                <option value="name">Name</option>
                <option value="executions">Most Used</option>
              </select>
            </motion.div>

            <motion.div variants={itemVariants}>
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Icons.loader className="h-8 w-8 animate-spin text-indigo-500" />
                </div>
              ) : filteredPolicies.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-950 dark:to-blue-950">
                    <Icons.brain className="h-8 w-8 text-indigo-500" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {searchQuery || filter !== 'all' ? 'No matching policies' : 'No policies yet'}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400 dark:text-slate-500">
                    {searchQuery || filter !== 'all'
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Create your first AI policy using natural language.'}
                  </p>
                  <button
                    onClick={() => setActiveTab('create-ai')}
                    className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                  >
                    <Icons.sparkles className="h-4 w-4" />
                    Create with AI
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredPolicies.map((policy) => (
                    <PolicyCard
                      key={policy.id}
                      policy={policy}
                      onClick={handleCardClick}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'create-ai' && (
          <motion.div
            key="create-ai-tab"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
              <CreateWithAI
                onPolicyCreate={handlePolicyCreate}
                onCancel={() => setActiveTab('policies')}
              />
            </div>
          </motion.div>
        )}

        {activeTab === 'structured' && (
          <motion.div
            key="structured-tab"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
              <div className="mx-auto max-w-3xl">
                <div className="mb-8 text-center">
                  <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">Structured Rule Builder</h2>
                  <p className="text-slate-500 dark:text-slate-400">Visually build rules with conditions and actions</p>
                </div>
                <div className="mb-6">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Rule Name *</label>
                  <input
                    type="text"
                    value={structuredName}
                    onChange={(e) => setStructuredName(e.target.value)}
                    placeholder="e.g., Auto-Approve Low Value Items"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-base text-slate-700 dark:text-slate-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                  />
                </div>
                <StructuredBuilder onChange={(dsl) => setStructuredDSL(dsl)} />
                <div className="mt-8 flex justify-center gap-3">
                  <button
                    onClick={() => setActiveTab('policies')}
                    className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!structuredDSL || structuredDSL.conditions.length === 0 || !structuredName.trim() || isSavingStructured}
                    onClick={async () => {
                      if (!structuredDSL || !structuredName.trim()) return
                      setIsSavingStructured(true)
                      try {
                        await handlePolicyCreate({
                          name: structuredName.trim(),
                          description: '',
                          naturalLanguage: `Structured rule: ${structuredName}`,
                          policyType: 'logical',
                          dsl: {
                            conditions: structuredDSL.conditions.map(c => ({ field: c.field, operator: c.operator, value: c.value })),
                            actions: structuredDSL.actions.map(a => ({ type: a.type, value: a.value })),
                            match_mode: structuredDSL.match_mode,
                          },
                          refinedInstruction: null,
                          entityName: null,
                          tags: ['structured'],
                          priority: 50,
                        })
                        setStructuredName('')
                        setStructuredDSL(null)
                      } finally {
                        setIsSavingStructured(false)
                      }
                    }}
                    className="flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                  >
                    {isSavingStructured ? (
                      <>
                        <Icons.loader className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Icons.check className="h-4 w-4" />
                        Save Policy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'matrix' && (
          <motion.div
            key="matrix-tab"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            <PermissionMatrixTab />
          </motion.div>
        )}
      </AnimatePresence>

      <PolicyDetailModal
        policy={selectedPolicy}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedPolicy(null)
        }}
        onEdit={handleEditFromDetail}
        onToggleStatus={(id, isActive) => {
          togglePolicyStatus(id, isActive)
          setIsDetailModalOpen(false)
        }}
        onDelete={(id) => {
          deletePolicy(id)
          setIsDetailModalOpen(false)
        }}
      />

      <PolicyEditModal
        policy={editingPolicy}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingPolicy(null)
        }}
        onSave={handleSavePolicy}
      />
    </motion.div>
  )
}