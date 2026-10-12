import React, { useState, useEffect } from 'react'
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Download, 
  Trash2, 
  Copy, 
  Check, 
  Search, 
  Clock, 
  Layers, 
  Sparkles, 
  FileText, 
  RotateCcw,
  Eye,
  Code2,
  ChevronLeft,
  ChevronRight,
  List,
  Coins
} from 'lucide-react'
import { BatchDetail, markBatchRead, pollBatchNow, getExportUrl, deleteBatch, retryFailedBatch } from '../lib/api'
import { cn, formatDate, formatCost, formatTokens } from '../lib/utils'
import { MarkdownRenderer } from './MarkdownRenderer'

interface BatchDetailViewProps {
  batch: BatchDetail | null
  isLoading: boolean
  onBatchUpdated: () => void
  onBatchDeleted: () => void
}

export const BatchDetailView: React.FC<BatchDetailViewProps> = ({
  batch,
  isLoading,
  onBatchUpdated,
  onBatchDeleted,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isPolling, setIsPolling] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [globalViewMode, setGlobalViewMode] = useState<'formatted' | 'raw'>('formatted')
  const [rowViewOverrides, setRowViewOverrides] = useState<Record<number, 'formatted' | 'raw'>>({})

  // Layout mode: 'focused' (tabs / single item) vs 'feed' (all items stacked)
  const [layoutMode, setLayoutMode] = useState<'focused' | 'feed'>(() => {
    return (localStorage.getItem('somnia_batch_layout_mode') as 'focused' | 'feed') || 'focused'
  })
  const [focusedIndex, setFocusedIndex] = useState<number>(0)

  // Reset focused item when switching batch
  useEffect(() => {
    setFocusedIndex(0)
  }, [batch?.id])

  // Automatically mark as read if opened with is_unread true
  useEffect(() => {
    if (batch && batch.is_unread) {
      markBatchRead(batch.id)
        .then(() => onBatchUpdated())
        .catch(err => console.error("Failed to mark as read:", err))
    }
  }, [batch?.id, batch?.is_unread])

  const getItemViewMode = (rowId: number) => rowViewOverrides[rowId] || globalViewMode

  const toggleRowViewMode = (rowId: number) => {
    const current = getItemViewMode(rowId)
    setRowViewOverrides(prev => ({
      ...prev,
      [rowId]: current === 'formatted' ? 'raw' : 'formatted'
    }))
  }

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleManualPoll = async () => {
    if (!batch) return
    setIsPolling(true)
    try {
      await pollBatchNow(batch.id)
      onBatchUpdated()
    } catch (err) {
      console.error("Poll failed:", err)
    } finally {
      setIsPolling(false)
    }
  }

  const handleDelete = async () => {
    if (!batch) return
    if (!confirm(`Are you sure you want to delete batch "${batch.name}"?`)) return
    setIsDeleting(true)
    try {
      await deleteBatch(batch.id)
      onBatchDeleted()
    } catch (err) {
      console.error("Delete failed:", err)
      setIsDeleting(false)
    }
  }

  const handleRetryFailed = async () => {
    if (!batch) return
    if (!confirm(`Retry ${batch.failed_requests} failed request(s) as a new batch?`)) return
    setIsRetrying(true)
    try {
      const res = await retryFailedBatch(batch.id)
      onBatchUpdated()
      alert(`Created retry batch #${res.id.slice(0, 8)}! Check the active sidebar.`)
    } catch (err: any) {
      alert(`Failed to retry: ${err.message}`)
    } finally {
      setIsRetrying(false)
    }
  }

  const filteredItems = (batch?.items || []).filter(item => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    const promptMatch = item.rendered_prompt.toLowerCase().includes(term)
    const respMatch = (item.response_text || '').toLowerCase().includes(term)
    const customIdMatch = item.custom_id.toLowerCase().includes(term)
    const inputMatch = JSON.stringify(item.input_data).toLowerCase().includes(term)
    return promptMatch || respMatch || customIdMatch || inputMatch
  })

  // Keyboard navigation for focused mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (layoutMode === 'focused') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setFocusedIndex(prev => Math.max(0, prev - 1))
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          setFocusedIndex(prev => Math.min(filteredItems.length - 1, prev + 1))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [layoutMode, filteredItems.length])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
          <p className="text-xs text-zinc-500 font-mono">Loading batch details...</p>
        </div>
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b] p-6 text-center select-none">
        <div className="max-w-md space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mx-auto shadow-inner">
            <Layers className="w-6 h-6 text-teal-400/80" />
          </div>
          <h2 className="text-lg font-semibold text-white">No Batch Selected</h2>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Select a batch from the sidebar to inspect items and download results, or launch a new batch from CSV data.
          </p>
        </div>
      </div>
    )
  }

  const isTerminal = ['completed', 'failed', 'cancelled', 'expired'].includes(batch.status)
  const isCompleted = batch.status === 'completed'
  const isFailed = batch.status === 'failed' || batch.status === 'cancelled'

  const progressPercent = batch.total_requests > 0 
    ? Math.round((batch.completed_requests / batch.total_requests) * 100) 
    : 0

  const safeFocusedIndex = Math.min(Math.max(0, focusedIndex), Math.max(0, filteredItems.length - 1))
  const currentFocusedItem = filteredItems[safeFocusedIndex]

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#09090b]">
      {/* Top Banner Header */}
      <div className="px-6 py-4 border-b border-[#202025] bg-[#0c0c10] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">{batch.name}</h1>
            
            {/* Status Pill */}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <XCircle className="w-3.5 h-3.5" />
                {batch.status}
              </span>
            )}
            {!isTerminal && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/30">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                In Progress
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <span className="font-mono text-zinc-300 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700">
              {batch.model}
            </span>
            <span>•</span>
            {((batch.total_cost !== null && batch.total_cost !== undefined) || (batch.estimated_cost !== null && batch.estimated_cost !== undefined)) && (
              <>
                <span 
                  className="inline-flex items-center gap-1.5 font-mono px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 text-xs font-semibold shadow-sm"
                  title={batch.total_tokens ? `${formatTokens(batch.total_tokens)} total tokens` : undefined}
                >
                  <Coins className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{formatCost(batch.total_cost ?? batch.estimated_cost)}</span>
                  {batch.status !== 'completed' && <span className="text-[10px] text-emerald-500 font-normal">(est.)</span>}
                  {batch.total_tokens ? (
                    <span className="text-zinc-500 font-normal text-[10px] hidden sm:inline">
                      • {formatTokens(batch.total_tokens)} tok
                    </span>
                  ) : null}
                </span>
                <span>•</span>
              </>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              Created {formatDate(batch.created_at)}
            </span>
            {batch.completed_at && (
              <>
                <span>•</span>
                <span>Finished {formatDate(batch.completed_at)}</span>
              </>
            )}
            {batch.openrouter_batch_id && (
              <>
                <span>•</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  OpenRouter ID: {batch.openrouter_batch_id}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2">
          {!isTerminal && (
            <button
              onClick={handleManualPoll}
              disabled={isPolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700 disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isPolling && "animate-spin text-teal-400")} />
              <span>Poll Status Now</span>
            </button>
          )}

          {isCompleted && (
            <div className="flex items-center gap-1.5">
              <a
                href={getExportUrl(batch.id, 'csv')}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold transition-all shadow-[0_0_12px_rgba(45,212,191,0.2)]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </a>

              <a
                href={getExportUrl(batch.id, 'markdown')}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
              >
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span>Markdown</span>
              </a>

              <a
                href={getExportUrl(batch.id, 'json')}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>JSON</span>
              </a>
            </div>
          )}

          {batch.failed_requests > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={isRetrying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={cn("w-3.5 h-3.5", isRetrying && "animate-spin")} />
              <span>Retry Failed ({batch.failed_requests})</span>
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete Batch"
            className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4 bg-[#0e0e12] border-b border-[#202025] shrink-0">
        <div className="p-3 rounded-xl bg-[#141418] border border-[#222228]">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Total Items</p>
          <p className="text-xl font-bold font-mono text-white mt-1">{batch.total_requests}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#141418] border border-[#222228]">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Completed</p>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{batch.completed_requests}</p>
        </div>

        <div className="p-3 rounded-xl bg-[#141418] border border-[#222228]">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Failed</p>
          <p className={cn("text-xl font-bold font-mono mt-1", batch.failed_requests > 0 ? "text-rose-400" : "text-zinc-500")}>
            {batch.failed_requests}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#141418] border border-[#222228]">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            <span>Batch Cost</span>
            <span className="text-[10px] text-emerald-400/90 font-normal normal-case">
              {batch.status === 'completed' ? '50% off' : 'estimated'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-xl font-bold font-mono text-emerald-400">
              {formatCost(batch.total_cost ?? batch.estimated_cost)}
            </p>
            {batch.total_tokens ? (
              <span className="text-[10px] font-mono text-zinc-500 truncate" title={`${batch.total_tokens} total tokens`}>
                {formatTokens(batch.total_tokens)} tok
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#141418] border border-[#222228]">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            <span>Progress</span>
            <span className="font-mono text-teal-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-teal-400 h-full rounded-full transition-all duration-500" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>
      </div>

      {/* Main Table Controls & Switchers */}
      <div className="px-6 py-3 border-b border-[#202025] flex flex-wrap items-center justify-between gap-3 bg-[#0b0b0e] shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search within inputs, prompts, outputs..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value)
              setFocusedIndex(0)
            }}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#16161c] border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Quick Row Navigator Dropdown + Prev/Next buttons (when in focused mode) */}
          {layoutMode === 'focused' && filteredItems.length > 0 && (
            <div className="flex items-center gap-1 bg-[#14141a] px-2 py-1 rounded-lg border border-zinc-800">
              <button
                type="button"
                onClick={() => setFocusedIndex(prev => Math.max(0, prev - 1))}
                disabled={safeFocusedIndex <= 0}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                title="Previous task (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={safeFocusedIndex}
                onChange={e => setFocusedIndex(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-mono font-medium text-teal-300 focus:outline-none cursor-pointer pr-1"
              >
                {filteredItems.map((item, idx) => {
                  const inputKeys = Object.keys(item.input_data || {})
                  const preview = inputKeys.length > 0 
                    ? ` • ${inputKeys[0]}=${String(item.input_data[inputKeys[0]]).slice(0, 16)}` 
                    : ''
                  const costStr = (item.cost !== undefined && item.cost !== null) ? ` • ${formatCost(item.cost)}` : ''
                  return (
                    <option key={item.id} value={idx} className="bg-[#16161c] text-zinc-200">
                      Task {idx + 1} of {filteredItems.length} (#{item.row_index}{preview}{costStr})
                    </option>
                  )
                })}
              </select>

              <button
                type="button"
                onClick={() => setFocusedIndex(prev => Math.min(filteredItems.length - 1, prev + 1))}
                disabled={safeFocusedIndex >= filteredItems.length - 1}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                title="Next task (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Formatted vs Raw Output Switcher */}
          <div className="flex items-center bg-[#15151c] p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setGlobalViewMode('formatted')
                setRowViewOverrides({})
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                globalViewMode === 'formatted'
                  ? "bg-teal-500/20 text-teal-300 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Render formatted Markdown with math equations"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Formatted</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGlobalViewMode('raw')
                setRowViewOverrides({})
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                globalViewMode === 'raw'
                  ? "bg-zinc-700 text-zinc-100 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="View raw Markdown text"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw</span>
            </button>
          </div>

          {/* Layout Mode Switcher (Tabs vs Feed) */}
          <div className="flex items-center bg-[#15151c] p-0.5 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setLayoutMode('focused')
                localStorage.setItem('somnia_batch_layout_mode', 'focused')
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                layoutMode === 'focused'
                  ? "bg-teal-500/20 text-teal-300 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Tabbed view focusing on one task at a time (no scrolling past others)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabs</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLayoutMode('feed')
                localStorage.setItem('somnia_batch_layout_mode', 'feed')
              }}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                layoutMode === 'feed'
                  ? "bg-zinc-700 text-zinc-100 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Scrollable feed showing all tasks stacked"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Feed</span>
            </button>
          </div>

          <div className="text-xs text-zinc-500 font-mono hidden md:block">
            {filteredItems.length} tasks
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Row Tabs Bar (Tabs Mode Only) */}
      {layoutMode === 'focused' && filteredItems.length > 0 && (
        <div className="px-6 py-2.5 border-b border-[#202025] bg-[#0c0c10] flex items-center gap-2 overflow-x-auto shrink-0 select-none">
          {filteredItems.map((item, idx) => {
            const isFocused = idx === safeFocusedIndex
            const isItemCompleted = item.status === 'completed'
            const isItemFailed = item.status === 'failed'

            const inputKeys = Object.keys(item.input_data || {})
            const firstVal = inputKeys.length > 0 ? String(item.input_data[inputKeys[0]]) : ''

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFocusedIndex(idx)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-2 shrink-0 transition-all border",
                  isFocused
                    ? "bg-teal-500/15 border-teal-500/50 text-teal-200 font-semibold shadow-[0_0_12px_rgba(45,212,191,0.2)]"
                    : "bg-[#141418] border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700"
                )}
              >
                {isItemCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {isItemFailed && <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                {!isItemCompleted && !isItemFailed && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />}
                
                <span className="font-semibold text-zinc-100">Task #{item.row_index}</span>
                {firstVal && (
                  <span className="text-[10px] text-zinc-500 max-w-[100px] truncate">
                    {firstVal}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Workspace Display Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-800">
            <p className="text-xs text-zinc-500">
              {searchTerm ? "No matching tasks found." : "No tasks to display in this batch."}
            </p>
          </div>
        ) : layoutMode === 'focused' && currentFocusedItem ? (
          /* Focused Single Item View */
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-5 rounded-2xl bg-[#121217] border border-[#22222a] shadow-xl space-y-4">
              {/* Task Header & Quick Nav */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/70">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold font-mono text-white">
                    Task #{currentFocusedItem.row_index} of {filteredItems.length}
                  </span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {currentFocusedItem.custom_id}
                  </span>

                  {currentFocusedItem.status === 'completed' && (
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                      Completed
                    </span>
                  )}
                  {currentFocusedItem.status === 'failed' && (
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                      Failed
                    </span>
                  )}
                  {currentFocusedItem.status === 'pending' && (
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      Pending
                    </span>
                  )}

                  {currentFocusedItem.cost !== undefined && currentFocusedItem.cost !== null && (
                    <span 
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-sm"
                      title={currentFocusedItem.total_tokens ? `${currentFocusedItem.total_tokens} total tokens (${currentFocusedItem.prompt_tokens ?? '?'} prompt / ${currentFocusedItem.completion_tokens ?? '?'} completion)` : undefined}
                    >
                      <Coins className="w-3 h-3 text-emerald-400" />
                      <span>{formatCost(currentFocusedItem.cost)}</span>
                      {currentFocusedItem.total_tokens ? (
                        <span className="text-zinc-400 text-[10px] hidden sm:inline">
                          ({formatTokens(currentFocusedItem.total_tokens)} tok)
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>

                {/* Prev / Next Task Buttons */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                    Use ← / → keys
                  </span>
                  <div className="flex items-center gap-1 bg-[#181822] p-1 rounded-xl border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setFocusedIndex(prev => Math.max(0, prev - 1))}
                      disabled={safeFocusedIndex <= 0}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-700/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFocusedIndex(prev => Math.min(filteredItems.length - 1, prev + 1))}
                      disabled={safeFocusedIndex >= filteredItems.length - 1}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-700/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Input Data Chips */}
              {currentFocusedItem.input_data && Object.keys(currentFocusedItem.input_data).length > 0 && (
                <div className="flex flex-wrap gap-2 items-center bg-[#0d0d12] p-3 rounded-xl border border-zinc-800/60">
                  <span className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider">
                    Input Columns:
                  </span>
                  {Object.entries(currentFocusedItem.input_data).map(([key, value]) => (
                    <span 
                      key={key} 
                      className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#181822] border border-zinc-700/60 text-zinc-200"
                    >
                      <span className="text-zinc-500 font-medium">{key}:</span> {String(value)}
                    </span>
                  ))}
                </div>
              )}

              {/* Rendered Prompt Section */}
              <div className="p-3.5 rounded-xl bg-[#0e0e12] border border-zinc-900 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  <span>Rendered Prompt</span>
                  <button
                    onClick={() => handleCopyText(currentFocusedItem.rendered_prompt, `prompt-${currentFocusedItem.id}`)}
                    className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                  >
                    {copiedId === `prompt-${currentFocusedItem.id}` ? (
                      <Check className="w-3 h-3 text-teal-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedId === `prompt-${currentFocusedItem.id}` ? 'Copied' : 'Copy Prompt'}</span>
                  </button>
                </div>
                <p className="font-mono text-zinc-300 text-xs whitespace-pre-wrap leading-relaxed">
                  {currentFocusedItem.rendered_prompt}
                </p>
              </div>

              {/* Generated Assistant Output */}
              {currentFocusedItem.response_text ? (
                <div className="p-4 rounded-xl bg-teal-950/10 border border-teal-500/20 text-xs space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-teal-400 uppercase tracking-wider font-semibold border-b border-teal-500/10 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>Generated Response</span>
                      {currentFocusedItem.cost !== undefined && currentFocusedItem.cost !== null && (
                        <span className="text-[10px] font-mono text-emerald-400/90 font-normal lowercase ml-1.5">
                          ({formatCost(currentFocusedItem.cost)}
                          {currentFocusedItem.total_tokens ? ` • ${formatTokens(currentFocusedItem.total_tokens)} tok` : ''})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleRowViewMode(currentFocusedItem.id)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#171720] hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors flex items-center gap-1 normal-case"
                      >
                        {getItemViewMode(currentFocusedItem.id) === 'formatted' ? (
                          <>
                            <Code2 className="w-3 h-3 text-zinc-400" />
                            <span>Show Raw</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3 text-teal-400" />
                            <span>Show Formatted</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleCopyText(currentFocusedItem.response_text!, `resp-${currentFocusedItem.id}`)}
                        className="flex items-center gap-1 hover:text-teal-200 transition-colors normal-case"
                      >
                        {copiedId === `resp-${currentFocusedItem.id}` ? (
                          <Check className="w-3 h-3 text-teal-300" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === `resp-${currentFocusedItem.id}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {getItemViewMode(currentFocusedItem.id) === 'formatted' ? (
                    <div className="pt-1">
                      <MarkdownRenderer content={currentFocusedItem.response_text} />
                    </div>
                  ) : (
                    <pre className="text-zinc-200 text-xs whitespace-pre-wrap leading-relaxed font-mono font-normal pt-1 bg-[#0c0c10] p-4 rounded-xl border border-zinc-900 overflow-x-auto">
                      {currentFocusedItem.response_text}
                    </pre>
                  )}
                </div>
              ) : currentFocusedItem.error ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 font-mono">
                  Error: {currentFocusedItem.error}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#16161d] border border-zinc-800/80 text-xs text-zinc-500 italic flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  <span>Waiting for OpenRouter batch completion...</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Feed View (All Items Stacked) */
          <div className="space-y-4">
            {filteredItems.map(item => {
              const isItemCompleted = item.status === 'completed'
              const isItemFailed = item.status === 'failed'
              const itemViewMode = getItemViewMode(item.id)

              return (
                <div 
                  key={item.id} 
                  className="p-4 rounded-xl bg-[#121217] border border-[#22222a] hover:border-zinc-700 transition-all space-y-3"
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-800/60">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-400 font-semibold">#{item.row_index}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {item.custom_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isItemCompleted && (
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Completed
                        </span>
                      )}
                      {isItemFailed && (
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Failed
                        </span>
                      )}
                      {!isItemCompleted && !isItemFailed && (
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          Pending
                        </span>
                      )}
                      {item.cost !== undefined && item.cost !== null && (
                        <span 
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-sm"
                          title={item.total_tokens ? `${item.total_tokens} total tokens` : undefined}
                        >
                          <Coins className="w-3 h-3 text-emerald-400" />
                          <span>{formatCost(item.cost)}</span>
                          {item.total_tokens ? (
                            <span className="text-zinc-500 text-[10px] hidden sm:inline">
                              • {formatTokens(item.total_tokens)} tok
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Input Data Chips */}
                  {item.input_data && Object.keys(item.input_data).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] uppercase font-medium text-zinc-500 mr-1">Inputs:</span>
                      {Object.entries(item.input_data).map(([key, value]) => (
                        <span 
                          key={key} 
                          className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#181820] border border-zinc-800 text-zinc-300"
                        >
                          <span className="text-zinc-500">{key}:</span> {String(value)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Rendered Prompt */}
                  <div className="p-3 rounded-lg bg-[#0e0e12] border border-zinc-900 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">
                      <span>Rendered Prompt</span>
                      <button
                        onClick={() => handleCopyText(item.rendered_prompt, `prompt-${item.id}`)}
                        className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                      >
                        {copiedId === `prompt-${item.id}` ? (
                          <Check className="w-3 h-3 text-teal-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === `prompt-${item.id}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <p className="font-mono text-zinc-300 text-xs whitespace-pre-wrap leading-relaxed">
                      {item.rendered_prompt}
                    </p>
                  </div>

                  {/* Generated Assistant Response */}
                  {item.response_text ? (
                    <div className="p-3.5 rounded-lg bg-teal-950/10 border border-teal-500/20 text-xs space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-teal-400 uppercase tracking-wider font-semibold">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generated Output</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleRowViewMode(item.id)}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#171720] hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors flex items-center gap-1"
                            title={`Switch this response to ${itemViewMode === 'formatted' ? 'Raw text' : 'Formatted Markdown'}`}
                          >
                            {itemViewMode === 'formatted' ? (
                              <>
                                <Code2 className="w-3 h-3 text-zinc-400" />
                                <span>Raw</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3 text-teal-400" />
                                <span>Formatted</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleCopyText(item.response_text!, `resp-${item.id}`)}
                            className="flex items-center gap-1 hover:text-teal-200 transition-colors"
                          >
                            {copiedId === `resp-${item.id}` ? (
                              <Check className="w-3 h-3 text-teal-300" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedId === `resp-${item.id}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      {itemViewMode === 'formatted' ? (
                        <div className="pt-0.5">
                          <MarkdownRenderer content={item.response_text} />
                        </div>
                      ) : (
                        <pre className="text-zinc-200 text-xs whitespace-pre-wrap leading-relaxed font-mono font-normal pt-1 bg-[#0c0c10] p-3 rounded-lg border border-zinc-900 overflow-x-auto">
                          {item.response_text}
                        </pre>
                      )}
                    </div>
                  ) : item.error ? (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 font-mono">
                      Error: {item.error}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-[#16161d] border border-zinc-800/80 text-xs text-zinc-500 italic flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                      <span>Waiting for OpenRouter batch completion...</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
