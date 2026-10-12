import React, { useState, useRef, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  Sliders, 
  Brain, 
  Sparkles, 
  AlertCircle,
  Loader2,
  Eye,
  Coins,
  Code2
} from 'lucide-react'
import { ModelOption, createBatch } from '../lib/api'
import { cn } from '../lib/utils'

interface NewBatchModalProps {
  isOpen: boolean
  onClose: () => void
  models: ModelOption[]
  onBatchCreated: (batchId: string) => void
  onOpenSettings: () => void
}

function getModelProvider(id: string): string {
  const low = id.toLowerCase()
  if (low.startsWith('openai/')) return 'OpenAI'
  if (low.startsWith('anthropic/')) return 'Anthropic'
  if (low.startsWith('deepseek/')) return 'DeepSeek'
  if (low.startsWith('google/')) return 'Google'
  if (low.startsWith('meta-llama/')) return 'Meta / Llama'
  if (low.startsWith('mistralai/')) return 'Mistral'
  if (low.startsWith('moonshotai/')) return 'Moonshot'
  if (low.startsWith('x-ai/')) return 'xAI / Grok'
  if (low.startsWith('z-ai/')) return 'Z-AI / GLM'
  if (low.startsWith('qwen/')) return 'Qwen'
  if (low.startsWith('cohere/')) return 'Cohere'
  return 'Other Verified'
}


function interpolatePrompt(template: string, row: Record<string, any>): string {
  if (!row) return template
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, varName) => {
    const trimmed = varName.trim()
    if (row[trimmed] !== undefined && row[trimmed] !== null) return String(row[trimmed])
    for (const [k, v] of Object.entries(row)) {
      if (k.trim().toLowerCase() === trimmed.toLowerCase()) {
        return v !== null && v !== undefined ? String(v) : ''
      }
    }
    return match
  })
}

export const NewBatchModal: React.FC<NewBatchModalProps> = ({
  isOpen,
  onClose,
  models,
  onBatchCreated,
  onOpenSettings,
}) => {
  const [batchName, setBatchName] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o:batch')
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [customModelSlug, setCustomModelSlug] = useState('')
  const [onlyBatchReady, setOnlyBatchReady] = useState(true)
  const [promptTemplate, setPromptTemplate] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [responseFormatJson, setResponseFormatJson] = useState(false)
  const [temperature, setTemperature] = useState<number>(1.0)
  const [reasoningEffort, setReasoningEffort] = useState<string>('medium')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const [searchModel, setSearchModel] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  // CSV State
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, any>[]>([])
  const [csvPreviewRows, setCsvPreviewRows] = useState<Record<string, any>[]>([])
  const [isParsingCsv, setIsParsingCsv] = useState(false)

  // Submitting State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (models.length > 0) {
      const currentExists = models.some(m => m.id === selectedModel)
      if (!currentExists) {
        // Find preferred batch ready model
        const defaultModel = models.find(m => m.is_batch_ready) || models[0]
        if (defaultModel) {
          setSelectedModel(defaultModel.id)
        }
      }
    }
  }, [models, selectedModel])


  const handleFileUpload = (file: File) => {
    setIsParsingCsv(true)
    setErrorMessage(null)
    setCsvFileName(file.name)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsParsingCsv(false)
        if (results.errors.length > 0 && results.data.length === 0) {
          setErrorMessage(`Error parsing CSV: ${results.errors[0].message}`)
          return
        }

        const headers = results.meta.fields || []
        const rows = results.data as Record<string, any>[]

        if (rows.length === 0) {
          setErrorMessage('CSV file appears to be empty.')
          return
        }

        setCsvHeaders(headers)
        setCsvRows(rows)
        setCsvPreviewRows(rows.slice(0, 3))

        if (!batchName) {
          setBatchName(`${file.name.replace(/\.[^/.]+$/, '')} (${rows.length} rows)`)
        }
      },
      error: (err) => {
        setIsParsingCsv(false)
        setErrorMessage(`Failed to read CSV: ${err.message}`)
      }
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  const insertVariableChip = (header: string) => {
    const chipText = `{{${header}}}`
    const textarea = textareaRef.current
    if (!textarea) {
      setPromptTemplate(prev => prev + chipText)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentText = promptTemplate
    const nextText = currentText.substring(0, start) + chipText + currentText.substring(end)
    setPromptTemplate(nextText)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + chipText.length, start + chipText.length)
    }, 0)
  }

  const activeModel = isCustomModel ? customModelSlug.trim() : selectedModel
  const selectedModelObj = models.find(m => m.id === selectedModel)
  const isSelectedModelBatchReady = isCustomModel
    ? true // Custom model validity will be resolved or reported by backend
    : (selectedModelObj?.is_batch_ready ?? selectedModel.endsWith(':batch'))

  const supportsReasoning = isCustomModel
    ? ['/o1', '/o3', '/o4', '-r1', 'reasoning', 'deepseek-r1'].some(tag => customModelSlug.toLowerCase().includes(tag))
    : (selectedModelObj?.supports_reasoning ?? false)

  const filteredModels = models.filter(m => {
    const matchesBatch = onlyBatchReady ? (m.is_batch_ready ?? false) : true
    const matchesSearch = 
      m.id.toLowerCase().includes(searchModel.toLowerCase()) || 
      m.name.toLowerCase().includes(searchModel.toLowerCase())
    return matchesBatch && matchesSearch
  })

  // Group models by provider
  const groupedModels = useMemo(() => {
    const map = new Map<string, ModelOption[]>()
    for (const m of filteredModels) {
      const provider = getModelProvider(m.id)
      if (!map.has(provider)) {
        map.set(provider, [])
      }
      map.get(provider)!.push(m)
    }
    return map
  }, [filteredModels])

  // Pre-flight estimation
  const tokenAndCostEstimate = useMemo(() => {
    if (csvRows.length === 0 || !promptTemplate.trim()) {
      return null
    }

    const sampleRow = csvRows[0] || {}
    const sampleRendered = interpolatePrompt(promptTemplate, sampleRow)
    const approxTokensPerRow = Math.max(10, Math.ceil((sampleRendered.length + (systemPrompt?.length || 0)) / 4))
    const totalInputTokens = approxTokensPerRow * csvRows.length

    let estCost: number | null = null
    let standardCost: number | null = null

    if (selectedModelObj && selectedModelObj.pricing) {
      const promptRate = parseFloat(String(selectedModelObj.pricing.prompt || '0'))
      const completionRate = parseFloat(String(selectedModelObj.pricing.completion || '0'))
      if (!isNaN(promptRate) && promptRate > 0) {
        // Assume avg 400 completion tokens per item
        const rawCost = (totalInputTokens * promptRate) + (csvRows.length * 400 * completionRate)
        const isBatchEndpoint = selectedModelObj.id.endsWith(':batch')
        if (isBatchEndpoint) {
          // OpenRouter's :batch model pricing ALREADY reflects the 50% discount!
          estCost = rawCost
          standardCost = rawCost * 2
        } else {
          standardCost = rawCost
          estCost = rawCost * 0.5 // Apply 50% discount to standard pricing
        }
      }
    }

    return {
      approxTokensPerRow,
      totalInputTokens,
      estCost,
      standardCost
    }
  }, [csvRows, promptTemplate, systemPrompt, selectedModelObj])


  // Rendered prompt for dry-run inspection
  const row1RenderedPrompt = useMemo(() => {
    if (csvRows.length === 0 || !promptTemplate.trim()) return ''
    return interpolatePrompt(promptTemplate, csvRows[0])
  }, [csvRows, promptTemplate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (csvRows.length === 0) {
      setErrorMessage('Please upload a CSV file with at least 1 row.')
      return
    }
    if (!promptTemplate.trim()) {
      setErrorMessage('Please enter a prompt template.')
      return
    }
    if (isCustomModel && !customModelSlug.trim()) {
      setErrorMessage('Please enter a custom model slug (e.g. openai/gpt-4o:batch or deepseek/deepseek-v4.1-flash:batch).')
      return
    }
    if (!isCustomModel && !isSelectedModelBatchReady) {
      setErrorMessage(`Model '${selectedModelObj?.name || selectedModel}' does not have an OpenRouter :batch endpoint. Please choose a Batch Ready model to proceed.`)
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)


    try {
      const result = await createBatch({
        name: batchName.trim() || undefined,
        model: activeModel,
        prompt_template: promptTemplate,
        csv_rows: csvRows,
        temperature,
        reasoning_effort: supportsReasoning ? reasoningEffort : undefined,
        system_prompt: systemPrompt.trim() || undefined,
        response_format_json: responseFormatJson,
        estimated_cost: tokenAndCostEstimate?.estCost,
      })

      onBatchCreated(result.id)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit batch.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl lg:max-w-5xl bg-[#111115] border border-[#27272f] rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#202025] bg-[#0d0d10]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.2)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Create OpenRouter Batch</h2>
              <p className="text-xs text-zinc-400">Asynchronous execution (50% discount) from CSV tabular datasets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3 text-xs text-rose-300">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              {errorMessage.includes('API key') && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="underline font-semibold hover:text-rose-100 shrink-0"
                >
                  Configure Key
                </button>
              )}
            </div>
          )}

          {/* 1. Batch Title & Target Model Picker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="batch-name-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Batch Name (Optional)
              </label>
              <input
                id="batch-name-input"
                type="text"
                placeholder="e.g. Filter Frequency Calculations - Set #1"
                value={batchName}
                onChange={e => setBatchName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#18181e] border border-[#272730] text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            {/* Model Selector Dropdown & Custom Override */}
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor={isCustomModel ? "custom-model-input" : undefined} className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <span>Target Model</span>
                  {supportsReasoning && (
                    <span className="text-[10px] text-teal-400 font-mono px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/30 font-semibold normal-case">
                      Reasoning Ready
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModel(prev => !prev)
                    setShowModelDropdown(false)
                  }}
                  className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium hover:underline"
                >
                  {isCustomModel ? 'Choose from verified list' : '+ Custom model slug'}
                </button>
              </div>

              {isCustomModel ? (
                <div className="space-y-1.5">
                  <input
                    id="custom-model-input"
                    type="text"
                    placeholder="e.g. anthropic/claude-sonnet-5.5:batch"
                    value={customModelSlug}
                    onChange={e => setCustomModelSlug(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#18181e] border border-teal-500/50 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-zinc-400">
                    <span>
                      OpenRouter batch requests require the <code className="text-teal-400 font-mono">:batch</code> tag.
                    </span>
                    {customModelSlug.trim() && !customModelSlug.trim().endsWith(':batch') && (
                      <button
                        type="button"
                        onClick={() => setCustomModelSlug(prev => prev.trim() + ':batch')}
                        className="px-2 py-0.5 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-mono text-[11px] font-medium border border-teal-500/30 transition-colors"
                      >
                        + Add ':batch' suffix
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#18181e] border border-[#272730] text-sm text-zinc-100 hover:border-zinc-600 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="truncate font-semibold text-sm">
                        {selectedModelObj ? selectedModelObj.name : selectedModel}
                      </span>
                      {selectedModelObj?.is_batch_ready ? (
                        <span className="text-xs text-teal-300 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-md font-mono font-semibold shrink-0">
                          50% Off
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono font-semibold shrink-0">
                          No Batch Endpoint
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                  </button>

                  {!isCustomModel && selectedModelObj && !selectedModelObj.is_batch_ready && (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="leading-relaxed">
                        <span className="font-semibold">No Batch Endpoint:</span> OpenRouter does not support asynchronous batch processing for <code className="font-mono text-amber-200">{selectedModelObj.id}</code>. Please choose a model with the <strong className="text-teal-300">50% Off</strong> badge to proceed.
                      </div>
                    </div>
                  )}


                  {showModelDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-[#16161c] border border-[#272730] rounded-xl shadow-2xl p-2.5 space-y-2 max-h-[440px] overflow-y-auto">
                      <input
                        type="text"
                        placeholder="Search model name or provider..."
                        value={searchModel}
                        onChange={e => setSearchModel(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-[#1f1f27] border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                        autoFocus
                      />

                      {/* Filter Toggles */}
                      <div className="flex items-center justify-between px-1 py-1 text-xs border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-1.5 bg-[#121217] p-1 rounded-lg border border-zinc-800">
                          <button
                            type="button"
                            onClick={() => setOnlyBatchReady(true)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                              onlyBatchReady
                                ? "bg-teal-500/20 text-teal-300 font-semibold"
                                : "text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            Batch Ready (50% Off)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOnlyBatchReady(false)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                              !onlyBatchReady
                                ? "bg-zinc-700 text-zinc-200 font-semibold"
                                : "text-zinc-400 hover:text-zinc-200"
                            )}
                          >
                            All Models
                          </button>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono">
                          {filteredModels.length} models
                        </span>
                      </div>

                      {filteredModels.length === 0 ? (
                        <div className="py-6 text-center text-xs text-zinc-500">
                          No models match your search or filter.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {Array.from(groupedModels.entries()).map(([provider, pModels]) => (
                            <div key={provider} className="space-y-1">
                              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1 bg-[#1a1a23] rounded-md sticky top-0 z-10">
                                {provider}
                              </div>
                              {pModels.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    if (!m.is_batch_ready && m.batch_model_id) {
                                      setSelectedModel(m.batch_model_id)
                                    } else {
                                      setSelectedModel(m.id)
                                    }
                                    setShowModelDropdown(false)
                                    setSearchModel('')
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors",
                                    selectedModel === m.id
                                      ? "bg-teal-500/15 text-teal-200 border border-teal-500/30 font-medium"
                                      : "hover:bg-zinc-800 text-zinc-300"
                                  )}
                                >
                                  <div className="truncate mr-3">
                                    <div className="font-medium text-sm text-zinc-100 flex items-center gap-2">
                                      <span>{m.name}</span>
                                      {m.is_batch_ready && (
                                        <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded font-mono">
                                          50% Off
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-zinc-500 font-mono mt-0.5">{m.id}</div>
                                  </div>
                                  {m.supports_reasoning && (
                                    <span title="Supports Reasoning" className="shrink-0">
                                      <Brain className="w-4 h-4 text-teal-400" />
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 2. CSV File Uploader */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              CSV Data Source
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={e => e.target.files && handleFileUpload(e.target.files[0])}
              className="hidden"
            />

            {!csvFileName ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#272732] hover:border-teal-500/50 rounded-2xl p-6 text-center cursor-pointer transition-all bg-[#141418]/60 hover:bg-[#16161d]"
              >
                {isParsingCsv ? (
                  <div className="py-3">
                    <Loader2 className="w-7 h-7 text-teal-400 animate-spin mx-auto mb-2" />
                    <p className="text-xs text-zinc-300">Parsing CSV rows...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 mx-auto flex items-center justify-center text-zinc-400 mb-2.5">
                      <Upload className="w-6 h-6 text-teal-400" />
                    </div>
                    <p className="text-sm font-semibold text-zinc-200">
                      Click to upload or drag and drop your CSV dataset
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Column headers will automatically become template chips
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#16161c] border border-[#272730] flex items-center justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-200 truncate">{csvFileName}</p>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">
                        {csvRows.length} rows loaded • {csvHeaders.length} columns
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvFileName(null)
                      setCsvHeaders([])
                      setCsvRows([])
                      setCsvPreviewRows([])
                    }}
                    className="p-2 text-zinc-400 hover:text-rose-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {csvPreviewRows.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#141418] border border-zinc-800/80 text-xs overflow-x-auto">
                    <div className="text-[11px] uppercase font-semibold text-zinc-500 mb-2 px-1">
                      Dataset Preview (First {csvPreviewRows.length} rows)
                    </div>
                    <table className="w-full text-left font-mono text-zinc-400">
                      <thead>
                        <tr className="border-b border-zinc-800 text-zinc-500">
                          {csvHeaders.slice(0, 5).map(h => (
                            <th key={h} className="p-1.5 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewRows.map((r, i) => (
                          <tr key={i} className="border-b border-zinc-900 last:border-0">
                            {csvHeaders.slice(0, 5).map(h => (
                              <td key={h} className="p-1.5 truncate max-w-[150px]">{String(r[h] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. CSV Column Chips Generator */}
          {csvHeaders.length > 0 && (
            <div className="p-4 rounded-xl bg-[#141418] border border-[#222228] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Available Variable Chips
                </span>
                <span className="text-xs text-zinc-500">
                  Click a chip to insert into prompt template
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {csvHeaders.map(header => (
                  <button
                    key={header}
                    type="button"
                    onClick={() => insertVariableChip(header)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f1f28] hover:bg-teal-500/20 border border-zinc-700/80 hover:border-teal-500/50 text-xs font-mono text-teal-300 transition-all hover:scale-[1.03] active:scale-95"
                  >
                    <span>{`{{${header}}}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Prompt Template Textarea */}
          <div>
            <label htmlFor="prompt-template-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Prompt Template</span>
              <span className="text-xs text-zinc-500 normal-case font-normal">Each CSV row generates 1 batch request</span>
            </label>
            <textarea
              id="prompt-template-input"
              ref={textareaRef}
              rows={5}
              value={promptTemplate}
              onChange={e => setPromptTemplate(e.target.value)}
              placeholder="e.g. For component {{part_number}} with nominal capacitance {{capacitance}} and ESR {{esr}}, calculate the 3dB cutoff frequency in low-pass configuration."
              className="w-full px-4 py-3 rounded-xl bg-[#16161c] border border-[#272730] text-sm text-zinc-100 placeholder-zinc-500 font-mono leading-relaxed focus:outline-none focus:border-teal-500 transition-colors resize-y"
            />
          </div>

          {/* 5. Row 1 Dry-Run Prompt Preview */}
          {csvRows.length > 0 && promptTemplate.trim() && (
            <div className="border border-[#222228] rounded-xl overflow-hidden bg-[#131317]">
              <button
                type="button"
                onClick={() => setShowPromptPreview(prev => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-400" />
                  <span>Dry-Run Inspection: Rendered Prompt for Row 1</span>
                </div>
                {showPromptPreview ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {showPromptPreview && (
                <div className="p-4 pt-2 border-t border-[#202025] bg-[#0d0d10] space-y-2">
                  <p className="text-[11px] text-zinc-400">
                    This is the exact prompt that OpenRouter will execute for the first dataset item:
                  </p>
                  <pre className="p-3.5 rounded-xl bg-[#16161c] border border-zinc-800 text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed">
                    {row1RenderedPrompt}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* 6. Advanced Controls Accordion */}
          <div className="border border-[#222228] rounded-xl overflow-hidden bg-[#131317]">
            <button
              type="button"
              onClick={() => setShowAdvanced(prev => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                <span>Advanced Controls (System Prompt, JSON Mode, Reasoning)</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="px-5 pb-5 pt-3 border-t border-[#202025] space-y-5">
                {/* System Prompt */}
                <div>
                  <label htmlFor="system-prompt-input" className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>System Prompt (Optional)</span>
                  </label>
                  <textarea
                    id="system-prompt-input"
                    rows={2}
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    placeholder="e.g. You are an expert electrical engineer. Provide rigorous equations and clean formatting."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#181820] border border-[#272730] text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>

                {/* Structured Output (JSON Mode) Toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#17171e] border border-[#25252e]">
                  <div>
                    <label htmlFor="json-mode-checkbox" className="text-xs font-medium text-zinc-200 cursor-pointer block">
                      Structured Output (JSON Mode)
                    </label>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Enforces valid JSON object output (<code className="text-teal-400">response_format: json_object</code>)
                    </p>
                  </div>
                  <input
                    id="json-mode-checkbox"
                    type="checkbox"
                    checked={responseFormatJson}
                    onChange={e => setResponseFormatJson(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-500 accent-teal-500 focus:ring-teal-400 cursor-pointer"
                  />
                </div>

                {/* Temperature Slider */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label htmlFor="temperature-slider-input" className="text-zinc-300 cursor-pointer">
                      Temperature
                    </label>
                    <span className="font-mono text-teal-300 text-xs px-2 py-0.5 rounded bg-zinc-800">
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="temperature-slider-input"
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={e => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
                  />
                  <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                    <span>0.0 (Precise / Deterministic)</span>
                    <span>1.0 (Creative)</span>
                  </div>
                </div>

                {/* Reasoning Effort Dropdown */}
                {supportsReasoning ? (
                  <div>
                    <label htmlFor="reasoning-effort-select" className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Brain className="w-4 h-4 text-teal-400" />
                      <span>Reasoning Effort</span>
                    </label>
                    <select
                      id="reasoning-effort-select"
                      value={reasoningEffort}
                      onChange={e => setReasoningEffort(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#1a1a22] border border-[#272730] text-xs text-zinc-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="low">Low (Faster, lower token consumption)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (Deepest chain-of-thought analysis)</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic">
                    Reasoning effort controls are automatically activated for reasoning models (e.g. o1, o3, DeepSeek-R1).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 7. Pre-Flight Token & Cost Estimator Card */}
          {tokenAndCostEstimate && (
            <div className="p-4 rounded-xl bg-[#14181a] border border-teal-500/20 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <span>Pre-Flight Batch Estimator</span>
                    <span className="text-[10px] text-teal-300 bg-teal-500/20 border border-teal-500/30 px-1.5 py-0.5 rounded font-mono">
                      50% Discount Applied
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {csvRows.length} requests • ~{tokenAndCostEstimate.totalInputTokens.toLocaleString()} total input tokens (~{tokenAndCostEstimate.approxTokensPerRow} tokens/row)
                  </p>
                </div>
              </div>

              {tokenAndCostEstimate.estCost !== null && (
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-teal-300">
                    Est. Cost: ~${tokenAndCostEstimate.estCost < 0.001 ? '< 0.001' : tokenAndCostEstimate.estCost.toFixed(3)}
                  </div>
                  {tokenAndCostEstimate.standardCost && (
                    <div className="text-[10px] font-mono text-zinc-500 line-through">
                      Standard: ~${tokenAndCostEstimate.standardCost.toFixed(3)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3.5 pt-4 border-t border-[#202025]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                isSubmitting || 
                csvRows.length === 0 || 
                !promptTemplate.trim() || 
                (isCustomModel && !customModelSlug.trim()) ||
                (!isCustomModel && !isSelectedModelBatchReady)
              }
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-all shadow-[0_0_16px_rgba(45,212,191,0.25)] hover:shadow-[0_0_24px_rgba(45,212,191,0.4)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting to OpenRouter...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Submit Batch ({csvRows.length} requests)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
