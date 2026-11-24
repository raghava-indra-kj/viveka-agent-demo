import type { AISettings, FormContent, Form, FormSummary, PublicSettings, Question, QuestionType } from './types.ts';
export class AppError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export const isChoice = (type: QuestionType) => ['singleChoice', 'multipleChoice', 'trueFalse'].includes(type);
export function summarize(form: Form): FormSummary {
    return { id: form.id, title: form.title, type: form.type, questionCount: form.questions.length,
        totalMarks: form.type === 'assessment' ? form.questions.reduce((n, q) => n + q.marks, 0) : 0, updatedAt: form.updatedAt };
}
/** Domain constraints shared by the UI, Zod validation and offline tests. */
export function formIssues(form: FormContent): string[] {
    const issues: string[] = [];
    const ids = new Set<string>();
    for (const q of form.questions) {
        if (ids.has(q.id))
            issues.push('Duplicate question ID.');
        ids.add(q.id);
        if (!Number.isFinite(q.marks) || q.marks < 0)
            issues.push('Marks must be nonnegative.');
        if (form.type === 'form' && (q.marks !== 0 || q.correctAnswer !== null))
            issues.push('Surveys cannot have marks or correct answers.');
        const optionIds = new Set(q.options.map(o => o.id));
        if (optionIds.size !== q.options.length)
            issues.push('Duplicate option ID.');
        if (isChoice(q.type)) {
            if (q.options.length < 2)
                issues.push('Choice questions require at least two options.');
            if (q.type === 'trueFalse' && (q.options.length !== 2 || q.options[0]?.text !== 'True' || q.options[1]?.text !== 'False'))
                issues.push('True/False options must be True and False.');
            if (q.correctAnswer !== null) {
                const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
                if (q.type === 'multipleChoice' ? !Array.isArray(q.correctAnswer) : Array.isArray(q.correctAnswer))
                    issues.push('Incorrect answer type.');
                if (!answers.length || new Set(answers).size !== answers.length || answers.some(a => !optionIds.has(a)))
                    issues.push('Correct answer must reference existing options.');
            }
        }
        else if (q.options.length || Array.isArray(q.correctAnswer))
            issues.push('Text questions cannot have choice options or array answers.');
    }
    return issues;
}
export function publicSettings(settings: AISettings): PublicSettings {
    return { baseUrl: settings.baseUrl, model: settings.model, hasApiKey: Boolean(settings.apiKey) };
}
export function normalizeBaseUrl(input: string): string {
    let url: URL;
    try {
        url = new URL(input.trim());
    }
    catch {
        throw new AppError(400, 'INVALID_URL', 'Enter a valid HTTP or HTTPS base URL.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new AppError(400, 'INVALID_URL', 'Use an HTTP(S) base URL without credentials, query or fragment.');
    if (/\/chat\/completions\/?$/.test(url.pathname))
        throw new AppError(400, 'INVALID_URL', 'Enter the API base URL, not the chat/completions endpoint.');
    return url.toString().replace(/\/+$/, '');
}
export function mergeSettings(old: AISettings, input: {
    baseUrl: string;
    model: string;
    apiKey?: string;
}): AISettings {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const model = input.model.trim();
    if (!model)
        throw new AppError(400, 'MODEL_REQUIRED', 'Enter a model ID.');
    if (new URL(old.baseUrl).origin !== new URL(baseUrl).origin && old.apiKey && input.apiKey === undefined)
        throw new AppError(400, 'KEY_REENTRY_REQUIRED', 'Re-enter a key for the new provider, or clear the existing key.');
    return { baseUrl, model, apiKey: input.apiKey === undefined ? old.apiKey : input.apiKey.trim() };
}
export function newQuestion(type: QuestionType, id: () => string, assessment: boolean): Question {
    return { id: id(), type, title: 'Untitled question', required: true, options: isChoice(type) ? (type === 'trueFalse' ? ['True', 'False'] : ['Option 1', 'Option 2']).map(text => ({ id: id(), text })) : [], correctAnswer: null, marks: assessment ? 1 : 0 };
}
/** Derive factual mutation summaries rather than trusting model claims. */
export function changesBetween(before: FormContent, after: FormContent): string[] {
    const old = new Map(before.questions.map(q => [q.id, q]));
    const next = new Map(after.questions.map(q => [q.id, q]));
    const added = after.questions.filter(q => !old.has(q.id)).length;
    const removed = before.questions.filter(q => !next.has(q.id)).length;
    const changed = after.questions.filter(q => old.has(q.id) && JSON.stringify(old.get(q.id)) !== JSON.stringify(q)).length;
    const reordered = before.questions.filter(q => next.has(q.id)).map(q => q.id).join(',') !== after.questions.filter(q => old.has(q.id)).map(q => q.id).join(',');
    const summary: string[] = [];
    if (added)
        summary.push(`${added} question${added === 1 ? '' : 's'} added`);
    if (removed)
        summary.push(`${removed} question${removed === 1 ? '' : 's'} removed`);
    if (changed)
        summary.push(`${changed} question${changed === 1 ? '' : 's'} updated`);
    if (reordered)
        summary.push('Question order updated');
    if (before.title !== after.title || before.description !== after.description || before.type !== after.type)
        summary.push('Form details updated');
    return summary;
}
export function parseModelJson(text: string): unknown {
    const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    try {
        return JSON.parse(cleaned);
    }
    catch {
        throw new AppError(502, 'INVALID_MODEL_RESPONSE', 'The model did not return valid JSON. Try a smaller request.');
    }
}
