import { Pool } from 'pg';
import { ContentVersion, ServiceResponse } from '../types/versioning';
export interface DiffResult {
    leftVersion: ContentVersion;
    rightVersion: ContentVersion;
    textDiff: TextDiff;
    structuralDiff: StructuralDiff;
    metadataDiff: MetadataDiff;
    statistics: ChangeStatistics;
    computedAt: Date;
    algorithmUsed: DiffAlgorithm;
    cacheKey?: string;
}
export interface TextDiff {
    hunks: DiffHunk[];
    changes: DiffChange[];
    linesAdded: number;
    linesRemoved: number;
    linesModified: number;
    similarityRatio: number;
}
export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    changes: DiffChange[];
}
export interface DiffChange {
    type: 'add' | 'remove' | 'modify' | 'unchanged';
    lineNumberOld?: number;
    lineNumberNew?: number;
    content: string;
    oldContent?: string;
    newContent?: string;
    inlineChanges?: InlineChange[];
}
export interface InlineChange {
    type: 'add' | 'remove';
    start: number;
    end: number;
    text: string;
}
export interface StructuralDiff {
    changes: StructuralChange[];
    domOperations?: DomOperation[];
    movedElements?: MovedElement[];
}
export interface StructuralChange {
    type: 'element_added' | 'element_removed' | 'element_modified' | 'attribute_changed' | 'text_changed';
    element?: string;
    attribute?: string;
    oldContent?: string;
    newContent?: string;
    oldValue?: string;
    newValue?: string;
    position?: {
        line: number;
        column: number;
    };
}
export interface DomOperation {
    operation: 'insert' | 'delete' | 'move' | 'modify';
    xpath: string;
    data?: any;
}
export interface MovedElement {
    element: string;
    fromPosition: {
        line: number;
        column: number;
    };
    toPosition: {
        line: number;
        column: number;
    };
}
export interface MetadataDiff {
    [key: string]: FieldChange | undefined;
}
export interface FieldChange {
    changeType: 'added' | 'removed' | 'modified';
    oldValue?: any;
    newValue?: any;
}
export interface ChangeStatistics {
    totalChanges: number;
    linesAdded: number;
    linesRemoved: number;
    linesModified: number;
    charactersAdded: number;
    charactersRemoved: number;
    wordsAdded: number;
    wordsRemoved: number;
    changePercent: number;
    complexityScore: number;
    reviewTimeEstimate: number;
    majorChanges: string[];
}
export type DiffAlgorithm = 'myers' | 'patience' | 'histogram' | 'semantic';
export type DiffGranularity = 'line' | 'word' | 'character';
export type ExportFormat = 'pdf' | 'html' | 'json' | 'docx';
export interface DiffOptions {
    algorithm?: DiffAlgorithm;
    granularity?: DiffGranularity;
    contextLines?: number;
    includeUnchanged?: boolean;
    ignoreWhitespace?: boolean;
    semanticCleanup?: boolean;
}
export interface ExportOptions {
    includeMetadata?: boolean;
    includeStatistics?: boolean;
    includeUnchanged?: boolean;
    template?: string;
    customBranding?: boolean;
    pageOrientation?: 'portrait' | 'landscape';
}
export declare class DiffService {
    private pool;
    private diffEngine;
    private diffCache;
    private readonly CACHE_TTL;
    private readonly MAX_CACHE_SIZE;
    constructor(pool: Pool);
    compareVersions(versionId1: number, versionId2: number, userId: number, options?: DiffOptions): Promise<ServiceResponse<DiffResult>>;
    generateTextDiff(text1: string, text2: string, granularity?: DiffGranularity): TextDiff;
    generateStructuralDiff(html1: string, html2: string): StructuralDiff;
    private compareDOMNodes;
    generateMetadataDiff(version1: ContentVersion, version2: ContentVersion): MetadataDiff;
    calculateChangeStats(textDiff: TextDiff, structuralDiff: StructuralDiff, metadataDiff: MetadataDiff, content1: string, content2: string): ChangeStatistics;
    exportDiff(diff: DiffResult, format: ExportFormat, options?: ExportOptions): Promise<ServiceResponse<Buffer | string>>;
    private exportAsHTML;
    private renderHTMLContent;
    private exportAsJSON;
    private exportAsPDF;
    private generateCacheKey;
    private getCachedDiff;
    private cacheDiff;
    private fetchVersion;
    private validateUserAccess;
    private logDiffOperation;
    private escapeHtml;
}
//# sourceMappingURL=DiffService.d.ts.map