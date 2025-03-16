declare module '*.svg' {
  import React = require('react')
  export const ReactComponent: React.SFC<React.SVGProps<SVGSVGElement>>
  const src: string
  export default src
}

declare module '*.json' {
  const content: string
  export default content
}

// Extend Chrome types to include AI API (not yet in chrome-types)
declare global {
  namespace chrome {
    export interface AIOriginTrial {
      languageModel: {
        create(options: LanguageModelOptions): Promise<LanguageModelSession>
      }
    }

    export interface LanguageModelOptions {
      systemPrompt?: string
      temperature?: number
      topK?: number
      topP?: number
      maxOutputTokens?: number
      initialPrompts?: Array<{
        role: 'system' | 'user' | 'assistant'
        content: string
      }>
    }

    export interface LanguageModelSession {
      prompt(prompt: string): Promise<string>
      destroy(): void
    }

    export const aiOriginTrial: AIOriginTrial
  }
}

export {}
