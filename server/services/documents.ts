import { extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Reference } from '../../shared/types.ts';
import { AppError } from '../../shared/domain.ts';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 3;
export interface UploadedFile {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}
export async function extractDocument(file: UploadedFile): Promise<Reference> {
    const name = basename(file.originalname).slice(0, 250);
    const extension = extname(name).toLowerCase();
    if (file.size > MAX_FILE_BYTES)
        throw new AppError(413, 'FILE_TOO_LARGE', `${name} exceeds 10 MB.`);
    let text: string;
    try {
        if (['.txt', '.md', '.csv', '.json'].includes(extension)) {
            text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
            if (extension === '.json')
                JSON.parse(text);
        }
        else if (extension === '.pdf') {
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
            try {
                text = (await parser.getText()).text;
            }
            finally {
                await parser.destroy();
            }
        }
        else if (extension === '.docx') {
            const mammoth = await import('mammoth');
            text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
        }
        else
            throw new AppError(400, 'UNSUPPORTED_FILE', `Unsupported file format: ${name}.`);
    }
    catch (error) {
        if (error instanceof AppError)
            throw error;
        throw new AppError(400, 'EXTRACTION_FAILED', `Could not extract text from ${name}.`);
    }
    if (!text.trim())
        throw new AppError(400, 'NO_DOCUMENT_TEXT', `${name} has no extractable text. Scanned documents require OCR, which is not supported.`);
    return { id: randomUUID(), name, mimeType: file.mimetype, size: file.size, text: text.slice(0, 250000) };
}
