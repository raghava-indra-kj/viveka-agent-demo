export type FormType = 'form' | 'assessment';
export type QuestionType = 'singleChoice' | 'multipleChoice' | 'trueFalse' | 'shortAnswer' | 'longAnswer';
export interface QuestionOption {
    id: string;
    text: string;
}
export interface Question {
    id: string;
    type: QuestionType;
    title: string;
    description?: string;
    required: boolean;
    options: QuestionOption[];
    correctAnswer: string | string[] | null;
    marks: number;
}
export interface FormContent {
    title: string;
    description: string;
    type: FormType;
    questions: Question[];
}
export interface Form extends FormContent {
    id: string;
    createdAt: string;
    updatedAt: string;
}
export interface Attachment {
    id: string;
    name: string;
    mimeType: string;
    size: number;
}
export interface Reference extends Attachment {
    text: string;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    attachments?: Attachment[];
    activities?: string[];
    createdAt: string;
}
export interface AISettings {
    baseUrl: string;
    model: string;
    apiKey: string;
}
export interface PublicSettings {
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
}
export interface FormRecord {
    form: Form;
    messages: ChatMessage[];
    references: Reference[];
}
export interface FormSummary {
    id: string;
    title: string;
    type: FormType;
    questionCount: number;
    totalMarks: number;
    updatedAt: string;
}
export interface AgentResult {
    message: string;
    action: 'none' | 'updateForm';
    updatedForm: FormContent | null;
    summary: string[];
}
export type AgentEvent = {
    event: 'activity';
    data: {
        message: string;
    };
} | {
    event: 'message';
    data: {
        message: ChatMessage;
    };
} | {
    event: 'formUpdated';
    data: {
        form: Form;
    };
} | {
    event: 'error';
    data: {
        code: string;
        message: string;
    };
} | {
    event: 'done';
    data: {
        success: true;
    };
};
export const DEFAULT_SETTINGS: AISettings = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.2-sol', apiKey: '' };
export const QUESTION_LABELS: Record<QuestionType, string> = { singleChoice: 'Single choice', multipleChoice: 'Multiple select', trueFalse: 'True / False', shortAnswer: 'Short answer', longAnswer: 'Long answer' };
