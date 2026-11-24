import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '../../shared/types.ts';
import type { AISettings, Form, FormContent, FormRecord, FormSummary, FormType } from '../../shared/types.ts';
import { AppError, summarize } from '../../shared/domain.ts';
interface Database {
    records: Record<string, FormRecord>;
}
/** One atomic data file keeps form, messages and extracted text in the same transaction. */
export class Storage {
    private queue: Promise<unknown> = Promise.resolve();
    readonly directory: string;
    constructor(directory: string) { this.directory = directory; }
    private async read<T>(file: string, initial: T): Promise<T> {
        try {
            return JSON.parse(await readFile(join(this.directory, file), 'utf8')) as T;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                return initial;
            throw new AppError(500, 'STORAGE_ERROR', `Cannot read ${file}. Existing data has not been overwritten.`);
        }
    }
    private async write(file: string, data: unknown): Promise<void> {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const target = join(this.directory, file);
        const temp = `${target}.${randomUUID()}.tmp`;
        try {
            await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
            await rename(temp, target);
        }
        catch {
            await unlink(temp).catch(() => { });
            throw new AppError(500, 'STORAGE_ERROR', 'Could not save local data.');
        }
    }
    private serial<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.queue.then(fn, fn);
        this.queue = run.catch(() => { });
        return run;
    }
    private async database(): Promise<Database> {
        const db = await this.read<Database>('forms.json', { records: {} });
        if (!db || typeof db.records !== 'object' || !db.records || Array.isArray(db.records))
            throw new AppError(500, 'STORAGE_ERROR', 'Invalid forms.json. Existing data has not been overwritten.');
        return db;
    }
    async settings(): Promise<AISettings> { const settings = await this.read('settings.json', DEFAULT_SETTINGS); if (!settings || typeof settings.apiKey !== 'string' || typeof settings.baseUrl !== 'string' || typeof settings.model !== 'string')
        throw new AppError(500, 'STORAGE_ERROR', 'Invalid settings.json.'); return settings; }
    updateSettings(fn: (old: AISettings) => AISettings): Promise<AISettings> { return this.serial(async () => { const next = fn(await this.settings()); await this.write('settings.json', next); return next; }); }
    async list(): Promise<FormSummary[]> { return Object.values((await this.database()).records).map(r => summarize(r.form)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
    async get(id: string): Promise<FormRecord> { const db = await this.database(); const r = db.records[id]; if (!Object.hasOwn(db.records, id) || !r || !r.form)
        throw new AppError(404, 'FORM_NOT_FOUND', 'Form not found.'); return r; }
    create(title: string, type: FormType): Promise<Form> { return this.serial(async () => { const db = await this.database(); const now = new Date().toISOString(); const form: Form = { id: randomUUID(), title, type, description: '', questions: [], createdAt: now, updatedAt: now }; db.records[form.id] = { form, messages: [], references: [] }; await this.write('forms.json', db); return form; }); }
    update(id: string, fn: (record: FormRecord) => FormRecord): Promise<FormRecord> { return this.serial(async () => { const db = await this.database(); if (!Object.hasOwn(db.records, id))
        throw new AppError(404, 'FORM_NOT_FOUND', 'Form not found.'); const next = fn(db.records[id]); db.records[id] = next; await this.write('forms.json', db); return next; }); }
    saveForm(id: string, content: FormContent): Promise<FormRecord> { return this.update(id, r => ({ ...r, form: { ...r.form, ...content, updatedAt: new Date().toISOString() } })); }
    delete(id: string): Promise<void> { return this.serial(async () => { const db = await this.database(); if (!Object.hasOwn(db.records, id))
        throw new AppError(404, 'FORM_NOT_FOUND', 'Form not found.'); delete db.records[id]; await this.write('forms.json', db); }); }
}
