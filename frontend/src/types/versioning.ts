/**
 * Versioning Types - CV-007
 *
 * Type definitions for version management and diff functionality
 */

// Core version types
export interface ContentVersion {
  id: number;
  site_id: number;
  locale?: string;
  content_type: string;
  content_id: number;
  version_number: number;
  version_type: 'draft' | 'published' | 'auto_save' | 'archived';
  is_current_draft: boolean;
  is_current_published: boolean;
  title: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  data?: any;
  meta_data?: any;
  created_by: number;
  created_at: Date | string;
  updated_at?: Date | string;
  published_at?: Date | string;
  archived_at?: Date | string;
}

// Diff result types
export interface DiffResult {
  leftVersion: ContentVersion;
  rightVersion: ContentVersion;
  textDiff: TextDiff;
  structuralDiff: StructuralDiff;
  metadataDiff: MetadataDiff;
  statistics: ChangeStatistics;
  computedAt?: Date;
  algorithmUsed?: string;
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
  position?: { line: number; column: number };
}

export interface DomOperation {
  operation: 'insert' | 'delete' | 'move' | 'modify';
  xpath: string;
  data?: any;
}

export interface MovedElement {
  element: string;
  fromPosition: { line: number; column: number };
  toPosition: { line: number; column: number };
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
  reviewTimeEstimate: number; // in minutes
  majorChanges: string[];
}

// Version comparison options
export interface DiffOptions {
  algorithm?: 'myers' | 'patience' | 'histogram' | 'semantic';
  granularity?: 'line' | 'word' | 'character';
  contextLines?: number;
  includeUnchanged?: boolean;
  ignoreWhitespace?: boolean;
  semanticCleanup?: boolean;
}

// Export options
export interface ExportOptions {
  includeMetadata?: boolean;
  includeStatistics?: boolean;
  includeUnchanged?: boolean;
  template?: string;
  customBranding?: boolean;
  pageOrientation?: 'portrait' | 'landscape';
}

// Version history
export interface VersionHistory {
  versions: ContentVersion[];
  total: number;
  content_type: string;
  content_id: number;
}

export interface VersionWithChanges extends ContentVersion {
  changes_from_previous?: {
    total_changes: number;
    lines_added: number;
    lines_removed: number;
    change_percent: number;
  };
}