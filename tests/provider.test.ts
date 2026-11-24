import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { callModel } from '../server/services/provider.ts';
/** Exercise the real SDK against a local OpenAI-compatible test endpoint. */
test('SDK uses the configured base URL, model and authorization without fallback', async () => {
    const requests: {
        url: string;
        key: string | undefined;
        body: Record<string, unknown>;
    }[] = [];
    let fail = false;
    const server = createServer(async (req, res) => { let body = ''; for await (const chunk of req)
        body += String(chunk); requests.push({ url: req.url ?? '', key: req.headers.authorization, body: JSON.parse(body) }); res.setHeader('Content-Type', 'application/json'); if (fail) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: 'Test unauthorized' } }));
        return;
    } res.end(JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion', created: 1, model: 'custom-sol', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })); });
    server.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
        const settings = { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/custom/v1`, model: 'custom-sol', apiKey: 'unit-test-key' };
        assert.equal(await callModel(settings, { system: 'Test', user: 'Hello' }), 'OK');
        assert.equal(requests[0].url, '/custom/v1/chat/completions');
        assert.equal(requests[0].key, 'Bearer unit-test-key');
        assert.equal(requests[0].body.model, 'custom-sol');
        fail = true;
        await assert.rejects(() => callModel(settings, { system: 'Test', user: 'Hello' }), /rejected the API key/);
    }
    finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
