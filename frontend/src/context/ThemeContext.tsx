'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import apiClient from '@/lib/api-client'

interface ThemeContextType {
  isDark: boolean
  toggleDark: () => Promise<void>
  setDark: (value: boolean) => Promise<void>
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface UserSettings {
  dark_mode: boolean
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [isDark, setIsDark] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const userEmail = session?.user?.email

  // Apply/remove the "dark" class on <html> whenever isDark changes.
  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [isDark])

  // Load the persisted preference once we know who's logged in.
  useEffect(() => {
    if (!userEmail || loaded) return
    ;(async () => {
      try {
        const settings = await apiClient<UserSettings>(`/api/settings/${encodeURIComponent(userEmail)}`)
        setIsDark(!!settings.dark_mode)
      } catch (err) {
        console.error('Failed to load theme preference', err)
      } finally {
        setLoaded(true)
      }
    })()
  }, [userEmail, loaded])

  const setDark = useCallback(
    async (value: boolean) => {
      setIsDark(value) // optimistic UI update
      if (!userEmail) return
      try {
        await apiClient(`/api/settings/${encodeURIComponent(userEmail)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dark_mode: value }),
        })
      } catch (err) {
        console.error('Failed to save theme preference', err)
        setIsDark(!value) // revert on failure
      }
    },
    [userEmail]
  )

  const toggleDark = useCallback(async () => {
    await setDark(!isDark)
  }, [isDark, setDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, setDark }}>
      {children}
    </ThemeContext.Provider>
  )
}