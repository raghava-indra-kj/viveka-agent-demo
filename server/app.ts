import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { resolve } from 'node:path';
import { AppError, mergeSettings, publicSettings } from '../shared/domain.ts';
import { settingsSchema, formContentSchema, newFormSchema } from '../shared/schemas.ts';
import type { AgentEvent } from '../shared/types.ts';
import { Storage } from './services/storage.ts';
import { FormLocks } from './services/locks.ts';
import { callModel, providerError } from './services/provider.ts';
import type { ModelProvider } from './services/provider.ts';
import { extractDocument, MAX_FILE_BYTES, MAX_FILES } from './services/documents.ts';
import { runAgent } from './services/agent.ts';
function asError(error: unknown): AppError {
    if (error instanceof AppError)
        return error;
    if (error instanceof multer.MulterError)
        return new AppError(error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT' ? 413 : 400, 'UPLOAD_LIMIT', 'Upload at most three files, 10 MB each.');
    if (error instanceof SyntaxError && 'body' in error)
        return new AppError(400, 'INVALID_JSON', 'Malformed JSON request.');
    if ((error as {
        status?: number;
    })?.status === 413)
        return new AppError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
    return new AppError(500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
}
function parse<T>(schema: {
    safeParse: (input: unknown) => {
        success: true;
        data: T;
    } | {
        success: false;
        error: {
            issues: {
                message: string;
            }[];
        };
    };
}, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success)
        throw new AppError(400, 'VALIDATION_ERROR', result.error.issues.map(i => i.message).slice(0, 5).join(' '));
    return result.data;
}
function isLocalOrigin(origin: string): boolean {
    try {
        const url = new URL(origin);
        return (url.protocol === 'http:' || url.protocol === 'https:') &&
            ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
    } catch {
        return false;
    }
}
export function createApp(options: {
    directory?: string;
    provider?: ModelProvider;
} = {}) {
    const storage = new Storage(options.directory ?? resolve(process.cwd(), '.data'));
    const provider = options.provider ?? callModel;
    const locks = new FormLocks();
    const app = express();
    app.disable('x-powered-by');
    // This is a local application, not a public unauthenticated API. Block cross-site browser writes.
    app.use('/api', (req, res, next) => {
        const host = req.hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
            res.status(403).json({ error: { code: 'HOST_DENIED', message: 'Only localhost hosts are allowed.' } });
            return;
        }
        const origin = req.get('origin');
        if (origin && !isLocalOrigin(origin)) {
            res.status(403).json({ error: { code: 'ORIGIN_DENIED', message: 'Only local application origins are allowed.' } });
            return;
        }
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.use(express.json({ limit: '12mb' }));
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 1, fieldSize: 32000, parts: MAX_FILES + 1 } });
    app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
    app.get('/api/settings', async (_req, res) => { res.json(publicSettings(await storage.settings())); });
    app.put('/api/settings', async (req, res) => { const input = parse(settingsSchema, req.body); res.json(publicSettings(await storage.updateSettings(old => mergeSettings(old, input)))); });
    app.post('/api/settings/test', async (_req, res) => {
        const settings = await storage.settings();
        if (!settings.apiKey)
            throw new AppError(400, 'API_KEY_REQUIRED', 'Save an API key first.');
        try {
            await provider(settings, { system: 'You are a connection test. Reply briefly.', user: 'Reply OK.' });
        }
        catch (error) {
            throw providerError(error);
        }
        res.json({ success: true, message: 'Connection successful', model: settings.model });
    });
    app.get('/api/forms', async (_req, res) => { res.json({ forms: await storage.list() }); });
    app.post('/api/forms', async (req, res) => { const input = parse(newFormSchema, req.body); res.status(201).json(await storage.create(input.title, input.type)); });
    app.get('/api/forms/:formId', async (req, res) => { const { form, messages } = await storage.get(req.params.formId); res.json({ form, messages }); });
    app.put('/api/forms/:formId', async (req, res) => {
        const release = locks.acquire(req.params.formId);
        try {
            const content = parse(formContentSchema, req.body);
            res.json((await storage.saveForm(req.params.formId, content)).form);
        }
        finally {
            release();
        }
    });
    app.delete('/api/forms/:formId', async (req, res) => { const release = locks.acquire(req.params.formId); try {
        await storage.delete(req.params.formId);
        res.status(204).end();
    }
    finally {
        release();
    } });
    app.post('/api/forms/:formId/agent', upload.array('files', MAX_FILES), async (req, res) => {
        const id = req.params.formId;
        const release = locks.acquire(id);
        const controller = new AbortController();
        const onClose = () => { if (!res.writableEnded)
            controller.abort(); };
        res.on('close', onClose);
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        const emit = (item: AgentEvent) => { if (!res.destroyed && !res.writableEnded)
            res.write(`event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`); };
        const activities: string[] = [];
        try {
            const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
            if (!message || message.length > 32000)
                throw new AppError(400, 'MESSAGE_REQUIRED', 'Enter an instruction of up to 32,000 characters.');
            const record = await storage.get(id);
            const settings = await storage.settings();
            if (!settings.apiKey)
                throw new AppError(400, 'API_KEY_REQUIRED', 'Save an API key in Settings first.');
            res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive' });
            res.flushHeaders();
            heartbeat = setInterval(() => { if (!res.destroyed)
                res.write(': heartbeat\n\n'); }, 15000);
            const files = Array.isArray(req.files) ? req.files : [];
            const refs = [];
            for (const file of files) {
                controller.signal.throwIfAborted();
                const activity = `Reading ${file.originalname.slice(0, 200)}`;
                activities.push(activity);
                emit({ event: 'activity', data: { message: activity } });
                refs.push(await extractDocument(file));
            }
            await runAgent({ storage, record, settings, instruction: message, references: refs, provider, emit, signal: controller.signal, activities });
        }
        catch (error) {
            if (!controller.signal.aborted) {
                const err = res.headersSent ? providerError(error) : asError(error);
                if (res.headersSent) {
                    emit({ event: 'error', data: { code: err.code, message: err.message } });
                }
                else {
                    res.status(err.status).json({ error: { code: err.code, message: err.message } });
                }
            }
        }
        finally {
            if (heartbeat)
                clearInterval(heartbeat);
            res.off('close', onClose);
            release();
            if (!res.writableEnded && !res.destroyed)
                res.end();
        }
    });
    app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }); });
    app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => { if (res.headersSent) {
        next(error);
        return;
    } const err = asError(error); res.status(err.status).json({ error: { code: err.code, message: err.message } }); });
    return app;
}
