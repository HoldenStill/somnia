export interface BatchSummary {
  id: string
  openrouter_batch_id: string | null
  name: string
  model: string
  endpoint: string
  status: 'submitted' | 'in_progress' | 'validating' | 'completed' | 'failed' | 'cancelled' | 'expired'
  prompt_template: string
  total_requests: number
  completed_requests: number
  failed_requests: number
  is_unread: boolean
  temperature: number
  reasoning_effort: string | null
  system_prompt?: string | null
  response_format_json?: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
  error_message: string | null
  total_cost?: number | null
  total_tokens?: number | null
  total_prompt_tokens?: number | null
  total_completion_tokens?: number | null
  estimated_cost?: number | null
}

export interface BatchItem {
  id: number
  custom_id: string
  row_index: number
  input_data: Record<string, any>
  rendered_prompt: string
  response_text: string | null
  status: 'pending' | 'completed' | 'failed'
  error: string | null
  cost?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
}

export interface BatchDetail extends BatchSummary {
  items: BatchItem[]
}

export interface ModelOption {
  id: string
  name: string
  context_length: number | null
  pricing: Record<string, any> | null
  description: string | null
  supports_reasoning: boolean
  is_batch_ready?: boolean
  batch_model_id?: string | null
}

export interface SettingsResponse {
  has_api_key: boolean
  api_key_masked: string | null
  poll_interval_minutes: number
  data_dir: string
  db_path: string
  webhook_url?: string | null
}

export interface BatchCreatePayload {
  name?: string
  model: string
  prompt_template: string
  csv_rows: Record<string, any>[]
  temperature: number
  reasoning_effort?: string | null
  system_prompt?: string | null
  response_format_json?: boolean
  estimated_cost?: number | null
}

const API_BASE = '/api'

export async function fetchBatches(status?: 'active' | 'archive'): Promise<BatchSummary[]> {
  const url = status ? `${API_BASE}/batches?status=${status}` : `${API_BASE}/batches`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch batches: ${res.statusText}`)
  return res.json()
}

export async function fetchBatchDetail(id: string): Promise<BatchDetail> {
  const res = await fetch(`${API_BASE}/batches/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch batch detail: ${res.statusText}`)
  return res.json()
}

export async function createBatch(payload: BatchCreatePayload): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to create batch')
  }
  return res.json()
}

export async function markBatchRead(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/batches/${id}/read`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to mark batch as read')
}

export async function pollBatchNow(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/batches/${id}/poll`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to trigger poll for batch')
  return res.json()
}

export async function deleteBatch(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/batches/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete batch')
}

export async function fetchModels(): Promise<ModelOption[]> {
  const res = await fetch(`${API_BASE}/models`)
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`)
  if (!res.ok) throw new Error('Failed to fetch settings')
  return res.json()
}

export async function updateSettings(data: { api_key?: string; webhook_url?: string }): Promise<SettingsResponse> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update settings')
  return res.json()
}

export async function testWebhook(webhookUrl: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/settings/test-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_url: webhookUrl }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Webhook test failed')
  }
  return res.json()
}

export async function retryFailedBatch(id: string): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE}/batches/${id}/retry-failed`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to retry batch')
  }
  return res.json()
}

export function getExportUrl(id: string, format: 'csv' | 'json' | 'markdown'): string {
  return `${API_BASE}/batches/${id}/export?format=${format}`
}
