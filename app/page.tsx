'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent, extractText } from '@/lib/aiAgent'
import { uploadAndTrainDocument, getDocuments, deleteDocuments, validateFile } from '@/lib/ragKnowledgeBase'
import type { RAGDocument } from '@/lib/ragKnowledgeBase'
import { copyToClipboard } from '@/lib/clipboard'
import { useLyzrAgentEvents } from '@/lib/lyzrAgentEvents'
import { AgentActivityPanel } from '@/components/AgentActivityPanel'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

import { FiFile, FiUpload, FiCopy, FiDownload, FiPlus, FiMenu, FiChevronDown, FiChevronUp, FiSend, FiRefreshCw, FiClock, FiAlertCircle, FiCheckCircle, FiFileText, FiShield, FiInfo, FiEdit3, FiX, FiActivity } from 'react-icons/fi'

// --- Constants ---
const AGENT_ID = '699409dfcb4f20e1f49e194e'
const RAG_ID = '699409c3869797813b09f696'

const REGULATIONS = ['GDPR', 'CCPA', 'LGPD', 'PIPEDA', 'General', 'Custom'] as const
const SCOPES = ['Full Policy', 'Specific Section', 'Amendment Clause'] as const

// --- Interfaces ---
interface PolicyData {
  policy_title: string
  policy_content: string
  regulation_framework: string
  scope_type: string
  key_sections: string[]
  compliance_notes: string
  revision_suggestions: string
}

interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
  policyData?: PolicyData
  timestamp: number
}

interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  entries: ConversationEntry[]
}

// --- Sample Data ---
const SAMPLE_POLICY_DATA: PolicyData = {
  policy_title: 'Privacy Policy for Mobile Application - GDPR Compliance',
  policy_content: `# Privacy Policy\n\n**Effective Date:** January 1, 2025\n\n## 1. Introduction\n\nThis Privacy Policy explains how we collect, use, disclose, and safeguard your personal data when you use our mobile application ("App"). We are committed to protecting your privacy in accordance with the General Data Protection Regulation (GDPR).\n\n## 2. Data Controller\n\nThe data controller responsible for your personal data is:\n- **Company Name:** Example Corp\n- **Address:** 123 Privacy Lane, Berlin, Germany\n- **DPO Contact:** dpo@example.com\n\n## 3. Data We Collect\n\nWe collect the following categories of personal data:\n\n### 3.1 Data You Provide\n- Account registration information (name, email address)\n- Profile information\n- Communications and feedback\n\n### 3.2 Automatically Collected Data\n- Device identifiers\n- Usage analytics\n- IP address and approximate location\n\n## 4. Legal Basis for Processing\n\nWe process your data under the following legal bases:\n1. **Consent** - Where you have given explicit consent\n2. **Contract** - Processing necessary for the performance of our contract with you\n3. **Legitimate Interest** - For improving our services and security\n\n## 5. Your Rights Under GDPR\n\nYou have the following rights:\n- **Right to Access** - Request a copy of your personal data\n- **Right to Rectification** - Correct inaccurate data\n- **Right to Erasure** - Request deletion of your data\n- **Right to Data Portability** - Receive your data in a structured format\n- **Right to Object** - Object to processing based on legitimate interest\n- **Right to Restrict Processing** - Limit how we use your data\n\n## 6. Data Retention\n\nWe retain your personal data only for as long as necessary to fulfill the purposes outlined in this policy, unless a longer retention period is required by law.\n\n## 7. International Transfers\n\nIf we transfer your data outside the EEA, we ensure appropriate safeguards are in place, including Standard Contractual Clauses.\n\n## 8. Contact Us\n\nFor questions about this Privacy Policy, contact our Data Protection Officer at dpo@example.com.`,
  regulation_framework: 'GDPR',
  scope_type: 'Full Policy',
  key_sections: ['Introduction', 'Data Controller', 'Data Collection', 'Legal Basis', 'User Rights', 'Data Retention', 'International Transfers', 'Contact Information'],
  compliance_notes: 'This policy includes all GDPR-required disclosures including lawful basis for processing, data subject rights, DPO contact details, and international transfer mechanisms. Consider adding specific cookie policy details and third-party processor list as annexes.',
  revision_suggestions: 'Consider adding: (1) Specific data retention periods per data category, (2) Detailed cookie policy or reference to standalone cookie notice, (3) List of third-party data processors, (4) Automated decision-making disclosure if applicable, (5) Children\'s data handling section if the app may be accessed by minors.'
}

// --- Markdown Renderer ---
function formatInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  return (
    <div className="space-y-2 leading-relaxed tracking-wide">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-4 mb-1 text-foreground">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-5 mb-2 text-foreground border-b border-border/40 pb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-6 mb-3 text-foreground">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-5 list-disc text-sm text-foreground/90">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-5 list-decimal text-sm text-foreground/90">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-2" />
        return <p key={i} className="text-sm text-foreground/90">{formatInline(line)}</p>
      })}
    </div>
  )
}

// --- Policy Output Component ---
function PolicyOutput({
  policyData,
  onRevise,
  isRevising,
}: {
  policyData: PolicyData
  onRevise: (msg: string) => void
  isRevising: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [reviseText, setReviseText] = useState('')
  const [complianceOpen, setComplianceOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const handleCopy = async () => {
    const success = await copyToClipboard(policyData.policy_content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleDownload = () => {
    const content = `# ${policyData.policy_title}\n\n${policyData.policy_content}`
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${policyData.policy_title.replace(/\s+/g, '_').toLowerCase()}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRevise = () => {
    if (!reviseText.trim()) return
    onRevise(reviseText.trim())
    setReviseText('')
  }

  return (
    <div className="space-y-5">
      {/* Title & Actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground tracking-wide leading-relaxed">{policyData.policy_title}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {policyData.regulation_framework && (
              <Badge variant="default" className="bg-primary text-primary-foreground">
                <FiShield className="mr-1 h-3 w-3" />
                {policyData.regulation_framework}
              </Badge>
            )}
            {policyData.scope_type && (
              <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                <FiFileText className="mr-1 h-3 w-3" />
                {policyData.scope_type}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleCopy} className="border-border/60">
            {copied ? <FiCheckCircle className="mr-1.5 h-3.5 w-3.5 text-green-600" /> : <FiCopy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="border-border/60">
            <FiDownload className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {/* Key Sections Tags */}
      {Array.isArray(policyData.key_sections) && policyData.key_sections.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Key Sections</Label>
          <div className="flex flex-wrap gap-1.5">
            {policyData.key_sections.map((section, idx) => (
              <Badge key={idx} variant="outline" className="text-xs border-border/50 text-foreground/80 bg-card">
                {section}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator className="bg-border/30" />

      {/* Policy Content */}
      <Card className="shadow-md border-border/30 bg-card">
        <CardContent className="p-6">
          {renderMarkdown(policyData.policy_content)}
        </CardContent>
      </Card>

      {/* Compliance Notes */}
      {policyData.compliance_notes && (
        <Collapsible open={complianceOpen} onOpenChange={setComplianceOpen}>
          <Card className="shadow-sm border-border/30">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/40 transition-colors rounded-t-lg">
                <div className="flex items-center gap-2">
                  <FiInfo className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm text-foreground">Compliance Notes</span>
                </div>
                {complianceOpen ? <FiChevronUp className="h-4 w-4 text-muted-foreground" /> : <FiChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-4 px-4">
                <div className="bg-secondary/30 rounded-lg p-4 text-sm text-foreground/85 leading-relaxed">
                  {renderMarkdown(policyData.compliance_notes)}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Revision Suggestions */}
      {policyData.revision_suggestions && (
        <Collapsible open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
          <Card className="shadow-sm border-border/30">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/40 transition-colors rounded-t-lg">
                <div className="flex items-center gap-2">
                  <FiEdit3 className="h-4 w-4 text-accent-foreground" />
                  <span className="font-medium text-sm text-foreground">Revision Suggestions</span>
                </div>
                {suggestionsOpen ? <FiChevronUp className="h-4 w-4 text-muted-foreground" /> : <FiChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-4 px-4">
                <div className="bg-secondary/30 rounded-lg p-4 text-sm text-foreground/85 leading-relaxed">
                  {renderMarkdown(policyData.revision_suggestions)}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Revise Input */}
      <Card className="shadow-sm border-border/30">
        <CardContent className="p-4">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Refine this Draft</Label>
          <div className="flex gap-2">
            <Textarea
              value={reviseText}
              onChange={(e) => setReviseText(e.target.value)}
              placeholder="Suggest changes... e.g., 'Add a section on cookie usage' or 'Make the language less formal'"
              rows={2}
              className="flex-1 text-sm bg-background border-border/50 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleRevise()
                }
              }}
            />
            <Button onClick={handleRevise} disabled={!reviseText.trim() || isRevising} className="self-end bg-primary text-primary-foreground hover:bg-primary/90">
              {isRevising ? <FiRefreshCw className="h-4 w-4 animate-spin" /> : <FiSend className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// --- Loading Skeleton ---
function PolicySkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Skeleton className="h-7 w-3/4 bg-muted" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full bg-muted" />
          <Skeleton className="h-6 w-28 rounded-full bg-muted" />
        </div>
      </div>
      <Separator className="bg-border/30" />
      <Card className="shadow-md border-border/30">
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-5 w-full bg-muted" />
          <Skeleton className="h-5 w-5/6 bg-muted" />
          <Skeleton className="h-5 w-4/6 bg-muted" />
          <div className="h-3" />
          <Skeleton className="h-5 w-full bg-muted" />
          <Skeleton className="h-5 w-3/4 bg-muted" />
          <Skeleton className="h-5 w-5/6 bg-muted" />
          <div className="h-3" />
          <Skeleton className="h-5 w-full bg-muted" />
          <Skeleton className="h-5 w-2/3 bg-muted" />
          <Skeleton className="h-5 w-4/5 bg-muted" />
          <Skeleton className="h-5 w-3/4 bg-muted" />
        </CardContent>
      </Card>
    </div>
  )
}

// --- Sidebar Content ---
function SidebarContent({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  documents,
  onUpload,
  onDeleteDoc,
  uploadStatus,
  docLoading,
}: {
  sessions: Session[]
  currentSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  documents: RAGDocument[]
  onUpload: (file: File) => void
  onDeleteDoc: (name: string) => void
  uploadStatus: string
  docLoading: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const validation = validateFile(file)
      if (validation.valid) {
        onUpload(file)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const validation = validateFile(file)
      if (validation.valid) {
        onUpload(file)
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full bg-card/50">
      {/* New Session Button */}
      <div className="p-4">
        <Button onClick={onNewSession} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" size="sm">
          <FiPlus className="mr-2 h-4 w-4" />
          New Session
        </Button>
      </div>

      <Separator className="bg-border/20" />

      {/* Document Upload */}
      <div className="p-4 space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Knowledge Base</Label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${dragOver ? 'border-primary bg-primary/5' : 'border-border/40 hover:border-primary/60 hover:bg-secondary/30'}`}
        >
          <FiUpload className="mx-auto h-5 w-5 text-muted-foreground mb-1.5" />
          <p className="text-xs text-muted-foreground">Drop policy document here</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">PDF, DOCX, TXT</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploadStatus && (
          <p className={`text-xs ${uploadStatus.includes('Error') || uploadStatus.includes('fail') ? 'text-destructive' : 'text-primary'}`}>
            {uploadStatus}
          </p>
        )}

        {/* Uploaded Documents */}
        {docLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-full bg-muted" />
            <Skeleton className="h-7 w-3/4 bg-muted" />
          </div>
        ) : (
          documents.length > 0 && (
            <div className="space-y-1.5">
              {documents.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/40 group">
                  <FiFile className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground/80 truncate flex-1">{doc.fileName}</span>
                  <button onClick={() => onDeleteDoc(doc.fileName)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10">
                    <FiX className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <Separator className="bg-border/20" />

      {/* Session History */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 pt-3 pb-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Session History</Label>
        </div>
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 pb-4 px-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-4">No sessions yet</p>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all duration-150 ${session.id === currentSessionId ? 'bg-primary/10 text-foreground border border-primary/20' : 'text-foreground/70 hover:bg-secondary/50 border border-transparent'}`}
                >
                  <div className="font-medium truncate">{session.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <FiClock className="h-2.5 w-2.5" />
                    {new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Agent Info */}
      <div className="p-4 border-t border-border/20">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-foreground/80">Privacy Policy Generator</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">AI-powered policy drafting with knowledge base analysis</p>
      </div>
    </div>
  )
}

// --- Main Page Component ---
export default function Page() {
  // State
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const [regulation, setRegulation] = useState<string>('GDPR')
  const [scope, setScope] = useState<string>('Full Policy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleMode, setSampleMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('output')

  // KB state
  const [documents, setDocuments] = useState<RAGDocument[]>([])
  const [uploadStatus, setUploadStatus] = useState('')
  const [docLoading, setDocLoading] = useState(false)

  // Agent activity monitoring
  const agentActivity = useLyzrAgentEvents(currentSessionId || null)

  // Initialize session & load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('ppg_sessions')
    let loadedSessions: Session[] = []
    if (stored) {
      try {
        loadedSessions = JSON.parse(stored)
      } catch {
        loadedSessions = []
      }
    }
    if (loadedSessions.length > 0) {
      setSessions(loadedSessions)
      setCurrentSessionId(loadedSessions[0].id)
    } else {
      const newId = `session_${Date.now()}`
      const newSession: Session = {
        id: newId,
        title: 'New Draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        entries: [],
      }
      setSessions([newSession])
      setCurrentSessionId(newId)
    }
  }, [])

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('ppg_sessions', JSON.stringify(sessions))
    }
  }, [sessions])

  // Load KB documents
  useEffect(() => {
    const loadDocs = async () => {
      setDocLoading(true)
      const result = await getDocuments(RAG_ID)
      if (result.success && Array.isArray(result.documents)) {
        setDocuments(result.documents)
      }
      setDocLoading(false)
    }
    loadDocs()
  }, [])

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId) || null
  const currentEntries = currentSession?.entries ?? []
  const lastPolicyData = (() => {
    for (let i = currentEntries.length - 1; i >= 0; i--) {
      if (currentEntries[i]?.policyData) return currentEntries[i].policyData
    }
    return null
  })()

  // Create new session
  const createNewSession = useCallback(() => {
    const newId = `session_${Date.now()}`
    const newSession: Session = {
      id: newId,
      title: 'New Draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entries: [],
    }
    setSessions((prev) => [newSession, ...prev])
    setCurrentSessionId(newId)
    setError(null)
    agentActivity.reset()
  }, [agentActivity])

  // Select session
  const selectSession = useCallback((id: string) => {
    setCurrentSessionId(id)
    setError(null)
    setSidebarOpen(false)
  }, [])

  // Parse agent response
  const parseAgentResponse = (result: any): PolicyData => {
    let parsed = result?.response?.result

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        parsed = { policy_content: parsed, policy_title: 'Generated Draft' }
      }
    }

    // Sometimes the parsed result might be wrapped in another layer
    if (parsed && typeof parsed === 'object' && parsed.response && typeof parsed.response === 'object') {
      parsed = parsed.response
    }

    const fallbackText = extractText(result?.response ?? { status: 'success', result: {} })

    return {
      policy_title: parsed?.policy_title || 'Generated Policy Draft',
      policy_content: parsed?.policy_content || fallbackText || '',
      regulation_framework: parsed?.regulation_framework || regulation,
      scope_type: parsed?.scope_type || scope,
      key_sections: Array.isArray(parsed?.key_sections) ? parsed.key_sections : [],
      compliance_notes: parsed?.compliance_notes || '',
      revision_suggestions: parsed?.revision_suggestions || '',
    }
  }

  // Generate policy
  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    agentActivity.setProcessing(true)

    const userMessage = `Generate a privacy policy draft for the following scenario:\n\nScenario: ${prompt.trim()}\nTarget Regulation: ${regulation}\nScope: ${scope}\n\nPlease provide the output as JSON with these fields: policy_title, policy_content, regulation_framework, scope_type, key_sections (array), compliance_notes, revision_suggestions.`

    // Add user entry
    const userEntry: ConversationEntry = {
      role: 'user',
      content: prompt.trim(),
      timestamp: Date.now(),
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, entries: [...s.entries, userEntry], updatedAt: Date.now() }
          : s
      )
    )

    try {
      const result = await callAIAgent(userMessage, AGENT_ID, { session_id: currentSessionId })

      if (result.success) {
        const policyData = parseAgentResponse(result)
        const assistantEntry: ConversationEntry = {
          role: 'assistant',
          content: policyData.policy_title,
          policyData,
          timestamp: Date.now(),
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  title: policyData.policy_title.slice(0, 50) || prompt.trim().slice(0, 50) || 'Policy Draft',
                  entries: [...s.entries, assistantEntry],
                  updatedAt: Date.now(),
                }
              : s
          )
        )
        setActiveTab('output')
      } else {
        setError(result.error || 'Failed to generate policy. Please try again.')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
      agentActivity.setProcessing(false)
    }
  }

  // Revise policy
  const handleRevise = async (revisionPrompt: string) => {
    setLoading(true)
    setError(null)
    agentActivity.setProcessing(true)

    const message = `Please revise the previously generated privacy policy based on the following feedback:\n\n${revisionPrompt}\n\nPlease provide the complete updated output as JSON with these fields: policy_title, policy_content, regulation_framework, scope_type, key_sections (array), compliance_notes, revision_suggestions.`

    const userEntry: ConversationEntry = {
      role: 'user',
      content: `Revision: ${revisionPrompt}`,
      timestamp: Date.now(),
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, entries: [...s.entries, userEntry], updatedAt: Date.now() }
          : s
      )
    )

    try {
      const result = await callAIAgent(message, AGENT_ID, { session_id: currentSessionId })

      if (result.success) {
        const policyData = parseAgentResponse(result)
        const assistantEntry: ConversationEntry = {
          role: 'assistant',
          content: policyData.policy_title,
          policyData,
          timestamp: Date.now(),
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, entries: [...s.entries, assistantEntry], updatedAt: Date.now() }
              : s
          )
        )
      } else {
        setError(result.error || 'Failed to revise policy.')
      }
    } catch {
      setError('An unexpected error occurred during revision.')
    } finally {
      setLoading(false)
      agentActivity.setProcessing(false)
    }
  }

  // Upload document
  const handleUpload = async (file: File) => {
    setUploadStatus('Uploading...')
    const result = await uploadAndTrainDocument(RAG_ID, file)
    if (result.success) {
      setUploadStatus('Document uploaded and trained successfully.')
      const docs = await getDocuments(RAG_ID)
      if (docs.success && Array.isArray(docs.documents)) {
        setDocuments(docs.documents)
      }
    } else {
      setUploadStatus(`Error: ${result.error || 'Upload failed'}`)
    }
    setTimeout(() => setUploadStatus(''), 4000)
  }

  // Delete document
  const handleDeleteDoc = async (name: string) => {
    const result = await deleteDocuments(RAG_ID, [name])
    if (result.success) {
      setDocuments((prev) => prev.filter((d) => d.fileName !== name))
    }
  }

  // Determine what to show in output area
  const displayData = sampleMode ? SAMPLE_POLICY_DATA : lastPolicyData

  // Sidebar component instance
  const sidebarContent = (
    <SidebarContent
      sessions={sessions}
      currentSessionId={currentSessionId}
      onSelectSession={selectSession}
      onNewSession={createNewSession}
      documents={documents}
      onUpload={handleUpload}
      onDeleteDoc={handleDeleteDoc}
      uploadStatus={uploadStatus}
      docLoading={docLoading}
    />
  )

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border/30 bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden p-2">
                <FiMenu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-card">
              {sidebarContent}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <FiShield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-wide leading-tight">Privacy Policy Generator</h1>
              <p className="text-[10px] text-muted-foreground tracking-wider">AI-Powered Legal Document Drafting</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer hidden sm:inline">Sample Data</Label>
          <Switch
            id="sample-toggle"
            checked={sampleMode}
            onCheckedChange={setSampleMode}
          />
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-[260px] border-r border-border/20 shrink-0 flex-col">
          {sidebarContent}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Input Strip */}
          <div className="border-b border-border/20 bg-card/40 p-4 shrink-0">
            <div className="max-w-4xl mx-auto space-y-3">
              <Textarea
                value={sampleMode ? 'We are launching a new mobile application in the EU market and need a comprehensive privacy policy that covers user data collection, third-party analytics, and push notifications.' : prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your scenario -- e.g., new region, feature, or regulation..."
                rows={3}
                className="w-full text-sm bg-background border-border/40 resize-none leading-relaxed"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    if (!sampleMode) handleGenerate()
                  }
                }}
              />
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Regulation</Label>
                  <Select value={regulation} onValueChange={setRegulation}>
                    <SelectTrigger className="h-9 text-sm bg-background border-border/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGULATIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground mb-1 block">Scope</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger className="h-9 text-sm bg-background border-border/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={loading || (!prompt.trim() && !sampleMode)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md h-9 px-6"
                >
                  {loading ? (
                    <>
                      <FiRefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FiFileText className="mr-2 h-4 w-4" />
                      Generate Draft
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/60">Press Ctrl+Enter to generate. Upload policy documents in the sidebar to improve results.</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mx-4 mt-3 max-w-4xl lg:mx-auto">
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <FiAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-auto shrink-0">
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Output Area with Tabs */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 pt-3 max-w-4xl mx-auto w-full">
                <TabsList className="bg-secondary/50">
                  <TabsTrigger value="output" className="text-xs">
                    <FiFileText className="mr-1.5 h-3.5 w-3.5" />
                    Policy Output
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">
                    <FiClock className="mr-1.5 h-3.5 w-3.5" />
                    Conversation
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs">
                    <FiActivity className="mr-1.5 h-3.5 w-3.5" />
                    Agent Activity
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Policy Output Tab */}
              <TabsContent value="output" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full">
                  <div className="max-w-4xl mx-auto p-4 pb-8">
                    {loading ? (
                      <PolicySkeleton />
                    ) : displayData ? (
                      <PolicyOutput
                        policyData={displayData}
                        onRevise={handleRevise}
                        isRevising={loading}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-5 shadow-sm">
                          <FiShield className="h-8 w-8 text-primary/60" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground/80 tracking-wide mb-2">Ready to Generate</h3>
                        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                          Describe your scenario above and select a regulation framework to generate a tailored privacy policy draft. Upload existing policy documents in the sidebar to match your company's style and tone.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                          {['GDPR Compliance', 'CCPA Ready', 'Cross-Border Transfers', 'Cookie Policy', 'Mobile App'].map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs border-border/40 text-muted-foreground">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Conversation History Tab */}
              <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full">
                  <div className="max-w-4xl mx-auto p-4 pb-8 space-y-4">
                    {currentEntries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <FiClock className="h-10 w-10 text-muted-foreground/40 mb-4" />
                        <p className="text-sm text-muted-foreground">No conversation entries yet. Generate a policy to get started.</p>
                      </div>
                    ) : (
                      currentEntries.map((entry, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-3 ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <Card className={`max-w-[85%] shadow-sm border-border/30 ${entry.role === 'user' ? 'bg-primary/5' : 'bg-card'}`}>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant={entry.role === 'user' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0.5">
                                  {entry.role === 'user' ? 'You' : 'AI Agent'}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {entry.role === 'user' ? (
                                <p className="text-sm text-foreground/90">{entry.content}</p>
                              ) : entry.policyData ? (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-foreground">{entry.policyData.policy_title}</p>
                                  <div className="flex gap-1.5">
                                    {entry.policyData.regulation_framework && (
                                      <Badge variant="outline" className="text-[10px]">{entry.policyData.regulation_framework}</Badge>
                                    )}
                                    {entry.policyData.scope_type && (
                                      <Badge variant="outline" className="text-[10px]">{entry.policyData.scope_type}</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {(entry.policyData.policy_content?.length ?? 0) > 200
                                      ? entry.policyData.policy_content.slice(0, 200) + '...'
                                      : entry.policyData.policy_content}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-sm text-foreground/90">{entry.content}</p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Agent Activity Tab */}
              <TabsContent value="activity" className="flex-1 overflow-hidden mt-0">
                <div className="max-w-4xl mx-auto p-4 h-full">
                  <AgentActivityPanel
                    isConnected={agentActivity.isConnected}
                    events={agentActivity.events}
                    thinkingEvents={agentActivity.thinkingEvents}
                    lastThinkingMessage={agentActivity.lastThinkingMessage}
                    activeAgentId={agentActivity.activeAgentId}
                    activeAgentName={agentActivity.activeAgentName}
                    isProcessing={agentActivity.isProcessing}
                    className="h-full"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  )
}
