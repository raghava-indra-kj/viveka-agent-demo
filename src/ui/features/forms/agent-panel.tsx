import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Check, ChevronDown, FileText, LoaderCircle, PanelRightClose, Paperclip, Sparkles, Square, X, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, PublicSettings } from '../../../../shared/types';

const examples = [
    'Create a 10-question assessment from my document',
    'Add five scenario-based multiple choice questions',
    'Review this form for clarity, grammar, and difficulty balance'
];

const extensions = /\.(txt|md|pdf|docx|csv|json)$/i;

function Activities({ items, running = false }: {
    items: string[];
    running?: boolean;
}) {
    return items.length ? (
        <details className="activities" open={running ? true : undefined}>
            <summary>
                {running ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>}
                <span>{running ? items[items.length - 1] : `Completed ${items.length} steps`}</span>
                <ChevronDown size={14}/>
            </summary>
            <div>
                {items.map((item, index) => (
                    <p key={`${index}-${item}`}>
                        <span>{running && index === items.length - 1 ? <LoaderCircle className="spin" size={12}/> : <Check size={12}/>}</span>
                        <span>{item}</span>
                    </p>
                ))}
            </div>
        </details>
    ) : null;
}

interface Props {
    formId: string;
    messages: ChatMessage[];
    activities: string[];
    busy: boolean;
    settings: PublicSettings | undefined;
    error: string;
    onSend: (message: string, files: File[]) => Promise<boolean>;
    onStop: () => void;
    onClose: () => void;
    onSettings: () => void;
}

export function AgentPanel({ formId, messages, activities, busy, settings, error, onSend, onStop, onClose, onSettings }: Props) {
    const [prompt, setPrompt] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [fileError, setFileError] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const scroll = useRef<HTMLDivElement>(null);
    const text = useRef<HTMLTextAreaElement>(null);
    const draft = useRef({ message: '', files: [] as File[] });

    useEffect(() => {
        setPrompt('');
        setFiles([]);
        setFileError('');
    }, [formId]);

    useEffect(() => {
        const el = scroll.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, activities, busy, error]);

    function addFiles(list: FileList | null) {
        if (!list) return;
        setFileError('');
        const next = [...files];
        for (const file of Array.from(list)) {
            if (next.length >= 3) {
                setFileError('Attach at most three files per message.');
                break;
            }
            if (!extensions.test(file.name)) {
                setFileError(`Unsupported format: ${file.name}`);
                continue;
            }
            if (file.size > 10 * 1024 * 1024) {
                setFileError(`${file.name} exceeds 10 MB limit.`);
                continue;
            }
            if (!next.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
                next.push(file);
            }
        }
        setFiles(next);
        if (input.current) input.current.value = '';
    }

    async function send() {
        if (!prompt.trim() || busy) return;
        const current = { message: prompt.trim(), files: [...files] };
        draft.current = current;
        setPrompt('');
        setFiles([]);
        setFileError('');
        const ok = await onSend(current.message, current.files);
        if (!ok) {
            setPrompt(p => p || draft.current.message);
            setFiles(f => f.length ? f : draft.current.files);
        }
    }

    return (
        <section className="agent-panel">
            <header className="agent-header">
                <div className="agent-avatar">
                    <Sparkles size={18}/>
                </div>
                <div className="agent-heading">
                    <strong>Viveka Copilot</strong>
                    <span>
                        <span className={`status-dot ${settings?.hasApiKey ? 'online' : ''}`}/>
                        {settings?.hasApiKey ? (settings.model || 'Connected') : 'API key required'}
                    </span>
                </div>
                <button className="icon-btn" title="Collapse copilot" aria-label="Collapse copilot" onClick={onClose}>
                    <PanelRightClose size={18}/>
                </button>
            </header>

            <div className="agent-scroll" ref={scroll}>
                {!settings?.hasApiKey && (
                    <div className="connect-note">
                        <strong>Connect your AI model</strong>
                        <span>Add an OpenAI, Anthropic, or local model API key to generate assessments.</span>
                        <button className="text-btn" onClick={onSettings}>Configure in Settings →</button>
                    </div>
                )}

                {!messages.length && !busy && (
                    <div className="agent-empty">
                        <div className="hero-sparkle">
                            <Sparkles size={28}/>
                        </div>
                        <h3>Build with Viveka AI</h3>
                        <p>Describe your assessment or attach documents (PDF, DOCX, text). The agent reads the context and dynamically constructs your questions.</p>
                        <div className="suggestions">
                            {examples.map(example => (
                                <button key={example} onClick={() => { setPrompt(example); text.current?.focus(); }}>
                                    <Sparkles size={14}/>
                                    <span>{example}</span>
                                    <span>↗</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map(message => (
                    <div key={message.id} className={`chat-message ${message.role}`}>
                        <div className="message-label">
                            {message.role === 'assistant' ? (
                                <><Bot size={14}/> Viveka Copilot</>
                            ) : (
                                <><User size={13}/> You</>
                            )}
                        </div>
                        {message.attachments?.map(file => (
                            <div className="chat-attachment" key={file.id}>
                                <FileText size={15}/>
                                <span>{file.name}</span>
                            </div>
                        ))}
                        {message.role === 'assistant' ? (
                            <>
                                <Activities items={message.activities ?? []}/>
                                <div className="markdown">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener"/>,
                                            img: ({ alt }) => <span>{alt ?? 'Image'}</span>
                                        }}
                                    >
                                        {message.content}
                                    </ReactMarkdown>
                                </div>
                            </>
                        ) : (
                            <div className="user-message-text">{message.content}</div>
                        )}
                    </div>
                ))}

                {busy && (
                    <div className="chat-message assistant">
                        <div className="message-label">
                            <Bot size={14}/> Viveka Copilot
                        </div>
                        {activities.length ? (
                            <Activities items={activities} running/>
                        ) : (
                            <div className="working">
                                <LoaderCircle size={15} className="spin"/>
                                <span>Generating assessment items…</span>
                            </div>
                        )}
                    </div>
                )}

                {error && <div className="error-banner" role="alert">{error}</div>}
            </div>

            <div className="composer-area">
                {fileError && <div className="error-banner">{fileError}</div>}
                <div className="composer">
                    <div className="attached-list">
                        {files.map((file, i) => (
                            <span className="file-chip" key={`${file.name}-${i}`}>
                                <FileText size={13}/>
                                <span title={file.name}>{file.name}</span>
                                <button className="icon-btn" aria-label={`Remove ${file.name}`} onClick={() => setFiles(f => f.filter((_, j) => j !== i))}>
                                    <X size={12}/>
                                </button>
                            </span>
                        ))}
                    </div>
                    <textarea
                        ref={text}
                        aria-label="Message Viveka Copilot"
                        rows={2}
                        value={prompt}
                        maxLength={32000}
                        disabled={busy}
                        placeholder="Ask AI to generate questions, upload a syllabus, or edit questions…"
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                void send();
                            }
                        }}
                    />
                    <div className="composer-actions">
                        <input
                            ref={input}
                            type="file"
                            accept=".txt,.md,.pdf,.docx,.csv,.json"
                            multiple
                            hidden
                            onChange={e => addFiles(e.target.files)}
                        />
                        <button
                            className="icon-btn attach"
                            disabled={busy}
                            title="Attach document (.pdf, .docx, .txt)"
                            aria-label="Attach document"
                            onClick={() => input.current?.click()}
                        >
                            <Paperclip size={17}/>
                        </button>
                        <span className="composer-hint">PDF, DOCX, TXT</span>
                        {busy ? (
                            <button className="send-btn stop" aria-label="Stop generation" title="Stop generation" onClick={onStop}>
                                <Square size={14}/>
                            </button>
                        ) : (
                            <button
                                className="send-btn"
                                aria-label="Send message"
                                title="Send message (Enter)"
                                disabled={!prompt.trim() || !settings?.hasApiKey}
                                onClick={() => void send()}
                            >
                                <ArrowUp size={18}/>
                            </button>
                        )}
                    </div>
                </div>
                <p className="ai-disclaimer">Review AI-generated questions before deploying to learners.</p>
            </div>
        </section>
    );
}
