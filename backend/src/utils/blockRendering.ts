import DOMPurify from 'isomorphic-dompurify';
import type { BlockNode, BlockType } from '../types/content';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const REQUIRED_FIELDS: Record<BlockType, string[]> = {
  hero: ['title'],
  heading: ['text'],
  subheading: ['text'],
  text: ['body'],
  richText: ['body'],
  image: [],
  gallery: [],
  quote: ['quote'],
  list: ['items'],
  columns: [],
  cta: ['title', 'ctaLabel'],
  button: ['label', 'href'],
  video: ['src'],
  embed: ['html'],
  divider: [],
};

export const getMissingFields = (block: BlockNode): string[] => {
  const required = REQUIRED_FIELDS[block.type] || [];
  return required.filter((field) => {
    const value = (block.props || {})[field];
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return value === undefined || value === null || value === '';
  });
};

const renderChildren = (children?: BlockNode[]): string => {
  if (!children || children.length === 0) {
    return '';
  }
  return children.map(renderBlock).join('\n');
};

export const renderBlock = (block: BlockNode): string => {
  const props = block.props || {};
  const settings = block.settings || {};
  const variant = block.variant || settings.variant;

  switch (block.type) {
    case 'hero': {
      const title = props.title ? escapeHtml(props.title) : '';
      const subtitle = props.subtitle ? escapeHtml(props.subtitle) : '';
      const ctaLabel = props.ctaLabel ? escapeHtml(props.ctaLabel) : '';
      const ctaHref = props.ctaHref ? escapeHtml(props.ctaHref) : '#';
      const mediaUrl = props.mediaUrl || props.src;
      const mediaAlt = props.mediaAlt || props.alt || title;
      return `
<section class="relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-800 text-white ${variant === 'left' ? 'text-left' : 'text-center'}">
  <div class="mx-auto max-w-5xl px-6 py-20">
    <div class="space-y-6">
      <h1 class="text-4xl md:text-6xl font-bold">${title}</h1>
      ${subtitle ? `<p class="text-xl text-primary-100">${subtitle}</p>` : ''}
      ${mediaUrl ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(mediaAlt || '')}" class="mx-auto max-h-80 rounded-xl shadow-xl" />` : ''}
      ${ctaLabel ? `<div><a href="${ctaHref}" class="inline-flex items-center px-6 py-3 rounded-md bg-white text-primary-600 font-semibold shadow-sm">${ctaLabel}</a></div>` : ''}
    </div>
  </div>
</section>
`.trim();
    }
    case 'heading':
    case 'subheading': {
      const level = props.level && Number(props.level) >= 1 && Number(props.level) <= 6 ? Number(props.level) : block.type === 'heading' ? 2 : 3;
      const tag = `h${level}`;
      const text = props.text ? escapeHtml(props.text) : '';
      return `<${tag} class="mt-8 text-${level === 1 ? '4xl' : level === 2 ? '3xl' : '2xl'} font-bold text-gray-900">${text}</${tag}>`;
    }
    case 'text': {
      const body = props.body ? escapeHtml(props.body) : '';
      return `<p class="text-lg leading-8 text-gray-700">${body}</p>`;
    }
    case 'richText': {
      const body = props.body ? DOMPurify.sanitize(props.body) : '';
      return `<div class="prose prose-lg max-w-none">${body}</div>`;
    }
    case 'image': {
      const src = props.src || props.mediaUrl || '';
      if (!src) return '';
      const alt = props.alt || props.caption || '';
      const caption = props.caption ? `<figcaption class="mt-2 text-sm text-gray-500">${escapeHtml(props.caption)}</figcaption>` : '';
      return `<figure class="my-10 text-center"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="mx-auto rounded-xl shadow-md" />${caption}</figure>`;
    }
    case 'gallery': {
      const items: Array<Record<string, any>> = Array.isArray(props.items) ? props.items : [];
      if (items.length === 0) return '';
      const images = items
        .map((item) => {
          if (!item?.src) return '';
          const alt = item.alt || props.alt || '';
          return `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(alt)}" class="w-full h-48 object-cover rounded-lg shadow-sm" />`;
        })
        .join('\n');
      return `<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 my-10">${images}</div>`;
    }
    case 'quote': {
      const quote = props.quote ? escapeHtml(props.quote) : '';
      const attribution = props.attribution ? `<cite class="mt-3 block text-sm text-gray-500">${escapeHtml(props.attribution)}</cite>` : '';
      return `<blockquote class="border-l-4 border-primary-500 pl-6 italic text-xl text-gray-700 my-8">${quote}${attribution}</blockquote>`;
    }
    case 'list': {
      const items: string[] = Array.isArray(props.items) ? props.items : [];
      if (items.length === 0) return '';
      const listItems = items.map((item) => `<li class="pl-2">${escapeHtml(item)}</li>`).join('\n');
      return `<ul class="list-disc pl-6 space-y-2 text-gray-700">${listItems}</ul>`;
    }
    case 'columns': {
      const html = renderChildren(block.children);
      return `<div class="grid gap-6 md:grid-cols-${props.columns || 2}">${html}</div>`;
    }
    case 'cta': {
      const title = props.title ? escapeHtml(props.title) : '';
      const body = props.body ? escapeHtml(props.body) : '';
      const ctaLabel = props.ctaLabel ? escapeHtml(props.ctaLabel) : '';
      const ctaHref = props.ctaHref ? escapeHtml(props.ctaHref) : '#';
      return `<section class="my-16 rounded-2xl bg-primary-600 px-8 py-12 text-white shadow-lg"><h2 class="text-3xl font-bold mb-4">${title}</h2>${body ? `<p class="text-lg mb-6 text-primary-50">${body}</p>` : ''}${ctaLabel ? `<a href="${ctaHref}" class="inline-flex items-center rounded-md bg-white px-5 py-3 font-semibold text-primary-600 shadow-sm">${ctaLabel}</a>` : ''}</section>`;
    }
    case 'button': {
      const label = props.label ? escapeHtml(props.label) : '';
      const href = props.href ? escapeHtml(props.href) : '#';
      return `<a href="${href}" class="inline-flex items-center rounded-md bg-primary-600 px-5 py-3 font-semibold text-white shadow-sm">${label}</a>`;
    }
    case 'video': {
      const src = props.src || props.embedUrl;
      if (!src) return '';
      return `<div class="aspect-video my-8 overflow-hidden rounded-2xl shadow-lg"><iframe src="${escapeHtml(src)}" class="h-full w-full" allowfullscreen loading="lazy"></iframe></div>`;
    }
    case 'embed': {
      const html = props.html ? DOMPurify.sanitize(props.html) : '';
      return `<div class="my-6">${html}</div>`;
    }
    case 'divider':
      return '<hr class="my-10 border-gray-200" />';
    default:
      return renderChildren(block.children);
  }
};

export const renderBlocksToHtml = (blocks: BlockNode[]): string => {
  return blocks.map(renderBlock).join('\n');
};
