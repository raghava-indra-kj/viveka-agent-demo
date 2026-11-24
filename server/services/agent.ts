import { randomUUID } from 'node:crypto';
import type { AgentEvent, ChatMessage, Reference, FormRecord, AISettings } from '../../shared/types.ts';
import { agentResultSchema } from '../../shared/schemas.ts';
import { AppError, changesBetween, parseModelJson } from '../../shared/domain.ts';
import type { Storage } from './storage.ts';
import type { ModelProvider } from './provider.ts';
import { ASSESSMENT_SYSTEM_PROMPT } from '../prompts/assessment-agent.ts';
import { buildAgentContext } from './agent-core.ts';
export async function runAgent(options: {
    storage: Storage;
    record: FormRecord;
    settings: AISettings;
    instruction: string;
    references: Reference[];
    provider: ModelProvider;
    emit: (event: AgentEvent) => void;
    signal: AbortSignal;
    activities: string[];
}): Promise<void> {
    const { storage, record, settings, instruction, references, provider, emit, signal, activities } = options;
    const step = (message: string) => { activities.push(message); emit({ event: 'activity', data: { message } }); };
    signal.throwIfAborted();
    step('Preparing form context');
    const context = buildAgentContext(record, instruction, references);
    if (context.referencesTruncated)
        step('Reference context limited; some text was omitted');
    const userMessage: ChatMessage = { id: randomUUID(), role: 'user', content: instruction, attachments: references.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })), createdAt: new Date().toISOString() };
    step('Requesting AI generation');
    const raw = await provider(settings, { system: ASSESSMENT_SYSTEM_PROMPT, user: JSON.stringify(context), signal });
    signal.throwIfAborted();
    step('Validating model response');
    const parsed = agentResultSchema.safeParse(parseModelJson(raw));
    if (!parsed.success)
        throw new AppError(502, 'INVALID_MODEL_RESPONSE', 'The generated form failed validation. Try a smaller or more specific request.');
    const result = parsed.data;
    const summary = result.updatedForm ? changesBetween(record.form, result.updatedForm) : [];
    const hasChanges = Boolean(result.updatedForm && summary.length);
    if (hasChanges)
        step('Updating form');
    step('Saving conversation and changes');
    const assistant: ChatMessage = { id: randomUUID(), role: 'assistant', content: result.message + (summary.length ? '\n\n**Saved changes**\n' + summary.map(s => `- ${s}`).join('\n') : result.action === 'updateForm' ? '\n\nNo form changes were detected.' : ''), activities: [...activities], createdAt: new Date().toISOString() };
    signal.throwIfAborted();
    const saved = await storage.update(record.form.id, current => {
        signal.throwIfAborted();
        if (JSON.stringify(current.form) !== JSON.stringify(record.form))
            throw new AppError(409, 'FORM_CHANGED', 'The form changed during generation. Please retry.');
        return { form: hasChanges && result.updatedForm ? { ...current.form, ...result.updatedForm, updatedAt: new Date().toISOString() } : current.form, messages: [...current.messages, userMessage, assistant], references: [...current.references, ...references] };
    });
    if (hasChanges)
        emit({ event: 'formUpdated', data: { form: saved.form } });
    emit({ event: 'message', data: { message: assistant } });
    emit({ event: 'done', data: { success: true } });
}
