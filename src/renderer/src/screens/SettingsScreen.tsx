import { useEffect, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { PAPER_SIZES, cloudConfigured } from '@shared/types'
import type { CloudSettings, CloudStatus } from '@shared/types'
import { IconChevronLeft } from '../components/Icon'

export default function SettingsScreen(): JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const printers = useAppStore((s) => s.printers)
  const setPrinters = useAppStore((s) => s.setPrinters)
  const setScreen = useAppStore((s) => s.setScreen)

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [saved, setSaved] = useState(false)
  const [cloudTest, setCloudTest] = useState<{ kind: 'busy' | 'ok' | 'error'; text: string } | null>(null)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null)

  useEffect(() => {
    window.api.getCloudStatus().then(setCloudStatus)
  }, [])

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setCameras(devices.filter((d) => d.kind === 'videoinput')))
      .catch(() => setCameras([]))
    window.api.listPrinters().then(setPrinters)
  }, [setPrinters])

  async function persist(next = settings): Promise<void> {
    await window.api.setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  // The save location takes effect right away — it's saved on its own rather
  // than waiting for the Save Settings button, so a session can't be missed.
  async function saveExportFolder(folder: string | null): Promise<void> {
    const next = { ...settings, exportFolder: folder }
    setSettings(next)
    await persist(next)
  }

  async function chooseExportFolder(): Promise<void> {
    const folder = await window.api.pickExportFolder()
    if (folder) await saveExportFolder(folder)
  }

  function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void {
    const next = { ...settings, [key]: value }
    setSettings(next)
  }

  function updateCloud(patch: Partial<CloudSettings>): void {
    setCloudTest(null)
    update('cloud', { ...settings.cloud, ...patch })
  }

  async function testCloud(): Promise<void> {
    setCloudTest({ kind: 'busy', text: 'Testing…' })
    const result = await window.api.testCloud(settings.cloud)
    if (!result.ok) setCloudTest({ kind: 'error', text: result.error ?? 'Could not connect.' })
    else if (result.warning) setCloudTest({ kind: 'error', text: result.warning })
    else setCloudTest({ kind: 'ok', text: 'Connected — uploads and auto-delete timing both work.' })
  }

  async function retryUploads(): Promise<void> {
    await window.api.retryCloudUploads()
    setCloudStatus(await window.api.getCloudStatus())
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn icon-btn back-btn" onClick={() => setScreen('home')}>
          <IconChevronLeft size={18} />
        </button>
        <h2>Photobooth Setup</h2>
        <div style={{ width: 36 }} />
      </div>
      <div className="content">
        <div className="settings-grid">
          <div className="panel-section">
            <h3>Business</h3>
            <div className="field">
              <label>Business Name</label>
              <input
                placeholder="Photobooth Name"
                value={settings.businessName}
                onChange={(e) => update('businessName', e.target.value)}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Shown on the Home screen.
            </p>
          </div>

          <div className="panel-section">
            <h3>Camera &amp; Booth Defaults</h3>
            <div className="field">
              <label>Camera</label>
              <select
                value={settings.cameraDeviceId ?? ''}
                onChange={(e) => update('cameraDeviceId', e.target.value || null)}
              >
                <option value="">System Default</option>
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || 'Camera'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default countdown seconds (for new events)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.countdownSeconds}
                onChange={(e) => update('countdownSeconds', Number(e.target.value))}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Print copies default to 2 for photo strips and 1 for every other format, set automatically
              per event based on the chosen layout.
            </p>
          </div>

          <div className="panel-section">
            <h3>Printing (DNP DS620A / DS-RX1HS)</h3>
            <div className="field">
              <label>Printer</label>
              <select
                value={settings.selectedPrinterName ?? ''}
                onChange={(e) => update('selectedPrinterName', e.target.value || null)}
              >
                <option value="">Select a printer...</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName} {p.isDefault ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Default paper size (for new layouts)</label>
              <select value={settings.paperSizeId} onChange={(e) => update('paperSizeId', e.target.value)}>
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Install the official DNP driver for your printer first, then it will appear in this list as
              a normal system printer.
            </p>
          </div>

          <div className="panel-section">
            <h3>Sharing</h3>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={settings.shareServerEnabled}
                  onChange={(e) => update('shareServerEnabled', e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Enable local QR sharing (same wifi network)
              </label>
            </div>
            <div className="field">
              <label>Share server port</label>
              <input
                type="number"
                value={settings.shareServerPort}
                onChange={(e) => update('shareServerPort', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="panel-section">
            <h3>Online Sharing (Cloudflare R2)</h3>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={settings.cloud.enabled}
                  onChange={(e) => updateCloud({ enabled: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Upload photos &amp; GIFs so QR codes keep working after the event
              </label>
            </div>
            <div className="field">
              <label>Account ID</label>
              <input
                value={settings.cloud.accountId}
                placeholder="From your Cloudflare dashboard"
                onChange={(e) => updateCloud({ accountId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Bucket name</label>
              <input value={settings.cloud.bucket} onChange={(e) => updateCloud({ bucket: e.target.value })} />
            </div>
            <div className="field">
              <label>Public address</label>
              <input
                value={settings.cloud.publicUrl}
                placeholder="https://pub-xxxxxxxx.r2.dev"
                onChange={(e) => updateCloud({ publicUrl: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Access Key ID</label>
              <input
                value={settings.cloud.accessKeyId}
                autoComplete="off"
                onChange={(e) => updateCloud({ accessKeyId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Secret Access Key</label>
              <input
                type="password"
                value={settings.cloud.secretAccessKey}
                autoComplete="off"
                onChange={(e) => updateCloud({ secretAccessKey: e.target.value })}
              />
            </div>
            <div className="row">
              <button className="btn secondary" onClick={testCloud} disabled={cloudTest?.kind === 'busy'}>
                Test Connection
              </button>
              {cloudStatus && cloudStatus.pending > 0 && (
                <button className="btn ghost" onClick={retryUploads}>
                  Retry {cloudStatus.pending} waiting
                </button>
              )}
            </div>
            {cloudTest && (
              <p className={`status-msg ${cloudTest.kind === 'ok' ? 'success' : cloudTest.kind === 'error' ? 'error' : ''}`}>
                {cloudTest.text}
              </p>
            )}
            {cloudStatus?.lastError && cloudStatus.pending > 0 && (
              <p className="status-msg error">Last upload problem: {cloudStatus.lastError}</p>
            )}
            {cloudStatus?.warning && <p className="status-msg error">{cloudStatus.warning}</p>}
            {settings.cloud.enabled && !cloudConfigured(settings.cloud) && (
              <p className="status-msg error">Fill in every field to turn this on.</p>
            )}
            <details className="cloud-steps">
              <summary>How to set this up</summary>
              <ol>
                <li>Create a free Cloudflare account and open <b>R2 Object Storage</b> in the dashboard.</li>
                <li>Create a bucket. Open its Settings and turn on the <b>Public Development URL</b> (r2.dev) — copy it into <b>Public address</b>. Later you can connect your own domain and paste that instead.</li>
                <li>Copy your <b>Account ID</b> from the R2 overview page.</li>
                <li>
                  Under <b>Manage API tokens</b>, create a token with <b>Admin Read &amp; Write</b> permission (needed so the
                  app can set each event’s “keep online for” time) and paste its Access Key ID and Secret Access Key
                  here.
                </li>
                <li>Press <b>Test Connection</b>, then <b>Save Settings</b>.</li>
              </ol>
              <p>
                The keys are saved on this computer in the app’s settings file. Anyone with the link to an event’s
                album can see every photo in it.
              </p>
            </details>
          </div>

          <div className="panel-section">
            <h3>Save Location</h3>
            <div className="field">
              <label>Save photos &amp; GIFs to</label>
              <div className="save-location-path" title={settings.exportFolder ?? undefined}>
                {settings.exportFolder ?? 'Not set — files stay inside the app only'}
              </div>
            </div>
            <div className="row">
              <button className="btn secondary" onClick={chooseExportFolder}>
                {settings.exportFolder ? 'Change Folder' : 'Choose Folder'}
              </button>
              {settings.exportFolder && (
                <>
                  <button className="btn secondary" onClick={() => window.api.openFolder(settings.exportFolder!)}>
                    Open
                  </button>
                  <button className="btn ghost" onClick={() => saveExportFolder(null)}>
                    Clear
                  </button>
                </>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-ink-faint)' }}>
              Each event gets its own folder named after it, with a <b>Photos</b> folder (finished prints), an{' '}
              <b>Individual Photos</b> folder (each shot) and a <b>GIFs</b> folder inside — for example{' '}
              <i>Smith Wedding / Photos</i>. Copies are added as each session finishes.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn primary" onClick={() => persist()}>
            Save Settings
          </button>
          {saved && <span className="status-msg success">Saved!</span>}
        </div>
      </div>
    </div>
  )
}
