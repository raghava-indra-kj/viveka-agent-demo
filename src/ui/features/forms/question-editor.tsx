import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X, Check } from 'lucide-react';
import type { Question, QuestionType } from '../../../../shared/types';
import { QUESTION_LABELS } from '../../../../shared/types';
import { isChoice, newQuestion } from '../../../../shared/domain';

const uid = () => crypto.randomUUID();

interface Props {
    question: Question;
    index: number;
    count: number;
    assessment: boolean;
    disabled: boolean;
    onChange: (q: Question) => void;
    onMove: (delta: number) => void;
    onDelete: () => void;
}

export function QuestionEditor({ question: q, index, count, assessment, disabled, onChange, onMove, onDelete }: Props) {
    const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
    const checked = (id: string) => Array.isArray(q.correctAnswer) ? q.correctAnswer.includes(id) : q.correctAnswer === id;

    function toggleAnswer(id: string) {
        if (q.type === 'multipleChoice') {
            const old = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
            const next = old.includes(id) ? old.filter(a => a !== id) : [...old, id];
            set({ correctAnswer: next.length ? next : null });
        } else {
            set({ correctAnswer: q.correctAnswer === id ? null : id });
        }
    }

    function removeOption(id: string) {
        let answer = q.correctAnswer;
        if (Array.isArray(answer)) {
            const next = answer.filter(a => a !== id);
            answer = next.length ? next : null;
        } else if (answer === id) {
            answer = null;
        }
        set({ options: q.options.filter(o => o.id !== id), correctAnswer: answer });
    }

    function changeType(type: QuestionType) {
        const next = newQuestion(type, uid, assessment);
        onChange({ ...q, type, options: next.options, correctAnswer: null });
    }

    return (
        <fieldset disabled={disabled} className="question-card">
            <div className="question-top">
                <span className="question-index">
                    <GripVertical size={13} />
                    <span>QUESTION {String(index + 1).padStart(2, '0')}</span>
                </span>
                <div className="question-actions">
                    <button
                        className="icon-btn"
                        title="Move question up"
                        aria-label={`Move question ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => onMove(-1)}
                    >
                        <ArrowUp size={14} />
                    </button>
                    <button
                        className="icon-btn"
                        title="Move question down"
                        aria-label={`Move question ${index + 1} down`}
                        disabled={index === count - 1}
                        onClick={() => onMove(1)}
                    >
                        <ArrowDown size={14} />
                    </button>
                    <button
                        className="icon-btn danger"
                        title="Delete question"
                        aria-label={`Delete question ${index + 1}`}
                        onClick={onDelete}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="question-title-row">
                <textarea
                    aria-label={`Question ${index + 1} title`}
                    className="question-title"
                    rows={1}
                    placeholder="Enter question text…"
                    value={q.title}
                    onChange={e => set({ title: e.target.value })}
                />
                <select
                    aria-label={`Question ${index + 1} type`}
                    value={q.type}
                    onChange={e => changeType(e.target.value as QuestionType)}
                >
                    {Object.entries(QUESTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
            </div>

            <input
                className="question-description"
                aria-label={`Question ${index + 1} description`}
                placeholder="Add supporting instructions, context, or hint (optional)"
                value={q.description ?? ''}
                onChange={e => set({ description: e.target.value })}
            />

            {isChoice(q.type) ? (
                <div className="option-list">
                    {q.options.map((o, i) => (
                        <div className="option-row" key={o.id}>
                            <button
                                type="button"
                                disabled={!assessment}
                                className={`answer-indicator ${q.type === 'multipleChoice' ? 'square' : ''} ${checked(o.id) ? 'selected' : ''}`}
                                aria-label={`Mark option ${i + 1} as correct answer`}
                                aria-pressed={checked(o.id)}
                                title={assessment ? (checked(o.id) ? 'Correct answer (click to unset)' : 'Click to mark as correct answer') : 'Respondent option'}
                                onClick={() => toggleAnswer(o.id)}
                            >
                                {checked(o.id) && <Check size={11} strokeWidth={3} />}
                            </button>
                            <input
                                aria-label={`Option ${i + 1}`}
                                value={o.text}
                                placeholder={`Option ${i + 1}`}
                                readOnly={q.type === 'trueFalse'}
                                onChange={e => set({ options: q.options.map(v => v.id === o.id ? { ...v, text: e.target.value } : v) })}
                            />
                            {q.type !== 'trueFalse' && (
                                <button
                                    className="icon-btn"
                                    title="Remove option"
                                    aria-label={`Remove option ${i + 1}`}
                                    disabled={q.options.length <= 2}
                                    onClick={() => removeOption(o.id)}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                    {q.type !== 'trueFalse' && (
                        <button
                            className="text-btn"
                            disabled={q.options.length >= 30}
                            onClick={() => set({ options: [...q.options, { id: uid(), text: `Option ${q.options.length + 1}` }] })}
                        >
                            <Plus size={13} /> Add option
                        </button>
                    )}
                </div>
            ) : (
                <div className="text-question">
                    {assessment ? (
                        <>
                            <label className="field-label">Expected response / rubric (optional)</label>
                            <textarea
                                rows={q.type === 'longAnswer' ? 2 : 1}
                                value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                                placeholder="Expected response keywords, scoring rubric, or answer key…"
                                onChange={e => set({ correctAnswer: e.target.value || null })}
                            />
                        </>
                    ) : (
                        <div className="answer-placeholder">
                            {q.type === 'longAnswer' ? 'Respondent will write a long multi-line response.' : 'Respondent will provide a short single-line response.'}
                        </div>
                    )}
                </div>
            )}

            <div className="question-bottom">
                <label className="toggle-label">
                    <input
                        type="checkbox"
                        checked={q.required}
                        onChange={e => set({ required: e.target.checked })}
                    />
                    <span>Required</span>
                </label>
                {assessment && (
                    <label className="marks-label">
                        <span>Score:</span>
                        <input
                            type="number"
                            min={0}
                            max={10000}
                            step="0.5"
                            aria-label={`Question ${index + 1} marks`}
                            value={q.marks}
                            onChange={e => set({ marks: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })}
                        />
                        <span>{q.marks === 1 ? 'mark' : 'marks'}</span>
                    </label>
                )}
            </div>
        </fieldset>
    );
}
