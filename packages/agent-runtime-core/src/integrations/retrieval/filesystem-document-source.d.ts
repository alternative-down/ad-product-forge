import type { RetrievalDocumentSource, RetrievalSourceDocument } from './contracts.js';
export type FilesystemDocumentSourceOptions = {
    roots: string[];
    includeExtensions?: string[];
};
export declare class FilesystemDocumentSource implements RetrievalDocumentSource {
    private readonly roots;
    private readonly includeExtensions;
    constructor(options: FilesystemDocumentSourceOptions);
    loadDocuments(): Promise<RetrievalSourceDocument[]>;
}
