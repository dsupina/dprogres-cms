import type { PoolClient } from 'pg';
import type { BlockEntityType, BlockNode } from '../types/content';
interface FlattenedBlock {
    block: BlockNode;
    parentKey: string | null;
    position: number;
}
export declare const normaliseBlock: (block: BlockNode) => BlockNode;
export declare const collectMissingBlockFields: (blocks: BlockNode[], prefix?: string) => string[];
export declare const flattenBlocks: (blocks: BlockNode[], parentKey?: string | null) => FlattenedBlock[];
export declare function getContentBlocks(entityType: BlockEntityType, entityId: number, client?: PoolClient): Promise<BlockNode[]>;
export declare function saveContentBlocks(entityType: BlockEntityType, entityId: number, blocks: BlockNode[], client: PoolClient): Promise<Map<string, number>>;
export {};
//# sourceMappingURL=contentBlocks.d.ts.map