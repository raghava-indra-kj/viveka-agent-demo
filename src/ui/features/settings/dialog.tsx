import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LoaderCircle, Settings2, X, Trash2, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../../infra/api/api-client';
import type { PublicSettings } from '../../../../shared/types';
import { DEFAULT_SETTINGS } from '../../../../shared/types';

export function SettingsDialog({ onClose, onSaved }: {
    onClose: () => void;
    onSaved: (settings: PublicSettings) => void;
}) {
    const [saved, setSaved] = useState<PublicSettings | null>(null);
    const [baseUrl, setBaseUrl] = useState(DEFAULT_SETTINGS.baseUrl);
    const [model, setModel] = useState(DEFAULT_SETTINGS.model);
    const [key, setKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [clearKey, setClearKey] = useState(false);
    const [busy, setBusy] = useState('loading');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let live = true;
        api<PublicSettings>('/settings')
            .then(s => {
                if (live) {
                    setSaved(s);
                    setBaseUrl(s.baseUrl);
                    setModel(s.model);
                    setBusy('');
                }
            })
            .catch(e => {
                if (live) {
                    setError(e.message);
                    setBusy('');
                }
            });
        return () => { live = false; };
    }, []);

    useEffect(() => {
        const fn = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [onClose, busy]);

    const changed = !saved || baseUrl !== saved.baseUrl || model !== saved.model || Boolean(key) || clearKey;

    async function save() {
        setError('');
        setSuccess('');
        setBusy('saving');
        try {
            const next = await api<PublicSettings>('/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    baseUrl,
                    model,
                    ...(key ? { apiKey: key } : clearKey ? { apiKey: '' } : {})
                })
            });
            setSaved(next);
            setBaseUrl(next.baseUrl);
            setModel(next.model);
            setKey('');
            setClearKey(false);
            setShowKey(false);
            onSaved(next);
            setSuccess('Settings saved securely on this local machine.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save settings.');
        } finally {
            setBusy('');
        }
    }

    async function test() {
        setError('');
        setSuccess('');
        setBusy('testing');
        try {
            const r = await api<{ message: string; model: string }>('/settings/test', { method: 'POST' });
            setSuccess(`${r.message} · Verified with model ${r.model}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Connection test failed.');
        } finally {
            setBusy('');
        }
    }

    return (
        <div
            className="modal-backdrop"
            onMouseDown={e => {
                if (e.target === e.currentTarget && !busy) onClose();
            }}
        >
            <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="settings-modal">
                <div className="modal-header">
                    <div className="modal-icon">
                        <Settings2 size={22}/>
                    </div>
                    <div>
                        <h2 id="settings-title">AI Provider & Model Settings</h2>
                        <p>Configure any OpenAI-compatible API endpoint (OpenAI, Groq, Ollama, OpenRouter).</p>
                    </div>
                    <button aria-label="Close settings" className="icon-btn close-modal" disabled={!!busy} onClick={onClose}>
                        <X size={20}/>
                    </button>
                </div>

                <div className="modal-body">
                    <div className="provider-note">
                        <ShieldCheck size={20} style={{ flex: 'none', color: 'var(--accent)' }} />
                        <div>
                            <strong>Local Privacy Guarantee</strong>
                            <p style={{ marginTop: 2 }}>API keys are stored exclusively in your local storage on this computer and never sent to any intermediate server.</p>
                        </div>
                    </div>

                    <label className="field-label" htmlFor="base-url">API Base URL</label>
                    <input
                        id="base-url"
                        type="url"
                        disabled={!!busy}
                        value={baseUrl}
                        placeholder="https://api.openai.com/v1"
                        onChange={e => setBaseUrl(e.target.value)}
                    />
                    <small className="muted">Standard OpenAI endpoint or local endpoint (e.g. http://127.0.0.1:11434/v1 for Ollama).</small>

                    {baseUrl.trim().toLowerCase().startsWith('http://') && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1') && (
                        <div className="error-banner">Warning: HTTP endpoints are unencrypted. Use HTTPS unless testing on a private local network.</div>
                    )}

                    <label className="field-label" htmlFor="model-id">Model Identifier</label>
                    <input
                        id="model-id"
                        disabled={!!busy}
                        value={model}
                        placeholder="gpt-4o, claude-3-5-sonnet, llama3..."
                        onChange={e => setModel(e.target.value)}
                    />
                    <small className="muted">Specify the exact model name supported by your provider.</small>

                    <label className="field-label" htmlFor="api-key">
                        <span>API Key</span>
                        {saved?.hasApiKey && !clearKey && (
                            <span className="configured">
                                <CheckCircle2 size={13}/> Configured & Active
                            </span>
                        )}
                    </label>
                    <div className="password-row">
                        <input
                            id="api-key"
                            autoComplete="off"
                            spellCheck={false}
                            type={showKey ? 'text' : 'password'}
                            disabled={!!busy}
                            value={key}
                            placeholder={clearKey ? 'Key will be cleared upon save' : saved?.hasApiKey ? 'Enter new key to replace saved key' : 'sk-...'}
                            onChange={e => {
                                setKey(e.target.value);
                                setClearKey(false);
                            }}
                        />
                        <button
                            className="icon-btn"
                            aria-label={showKey ? 'Hide key' : 'Show key'}
                            title={showKey ? 'Hide key' : 'Show key'}
                            type="button"
                            onClick={() => setShowKey(v => !v)}
                        >
                            {showKey ? <EyeOff size={16}/> : <Eye size={16}/>}
                        </button>
                    </div>

                    {saved?.hasApiKey && (
                        <button
                            type="button"
                            className="text-btn danger"
                            disabled={!!busy}
                            onClick={() => {
                                setClearKey(v => !v);
                                setKey('');
                            }}
                        >
                            <Trash2 size={13}/>
                            <span>{clearKey ? 'Cancel clearing key' : 'Remove saved API key'}</span>
                        </button>
                    )}

                    {error && <div role="alert" className="error-banner">{error}</div>}
                    {success && <div role="status" className="success-banner"><CheckCircle2 size={16}/><span>{success}</span></div>}
                </div>

                <div className="modal-footer">
                    <button
                        type="button"
                        className="button secondary"
                        disabled={!!busy || changed || !saved?.hasApiKey}
                        onClick={() => void test()}
                    >
                        {busy === 'testing' && <LoaderCircle className="spin" size={15}/>}
                        <Sparkles size={15}/>
                        <span>Test connection</span>
                    </button>
                    <button
                        type="button"
                        className="button primary"
                        disabled={!!busy || !changed || !baseUrl.trim() || !model.trim()}
                        onClick={() => void save()}
                    >
                        {busy === 'saving' && <LoaderCircle className="spin" size={15}/>}
                        <span>Save settings</span>
                    </button>
                </div>
            </section>
        </div>
    );
}
