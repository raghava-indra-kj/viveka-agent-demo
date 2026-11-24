import type { FormRecord, Reference } from '../../shared/types.ts';
const MAX_REFERENCE_CHARS = 75000;
const MAX_HISTORY_CHARS = 30000;
export function buildAgentContext(record: FormRecord, instruction: string, newReferences: Reference[]) {
    let remaining = MAX_REFERENCE_CHARS;
    const refs = [...newReferences, ...record.references.slice().reverse()];
    const documents: {
        name: string;
        text: string;
        truncated: boolean;
    }[] = [];
    for (const ref of refs) {
        if (remaining <= 0)
            break;
        const text = ref.text.slice(0, Math.min(remaining, 30000));
        remaining -= text.length;
        documents.push({ name: ref.name, text, truncated: text.length < ref.text.length });
    }
    let budget = MAX_HISTORY_CHARS;
    const history: {
        role: string;
        content: string;
    }[] = [];
    for (const msg of record.messages.slice(-30).reverse()) {
        if (budget <= 0)
            break;
        const content = msg.content.slice(0, Math.min(6000, budget));
        budget -= content.length;
        history.unshift({ role: msg.role, content });
    }
    const { title, description, type, questions } = record.form;
    return { instruction, currentForm: { title, description, type, questions }, history, documents,
        referencesTruncated: documents.length < refs.length || documents.some(d => d.truncated) };
}
