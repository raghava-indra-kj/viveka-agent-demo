import OpenAI from 'openai';
import type { AISettings } from '../../shared/types.ts';
import { AppError } from '../../shared/domain.ts';
export type ModelRequest = {
    system: string;
    user: string;
    signal?: AbortSignal;
};
export type ModelProvider = (settings: AISettings, request: ModelRequest) => Promise<string>;
export function providerError(error: unknown): AppError {
    if (error instanceof AppError)
        return error;
    const status = (error as {
        status?: number;
    })?.status;
    if (status === 401 || status === 403)
        return new AppError(400, 'INVALID_CREDENTIALS', 'Provider rejected the API key or access to this model.');
    if (status === 404)
        return new AppError(400, 'MODEL_NOT_AVAILABLE', 'The model or API endpoint was not found. Check the base URL and exact model ID.');
    if (status === 429)
        return new AppError(429, 'RATE_LIMITED', 'Provider rate limit or quota reached. Try again later.');
    if (status === 400 || status === 422)
        return new AppError(400, 'PROVIDER_REJECTED', 'Provider rejected the request. Check model compatibility and context size.');
    return new AppError(502, 'PROVIDER_ERROR', 'Could not complete the model request. Check the provider URL, network and model.');
}
export const callModel: ModelProvider = async (settings, request) => {
    if (!settings.apiKey)
        throw new AppError(400, 'API_KEY_REQUIRED', 'Save an API key in Settings first.');
    try {
        const client = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl, timeout: 120000, maxRetries: 0,
            fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) });
        const response = await client.chat.completions.create({ model: settings.model, messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }] }, { signal: request.signal });
        const content = response.choices[0]?.message.content;
        if (!content || response.choices[0]?.finish_reason === 'length')
            throw new AppError(502, 'INVALID_MODEL_RESPONSE', 'Model returned no complete text response. Try a smaller request.');
        return content;
    }
    catch (error) {
        throw providerError(error);
    }
};
