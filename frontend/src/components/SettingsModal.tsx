import React, { useState, useEffect } from 'react'
import { X, Key, Database, Check, AlertCircle, Loader2, Bell, Send } from 'lucide-react'
import { SettingsResponse, fetchSettings, updateSettings, testWebhook } from '../lib/api'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSettingsUpdated: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsUpdated,
}) => {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Webhook Test State
  const [isTestingWebhook, setIsTestingWebhook] = useState(false)
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    setWebhookTestResult(null)
    try {
      const data = await fetchSettings()
      setSettings(data)
      setWebhookUrl(data.webhook_url || '')
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMsg(null)
    setSaveSuccess(false)

    try {
      const payload: { api_key?: string; webhook_url?: string } = {}
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim()
      }
      payload.webhook_url = webhookUrl.trim()

      const updated = await updateSettings(payload)
      setSettings(updated)
      setApiKey('')
      setSaveSuccess(true)
      onSettingsUpdated()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim()) return
    setIsTestingWebhook(true)
    setWebhookTestResult(null)
    try {
      const res = await testWebhook(webhookUrl.trim())
      setWebhookTestResult({ success: true, message: res.message || 'Ping sent successfully!' })
    } catch (err: any) {
      setWebhookTestResult({ success: false, message: err.message || 'Webhook test failed' })
    } finally {
      setIsTestingWebhook(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-[#111115] border border-[#27272f] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#202025] bg-[#0d0d10]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Settings & Notifications</h2>
              <p className="text-xs text-zinc-400">Manage OpenRouter credentials and completion alerts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {isLoading && (
            <div className="py-8 flex items-center justify-center text-teal-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {/* Current Auth Status */}
          <div className="p-3.5 rounded-xl bg-[#16161c] border border-[#22222a] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 font-medium">Authentication Status</span>
              {settings?.has_api_key ? (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Key Active
                </span>
              ) : (
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  Missing Key
                </span>
              )}
            </div>

            {settings?.api_key_masked && (
              <p className="text-xs font-mono text-zinc-300">
                Key: <span className="text-teal-300">{settings.api_key_masked}</span>
              </p>
            )}
          </div>

          {/* Configuration Form */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* API Key */}
            <div>
              <label htmlFor="api-key-input" className="block text-xs font-medium text-zinc-300 mb-1.5">
                Update OpenRouter API Key
              </label>
              <input
                id="api-key-input"
                type="password"
                placeholder={settings?.has_api_key ? "Leave blank to keep current key" : "sk-or-v1-..."}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181e] border border-[#272730] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Keys can also be supplied via the <code className="text-zinc-400">OPENROUTER_API_KEY</code> environment variable.
              </p>
            </div>

            {/* Webhook Notifications */}
            <div className="pt-2 border-t border-[#202025]">
              <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-zinc-300">
                <Bell className="w-3.5 h-3.5 text-teal-400" />
                <label htmlFor="webhook-url-input">Completion Webhook (Discord, NTFY, Gotify)</label>
              </div>
              <div className="flex gap-2">
                <input
                  id="webhook-url-input"
                  type="url"
                  placeholder="https://ntfy.sh/my-somnia-topic or Discord webhook URL"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#18181e] border border-[#272730] text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook || !webhookUrl.trim()}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {isTestingWebhook ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  <span>Test Ping</span>
                </button>
              </div>

              {webhookTestResult && (
                <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  webhookTestResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                }`}>
                  {webhookTestResult.success ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>{webhookTestResult.message}</span>
                </div>
              )}

              <p className="text-[11px] text-zinc-500 mt-1">
                Somnia sends an asynchronous notification when your batch finishes or fails.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs transition-all disabled:opacity-50 mt-4"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Settings...</span>
                </>
              ) : (
                <span>Save Settings to Database</span>
              )}
            </button>
          </form>

          {/* System & Storage Info */}
          <div className="pt-3 border-t border-[#202025] space-y-2 text-xs text-zinc-400 font-mono">
            <div className="flex items-center gap-2 text-zinc-300">
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span>Persistence & Storage</span>
            </div>
            <div className="bg-[#0e0e12] p-3 rounded-xl border border-zinc-900 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">DB File:</span>
                <span className="text-zinc-300 truncate max-w-[260px]">{settings?.db_path || 'somnia.db'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Polling Interval:</span>
                <span className="text-zinc-300">{settings?.poll_interval_minutes || 5} mins</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
