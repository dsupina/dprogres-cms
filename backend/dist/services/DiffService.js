"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffService = void 0;
const DiffMatchPatch = __importStar(require("diff-match-patch"));
const isomorphic_dompurify_1 = __importDefault(require("isomorphic-dompurify"));
const jsdom_1 = require("jsdom");
const crypto_1 = __importDefault(require("crypto"));
class DiffService {
    constructor(pool) {
        this.CACHE_TTL = 3600000;
        this.MAX_CACHE_SIZE = 100;
        this.pool = pool;
        this.diffEngine = new DiffMatchPatch.diff_match_patch();
        this.diffCache = new Map();
        this.diffEngine.Diff_Timeout = 5.0;
        this.diffEngine.Diff_EditCost = 4;
    }
    async compareVersions(versionId1, versionId2, userId, options = {}) {
        try {
            const cacheKey = this.generateCacheKey(versionId1, versionId2, options);
            const cached = this.getCachedDiff(cacheKey);
            if (cached) {
                return { success: true, data: cached };
            }
            const version1Result = await this.fetchVersion(versionId1);
            const version2Result = await this.fetchVersion(versionId2);
            if (!version1Result.success || !version2Result.success) {
                return {
                    success: false,
                    error: 'Failed to fetch versions for comparison'
                };
            }
            const version1 = version1Result.data;
            const version2 = version2Result.data;
            if (version1.site_id !== version2.site_id) {
                return {
                    success: false,
                    error: 'Cannot compare versions from different sites (site isolation violation)'
                };
            }
            const hasAccess = await this.validateUserAccess(version1.site_id, userId);
            if (!hasAccess) {
                return {
                    success: false,
                    error: 'Access denied to compare these versions'
                };
            }
            const textDiff = this.generateTextDiff(version1.content || '', version2.content || '', options.granularity || 'line');
            const structuralDiff = this.generateStructuralDiff(version1.content || '', version2.content || '');
            const metadataDiff = this.generateMetadataDiff(version1, version2);
            const statistics = this.calculateChangeStats(textDiff, structuralDiff, metadataDiff, version1.content || '', version2.content || '');
            const diffResult = {
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
            this.cacheDiff(cacheKey, diffResult);
            await this.logDiffOperation(version1.site_id, userId, versionId1, versionId2);
            return { success: true, data: diffResult };
        }
        catch (error) {
            console.error('Error comparing versions:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to compare versions'
            };
        }
    }
    generateTextDiff(text1, text2, granularity = 'line') {
        const diffs = this.diffEngine.diff_main(text1, text2);
        this.diffEngine.diff_cleanupSemantic(diffs);
        const hunks = [];
        const changes = [];
        let linesAdded = 0;
        let linesRemoved = 0;
        let linesModified = 0;
        if (granularity === 'line') {
            const lines1 = text1.split('\n');
            const lines2 = text2.split('\n');
            let lineOld = 0;
            let lineNew = 0;
            let currentHunk = null;
            for (const [operation, text] of diffs) {
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (i === lines.length - 1 && lines[i] === '')
                        continue;
                    const change = {
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
                        }
                        else if (operation === -1) {
                            linesRemoved++;
                            currentHunk.oldLines++;
                        }
                    }
                    else if (currentHunk) {
                        if (currentHunk.changes.length > 0) {
                            currentHunk = null;
                        }
                    }
                    if (operation !== 1)
                        lineOld++;
                    if (operation !== -1)
                        lineNew++;
                }
            }
        }
        else {
            for (const [operation, text] of diffs) {
                if (operation !== 0) {
                    changes.push({
                        type: operation === 1 ? 'add' : 'remove',
                        content: text
                    });
                }
            }
        }
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
    generateStructuralDiff(html1, html2) {
        const changes = [];
        try {
            const cleanHtml1 = isomorphic_dompurify_1.default.sanitize(html1);
            const cleanHtml2 = isomorphic_dompurify_1.default.sanitize(html2);
            const dom1 = new jsdom_1.JSDOM(cleanHtml1);
            const dom2 = new jsdom_1.JSDOM(cleanHtml2);
            const doc1 = dom1.window.document;
            const doc2 = dom2.window.document;
            this.compareDOMNodes(doc1.body, doc2.body, changes);
        }
        catch (error) {
            console.error('Error generating structural diff:', error);
        }
        return { changes };
    }
    compareDOMNodes(node1, node2, changes) {
        if (!node1 && !node2)
            return;
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
            if (node1.tagName && node2.tagName && node1.tagName !== node2.tagName) {
                changes.push({
                    type: 'element_modified',
                    oldContent: node1.tagName.toLowerCase(),
                    newContent: node2.tagName.toLowerCase()
                });
            }
            if (node1.attributes && node2.attributes) {
                const attrs1 = Array.from(node1.attributes);
                const attrs2 = Array.from(node2.attributes);
                attrs1.forEach((attr) => {
                    const attr2Value = node2.getAttribute(attr.name);
                    if (attr2Value === null) {
                        changes.push({
                            type: 'attribute_changed',
                            element: node1.tagName?.toLowerCase() || 'element',
                            attribute: attr.name,
                            oldValue: attr.value,
                            newValue: undefined
                        });
                    }
                    else if (attr.value !== attr2Value) {
                        changes.push({
                            type: 'attribute_changed',
                            element: node1.tagName?.toLowerCase() || 'element',
                            attribute: attr.name,
                            oldValue: attr.value,
                            newValue: attr2Value
                        });
                    }
                });
                attrs2.forEach((attr) => {
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
            if (node1.children && node2.children) {
                const maxChildren = Math.max(node1.children.length, node2.children.length);
                for (let i = 0; i < maxChildren; i++) {
                    this.compareDOMNodes(node1.children[i] || null, node2.children[i] || null, changes);
                }
            }
        }
    }
    generateMetadataDiff(version1, version2) {
        const diff = {};
        const fields = ['title', 'slug', 'excerpt'];
        fields.forEach(field => {
            if (version1[field] !== version2[field]) {
                diff[field] = {
                    changeType: 'modified',
                    oldValue: version1[field],
                    newValue: version2[field]
                };
            }
        });
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
                }
                else if (!(key in data2)) {
                    diff[`data.${key}`] = {
                        changeType: 'removed',
                        oldValue: data1[key]
                    };
                }
                else if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
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
    calculateChangeStats(textDiff, structuralDiff, metadataDiff, content1, content2) {
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
        const complexityScore = (textDiff.linesModified * 2) +
            (textDiff.linesAdded * 1) +
            (textDiff.linesRemoved * 1) +
            (structuralChanges * 3) +
            (metadataChanges * 1);
        const reviewTimeEstimate = Math.ceil((totalChanges * 0.5) +
            (wordsAdded * 0.01) +
            (complexityScore * 0.1));
        const majorChanges = [];
        if (metadataDiff.title)
            majorChanges.push('Title changed');
        if (metadataDiff.slug)
            majorChanges.push('URL slug modified');
        if (structuralChanges > 5)
            majorChanges.push(`${structuralChanges} structural changes`);
        if (textDiff.linesAdded > 10)
            majorChanges.push(`${textDiff.linesAdded} lines added`);
        if (textDiff.linesRemoved > 10)
            majorChanges.push(`${textDiff.linesRemoved} lines removed`);
        if (changePercent > 50)
            majorChanges.push('Major content revision');
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
    async exportDiff(diff, format, options = {}) {
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
        }
        catch (error) {
            console.error('Error exporting diff:', error);
            return {
                success: false,
                error: 'Failed to export diff'
            };
        }
    }
    async exportAsHTML(diff, options) {
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
    renderHTMLContent(content, textDiff, side) {
        const lines = content.split('\n');
        const renderedLines = [];
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
    async exportAsJSON(diff, options) {
        const exportData = {
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
    async exportAsPDF(diff, options) {
        const htmlResult = await this.exportAsHTML(diff, options);
        if (!htmlResult.success) {
            return { success: false, error: htmlResult.error };
        }
        const pdfBuffer = Buffer.from(htmlResult.data, 'utf-8');
        return { success: true, data: pdfBuffer };
    }
    generateCacheKey(versionId1, versionId2, options) {
        const optionsHash = crypto_1.default
            .createHash('md5')
            .update(JSON.stringify(options))
            .digest('hex');
        return `diff:${Math.min(versionId1, versionId2)}:${Math.max(versionId1, versionId2)}:${optionsHash}`;
    }
    getCachedDiff(key) {
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
    cacheDiff(key, diff) {
        if (this.diffCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.diffCache.keys().next().value;
            if (firstKey) {
                this.diffCache.delete(firstKey);
            }
        }
        this.diffCache.set(key, diff);
    }
    async fetchVersion(versionId) {
        try {
            const result = await this.pool.query(`SELECT * FROM content_versions WHERE id = $1`, [versionId]);
            if (result.rows.length === 0) {
                return { success: false, error: 'Version not found' };
            }
            return { success: true, data: result.rows[0] };
        }
        catch (error) {
            console.error('Error fetching version:', error);
            return { success: false, error: 'Failed to fetch version' };
        }
    }
    async validateUserAccess(siteId, userId) {
        try {
            const result = await this.pool.query(`SELECT 1 FROM sites
         WHERE id = $1 AND (user_id = $2 OR $2 IN (
           SELECT user_id FROM site_users WHERE site_id = $1
         ))`, [siteId, userId]);
            return result.rows.length > 0;
        }
        catch (error) {
            console.error('Error validating user access:', error);
            return false;
        }
    }
    async logDiffOperation(siteId, userId, versionId1, versionId2) {
        try {
            await this.pool.query(`INSERT INTO version_audit_log (site_id, user_id, action, version_id, related_version_id, metadata)
         VALUES ($1, $2, 'compared', $3, $4, $5)`, [
                siteId,
                userId,
                versionId1,
                versionId2,
                JSON.stringify({ timestamp: new Date() })
            ]);
        }
        catch (error) {
            console.error('Error logging diff operation:', error);
        }
    }
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
exports.DiffService = DiffService;
//# sourceMappingURL=DiffService.js.map