import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, ClipboardList, Clock3, Eye, FileQuestion, FileText, LayoutGrid, LoaderCircle, PanelLeft, Plus, Search, Settings, Sparkles, Trash2, X } from 'lucide-react';
import logoUrl from '@/assets/logo.png';
import type { ChatMessage, Form, FormContent, FormSummary, FormType, PublicSettings, Question } from '../../../../shared/types';
import { newQuestion, summarize } from '../../../../shared/domain';
import { api, agentStream } from '../../../infra/api/api-client';
import { QuestionEditor } from './question-editor';
import { Preview } from './preview';
import { AgentPanel } from './agent-panel';
import { SettingsDialog } from '../settings/dialog';
const uid = () => crypto.randomUUID();
const timeLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
const editable = ({ title, description, type, questions }: Form): FormContent => ({ title, description, type, questions });
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';
function TypeIcon({ type, size = 19 }: {
    type: FormType;
    size?: number;
}) { return type === 'assessment' ? <ClipboardList size={size}/> : <FileText size={size}/>; }
export default function FormsPage() {
    const { formId } = useParams();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const list = useQuery({ queryKey: ['forms'], queryFn: () => api<{
            forms: FormSummary[];
        }>('/forms') });
    const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<PublicSettings>('/settings') });
    const [search, setSearch] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 900);
    const [rightOpen, setRightOpen] = useState(true);
    const [agentWidth, setAgentWidth] = useState(390);
    const [creating, setCreating] = useState(false);
    const [globalError, setGlobalError] = useState('');
    const [form, setForm] = useState<Form | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
    const [formError, setFormError] = useState('');
    const [agentError, setAgentError] = useState('');
    const [busy, setBusy] = useState(false);
    const [activities, setActivities] = useState<string[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<FormSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const formRef = useRef<Form | null>(null);
    const persisted = useRef('');
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controller = useRef<AbortController | null>(null);
    const selectedId = useRef(formId);
    selectedId.current = formId;
    const busyRef = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); if (timer.current)
        clearTimeout(timer.current); }; }, []);
    const setCurrent = useCallback((value: Form | null) => { formRef.current = value; setForm(value); }, []);
    const refreshList = () => void qc.invalidateQueries({ queryKey: ['forms'] });
    const load = useCallback(async (id: string, signal?: AbortSignal) => { const data = await api<{
        form: Form;
        messages: ChatMessage[];
    }>(`/forms/${encodeURIComponent(id)}`, { signal }); if (selectedId.current !== id || signal?.aborted)
        return; persisted.current = JSON.stringify(editable(data.form)); setCurrent(data.form); setMessages(data.messages); setSaveStatus('saved'); }, [setCurrent]);
    useEffect(() => { if (!formId) {
        setCurrent(null);
        setLoading(false);
        return;
    } const ac = new AbortController(); setCurrent(null); setMessages([]); setLoading(true); setPreview(false); setRightOpen(true); setAgentError(''); setActivities([]); setFormError(''); setSaveStatus('saved'); void load(formId, ac.signal).catch(e => { if (!ac.signal.aborted)
        setFormError(errorText(e)); }).finally(() => { if (!ac.signal.aborted)
        setLoading(false); }); return () => ac.abort(); }, [formId, load, setCurrent]);
    const flushSave = useCallback(async () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const work = saveQueue.current.catch(() => { }).then(async () => { const current = formRef.current; if (!current)
            return; const content = editable(current); const snapshot = JSON.stringify(content); if (snapshot === persisted.current)
            return; setSaveStatus('saving'); try {
            const saved = await api<Form>(`/forms/${current.id}`, { method: 'PUT', body: snapshot });
            if (formRef.current?.id === current.id) {
                persisted.current = JSON.stringify(editable(saved));
                if (JSON.stringify(editable(formRef.current)) === snapshot) {
                    setCurrent(saved);
                    setSaveStatus('saved');
                }
                else
                    setSaveStatus('unsaved');
                setFormError('');
            }
            void qc.invalidateQueries({ queryKey: ['forms'] });
        }
        catch (e) {
            setSaveStatus('error');
            setFormError(errorText(e));
            throw e;
        } });
        saveQueue.current = work;
        await work;
    }, [qc, setCurrent]);
    function edit(content: Partial<FormContent>) { const current = formRef.current; if (!current || busyRef.current)
        return; setCurrent({ ...current, ...content }); setSaveStatus('unsaved'); if (timer.current)
        clearTimeout(timer.current); timer.current = setTimeout(() => { void flushSave().catch(() => { }); }, 650); }
    useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (busyRef.current || (formRef.current && JSON.stringify(editable(formRef.current)) !== persisted.current)) {
        e.preventDefault();
        e.returnValue = '';
    } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, []);
    async function go(id?: string) { if (busyRef.current || id === formId)
        return; try {
        await flushSave();
        setGlobalError('');
        navigate(id ? `/forms/${id}` : '/');
    }
    catch (e) {
        setGlobalError(`Save your changes before switching forms: ${errorText(e)}`);
    } }
    async function create(type: FormType = 'assessment') { if (creating || busyRef.current)
        return; setCreating(true); setGlobalError(''); try {
        await flushSave();
        const next = await api<Form>('/forms', { method: 'POST', body: JSON.stringify({ title: type === 'assessment' ? 'Untitled assessment' : 'Untitled form', type }) });
        refreshList();
        navigate(`/forms/${next.id}`);
    }
    catch (e) {
        setGlobalError(errorText(e));
    }
    finally {
        setCreating(false);
    } }
    async function remove() { if (!deleteTarget)
        return; setDeleting(true); setGlobalError(''); try {
        await flushSave();
        await api(`/forms/${deleteTarget.id}`, { method: 'DELETE' });
        if (formId === deleteTarget.id)
            navigate('/');
        setDeleteTarget(null);
        refreshList();
    }
    catch (e) {
        setGlobalError(errorText(e));
    }
    finally {
        setDeleting(false);
    } }
    async function send(message: string, files: File[]): Promise<boolean> {
        const current = formRef.current;
        if (!current || busyRef.current)
            return false;
        busyRef.current = true;
        setBusy(true);
        setAgentError('');
        setActivities([]);
        let userAdded = false;
        const ac = new AbortController();
        controller.current = ac;
        try {
            await flushSave();
            ac.signal.throwIfAborted();
            const temporary: ChatMessage = { id: uid(), role: 'user', content: message, attachments: files.map(f => ({ id: uid(), name: f.name, mimeType: f.type, size: f.size })), createdAt: new Date().toISOString() };
            setMessages(m => [...m, temporary]);
            userAdded = true;
            await agentStream(current.id, message, files, event => { if (selectedId.current !== current.id)
                return; if (event.event === 'activity')
                setActivities(a => [...a, event.data.message]); if (event.event === 'formUpdated') {
                persisted.current = JSON.stringify(editable(event.data.form));
                setCurrent(event.data.form);
                setSaveStatus('saved');
                refreshList();
            } if (event.event === 'message')
                setMessages(m => [...m, event.data.message]); }, ac.signal);
            await load(current.id);
            return true;
        }
        catch (e) {
            if (selectedId.current === current.id) {
                setAgentError(ac.signal.aborted ? 'Generation stopped. Any completed save is shown in the editor.' : errorText(e));
                if (userAdded)
                    await load(current.id).catch(() => { });
            }
            return false;
        }
        finally {
            controller.current = null;
            busyRef.current = false;
            if (mounted.current) {
                setBusy(false);
                setActivities([]);
            }
        }
    }
    function changeQuestion(q: Question) { edit({ questions: formRef.current!.questions.map(x => x.id === q.id ? q : x) }); }
    function move(index: number, delta: number) { const questions = [...formRef.current!.questions]; const target = index + delta; if (target < 0 || target >= questions.length)
        return; [questions[index], questions[target]] = [questions[target], questions[index]]; edit({ questions }); }
    function changeFormType(type: FormType) { if (!formRef.current)
        return; edit({ type, questions: type === 'form' ? formRef.current.questions.map(q => ({ ...q, marks: 0, correctAnswer: null })) : formRef.current.questions }); }
    function resize(e: React.PointerEvent<HTMLDivElement>) { e.preventDefault(); const startX = e.clientX, startWidth = agentWidth; const el = e.currentTarget; el.setPointerCapture(e.pointerId); const move = (event: PointerEvent) => setAgentWidth(Math.max(320, Math.min(650, Math.min(window.innerWidth * 0.65, startWidth + startX - event.clientX)))); const end = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); }; el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); }
    const all = list.data?.forms ?? [];
    const filtered = all.filter(f => f.title.toLowerCase().includes(search.toLowerCase()));
    const counts = all.reduce((a, f) => ({ forms: a.forms + (f.type === 'form' ? 1 : 0), assessments: a.assessments + (f.type === 'assessment' ? 1 : 0) }), { forms: 0, assessments: 0 });
    return <div className="app-shell">
        <header className="app-header">
            <button className="icon-btn nav-toggle" aria-label="Toggle navigation" onClick={() => setLeftOpen(v => !v)}>
                <PanelLeft size={19}/>
            </button>
            <button className="brand" onClick={() => void go()} disabled={busy} title="Viveka Assessment Studio">
                <img src={logoUrl} alt="Viveka" className="brand-logo-img"/>
                <span className="brand-badge">STUDIO</span>
            </button>
            <div className="header-divider"/>
            <div className="header-breadcrumbs">
                <span className="crumb-workspace">Workspace</span>
                {form && (
                    <>
                        <span className="crumb-separator">/</span>
                        <span className="crumb-current">{form.title || 'Untitled assessment'}</span>
                    </>
                )}
            </div>
            <div className="header-right">
                <span className="local-label" title="Running locally on 127.0.0.1">
                    <span className="status-dot online"/>
                    <span>Local</span>
                </span>
                <button className="button secondary settings-button" title="AI provider settings" onClick={() => setSettingsOpen(true)}>
                    <Settings size={15}/>
                    <span>Settings</span>
                </button>
            </div>
        </header>

        <div className={`workspace ${formId ? 'editing' : ''} ${leftOpen ? 'left-open' : ''} ${formId && rightOpen ? 'right-open' : ''}`} style={{ '--agent-width': `${agentWidth}px` } as React.CSSProperties}>
            {leftOpen && <>
                <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setLeftOpen(false)}/>
                <aside className="left-sidebar">
                    <div className="sidebar-inner">
                        <div className="section-label">NAVIGATION</div>
                        <button className={`nav-item ${!formId ? 'active' : ''}`} disabled={busy} onClick={() => void go()}>
                            <LayoutGrid size={15}/>
                            <span>All forms</span>
                            <span className="nav-badge">{all.length}</span>
                        </button>
                        <button className="button primary new-form-sidebar" disabled={creating || busy} onClick={() => void create()}>
                            <Plus size={15}/>
                            <span>New assessment</span>
                        </button>
                        <div className="sidebar-section">
                            <div className="section-label">YOUR FORMS</div>
                            <div className="search-field compact">
                                <Search size={14}/>
                                <input aria-label="Search forms" placeholder="Search forms" value={search} onChange={e => setSearch(e.target.value)}/>
                                {search && <button className="icon-btn" aria-label="Clear search" onClick={() => setSearch('')}><X size={12}/></button>}
                            </div>
                            <div className="sidebar-list">
                                {filtered.map(f => (
                                    <button title={f.title} key={f.id} disabled={busy} className={`nav-form ${f.id === formId ? 'selected' : ''}`} onClick={() => { void go(f.id); if (window.innerWidth < 900) setLeftOpen(false); }}>
                                        <TypeIcon type={f.type} size={15}/>
                                        <span>{f.title}</span>
                                    </button>
                                ))}
                                {!filtered.length && <p className="sidebar-empty">{search ? 'No matching forms' : 'Your forms will appear here.'}</p>}
                            </div>
                        </div>
                    </div>
                    <div className="sidebar-bottom">
                        <div className="sidebar-avatar">
                            <img src={logoUrl} alt="Viveka" className="avatar-logo-img"/>
                        </div>
                        <div className="sidebar-user-info">
                            <strong>Personal workspace</strong>
                            <small><span className="status-dot online"/> Connected</small>
                        </div>
                    </div>
                </aside>
            </>}

            <main className="main-panel">
                {globalError && (
                    <div className="global-error error-banner" role="alert">
                        {globalError}
                        <button className="icon-btn" aria-label="Dismiss error" onClick={() => setGlobalError('')}><X size={15}/></button>
                    </div>
                )}
                {!formId ? (
                    <div className="dashboard">
                        <div className="dashboard-kicker">
                            <span className="eyebrow-icon"><Sparkles size={14}/></span>
                            <span>WORKSPACE OVERVIEW</span>
                        </div>
                        <div className="dashboard-heading">
                            <div>
                                <h1>Forms & Assessments</h1>
                                <p>Create, organize and build intelligent assessments with AI.</p>
                            </div>
                            <button className="button primary" disabled={creating} onClick={() => void create()}>
                                {creating ? <LoaderCircle className="spin" size={17}/> : <Plus size={18}/>}
                                <span>Create assessment</span>
                            </button>
                        </div>

                        <div className="overview-strip">
                            <div>
                                <span>Total forms</span>
                                <strong>{all.length}</strong>
                            </div>
                            <div>
                                <span>Assessments</span>
                                <strong>{counts.assessments}</strong>
                            </div>
                            <div>
                                <span>Surveys</span>
                                <strong>{counts.forms}</strong>
                            </div>
                            <div className="overview-ai">
                                <Sparkles size={18}/>
                                <span>AI Assistant</span>
                                <strong>{settings.data?.hasApiKey ? 'Ready' : 'Configure key'}</strong>
                            </div>
                        </div>

                        <div className="list-heading">
                            <h2>All forms <span>{all.length}</span></h2>
                            <div className="list-actions">
                                <div className="search-field">
                                    <Search size={15}/>
                                    <input aria-label="Filter all forms" placeholder="Search your forms…" value={search} onChange={e => setSearch(e.target.value)}/>
                                </div>
                                <button className="button secondary" disabled={creating} onClick={() => void create('form')}>
                                    <Plus size={15}/>
                                    <span>New survey</span>
                                </button>
                            </div>
                        </div>

                        {list.isPending ? (
                            <div className="center-status"><LoaderCircle className="spin" size={24}/> Loading forms…</div>
                        ) : list.isError ? (
                            <div className="error-banner">{errorText(list.error)} <button className="text-btn" onClick={() => void list.refetch()}>Retry</button></div>
                        ) : filtered.length ? (
                            <div className="form-table">
                                <div className="table-header">
                                    <span>Name</span>
                                    <span>Questions</span>
                                    <span>Modified</span>
                                    <span/>
                                </div>
                                {filtered.map(f => (
                                    <div className="table-row" key={f.id}>
                                        <button className="form-name" onClick={() => void go(f.id)}>
                                            <span className={`type-icon ${f.type}`}><TypeIcon type={f.type}/></span>
                                            <span>
                                                <strong>{f.title}</strong>
                                                <small>{f.type === 'assessment' ? 'Assessment' : 'Survey'}{f.type === 'assessment' ? ` · ${f.totalMarks} marks` : ''}</small>
                                            </span>
                                        </button>
                                        <span className="table-count">{f.questionCount} {f.questionCount === 1 ? 'question' : 'questions'}</span>
                                        <span className="table-date">{timeLabel(f.updatedAt)}</span>
                                        <div className="table-actions">
                                            <button className="icon-btn danger" aria-label={`Delete ${f.title}`} title={`Delete ${f.title}`} onClick={() => setDeleteTarget(f)}>
                                                <Trash2 size={16}/>
                                            </button>
                                            <button className="icon-btn" aria-label={`Open ${f.title}`} title={`Open ${f.title}`} onClick={() => void go(f.id)}>
                                                <ArrowUpRight size={17}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon"><ClipboardList size={30}/></div>
                                <h3>{search ? 'No matching forms' : 'Create your first assessment'}</h3>
                                <p>{search ? 'Try a different search keyword.' : 'Start from scratch or use the AI copilot to turn reference materials into structured questions.'}</p>
                                {!search && (
                                    <button className="button primary" disabled={creating} onClick={() => void create()}>
                                        <Plus size={17}/> Create assessment
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : loading ? (
                    <div className="center-status"><LoaderCircle className="spin" size={24}/> Loading workspace…</div>
                ) : !form ? (
                    <div className="center-status">
                        <FileQuestion size={28}/>
                        <p>{formError || 'Form not found.'}</p>
                        <button className="button secondary" onClick={() => void go()}><ArrowLeft size={16}/> Back to forms</button>
                    </div>
                ) : (
                    <>
                        <div className="editor-toolbar">
                            <button className="icon-btn" aria-label="Back to forms" title="Back to forms" disabled={busy} onClick={() => void go()}>
                                <ArrowLeft size={16}/>
                            </button>
                            <div className="editor-toolbar-title">
                                <span className={`save-state ${saveStatus === 'error' ? 'danger' : ''}`}>
                                    {saveStatus === 'saved' ? <CheckCircle2 size={12}/> : saveStatus === 'saving' ? <LoaderCircle size={12} className="spin"/> : <Clock3 size={12}/>}
                                    {saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved changes'}
                                </span>
                            </div>
                            <div className="editor-tools">
                                <button className={`button secondary ${preview ? 'pressed' : ''}`} onClick={() => setPreview(v => !v)}>
                                    <Eye size={14}/>
                                    <span>{preview ? 'Edit' : 'Preview'}</span>
                                </button>
                                {!rightOpen && (
                                    <button className="button primary" onClick={() => setRightOpen(true)}>
                                        <Sparkles size={14}/>
                                        <span>AI Copilot</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="editor-scroll">
                            {formError && (
                                <div className="error-banner" role="alert">
                                    {formError}
                                    <button className="text-btn" disabled={busy} onClick={() => void flushSave().catch(() => {})}>Retry save</button>
                                </div>
                            )}
                            {preview ? (
                                <Preview form={form}/>
                            ) : (
                                <div className="editor-content">
                                    <div className="editor-meta">
                                        <span className="editor-type">
                                            <TypeIcon type={form.type} size={13}/>
                                            <span>{form.type === 'assessment' ? 'ASSESSMENT' : 'SURVEY'}</span>
                                        </span>
                                        <select aria-label="Form type" value={form.type} disabled={busy} onChange={e => changeFormType(e.target.value as FormType)}>
                                            <option value="assessment">Assessment (with marks & grading)</option>
                                            <option value="form">Survey (ungraded questionnaire)</option>
                                        </select>
                                    </div>
                                    <fieldset disabled={busy} className="form-title-block">
                                        <input aria-label="Form title" className="form-title-input" placeholder="Untitled assessment" value={form.title} onChange={e => edit({ title: e.target.value })}/>
                                        <textarea aria-label="Form description" rows={1} placeholder="Add a description or instructions for respondents…" value={form.description} onChange={e => edit({ description: e.target.value })}/>
                                    </fieldset>
                                    <div className="question-section-heading">
                                        <div>
                                            <h2>Questions</h2>
                                            <span>{form.questions.length} questions{form.type === 'assessment' ? ` · ${summarize(form).totalMarks} total marks` : ''}</span>
                                        </div>
                                        <button className="button secondary" disabled={busy || form.questions.length >= 200} onClick={() => edit({ questions: [...form.questions, newQuestion('singleChoice', uid, form.type === 'assessment')] })}>
                                            <Plus size={15}/> Add question
                                        </button>
                                    </div>
                                    {!form.questions.length ? (
                                        <div className="empty-state editor-empty">
                                            <span className="empty-icon"><FileQuestion size={28}/></span>
                                            <h3>No questions yet</h3>
                                            <p>Add a question manually or ask the AI copilot to build an assessment from your instructions.</p>
                                            <button className="button secondary" disabled={busy} onClick={() => setRightOpen(true)}>
                                                <Sparkles size={16}/> Create with AI
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="question-list">
                                            {form.questions.map((q, i) => (
                                                <QuestionEditor key={q.id} question={q} index={i} count={form.questions.length} assessment={form.type === 'assessment'} disabled={busy} onChange={changeQuestion} onMove={d => move(i, d)} onDelete={() => edit({ questions: form.questions.filter(x => x.id !== q.id) })}/>
                                            ))}
                                        </div>
                                    )}
                                    {form.questions.length > 0 && (
                                        <button className="add-question-bottom" disabled={busy || form.questions.length >= 200} onClick={() => edit({ questions: [...form.questions, newQuestion('singleChoice', uid, form.type === 'assessment')] })}>
                                            <Plus size={18}/> Add question
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>

            {formId && rightOpen && (
                <>
                    <div className="resize-handle" onPointerDown={resize} role="separator" aria-orientation="vertical" aria-label="Resize AI agent" tabIndex={0} onKeyDown={e => {
                        if (e.key === 'ArrowLeft') setAgentWidth(v => Math.min(650, v + 20));
                        if (e.key === 'ArrowRight') setAgentWidth(v => Math.max(320, v - 20));
                    }}/>
                    <aside className="right-sidebar">
                        {form ? (
                            <AgentPanel key={form.id} formId={form.id} messages={messages} activities={activities} busy={busy} settings={settings.data} error={agentError} onSend={send} onStop={() => controller.current?.abort()} onClose={() => setRightOpen(false)} onSettings={() => setSettingsOpen(true)}/>
                        ) : (
                            <div className="center-status"><Sparkles size={24}/> Select a form to use the agent.</div>
                        )}
                    </aside>
                </>
            )}
        </div>

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={s => qc.setQueryData(['settings'], s)}/>}
        {deleteTarget && (
            <div className="modal-backdrop">
                <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
                    <h2 id="delete-title">Delete form?</h2>
                    <p>“{deleteTarget.title}” and its conversation and reference documents will be permanently removed from this computer.</p>
                    <div className="confirm-actions">
                        <button className="button secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button>
                        <button className="button destructive" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete form'}</button>
                    </div>
                </section>
            </div>
        )}
    </div>;
}
