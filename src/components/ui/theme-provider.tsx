import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}
const ThemeProviderContext = createContext<ThemeProviderState>(initialState)
const isChrome = typeof chrome !== 'undefined' && chrome.storage

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'nanochat-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    if (!isChrome) return

    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) setTheme(result[storageKey] as Theme)
    })
  }, [storageKey, defaultTheme])

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      if (!isChrome) return

      chrome.storage.local.set({ [storageKey]: newTheme }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving theme:', chrome.runtime.lastError)
        }
      })

      setTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
