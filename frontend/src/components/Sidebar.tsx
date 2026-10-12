import React, { useState, useEffect } from 'react'
import { 
  Plus, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Settings, 
  Moon, 
  RefreshCw,
  Archive,
  Zap,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react'
import { BatchSummary } from '../lib/api'
import { cn, formatRelativeTime, formatCost } from '../lib/utils'

interface SidebarProps {
  batches: BatchSummary[]
  selectedBatchId: string | null
  onSelectBatch: (id: string) => void
  onOpenNewBatchModal: () => void
  onOpenSettingsModal: () => void
  onRefresh: () => void
  isRefreshing: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({
  batches,
  selectedBatchId,
  onSelectBatch,
  onOpenNewBatchModal,
  onOpenSettingsModal,
  onRefresh,
  isRefreshing,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('somnia_sidebar_collapsed') === 'true'
  })

  const [width, setWidth] = useState<number>(() => {
    const saved = localStorage.getItem('somnia_sidebar_width')
    return saved ? Math.max(220, Math.min(520, parseInt(saved, 10))) : 288
  })

  const [isResizing, setIsResizing] = useState(false)

  // Resizing mouse drag handlers
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const minW = 220
      const maxW = Math.min(550, window.innerWidth * 0.45)
      
      // Auto-collapse if dragged very narrow
      if (e.clientX < 140) {
        setIsCollapsed(true)
        localStorage.setItem('somnia_sidebar_collapsed', 'true')
        setIsResizing(false)
        return
      }

      const clamped = Math.max(minW, Math.min(maxW, e.clientX))
      setWidth(clamped)
      localStorage.setItem('somnia_sidebar_width', String(clamped))

      if (isCollapsed) {
        setIsCollapsed(false)
        localStorage.setItem('somnia_sidebar_collapsed', 'false')
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, isCollapsed])

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('somnia_sidebar_collapsed', String(next))
      return next
    })
  }

  const activeBatches = batches.filter(b => 
    ['submitted', 'in_progress', 'validating'].includes(b.status)
  )

  const archiveBatches = batches.filter(b => 
    ['completed', 'failed', 'cancelled', 'expired'].includes(b.status)
  )

  const unreadCount = batches.filter(b => b.is_unread).length

  // Collapsed Slim Rail (Gemini Style)
  if (isCollapsed) {
    return (
      <aside className="w-16 h-screen bg-[#0d0d10] border-r border-[#202025] flex flex-col items-center justify-between py-3 shrink-0 select-none transition-[width] duration-150 z-20">
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Expand Toggle */}
          <button
            onClick={toggleCollapse}
            title="Expand sidebar"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div 
            title="Somnia Batch Manager"
            className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.2)]"
          >
            <Moon className="w-4 h-4 fill-teal-400/20" />
          </div>

          <div className="w-8 h-[1px] bg-zinc-800 my-0.5" />

          {/* Quick New Batch Button */}
          <button
            onClick={onOpenNewBatchModal}
            title="Create New Batch"
            className="w-10 h-10 rounded-xl bg-teal-500 hover:bg-teal-400 text-zinc-950 flex items-center justify-center transition-all shadow-[0_0_16px_rgba(45,212,191,0.25)] hover:shadow-[0_0_20px_rgba(45,212,191,0.4)] active:scale-95"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            title="Refresh batches"
            disabled={isRefreshing}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-teal-400")} />
          </button>

          {/* Slim Batch Status Indicators */}
          <div className="flex flex-col items-center gap-2 mt-2 w-full px-2 overflow-y-auto max-h-[50vh]">
            {activeBatches.length > 0 && (
              <div 
                title={`${activeBatches.length} active batch(es) running`}
                className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 relative"
              >
                <Zap className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-bold flex items-center justify-center font-mono">
                  {activeBatches.length}
                </span>
              </div>
            )}

            {archiveBatches.slice(0, 6).map(b => {
              const isSelected = selectedBatchId === b.id
              const isFailed = b.status === 'failed' || b.status === 'cancelled'

              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBatch(b.id)}
                  title={`${b.name} (${b.model.split('/').pop()})`}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all relative",
                    isSelected
                      ? "bg-zinc-800 border border-teal-500/60 text-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.15)]"
                      : "bg-[#141418] hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800/60"
                  )}
                >
                  {isFailed ? (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}

                  {b.is_unread && (
                    <div 
                      title="Unread"
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf] animate-pulse ring-2 ring-zinc-900" 
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer / Settings */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onOpenSettingsModal}
            title="Settings & Auth"
            className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>
    )
  }

  // Expanded Sidebar
  return (
    <aside 
      style={{ width }}
      className="h-screen bg-[#0d0d10] border-r border-[#202025] flex flex-col shrink-0 select-none relative z-10"
    >
      {/* Brand & Action Header */}
      <div className="p-4 border-b border-[#202025]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.2)] shrink-0">
              <Moon className="w-4 h-4 fill-teal-400/20" />
            </div>
            <div className="min-w-0 truncate">
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5 truncate">
                <span>Somnia</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                  Batch
                </span>
              </h1>
              <p className="text-[11px] text-zinc-500 truncate">OpenRouter Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onRefresh}
              title="Refresh batches"
              disabled={isRefreshing}
              className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-teal-400")} />
            </button>

            {/* Collapse Button */}
            <button
              onClick={toggleCollapse}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          onClick={onOpenNewBatchModal}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-zinc-950 font-medium text-sm transition-all shadow-[0_0_16px_rgba(45,212,191,0.25)] hover:shadow-[0_0_20px_rgba(45,212,191,0.4)] active:scale-[0.99]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Batch</span>
        </button>
      </div>

      {/* Batch Lists Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Active Batches Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Active</span>
            </div>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700">
              {activeBatches.length}
            </span>
          </div>

          {activeBatches.length === 0 ? (
            <div className="px-3 py-4 rounded-lg border border-dashed border-zinc-800/80 text-center">
              <p className="text-xs text-zinc-500">No active batches running</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activeBatches.map(batch => {
                const isSelected = selectedBatchId === batch.id
                return (
                  <button
                    key={batch.id}
                    onClick={() => onSelectBatch(batch.id)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 group",
                      isSelected
                        ? "bg-zinc-800/90 border-teal-500/50 shadow-[0_0_12px_rgba(45,212,191,0.1)] text-white"
                        : "bg-[#141418] hover:bg-zinc-800/60 border-zinc-800/60 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    <Loader2 className="w-4 h-4 mt-0.5 text-teal-400 animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-zinc-200 group-hover:text-white">
                        {batch.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                        <span className="truncate max-w-[110px] text-zinc-400">{batch.model.split('/').pop()}</span>
                        <span>•</span>
                        <span className="font-mono text-zinc-400">{batch.completed_requests}/{batch.total_requests}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Archive / Completed Batches Section */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <Archive className="w-3.5 h-3.5 text-zinc-400" />
              <span>Archive</span>
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  {unreadCount} unread
                </span>
              )}
              <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                {archiveBatches.length}
              </span>
            </div>
          </div>

          {archiveBatches.length === 0 ? (
            <div className="px-3 py-4 rounded-lg border border-dashed border-zinc-800/80 text-center">
              <p className="text-xs text-zinc-500">No completed batches yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {archiveBatches.map(batch => {
                const isSelected = selectedBatchId === batch.id
                const isFailed = batch.status === 'failed' || batch.status === 'cancelled'
                return (
                  <button
                    key={batch.id}
                    onClick={() => onSelectBatch(batch.id)}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition-all flex items-start gap-2.5 relative group",
                      isSelected
                        ? "bg-zinc-800/90 border-teal-500/50 shadow-[0_0_12px_rgba(45,212,191,0.1)] text-white"
                        : "bg-[#141418] hover:bg-zinc-800/60 border-zinc-800/60 text-zinc-300 hover:border-zinc-700"
                    )}
                  >
                    {isFailed ? (
                      <XCircle className="w-4 h-4 mt-0.5 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                    )}

                    <div className="flex-1 min-w-0 pr-4">
                      <p className={cn(
                        "text-xs truncate",
                        batch.is_unread ? "font-semibold text-white" : "font-normal text-zinc-300"
                      )}>
                        {batch.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                        <span className="truncate max-w-[95px] text-zinc-400">{batch.model.split('/').pop()}</span>
                        <span>•</span>
                        <span className="font-mono">{formatRelativeTime(batch.completed_at || batch.created_at)}</span>
                        {((batch.total_cost !== null && batch.total_cost !== undefined) || (batch.estimated_cost !== null && batch.estimated_cost !== undefined)) && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-emerald-400/90 text-[10px] font-medium">
                              {formatCost(batch.total_cost ?? batch.estimated_cost)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Unread Pulsing Teal Indicator Dot */}
                    {batch.is_unread && (
                      <div 
                        title="Completed - unread"
                        className="absolute right-3 top-3.5 w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] animate-pulse ring-2 ring-teal-900/50" 
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer / Settings Trigger */}
      <div className="p-3 border-t border-[#202025] bg-[#0b0b0e]">
        <button
          onClick={onOpenSettingsModal}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 transition-colors text-xs"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400" />
            <span className="font-medium">Settings & Auth</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            v1.0
          </span>
        </button>
      </div>

      {/* Vertical Drag Resize Handle */}
      <div
        onMouseDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
        }}
        className={cn(
          "absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-teal-500/60 transition-colors z-30 group flex items-center justify-center",
          isResizing && "bg-teal-500 w-2 shadow-[0_0_8px_rgba(45,212,191,0.5)]"
        )}
        title="Drag to resize sidebar width"
      >
        <div className="w-[1px] h-8 bg-zinc-600 group-hover:bg-teal-300 transition-colors" />
      </div>
    </aside>
  )
}
