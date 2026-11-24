import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { newQuestion } from '../shared/domain.ts';
import { randomUUID } from 'node:crypto';
import type { Form, FormContent } from '../shared/types.ts';
import type { ModelProvider } from '../server/services/provider.ts';
/** Test double only: production always calls the configured OpenAI-compatible SDK. */
test('HTTP integration: settings, CRUD, upload, real protocol, validation and non-destructive failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'assessment-api-'));
    let invalid = false;
    let context: Record<string, unknown> = {};
    let lastModel = '';
    let requests = 0;
    const provider: ModelProvider = async (settings, request) => { lastModel = settings.model; requests++; if (request.user === 'Reply OK.')
        return 'OK'; context = JSON.parse(request.user); if (invalid)
        return '{"notValid":true}'; const content = context.currentForm as FormContent; const q = newQuestion('singleChoice', randomUUID, true); q.title = 'What is the reference topic?'; q.options[0].text = 'TypeScript'; q.correctAnswer = q.options[0].id; return JSON.stringify({ message: 'Created one question.', action: 'updateForm', updatedForm: { ...content, questions: [...content.questions, q] }, summary: [] }); };
    const app = createApp({ directory, provider });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const request = (path: string, method = 'GET', body?: unknown) => fetch(base + path, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    try {
        assert.deepEqual(await (await request('/health')).json(), { status: 'ok' });
        const defaults = await (await request('/settings')).json();
        assert.equal(defaults.hasApiKey, false);
        assert.equal(defaults.model, 'gpt-6.2-sol');
        const configured = await (await request('/settings', 'PUT', { baseUrl: 'https://example.com/v1', model: 'custom-model', apiKey: 'test-key' })).json();
        assert.equal(configured.hasApiKey, true);
        assert.equal('apiKey' in configured, false);
        assert.equal((await request('/settings', 'PUT', { baseUrl: 'https://other.example/v1', model: 'custom-model' })).status, 400);
        assert.equal((await request('/settings/test', 'POST')).status, 200);
        assert.equal(lastModel, 'custom-model');
        const created = await request('/forms', 'POST', { title: 'Assessment', type: 'assessment' });
        assert.equal(created.status, 201);
        const f: Form = await created.json();
        const path = `/forms/${f.id}`;
        const updated = await request(path, 'PUT', { title: 'Edited', description: 'Instructions', type: 'assessment', questions: [] });
        assert.equal(updated.status, 200);
        const body = new FormData();
        body.append('message', 'Generate one question');
        body.append('files', new Blob(['TypeScript is a typed language.'], { type: 'text/plain' }), 'notes.txt');
        const stream = await fetch(base + path + '/agent', { method: 'POST', body });
        assert.equal(stream.status, 200);
        const events = await stream.text();
        assert.match(events, /event: activity/);
        assert.match(events, /event: formUpdated/);
        assert.match(events, /event: message/);
        assert.match(events, /event: done/);
        assert.equal((context.documents as {
            text: string;
        }[])[0].text, 'TypeScript is a typed language.');
        const after = await (await request(path)).json();
        assert.equal(after.form.questions.length, 1);
        assert.equal(after.messages.length, 2);
        assert.equal('references' in after, false);
        assert.equal(after.messages[0].attachments[0].name, 'notes.txt');
        invalid = true;
        const fail = new FormData();
        fail.append('message', 'Create another');
        const failure = await (await fetch(base + path + '/agent', { method: 'POST', body: fail })).text();
        assert.match(failure, /event: error/);
        assert.doesNotMatch(failure, /event: done/);
        const unchanged = await (await request(path)).json();
        assert.deepEqual(unchanged, after);
        assert.ok(requests >= 3);
        assert.equal((await request(path, 'PUT', { ...after.form, questions: [{ ...after.form.questions[0], correctAnswer: 'missing' }] })).status, 400);
        const all = await (await request('/forms')).json();
        assert.equal(all.forms[0].questionCount, 1);
        assert.equal((await request(path, 'DELETE')).status, 204);
        assert.equal((await request(path)).status, 404);
    }
    finally {
        await new Promise<void>(r => server.close(() => r()));
        await rm(directory, { recursive: true, force: true });
    }
});
