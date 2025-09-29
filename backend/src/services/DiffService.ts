/**
 * DiffService - CV-007
 *
 * Service for computing differences between content versions,
 * providing multiple diff algorithms and export capabilities.
 */

import { Pool } from 'pg';
import * as DiffMatchPatch from 'diff-match-patch';
import DOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';
import crypto from 'crypto';
import {
  ContentVersion,
  ServiceResponse,
  ContentType,
  VersionType
} from '../types/versioning';

// Diff-specific types
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

export class DiffService {
  private pool: Pool;
  private diffEngine: any; // diff-match-patch instance
  private diffCache: Map<string, DiffResult>;
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
  private readonly MAX_CACHE_SIZE = 100;

  constructor(pool: Pool) {
    this.pool = pool;
    this.diffEngine = new (DiffMatchPatch as any).diff_match_patch();
    this.diffCache = new Map();

    // Configure diff engine
    this.diffEngine.Diff_Timeout = 5.0; // 5 seconds
    this.diffEngine.Diff_EditCost = 4;
  }

  /**
   * Compare two content versions and return comprehensive diff
   */
  async compareVersions(
    versionId1: number,
    versionId2: number,
    userId: number,
    options: DiffOptions = {}
  ): Promise<ServiceResponse<DiffResult>> {
    try {
      // Generate cache key
      const cacheKey = this.generateCacheKey(versionId1, versionId2, options);

      // Check cache
      const cached = this.getCachedDiff(cacheKey);
      if (cached) {
        return { success: true, data: cached };
      }

      // Fetch versions from database
      const version1Result = await this.fetchVersion(versionId1);
      const version2Result = await this.fetchVersion(versionId2);

      if (!version1Result.success || !version2Result.success) {
        return {
          success: false,
          error: 'Failed to fetch versions for comparison'
        };
      }

      const version1 = version1Result.data!;
      const version2 = version2Result.data!;

      // Validate site isolation
      if (version1.site_id !== version2.site_id) {
        return {
          success: false,
          error: 'Cannot compare versions from different sites (site isolation violation)'
        };
      }

      // Validate user has access to the site
      const hasAccess = await this.validateUserAccess(version1.site_id, userId);
      if (!hasAccess) {
        return {
          success: false,
          error: 'Access denied to compare these versions'
        };
      }

      // Generate diffs
      const textDiff = this.generateTextDiff(
        version1.content || '',
        version2.content || '',
        options.granularity || 'line'
      );

      const structuralDiff = this.generateStructuralDiff(
        version1.content || '',
        version2.content || ''
      );

      const metadataDiff = this.generateMetadataDiff(version1, version2);

      // Calculate statistics
      const statistics = this.calculateChangeStats(
        textDiff,
        structuralDiff,
        metadataDiff,
        version1.content || '',
        version2.content || ''
      );

      const diffResult: DiffResult = {
        leftVersion: version1,
        rightVersion: version2,
        textDiff,
        structuralDiff,
        metadataDiff,
        statistics,
        computedAt: new Date(),
        algorithmUsed: options.algorithm || 'myers',
        cacheKey
      };

      // Cache the result
      this.cacheDiff(cacheKey, diffResult);

      // Log the comparison for audit
      await this.logDiffOperation(version1.site_id, userId, versionId1, versionId2);

      return { success: true, data: diffResult };
    } catch (error) {
      console.error('Error comparing versions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compare versions'
      };
    }
  }

  /**
   * Generate text-based diff
   */
  generateTextDiff(text1: string, text2: string, granularity: DiffGranularity = 'line'): TextDiff {
    const diffs = this.diffEngine.diff_main(text1, text2);

    // Apply semantic cleanup for better readability
    this.diffEngine.diff_cleanupSemantic(diffs);

    const hunks: DiffHunk[] = [];
    const changes: DiffChange[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;
    let linesModified = 0;

    // Process diffs based on granularity
    if (granularity === 'line') {
      const lines1 = text1.split('\n');
      const lines2 = text2.split('\n');

      let lineOld = 0;
      let lineNew = 0;
      let currentHunk: DiffHunk | null = null;

      for (const [operation, text] of diffs) {
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (i === lines.length - 1 && lines[i] === '') continue;

          const change: DiffChange = {
            type: operation === 0 ? 'unchanged' : operation === 1 ? 'add' : 'remove',
            content: lines[i],
            lineNumberOld: operation !== 1 ? lineOld + 1 : undefined,
            lineNumberNew: operation !== -1 ? lineNew + 1 : undefined
          };

          if (operation !== 0) {
            if (!currentHunk) {
              currentHunk = {
                oldStart: lineOld + 1,
                oldLines: 0,
                newStart: lineNew + 1,
                newLines: 0,
                changes: []
              };
              hunks.push(currentHunk);
            }

            currentHunk.changes.push(change);
            changes.push(change);

            if (operation === 1) {
              linesAdded++;
              currentHunk.newLines++;
            } else if (operation === -1) {
              linesRemoved++;
              currentHunk.oldLines++;
            }
          } else if (currentHunk) {
            // Add context lines
            if (currentHunk.changes.length > 0) {
              currentHunk = null;
            }
          }

          if (operation !== 1) lineOld++;
          if (operation !== -1) lineNew++;
        }
      }
    } else {
      // Word or character level diff
      for (const [operation, text] of diffs) {
        if (operation !== 0) {
          changes.push({
            type: operation === 1 ? 'add' : 'remove',
            content: text
          });
        }
      }
    }

    // Calculate similarity ratio
    const maxLength = Math.max(text1.length, text2.length);
    const similarityRatio = maxLength > 0
      ? 1 - (this.diffEngine.diff_levenshtein(diffs) / maxLength)
      : 1;

    return {
      hunks,
      changes,
      linesAdded,
      linesRemoved,
      linesModified,
      similarityRatio
    };
  }

  /**
   * Generate structural diff for HTML content
   */
  generateStructuralDiff(html1: string, html2: string): StructuralDiff {
    const changes: StructuralChange[] = [];

    try {
      // Sanitize HTML first
      const cleanHtml1 = DOMPurify.sanitize(html1);
      const cleanHtml2 = DOMPurify.sanitize(html2);

      // Parse HTML
      const dom1 = new JSDOM(cleanHtml1);
      const dom2 = new JSDOM(cleanHtml2);

      const doc1 = dom1.window.document;
      const doc2 = dom2.window.document;

      // Compare DOM structures
      this.compareDOMNodes(doc1.body, doc2.body, changes);

    } catch (error) {
      console.error('Error generating structural diff:', error);
    }

    return { changes };
  }

  /**
   * Recursively compare DOM nodes
   */
  private compareDOMNodes(node1: any, node2: any, changes: StructuralChange[]) {
    if (!node1 && !node2) return;

    if (!node1 && node2) {
      changes.push({
        type: 'element_added',
        element: node2.tagName?.toLowerCase() || 'text',
        newContent: node2.textContent || ''
      });
      return;
    }

    if (node1 && !node2) {
      changes.push({
        type: 'element_removed',
        element: node1.tagName?.toLowerCase() || 'text',
        oldContent: node1.textContent || ''
      });
      return;
    }

    if (node1 && node2) {
      // Compare tag names
      if (node1.tagName && node2.tagName && node1.tagName !== node2.tagName) {
        changes.push({
          type: 'element_modified',
          oldContent: node1.tagName.toLowerCase(),
          newContent: node2.tagName.toLowerCase()
        });
      }

      // Compare attributes (only for element nodes)
      if (node1.attributes && node2.attributes) {
        const attrs1 = Array.from(node1.attributes) as Array<{ name: string; value: string }>;
        const attrs2 = Array.from(node2.attributes) as Array<{ name: string; value: string }>;

        attrs1.forEach((attr: { name: string; value: string }) => {
          const attr2Value = node2.getAttribute(attr.name);
          if (attr2Value === null) {
            changes.push({
              type: 'attribute_changed',
              element: node1.tagName?.toLowerCase() || 'element',
              attribute: attr.name,
              oldValue: attr.value,
              newValue: undefined
            });
          } else if (attr.value !== attr2Value) {
            changes.push({
              type: 'attribute_changed',
              element: node1.tagName?.toLowerCase() || 'element',
              attribute: attr.name,
              oldValue: attr.value,
              newValue: attr2Value
            });
          }
        });

        attrs2.forEach((attr: { name: string; value: string }) => {
          if (!node1.hasAttribute(attr.name)) {
            changes.push({
              type: 'attribute_changed',
              element: node2.tagName?.toLowerCase() || 'element',
              attribute: attr.name,
              oldValue: undefined,
              newValue: attr.value
            });
          }
        });
      }

      // Compare text content (only if no children)
      if (node1.children && node2.children &&
          node1.children.length === 0 && node2.children.length === 0) {
        if (node1.textContent !== node2.textContent) {
          changes.push({
            type: 'text_changed',
            element: node1.tagName?.toLowerCase() || 'text',
            oldContent: node1.textContent || '',
            newContent: node2.textContent || ''
          });
        }
      }

      // Recursively compare children
      if (node1.children && node2.children) {
        const maxChildren = Math.max(node1.children.length, node2.children.length);
        for (let i = 0; i < maxChildren; i++) {
          this.compareDOMNodes(
            node1.children[i] || null,
            node2.children[i] || null,
            changes
          );
        }
      }
    }
  }

  /**
   * Generate metadata diff
   */
  generateMetadataDiff(version1: ContentVersion, version2: ContentVersion): MetadataDiff {
    const diff: MetadataDiff = {};

    // Compare simple fields
    const fields = ['title', 'slug', 'excerpt'] as const;

    fields.forEach(field => {
      if (version1[field] !== version2[field]) {
        diff[field] = {
          changeType: 'modified',
          oldValue: version1[field],
          newValue: version2[field]
        };
      }
    });

    // Compare data fields (JSON)
    if (version1.data || version2.data) {
      const data1 = version1.data || {};
      const data2 = version2.data || {};

      const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);

      allKeys.forEach(key => {
        if (!(key in data1)) {
          diff[`data.${key}`] = {
            changeType: 'added',
            newValue: data2[key]
          };
        } else if (!(key in data2)) {
          diff[`data.${key}`] = {
            changeType: 'removed',
            oldValue: data1[key]
          };
        } else if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
          diff[`data.${key}`] = {
            changeType: 'modified',
            oldValue: data1[key],
            newValue: data2[key]
          };
        }
      });
    }

    return diff;
  }

  /**
   * Calculate change statistics
   */
  calculateChangeStats(
    textDiff: TextDiff,
    structuralDiff: StructuralDiff,
    metadataDiff: MetadataDiff,
    content1: string,
    content2: string
  ): ChangeStatistics {
    const words1 = content1.split(/\s+/).length;
    const words2 = content2.split(/\s+/).length;
    const wordsAdded = Math.max(0, words2 - words1);
    const wordsRemoved = Math.max(0, words1 - words2);

    const chars1 = content1.length;
    const chars2 = content2.length;
    const charactersAdded = Math.max(0, chars2 - chars1);
    const charactersRemoved = Math.max(0, chars1 - chars2);

    const metadataChanges = Object.keys(metadataDiff).length;
    const structuralChanges = structuralDiff.changes.length;
    const totalChanges = textDiff.changes.length + structuralChanges + metadataChanges;

    const changePercent = content1.length > 0
      ? ((Math.abs(content2.length - content1.length) / content1.length) * 100)
      : content2.length > 0 ? 100 : 0;

    // Calculate complexity score based on types of changes
    const complexityScore =
      (textDiff.linesModified * 2) +
      (textDiff.linesAdded * 1) +
      (textDiff.linesRemoved * 1) +
      (structuralChanges * 3) +
      (metadataChanges * 1);

    // Estimate review time (rough calculation)
    const reviewTimeEstimate = Math.ceil(
      (totalChanges * 0.5) + // 30 seconds per change
      (wordsAdded * 0.01) +   // ~6 seconds per 10 words
      (complexityScore * 0.1)  // Additional time for complexity
    );

    // Identify major changes
    const majorChanges: string[] = [];
    if (metadataDiff.title) majorChanges.push('Title changed');
    if (metadataDiff.slug) majorChanges.push('URL slug modified');
    if (structuralChanges > 5) majorChanges.push(`${structuralChanges} structural changes`);
    if (textDiff.linesAdded > 10) majorChanges.push(`${textDiff.linesAdded} lines added`);
    if (textDiff.linesRemoved > 10) majorChanges.push(`${textDiff.linesRemoved} lines removed`);
    if (changePercent > 50) majorChanges.push('Major content revision');

    return {
      totalChanges,
      linesAdded: textDiff.linesAdded,
      linesRemoved: textDiff.linesRemoved,
      linesModified: textDiff.linesModified,
      charactersAdded,
      charactersRemoved,
      wordsAdded,
      wordsRemoved,
      changePercent: Math.round(changePercent * 10) / 10,
      complexityScore,
      reviewTimeEstimate,
      majorChanges
    };
  }

  /**
   * Export diff in various formats
   */
  async exportDiff(
    diff: DiffResult,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<ServiceResponse<Buffer | string>> {
    try {
      switch (format) {
        case 'html':
          return this.exportAsHTML(diff, options);
        case 'json':
          return this.exportAsJSON(diff, options);
        case 'pdf':
          return this.exportAsPDF(diff, options);
        default:
          return {
            success: false,
            error: `Unsupported export format: ${format}`
          };
      }
    } catch (error) {
      console.error('Error exporting diff:', error);
      return {
        success: false,
        error: 'Failed to export diff'
      };
    }
  }

  /**
   * Export as HTML
   */
  private async exportAsHTML(diff: DiffResult, options: ExportOptions): Promise<ServiceResponse<string>> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Version Comparison - ${diff.leftVersion.title} vs ${diff.rightVersion.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .statistics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat { background: white; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .stat-label { font-size: 12px; color: #666; }
        .stat-value { font-size: 20px; font-weight: bold; color: #333; }
        .diff-container { display: flex; gap: 20px; }
        .version { flex: 1; }
        .version-header { background: #e1e4e8; padding: 10px; font-weight: bold; }
        .added { background-color: #dcfce7; color: #15803d; }
        .removed { background-color: #fee2e2; color: #991b1b; text-decoration: line-through; }
        .modified { background-color: #fef3c7; color: #92400e; }
        .line { padding: 2px 10px; border-left: 3px solid transparent; }
        .line.added { border-left-color: #22c55e; }
        .line.removed { border-left-color: #ef4444; }
        .metadata-changes { margin: 20px 0; }
        .metadata-change { padding: 10px; margin: 5px 0; background: #f9fafb; border-left: 3px solid #3b82f6; }
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Version Comparison</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
    </div>

    ${options.includeStatistics ? `
    <div class="statistics">
        <div class="stat">
            <div class="stat-label">Total Changes</div>
            <div class="stat-value">${diff.statistics.totalChanges}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Lines Added</div>
            <div class="stat-value added">+${diff.statistics.linesAdded}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Lines Removed</div>
            <div class="stat-value removed">-${diff.statistics.linesRemoved}</div>
        </div>
        <div class="stat">
            <div class="stat-label">Change Percent</div>
            <div class="stat-value">${diff.statistics.changePercent}%</div>
        </div>
    </div>
    ` : ''}

    <div class="diff-container">
        <div class="version">
            <div class="version-header">
                Version ${diff.leftVersion.version_number} - ${diff.leftVersion.version_type}
                <br><small>${new Date(diff.leftVersion.created_at).toLocaleString()}</small>
            </div>
            <div class="content">
                ${this.renderHTMLContent(diff.leftVersion.content || '', diff.textDiff, 'left')}
            </div>
        </div>

        <div class="version">
            <div class="version-header">
                Version ${diff.rightVersion.version_number} - ${diff.rightVersion.version_type}
                <br><small>${new Date(diff.rightVersion.created_at).toLocaleString()}</small>
            </div>
            <div class="content">
                ${this.renderHTMLContent(diff.rightVersion.content || '', diff.textDiff, 'right')}
            </div>
        </div>
    </div>

    ${options.includeMetadata && Object.keys(diff.metadataDiff).length > 0 ? `
    <div class="metadata-changes">
        <h2>Metadata Changes</h2>
        ${Object.entries(diff.metadataDiff).map(([field, change]) => change ? `
            <div class="metadata-change">
                <strong>${field}:</strong>
                ${change.changeType === 'modified' ? `
                    <span class="removed">${change.oldValue}</span> →
                    <span class="added">${change.newValue}</span>
                ` : change.changeType === 'added' ? `
                    <span class="added">Added: ${change.newValue}</span>
                ` : `
                    <span class="removed">Removed: ${change.oldValue}</span>
                `}
            </div>
        ` : '').join('')}
    </div>
    ` : ''}
</body>
</html>`;

    return { success: true, data: html };
  }

  /**
   * Render HTML content with diff highlighting
   */
  private renderHTMLContent(content: string, textDiff: TextDiff, side: 'left' | 'right'): string {
    const lines = content.split('\n');
    const renderedLines: string[] = [];

    textDiff.changes.forEach(change => {
      if (change.type === 'unchanged' ||
          (side === 'left' && change.type === 'remove') ||
          (side === 'right' && change.type === 'add')) {
        const cssClass = change.type === 'unchanged' ? '' : change.type === 'add' ? 'added' : 'removed';
        renderedLines.push(`<div class="line ${cssClass}">${this.escapeHtml(change.content)}</div>`);
      }
    });

    return renderedLines.join('');
  }

  /**
   * Export as JSON
   */
  private async exportAsJSON(diff: DiffResult, options: ExportOptions): Promise<ServiceResponse<string>> {
    const exportData: any = {
      leftVersion: {
        id: diff.leftVersion.id,
        version_number: diff.leftVersion.version_number,
        title: diff.leftVersion.title,
        created_at: diff.leftVersion.created_at
      },
      rightVersion: {
        id: diff.rightVersion.id,
        version_number: diff.rightVersion.version_number,
        title: diff.rightVersion.title,
        created_at: diff.rightVersion.created_at
      },
      changes: diff.textDiff.changes,
      metadataChanges: diff.metadataDiff
    };

    if (options.includeStatistics) {
      exportData.statistics = diff.statistics;
    }

    return {
      success: true,
      data: JSON.stringify(exportData, null, 2)
    };
  }

  /**
   * Export as PDF (simplified - would need puppeteer or similar for real implementation)
   */
  private async exportAsPDF(diff: DiffResult, options: ExportOptions): Promise<ServiceResponse<Buffer>> {
    // In a real implementation, this would use puppeteer or a PDF library
    // For now, we'll return a simple buffer
    const htmlResult = await this.exportAsHTML(diff, options);

    if (!htmlResult.success) {
      return { success: false, error: htmlResult.error };
    }

    // Simplified PDF generation (would need real PDF library)
    const pdfBuffer = Buffer.from(htmlResult.data!, 'utf-8');

    return { success: true, data: pdfBuffer };
  }

  /**
   * Helper methods
   */

  private generateCacheKey(versionId1: number, versionId2: number, options: DiffOptions): string {
    const optionsHash = crypto
      .createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');

    return `diff:${Math.min(versionId1, versionId2)}:${Math.max(versionId1, versionId2)}:${optionsHash}`;
  }

  private getCachedDiff(key: string): DiffResult | null {
    const cached = this.diffCache.get(key);

    if (cached) {
      const age = Date.now() - cached.computedAt.getTime();
      if (age < this.CACHE_TTL) {
        return cached;
      }
      this.diffCache.delete(key);
    }

    return null;
  }

  private cacheDiff(key: string, diff: DiffResult): void {
    // Implement LRU cache eviction
    if (this.diffCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.diffCache.keys().next().value;
      if (firstKey) {
        this.diffCache.delete(firstKey);
      }
    }

    this.diffCache.set(key, diff);
  }

  private async fetchVersion(versionId: number): Promise<ServiceResponse<ContentVersion>> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM content_versions WHERE id = $1`,
        [versionId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Version not found' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Error fetching version:', error);
      return { success: false, error: 'Failed to fetch version' };
    }
  }

  private async validateUserAccess(siteId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT 1 FROM sites
         WHERE id = $1 AND (user_id = $2 OR $2 IN (
           SELECT user_id FROM site_users WHERE site_id = $1
         ))`,
        [siteId, userId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validating user access:', error);
      return false;
    }
  }

  private async logDiffOperation(
    siteId: number,
    userId: number,
    versionId1: number,
    versionId2: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO version_audit_log (site_id, user_id, action, version_id, related_version_id, metadata)
         VALUES ($1, $2, 'compared', $3, $4, $5)`,
        [
          siteId,
          userId,
          versionId1,
          versionId2,
          JSON.stringify({ timestamp: new Date() })
        ]
      );
    } catch (error) {
      console.error('Error logging diff operation:', error);
    }
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return text.replace(/[&<>"']/g, m => map[m]);
  }
}