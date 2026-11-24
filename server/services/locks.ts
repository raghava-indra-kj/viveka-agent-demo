import { AppError } from '../../shared/domain.ts';
export class FormLocks {
    private active = new Set<string>();
    acquire(id: string): () => void {
        if (this.active.has(id))
            throw new AppError(409, 'FORM_BUSY', 'This form has an active operation. Try again when it finishes.');
        this.active.add(id);
        return () => { this.active.delete(id); };
    }
}
