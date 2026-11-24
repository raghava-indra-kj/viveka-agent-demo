import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Storage } from '../server/services/storage.ts';
import { FormLocks } from '../server/services/locks.ts';
import { buildAgentContext } from '../server/services/agent-core.ts';
import { formIssues, newQuestion, mergeSettings, publicSettings, changesBetween, parseModelJson } from '../shared/domain.ts';
import { DEFAULT_SETTINGS } from '../shared/types.ts';
import type { FormContent, Reference } from '../shared/types.ts';
test('settings are normalized, keys never exposed and origin changes need a new key', () => {
    const settings = mergeSettings(DEFAULT_SETTINGS, { baseUrl: 'https://api.openai.com/v1/', model: 'custom-model', apiKey: 'test-secret' });
    assert.equal(settings.baseUrl, 'https://api.openai.com/v1');
    assert.equal(settings.model, 'custom-model');
    assert.equal(publicSettings(settings).hasApiKey, true);
    assert.equal('apiKey' in publicSettings(settings), false);
    assert.throws(() => mergeSettings(settings, { baseUrl: 'https://example.org/v1', model: 'other' }), /Re-enter/);
    assert.equal(mergeSettings(settings, { baseUrl: 'http://127.0.0.1:8080/v1', model: 'other', apiKey: 'new' }).apiKey, 'new');
    assert.equal(mergeSettings(settings, { baseUrl: settings.baseUrl, model: 'other', apiKey: '' }).apiKey, '');
    assert.equal(mergeSettings(settings, { baseUrl: 'http://remote.example/v1', model: 'other', apiKey: 'new' }).baseUrl, 'http://remote.example/v1');
    assert.throws(() => mergeSettings(settings, { baseUrl: 'file:///tmp/secrets', model: 'other', apiKey: 'new' }), /HTTP/);
});
test('question validation checks answer references, option counts, IDs and marks', () => {
    const q = newQuestion('singleChoice', randomUUID, true);
    const f: FormContent = { title: 'Test', description: '', type: 'assessment', questions: [{ ...q, correctAnswer: q.options[0].id }] };
    assert.deepEqual(formIssues(f), []);
    assert.ok(formIssues({ ...f, questions: [{ ...q, correctAnswer: 'unknown' }] }).length);
    assert.ok(formIssues({ ...f, questions: [{ ...q, marks: -1 }] }).length);
    assert.ok(formIssues({ ...f, questions: [q, q] }).length);
    assert.ok(formIssues({ ...f, type: 'form' }).length);
    assert.ok(formIssues({ ...f, questions: [{ ...q, type: 'multipleChoice', correctAnswer: q.options[0].id }] }).length);
    assert.ok(formIssues({ ...f, questions: [{ ...q, options: [q.options[0]] }] }).length);
});
test('mutation summary reflects actual edits and reordering', () => {
    const a = newQuestion('shortAnswer', randomUUID, true), b = newQuestion('longAnswer', randomUUID, true);
    const f: FormContent = { title: 'A', description: '', type: 'assessment', questions: [a, b] };
    assert.deepEqual(changesBetween(f, { ...f, questions: [{ ...b, marks: 2 }, a] }), ['1 question updated', 'Question order updated']);
    assert.deepEqual(changesBetween(f, { ...f, questions: [a] }), ['1 question removed']);
    assert.deepEqual(changesBetween(f, f), []);
});
test('model JSON parsing accepts JSON and fenced JSON, rejects malformed text', () => {
    assert.deepEqual(parseModelJson('{"action":"none"}'), { action: 'none' });
    assert.deepEqual(parseModelJson('```json\n{"ok":true}\n```'), { ok: true });
    assert.throws(() => parseModelJson('not json'), /valid JSON/);
});
test('storage persists settings, form content and conversation atomically across restarts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'assessment-test-'));
    try {
        const db = new Storage(dir);
        const form = await db.create('Example', 'assessment');
        const question = newQuestion('trueFalse', randomUUID, true);
        await db.saveForm(form.id, { title: 'Changed', description: '', type: 'assessment', questions: [question] });
        await db.update(form.id, r => ({ ...r, messages: [{ id: 'm1', role: 'user', content: 'Create test', createdAt: new Date().toISOString() }], references: [{ id: 'a1', name: 'notes.txt', mimeType: 'text/plain', size: 5, text: 'notes' }] }));
        await db.updateSettings(old => ({ ...old, apiKey: 'not-real' }));
        const next = new Storage(dir);
        const record = await next.get(form.id);
        assert.equal(record.form.title, 'Changed');
        assert.deepEqual(record.form.questions, [question]);
        assert.equal(record.messages[0].content, 'Create test');
        assert.equal(record.references[0].text, 'notes');
        assert.equal((await next.settings()).apiKey, 'not-real');
        assert.equal((await next.list())[0].questionCount, 1);
        await next.delete(form.id);
        assert.deepEqual(await next.list(), []);
        await assert.rejects(() => next.get(form.id), /not found/i);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('concurrent writes preserve unrelated records and corrupt data is not overwritten', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'assessment-test-'));
    try {
        const db = new Storage(dir);
        await Promise.all(Array.from({ length: 12 }, (_, i) => db.create(`Form ${i}`, 'form')));
        assert.equal((await db.list()).length, 12);
        await writeFile(join(dir, 'forms.json'), 'broken JSON');
        await assert.rejects(() => db.create('Never overwrite', 'form'), /not been overwritten/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('per-form lock rejects overlapping operations without blocking another form', () => { const locks = new FormLocks(); const release = locks.acquire('one'); assert.throws(() => locks.acquire('one'), /active operation/); locks.acquire('two')(); release(); locks.acquire('one')(); });
test('context keeps actual uploaded text, bounded history and current form', async () => { const dir = await mkdtemp(join(tmpdir(), 'assessment-test-')); try {
    const db = new Storage(dir);
    const f = await db.create('Original', 'assessment');
    const ref: Reference = { id: '1', name: 'notes.txt', mimeType: 'text/plain', size: 120000, text: 'A'.repeat(120000) };
    const ctx = buildAgentContext(await db.get(f.id), 'Create questions', [ref]);
    assert.equal(ctx.currentForm.title, 'Original');
    assert.equal(ctx.instruction, 'Create questions');
    assert.equal(ctx.documents[0].text.length, 30000);
    assert.equal(ctx.referencesTruncated, true);
}
finally {
    await rm(dir, { recursive: true, force: true });
} });
test('plain text and JSON extraction uses uploaded bytes, rejects invalid and empty files', async () => {
    const { extractDocument } = await import('../server/services/documents.ts');
    const buffer = Buffer.from('Assessment source text.');
    const doc = await extractDocument({ originalname: 'notes.txt', mimetype: 'text/plain', size: buffer.length, buffer });
    assert.equal(doc.text, 'Assessment source text.');
    assert.equal(doc.name, 'notes.txt');
    await assert.rejects(() => extractDocument({ originalname: 'notes.json', mimetype: 'application/json', size: buffer.length, buffer }), /Could not extract/);
    await assert.rejects(() => extractDocument({ originalname: 'empty.md', mimetype: 'text/markdown', size: 0, buffer: Buffer.alloc(0) }), /no extractable text/);
    await assert.rejects(() => extractDocument({ originalname: 'image.png', mimetype: 'image/png', size: buffer.length, buffer }), /Unsupported/);
});
test('frontend streaming parser handles split events and reports failures', async () => {
    const { agentStream } = await import('../src/infra/api/api-client.ts');
    const originalFetch = globalThis.fetch;
    const events: string[] = [];
    const encoder = new TextEncoder();
    try {
        globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('event: acti')); controller.enqueue(encoder.encode('vity\ndata: {"message":"Working"}\n\n: heartbeat\n\nevent: done\ndata: {"success":true}\n\n')); controller.close(); } }), { status: 200 });
        await agentStream('test', 'Generate', [], e => events.push(e.event), new AbortController().signal);
        assert.deepEqual(events, ['activity', 'done']);
        globalThis.fetch = async () => new Response('event: error\ndata: {"code":"MODEL_ERROR","message":"Generation failed"}\n\n', { status: 200 });
        await assert.rejects(() => agentStream('test', 'Generate', [], () => { }, new AbortController().signal), /Generation failed/);
    }
    finally {
        globalThis.fetch = originalFetch;
    }
});
