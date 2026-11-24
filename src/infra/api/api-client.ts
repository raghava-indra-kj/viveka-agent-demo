import type { AgentEvent } from '../../../shared/types';
export class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status; }
}
async function ensureOk(response: Response) { if (response.ok)
    return; const json = await response.json().catch(() => null); throw new ApiError(json?.error?.message ?? `Request failed (${response.status})`, json?.error?.code ?? 'HTTP_ERROR', response.status); }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/api${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    await ensureOk(response);
    return response.status === 204 ? undefined as T : await response.json() as T;
}
export async function agentStream(formId: string, message: string, files: File[], onEvent: (event: AgentEvent) => void, signal: AbortSignal) {
    const body = new FormData();
    body.append('message', message);
    for (const file of files)
        body.append('files', file);
    const response = await fetch(`/api/forms/${encodeURIComponent(formId)}/agent`, { method: 'POST', body, signal });
    await ensureOk(response);
    if (!response.body)
        throw new Error('No response stream received.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    const processBlock = (block: string) => { const lines = block.split(/\r?\n/); const type = lines.find(l => l.startsWith('event:'))?.slice(6).trim(); const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n'); if (!type || !data)
        return; const event = { event: type, data: JSON.parse(data) } as AgentEvent; onEvent(event); if (event.event === 'error')
        throw new ApiError(event.data.message, event.data.code, 502); if (event.event === 'done')
        done = true; };
    try {
        while (true) {
            const chunk = await reader.read();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? '';
            for (const block of blocks)
                processBlock(block);
            if (chunk.done)
                break;
        }
        if (buffer.trim())
            processBlock(buffer);
        if (!done)
            throw new Error('The stream ended unexpectedly. Reload the form to check its saved state.');
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
