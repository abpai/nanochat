import React from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '@pages/panel/Panel'
import '@assets/styles/tailwind.css'
import { ThemeProvider } from '@src/components/ui/theme-provider'

function init() {
  const rootContainer = document.querySelector('#__root')
  if (!rootContainer) throw new Error("Can't find Panel root element")
  const root = createRoot(rootContainer)
  root.render(
    <ThemeProvider defaultTheme="dark" storageKey="nanochat-theme">
      <Panel />
    </ThemeProvider>,
  )
}

init()
