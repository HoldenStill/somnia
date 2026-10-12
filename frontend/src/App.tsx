import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { BatchDetailView } from './components/BatchDetailView'
import { NewBatchModal } from './components/NewBatchModal'
import { SettingsModal } from './components/SettingsModal'
import { 
  BatchSummary, 
  BatchDetail, 
  ModelOption, 
  fetchBatches, 
  fetchBatchDetail, 
  fetchModels 
} from './lib/api'

export const App: React.FC = () => {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<BatchDetail | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  
  const [isRefreshingBatches, setIsRefreshingBatches] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  
  const [isNewBatchOpen, setIsNewBatchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Load initial batch summaries
  const refreshBatchesList = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshingBatches(true)
    try {
      const data = await fetchBatches()
      setBatches(data)
    } catch (err) {
      console.error('Failed to load batches list:', err)
    } finally {
      if (!quiet) setIsRefreshingBatches(false)
    }
  }, [])

  // Load models catalog
  const loadModels = useCallback(async () => {
    try {
      const data = await fetchModels()
      setModels(data)
    } catch (err) {
      console.error('Failed to load models list:', err)
    }
  }, [])

  // Load selected batch details
  const loadBatchDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setIsLoadingDetail(true)
    try {
      const detail = await fetchBatchDetail(id)
      setSelectedBatchDetail(detail)
    } catch (err) {
      console.error(`Failed to load batch detail for ${id}:`, err)
      setSelectedBatchDetail(null)
    } finally {
      if (!quiet) setIsLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    refreshBatchesList()
    loadModels()
  }, [refreshBatchesList, loadModels])

  // Periodic polling every 10 seconds for live updates
  useEffect(() => {
    const timer = setInterval(() => {
      refreshBatchesList(true)
      if (selectedBatchId) {
        loadBatchDetail(selectedBatchId, true)
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [selectedBatchId, refreshBatchesList, loadBatchDetail])

  // When selectedBatchId changes, load details
  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetail(selectedBatchId)
    } else {
      setSelectedBatchDetail(null)
    }
  }, [selectedBatchId, loadBatchDetail])

  const handleBatchCreated = (newId: string) => {
    refreshBatchesList()
    setSelectedBatchId(newId)
  }

  const handleBatchDeleted = () => {
    setSelectedBatchId(null)
    setSelectedBatchDetail(null)
    refreshBatchesList()
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100">
      {/* Left Sidebar */}
      <Sidebar
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelectBatch={(id) => setSelectedBatchId(id)}
        onOpenNewBatchModal={() => setIsNewBatchOpen(true)}
        onOpenSettingsModal={() => setIsSettingsOpen(true)}
        onRefresh={() => refreshBatchesList()}
        isRefreshing={isRefreshingBatches}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <BatchDetailView
          batch={selectedBatchDetail}
          isLoading={isLoadingDetail}
          onBatchUpdated={() => {
            if (selectedBatchId) loadBatchDetail(selectedBatchId, true)
            refreshBatchesList(true)
          }}
          onBatchDeleted={handleBatchDeleted}
        />
      </main>

      {/* New Batch Creation Modal */}
      <NewBatchModal
        isOpen={isNewBatchOpen}
        onClose={() => setIsNewBatchOpen(false)}
        models={models}
        onBatchCreated={handleBatchCreated}
        onOpenSettings={() => {
          setIsNewBatchOpen(false)
          setIsSettingsOpen(true)
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsUpdated={() => {
          loadModels()
          refreshBatchesList()
        }}
      />
    </div>
  )
}

export default App
