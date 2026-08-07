'use client'

import './globals.css'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Providers } from './providers'
import { Header } from '@/components/layout/Header'
import { Sidebar, SidebarProvider, useSidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { VisualPattern } from '@/components/brand'
import { ThemeProvider } from '@/context/ThemeContext'
import { Funnel_Display, Geologica } from 'next/font/google'
import { cn } from '@/lib/utils'

const funnel = Funnel_Display({
  subsets: ['latin'],
  variable: '--font-funnel',
  display: 'swap',
})

const geologica = Geologica({
  subsets: ['latin'],
  variable: '--font-geologica',
  display: 'swap',
})

const AUTH_ROUTES = ['/auth/signin', '/auth/register', '/auth/error']

function LayoutContent({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isCollapsed } = useSidebar()
  const pathname = usePathname()

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route))

  if (isAuthRoute) {
    return (
      <div className='min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950'>
        <VisualPattern variant='subtle' />
        <main className='relative z-10 flex min-h-screen items-center justify-center p-4'>
          {children}
        </main>
      </div>
    )
  }

  return (
    <>
      <VisualPattern variant='subtle' />
      <Sidebar />
      <MobileSidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <div
        className={cn(
          'min-h-screen',
          isCollapsed ? 'md:pl-16' : 'md:pl-64',
          'transition-all duration-300 ease-out'
        )}
      >
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        <main
          id='main-content'
          role='main'
          aria-label='Main content'
          className={cn('flex flex-col', 'pt-24', 'px-4 pb-8 lg:px-8', 'min-h-screen')}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <title>AutoPilot Command Center</title>
        <meta name='description' content='AI Command Center — Build, govern, and monitor your AI workforce' />
      </head>
      <body
        className={cn(
          'min-h-screen font-sans antialiased',
          'bg-background text-foreground',
          funnel.variable,
          geologica.variable
        )}
      >
        <Providers>
          <ThemeProvider>
            <SidebarProvider>
              <LayoutContent>{children}</LayoutContent>
            </SidebarProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}