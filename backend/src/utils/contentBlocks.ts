import type { PoolClient, QueryResult } from 'pg';
import pool from './database';
import type { BlockEntityType, BlockNode } from '../types/content';
import { getMissingFields } from './blockRendering';

interface ContentBlockRow {
  id: number;
  entity_type: BlockEntityType;
  entity_id: number;
  parent_id: number | null;
  block_type: string;
  block_variant: string | null;
  data: Record<string, any> | null;
  settings: Record<string, any> | null;
  position: number;
  ai_state: Record<string, any> | null;
}

interface FlattenedBlock {
  block: BlockNode;
  parentKey: string | null;
  position: number;
}

const ensureArray = <T>(value?: T[]): T[] => Array.isArray(value) ? value : [];

export const normaliseBlock = (block: BlockNode): BlockNode => ({
  ...block,
  props: block.props || {},
  settings: block.settings || {},
  children: ensureArray(block.children),
});

export const collectMissingBlockFields = (blocks: BlockNode[], prefix = 'blocks'): string[] => {
  const missing: string[] = [];

  blocks.forEach((block, index) => {
    const basePath = `${prefix}[${index}]`;
    getMissingFields(block).forEach((field) => missing.push(`${basePath}.${field}`));

    if (block.children && block.children.length > 0) {
      missing.push(...collectMissingBlockFields(block.children, `${basePath}.children`));
    }
  });

  return missing;
};

export const flattenBlocks = (blocks: BlockNode[], parentKey: string | null = null): FlattenedBlock[] => {
  return blocks.flatMap((block, index) => {
    const current: FlattenedBlock = {
      block: normaliseBlock(block),
      parentKey,
      position: index,
    };

    const children = current.block.children ? flattenBlocks(current.block.children, block.id) : [];
    return [current, ...children];
  });
};

const buildTree = (rows: ContentBlockRow[]): BlockNode[] => {
  const map = new Map<number, BlockNode & { __parentId: number | null; __position: number }>();
  const roots: BlockNode[] = [];

  rows.forEach((row) => {
    const node: BlockNode & { __parentId: number | null; __position: number } = {
      id: String(row.id),
      type: row.block_type as BlockNode['type'],
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
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const sortChildren = (list: BlockNode[]) => {
    list.sort((a, b) => {
      const posA = (a as any).__position ?? 0;
      const posB = (b as any).__position ?? 0;
      return posA - posB;
    });
    list.forEach((child) => {
      if (child.children && child.children.length > 0) {
        sortChildren(child.children);
      }
      delete (child as any).__position;
      delete (child as any).__parentId;
    });
  };

  sortChildren(roots);
  return roots;
};

export async function getContentBlocks(
  entityType: BlockEntityType,
  entityId: number,
  client?: PoolClient,
): Promise<BlockNode[]> {
  const executor = client ?? pool;
  const result: QueryResult<ContentBlockRow> = await executor.query(
    `SELECT id, entity_type, entity_id, parent_id, block_type, block_variant, data, settings, position, ai_state
     FROM content_blocks
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY parent_id NULLS FIRST, position ASC, id ASC`,
    [entityType, entityId],
  );

  if (result.rowCount === 0) {
    return [];
  }

  return buildTree(result.rows);
}

export async function saveContentBlocks(
  entityType: BlockEntityType,
  entityId: number,
  blocks: BlockNode[],
  client: PoolClient,
): Promise<Map<string, number>> {
  await client.query('DELETE FROM content_blocks WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);

  const flattened = flattenBlocks(blocks);
  const idMap = new Map<string, number>();

  for (const item of flattened) {
    const parentId = item.parentKey ? idMap.get(item.parentKey) || null : null;
    const result = await client.query(
      `INSERT INTO content_blocks (
        entity_type, entity_id, parent_id, block_type, block_variant, data, settings, position, ai_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        entityType,
        entityId,
        parentId,
        item.block.type,
        item.block.variant || null,
        item.block.props || {},
        item.block.settings || {},
        item.position,
        item.block.ai || {},
      ],
    );

    const insertedId = result.rows[0]?.id;
    if (insertedId) {
      idMap.set(item.block.id, insertedId);
    }
  }

  return idMap;
}
