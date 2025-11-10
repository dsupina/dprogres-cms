"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenBlocks = exports.collectMissingBlockFields = exports.normaliseBlock = void 0;
exports.getContentBlocks = getContentBlocks;
exports.saveContentBlocks = saveContentBlocks;
const database_1 = __importDefault(require("./database"));
const blockRendering_1 = require("./blockRendering");
const ensureArray = (value) => Array.isArray(value) ? value : [];
const normaliseBlock = (block) => ({
    ...block,
    props: block.props || {},
    settings: block.settings || {},
    children: ensureArray(block.children),
});
exports.normaliseBlock = normaliseBlock;
const collectMissingBlockFields = (blocks, prefix = 'blocks') => {
    const missing = [];
    blocks.forEach((block, index) => {
        const basePath = `${prefix}[${index}]`;
        (0, blockRendering_1.getMissingFields)(block).forEach((field) => missing.push(`${basePath}.${field}`));
        if (block.children && block.children.length > 0) {
            missing.push(...(0, exports.collectMissingBlockFields)(block.children, `${basePath}.children`));
        }
    });
    return missing;
};
exports.collectMissingBlockFields = collectMissingBlockFields;
const flattenBlocks = (blocks, parentKey = null) => {
    return blocks.flatMap((block, index) => {
        const current = {
            block: (0, exports.normaliseBlock)(block),
            parentKey,
            position: index,
        };
        const children = current.block.children ? (0, exports.flattenBlocks)(current.block.children, block.id) : [];
        return [current, ...children];
    });
};
exports.flattenBlocks = flattenBlocks;
const buildTree = (rows) => {
    const map = new Map();
    const roots = [];
    rows.forEach((row) => {
        const node = {
            id: String(row.id),
            type: row.block_type,
            variant: row.block_variant || undefined,
            props: row.data || {},
            settings: row.settings || {},
            ai: row.ai_state || undefined,
            children: [],
            __parentId: row.parent_id,
            __position: row.position,
        };
        map.set(row.id, node);
    });
    map.forEach((node, id) => {
        if (node.__parentId) {
            const parent = map.get(node.__parentId);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(node);
            }
            else {
                roots.push(node);
            }
        }
        else {
            roots.push(node);
        }
    });
    const sortChildren = (list) => {
        list.sort((a, b) => {
            const posA = a.__position ?? 0;
            const posB = b.__position ?? 0;
            return posA - posB;
        });
        list.forEach((child) => {
            if (child.children && child.children.length > 0) {
                sortChildren(child.children);
            }
            delete child.__position;
            delete child.__parentId;
        });
    };
    sortChildren(roots);
    return roots;
};
async function getContentBlocks(entityType, entityId, client) {
    const executor = client ?? database_1.default;
    const result = await executor.query(`SELECT id, entity_type, entity_id, parent_id, block_type, block_variant, data, settings, position, ai_state
     FROM content_blocks
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY parent_id NULLS FIRST, position ASC, id ASC`, [entityType, entityId]);
    if (result.rowCount === 0) {
        return [];
    }
    return buildTree(result.rows);
}
async function saveContentBlocks(entityType, entityId, blocks, client) {
    await client.query('DELETE FROM content_blocks WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
    const flattened = (0, exports.flattenBlocks)(blocks);
    const idMap = new Map();
    for (const item of flattened) {
        const parentId = item.parentKey ? idMap.get(item.parentKey) || null : null;
        const result = await client.query(`INSERT INTO content_blocks (
        entity_type, entity_id, parent_id, block_type, block_variant, data, settings, position, ai_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`, [
            entityType,
            entityId,
            parentId,
            item.block.type,
            item.block.variant || null,
            item.block.props || {},
            item.block.settings || {},
            item.position,
            item.block.ai || {},
        ]);
        const insertedId = result.rows[0]?.id;
        if (insertedId) {
            idMap.set(item.block.id, insertedId);
        }
    }
    return idMap;
}
//# sourceMappingURL=contentBlocks.js.map