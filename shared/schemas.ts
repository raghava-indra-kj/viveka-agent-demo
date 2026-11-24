import { z } from 'zod';
import { formIssues } from './domain.ts';
const id = z.string().min(1).max(120);
const title = z.string().trim().min(1).max(1000);
export const formTypeSchema = z.enum(['form', 'assessment']);
export const questionTypeSchema = z.enum(['singleChoice', 'multipleChoice', 'trueFalse', 'shortAnswer', 'longAnswer']);
const option = z.object({ id, text: z.string().trim().min(1).max(4000) });
const question = z.object({ id, type: questionTypeSchema, title, description: z.string().max(8000).optional(), required: z.boolean(), options: z.array(option).max(30), correctAnswer: z.union([z.string().max(8000), z.array(z.string()).max(30), z.null()]), marks: z.number().finite().min(0).max(10000) });
export const formContentSchema = z.object({ title, description: z.string().max(16000), type: formTypeSchema, questions: z.array(question).max(200) }).superRefine((form, ctx) => { for (const message of formIssues(form))
    ctx.addIssue({ code: 'custom', message }); });
export const newFormSchema = z.object({ title: title.default('Untitled assessment'), type: formTypeSchema.default('assessment') });
export const settingsSchema = z.object({ baseUrl: z.string().min(1).max(2048), model: z.string().min(1).max(200), apiKey: z.string().max(10000).optional() });
export const agentResultSchema = z.object({ message: z.string().min(1).max(30000), action: z.enum(['none', 'updateForm']), updatedForm: formContentSchema.nullable(), summary: z.array(z.string()).max(100).default([]) }).superRefine((result, ctx) => { if ((result.action === 'updateForm') !== Boolean(result.updatedForm))
    ctx.addIssue({ code: 'custom', message: 'Action and updatedForm do not agree.' }); });
