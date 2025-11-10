import { collectMissingBlockFields, flattenBlocks, normaliseBlock } from '../../utils/contentBlocks';
import type { BlockNode } from '../../types/content';

describe('contentBlocks utilities', () => {
  const baseBlock = (overrides: Partial<BlockNode> = {}): BlockNode => ({
    id: overrides.id ?? 'block-1',
    type: overrides.type ?? 'hero',
    props: overrides.props ?? {},
    settings: overrides.settings,
    children: overrides.children,
    variant: overrides.variant ?? null,
    ai: overrides.ai,
  });

  it('normaliseBlock ensures props, settings, and children defaults', () => {
    const block: BlockNode = {
      id: 'text-1',
      type: 'text',
      props: undefined as any,
      settings: undefined,
      children: undefined,
    };

    const normalised = normaliseBlock(block);

    expect(normalised.props).toEqual({});
    expect(normalised.settings).toEqual({});
    expect(Array.isArray(normalised.children)).toBe(true);
    expect(normalised.children).toHaveLength(0);
  });

  it('collectMissingBlockFields returns missing required paths recursively', () => {
    const blocks: BlockNode[] = [
      baseBlock({ id: 'hero-1', props: { subtitle: 'No title yet' } }),
      {
        id: 'text-1',
        type: 'text',
        props: { body: '' },
        children: [
          {
            id: 'quote-1',
            type: 'quote',
            props: {},
          },
        ],
      },
    ];

    const missing = collectMissingBlockFields(blocks);

    expect(missing).toEqual([
      'blocks[0].title',
      'blocks[1].body',
      'blocks[1].children[0].quote',
    ]);
  });

  it('flattenBlocks preserves parent chain and ordering', () => {
    const tree: BlockNode[] = [
      {
        id: 'parent',
        type: 'columns',
        props: { columns: 2 },
        children: [
          { id: 'child-1', type: 'text', props: { body: 'Left' } },
          { id: 'child-2', type: 'text', props: { body: 'Right' } },
        ],
      },
    ];

    const flattened = flattenBlocks(tree);

    expect(flattened).toHaveLength(3);
    expect(flattened[0].block.id).toBe('parent');

    const childIds = flattened.slice(1).map((entry) => entry.block.id);
    expect(childIds).toEqual(['child-1', 'child-2']);

    const parentKeys = flattened.slice(1).map((entry) => entry.parentKey);
    expect(parentKeys).toEqual(['parent', 'parent']);
  });
});
