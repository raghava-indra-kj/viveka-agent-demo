import { createApp } from './app.ts';
const app = createApp();
const server = app.listen(3001, '127.0.0.1', () => console.log('Assessment Studio API: http://127.0.0.1:3001'));
server.on('error', (error) => { console.error('Could not start API:', error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); });
