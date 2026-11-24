import { ClipboardCheck, HelpCircle } from 'lucide-react';
import type { Form } from '../../../../shared/types';
import { isChoice } from '../../../../shared/domain';

export function Preview({ form }: { form: Form }) {
    return (
        <div className="preview-wrap">
            <div className="preview-banner">
                <ClipboardCheck size={18} />
                <span>Respondent interactive preview</span>
                <span>Submissions & responses are not persisted in preview mode</span>
            </div>

            <div className="preview-heading">
                <h2>{form.title || 'Untitled Assessment'}</h2>
                <p>{form.description || 'Please review and answer the following questions carefully.'}</p>
            </div>

            {form.questions.map((q, i) => (
                <section key={q.id} className="preview-question">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <h3>
                            {i + 1}. {q.title || 'Untitled question'} {q.required && <span className="required-star">*</span>}
                        </h3>
                        {form.type === 'assessment' && (
                            <span className="brand-badge" style={{ fontSize: 11, padding: '2px 8px' }}>
                                {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                            </span>
                        )}
                    </div>
                    {q.description && <p>{q.description}</p>}

                    {isChoice(q.type) ? (
                        <div className="preview-options">
                            {q.options.map(o => (
                                <label key={o.id}>
                                    <input
                                        type={q.type === 'multipleChoice' ? 'checkbox' : 'radio'}
                                        name={q.id}
                                        value={o.id}
                                    />
                                    <span>{o.text}</span>
                                </label>
                            ))}
                        </div>
                    ) : q.type === 'longAnswer' ? (
                        <textarea rows={4} placeholder="Type your detailed answer here…" />
                    ) : (
                        <input placeholder="Type your short answer here…" />
                    )}
                </section>
            ))}

            {!form.questions.length && (
                <div className="empty-state">
                    <HelpCircle size={32} />
                    <h3>No questions added to this form yet</h3>
                    <p>Switch back to Edit mode or ask the AI copilot to generate questions.</p>
                </div>
            )}

            <p className="muted preview-note">
                Viveka Assessment Studio · Respondent Experience Preview
            </p>
        </div>
    );
}
