import { getMissingFields, renderBlock, renderBlocksToHtml } from '../../utils/blockRendering';
import type { BlockNode } from '../../types/content';

describe('blockRendering utilities', () => {
  it('getMissingFields identifies required props for hero block', () => {
    const block: BlockNode = {
      id: 'hero-1',
      type: 'hero',
      props: {},
    };

    expect(getMissingFields(block)).toEqual(['title']);
  });

  it('renderBlock escapes HTML for text blocks', () => {
    const block: BlockNode = {
      id: 'text-1',
      type: 'text',
      props: { body: '<script>alert("x")</script>' },
    };

    const html = renderBlock(block);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renderBlocksToHtml joins multiple blocks preserving order', () => {
    const blocks: BlockNode[] = [
      { id: 'heading-1', type: 'heading', props: { text: 'Hello', level: 2 } },
      { id: 'text-1', type: 'text', props: { body: 'Welcome to the article.' } },
    ];

    const html = renderBlocksToHtml(blocks);

    expect(html).toContain('Hello');
    expect(html).toContain('Welcome to the article.');
    const headingIndex = html.indexOf('Hello');
    const textIndex = html.indexOf('Welcome');
    expect(headingIndex).toBeLessThan(textIndex);
  });
});
