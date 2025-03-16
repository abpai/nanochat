import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@src/components/ui/button'
import { Textarea } from '@src/components/ui/textarea'
import { ScrollArea } from '@src/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@src/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@src/components/ui/tooltip'

import { Badge } from '@src/components/ui/badge'
import { useTheme } from '@src/components/ui/theme-provider'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, X, History, Eye, Send, Moon, Sun } from 'lucide-react'

import '@pages/panel/Panel.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type ChatSession = {
  id: string
  title: string
  timestamp: string
  messages: Message[]
}

const isChrome = typeof chrome !== 'undefined'

export default function Panel() {
  const { theme, setTheme } = useTheme()

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm NanoChat. How can I help you today?",
    },
  ])
  const [input, setInput] = useState('')
  const [temperature, setTemperature] = useState('default')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useTabContext, setUseTabContext] = useState(true)
  const [hasTabContext, setHasTabContext] = useState(false)
  const [currentTabContext, setCurrentTabContext] = useState<string>('')
  const [showHistory, setShowHistory] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([])
  const [currentChatId, setCurrentChatId] = useState<string>(generateUniqueId())
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [pendingTabContextUpdate, setPendingTabContextUpdate] = useState(false)

  const aiSessionRef = useRef<chrome.LanguageModelSession | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const resetAISession = useCallback(() => {
    if (aiSessionRef.current) {
      if (sessionActive) {
        setPendingTabContextUpdate(true)
        return
      }

      aiSessionRef.current.destroy()
      aiSessionRef.current = null
    }
  }, [sessionActive])

  useEffect(() => {
    const checkApiAvailability = async () => {
      try {
        if (isChrome && chrome.aiOriginTrial) {
          setApiAvailable(true)
        } else {
          setApiAvailable(false)
          console.warn('Chrome AI API not available. Using fallback responses.')
        }
      } catch (error) {
        setApiAvailable(false)
        console.error('Error checking API availability:', error)
      }
    }

    checkApiAvailability()
    loadChatHistory()

    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: 'Hello! How can I help?' }])
    }

    if (useTabContext) fetchTabContext()

    return () => {
      console.log('unmounting')
      resetAISession()
    }
  }, [])

  useEffect(() => {
    const handleTabUpdate = () => {
      if (!isChrome || !chrome.tabs || !useTabContext) return

      console.log('Setting up tab change listeners')

      // Event listeners for tab changes
      const onTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
        console.log('tab activated')
        fetchTabContext()
      }

      const onTabUpdated = (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
      ) => {
        if (changeInfo.status === 'complete') {
          console.log('tab updated')
          fetchTabContext()
        }
      }

      chrome.tabs.onActivated.addListener(onTabActivated)
      chrome.tabs.onUpdated.addListener(onTabUpdated)

      return () => {
        console.log('removing tab listeners')
        chrome.tabs.onActivated.removeListener(onTabActivated)
        chrome.tabs.onUpdated.removeListener(onTabUpdated)
      }
    }

    handleTabUpdate()
  }, [useTabContext])

  // Toggle useTabContext and trigger context fetching
  useEffect(() => {
    if (useTabContext) {
      fetchTabContext()
    } else {
      setHasTabContext(false)
      setCurrentTabContext('')
    }
  }, [useTabContext])

  useEffect(() => {
    if (!sessionActive) resetAISession()
  }, [temperature, currentChatId, resetAISession, sessionActive])

  useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim()) return

    // Add user message to UI
    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      let context = ''
      if (useTabContext) {
        context = currentTabContext || (await fetchTabContext())
      }

      // Check if Chrome AI API is available
      if (isChrome && chrome.aiOriginTrial) {
        // Set temperature based on selection
        let tempValue = 0.7 // default
        switch (temperature) {
          case 'creative':
            tempValue = 1.0
            break
          case 'precise':
            tempValue = 0.3
            break
          default:
            tempValue = 0.5
        }

        const initialPrompts: Array<{
          role: 'system' | 'user' | 'assistant'
          content: string
        }> = [
          {
            role: 'system',
            content: `You are a helpful and friendly assistant called NanoChat. Provide clear, accurate, and concise responses.${
              context && context.trim() !== ''
                ? `\n\nHere is context from the current page that may be relevant to answering the user's question:\n${context}`
                : ''
            }`,
          },
        ]

        const conversationHistory = messages.slice(1).map((msg) => {
          const role: 'user' | 'assistant' =
            msg.role === 'user' ? 'user' : 'assistant'
          return {
            role,
            content: msg.content,
          }
        })

        initialPrompts.push(...conversationHistory)

        // Always reset before creating a new session, but respect active sessions
        resetAISession()

        // Create a new session with the latest context and conversation history
        aiSessionRef.current = await chrome.aiOriginTrial.languageModel.create({
          temperature: tempValue,
          topK: 40,
          initialPrompts: initialPrompts,
        })

        // Mark session as active so tab changes don't destroy it while in use
        setSessionActive(true)
        setPendingTabContextUpdate(false)

        try {
          // Get response from model
          const response = await aiSessionRef.current.prompt(input)

          // Add assistant message
          const assistantMessage: Message = {
            role: 'assistant',
            content: response,
          }
          setMessages([...newMessages, assistantMessage])

          // Save chat to history
          saveChatToHistory([...newMessages, assistantMessage])
        } finally {
          // Mark session as no longer active
          setSessionActive(false)

          // If a tab change happened during response generation, reset the session now
          if (pendingTabContextUpdate) {
            resetAISession()
            setPendingTabContextUpdate(false)
          }
        }
      } else {
        // Chrome AI API not available - display guidance
        const helpMessage = `
## Chrome AI API Not Available

This extension requires Chrome's built-in AI features to function properly.

To enable Chrome AI:

1. Use Chrome version 127 or newer
2. Visit **chrome://flags/#prompt-api-for-gemini-nano** and enable it
3. Visit **chrome://flags/#optimization-guide-on-device-model** and enable it
4. Restart Chrome
5. Visit **chrome://components** and update "Optimization Guide On Device Model"

[Learn more about Chrome AI](https://developer.chrome.com/docs/ai/built-in)
[Setup instructions](https://developer.chrome.com/docs/ai/get-started)
        `

        const assistantMessage: Message = {
          role: 'assistant',
          content: helpMessage,
        }
        setMessages([...newMessages, assistantMessage])

        // Save chat to history
        saveChatToHistory([...newMessages, assistantMessage])

        // Make sure API availability is marked as false
        setApiAvailable(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')

      // Handle specific Chrome AI errors
      if (
        err instanceof Error &&
        err.message.includes('User declined permission')
      ) {
        setError(
          'Permission to use AI features was denied. Please enable it in Chrome settings.',
        )
      } else if (
        err instanceof Error &&
        err.message.includes('No model available')
      ) {
        setError(
          'AI model is not available. Please make sure you have the required components installed.',
        )
      }
    } finally {
      setLoading(false)
      // Ensure sessionActive is reset even if there was an error
      setSessionActive(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const startNewChat = () => {
    setShowHistory(false)
    const welcomeMessage: Message = {
      role: 'assistant',
      content: "Hello! I'm NanoChat. How can I help you today?",
    }
    setMessages([welcomeMessage])
    setCurrentChatId(generateUniqueId())
    resetAISession()
  }

  const loadChatHistory = () => {
    try {
      chrome.storage.local.get(
        ['nanochat_chat_history', 'nanochat_current_chat'],
        (result) => {
          if (result.nanochat_chat_history) {
            const history = result.nanochat_chat_history as ChatSession[]
            setChatHistory(history)

            if (result.nanochat_current_chat) {
              const currentChatId = result.nanochat_current_chat as string
              setCurrentChatId(currentChatId)
              const currentChat = history.find(
                (chat) => chat.id === currentChatId,
              )
              if (currentChat) {
                setMessages(currentChat.messages)
              }
            }
          }
        },
      )
    } catch (error) {
      console.error('Error loading chat history', error)
    }
  }

  const saveChatToHistory = (msgList: Message[]) => {
    if (msgList.length <= 1) return // Don't save empty chats

    const userMessage = msgList.find((m) => m.role === 'user')
    const title = userMessage
      ? userMessage.content.substring(0, 30) +
        (userMessage.content.length > 30 ? '...' : '')
      : 'New Chat'

    const chatEntry: ChatSession = {
      id: currentChatId,
      title,
      timestamp: new Date().toISOString(),
      messages: msgList,
    }

    let updatedHistory = [...chatHistory]
    const existingIndex = updatedHistory.findIndex(
      (c) => c.id === currentChatId,
    )

    if (existingIndex >= 0) {
      updatedHistory[existingIndex] = chatEntry
    } else {
      updatedHistory = [chatEntry, ...updatedHistory]
    }

    if (updatedHistory.length > 50) {
      updatedHistory = updatedHistory.slice(0, 50)
    }

    setChatHistory(updatedHistory)

    chrome.storage.local.set(
      {
        nanochat_chat_history: updatedHistory,
        nanochat_current_chat: currentChatId,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving chat history:', chrome.runtime.lastError)
        }
      },
    )
  }

  const loadChat = (chatId: string) => {
    const chat = chatHistory.find((c) => c.id === chatId)
    if (!chat) return

    setCurrentChatId(chatId)
    setMessages(chat.messages)
    setShowHistory(false)

    chrome.storage.local.set({ nanochat_current_chat: chatId }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving current chat ID:', chrome.runtime.lastError)
      }
    })
  }

  const fetchTabContext = async (): Promise<string> => {
    try {
      if (isChrome && chrome.tabs) {
        const queryOptions = { active: true, currentWindow: true }

        const [tab] = await chrome.tabs.query(queryOptions)

        if (!tab || !tab.id) {
          setHasTabContext(false)
          setCurrentTabContext('')
          return ''
        }

        function getPageContent() {
          return {
            url: window.location.href,
            title: document.title,
            content: document.body.innerText.substring(0, 5000), // Limit content size
            headings: Array.from(document.querySelectorAll('h1, h2, h3'))
              .map((h) => h.textContent)
              .filter(Boolean)
              .join(' | '),
          }
        }

        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: getPageContent,
        })

        if (!result || !result[0]?.result) {
          setHasTabContext(false)
          setCurrentTabContext('')
          return ''
        }

        const data = result[0].result as {
          url: string
          title: string
          content: string
          headings: string
        }

        const newContext = `URL: ${data.url}\nTitle: ${data.title}\nHeadings: ${data.headings}\n\nContent: ${data.content}`

        if (newContext !== currentTabContext) {
          setCurrentTabContext(newContext)
        }

        setHasTabContext(true)
        return newContext
      }

      setHasTabContext(false)
      setCurrentTabContext('')
      return ''
    } catch (error) {
      console.error('Error fetching tab context', error)
      setHasTabContext(false)
      setCurrentTabContext('')
      return ''
    }
  }

  function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }

  function formatDate(timestamp: string) {
    const date = new Date(timestamp)
    const now = new Date()

    if (date.toDateString() === now.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    }

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header - Fixed at the top */}
      <div className="flex items-center justify-between p-3 border-b">
        <h1 className="text-lg font-semibold">NanoChat</h1>
        <div className="flex gap-2">
          {apiAvailable === false && (
            <Badge
              variant="outline"
              className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 mr-2"
            >
              API Fallback Mode
            </Badge>
          )}

          {/* Theme toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle theme</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={startNewChat}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Chat history</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {hasTabContext && useTabContext && (
        <div className="px-3 py-2 bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 text-xs flex items-center gap-2 border-b">
          <Eye className="h-3 w-3" />
          Using context from current page
        </div>
      )}

      {error && (
        <div className="m-3 p-3 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* Main Content - This is the flex-growing middle area */}
      <div className="flex-1 overflow-auto flex flex-col">
        {showHistory ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-3 border-b">
              <h2 className="font-medium">Chat History</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {chatHistory.length === 0 ? (
                  <div className="text-center text-muted-foreground p-4">
                    No chat history yet
                  </div>
                ) : (
                  chatHistory.map((chat) => (
                    <div
                      key={chat.id}
                      className={`p-3 rounded-lg cursor-pointer hover:bg-accent/50 ${
                        chat.id === currentChatId ? 'bg-accent' : ''
                      }`}
                      onClick={() => loadChat(chat.id)}
                    >
                      <div className="font-medium truncate">{chat.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(chat.timestamp)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Only this section should be scrollable */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-6">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    } message-animation`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div
                      className={`max-w-[85%] ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-card-foreground border border-border'
                      } rounded-2xl p-3`}
                    >
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div className="markdown prose-sm dark:prose-invert markdown-container">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code: ({
                                node,
                                className,
                                children,
                                ...props
                              }) => {
                                const match = /language-(\w+)/.exec(
                                  className || '',
                                )
                                return (
                                  <code
                                    className={
                                      match
                                        ? `bg-muted px-1 py-0.5 rounded language-${match[1]}`
                                        : 'bg-muted px-1 py-0.5 rounded'
                                    }
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                )
                              },
                              pre: ({ children }) => (
                                <pre className="bg-muted p-2 rounded-md my-2">
                                  {children}
                                </pre>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl p-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground loading-dot"></div>
                        <div className="w-2 h-2 rounded-full bg-muted-foreground loading-dot"></div>
                        <div className="w-2 h-2 rounded-full bg-muted-foreground loading-dot"></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Input Area - Fixed at the bottom */}
      <div className="sticky bottom-0 z-10 border-t p-3 space-y-3 bg-background">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message NanoChat..."
          className="min-h-[60px] max-h-[200px] resize-none w-full"
        />

        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select
                      value={temperature}
                      onValueChange={setTemperature}
                      disabled={apiAvailable === false}
                    >
                      <SelectTrigger
                        className={`w-[120px] h-8 ${
                          apiAvailable === false ? 'opacity-50' : ''
                        }`}
                      >
                        <SelectValue placeholder="Temperature" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="creative">Creative</SelectItem>
                        <SelectItem value="precise">Precise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                {apiAvailable === false && (
                  <TooltipContent>
                    <p>Temperature control requires Chrome AI API</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setUseTabContext(!useTabContext)}
                  >
                    <Eye
                      className={`h-4 w-4 ${
                        useTabContext ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Include page content in questions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              disabled={!input.trim() || loading}
              onClick={handleSendMessage}
              size="sm"
              className="h-8"
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
