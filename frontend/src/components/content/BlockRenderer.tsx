import clsx from 'clsx';
import type { BlockNode } from '@/types/content';

interface BlockRendererProps {
  blocks?: BlockNode[] | null;
}

const ensureArray = <T,>(value?: T[] | null): T[] => (Array.isArray(value) ? value : []);

const renderChildren = (children?: BlockNode[]): React.ReactNode => {
  const nodes = ensureArray(children);
  if (nodes.length === 0) {
    return null;
  }

  return nodes.map((child) => (
    <div key={child.id} className="block-renderer-child">
      {renderBlock(child)}
    </div>
  ));
};

const renderListItems = (items: unknown[]): React.ReactNode => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return items
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item, index) => (
      <li key={index} className="pl-2">
        {item}
      </li>
    ));
};

export const renderBlock = (block: BlockNode): React.ReactNode => {
  const props = block.props || {};
  const variant = block.variant || block.settings?.variant;

  switch (block.type) {
    case 'hero': {
      const title = props.title ?? '';
      const subtitle = props.subtitle ?? '';
      const ctaLabel = props.ctaLabel ?? '';
      const ctaHref = props.ctaHref ?? '#';
      const mediaUrl = props.mediaUrl || props.src;
      const mediaAlt = props.mediaAlt || props.alt || title;

      return (
        <section
          className={clsx(
            'relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-800 text-white rounded-3xl shadow-xl',
            variant === 'left' ? 'text-left' : 'text-center',
          )}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
            <div className="space-y-6">
              {title && <h1 className="text-4xl md:text-5xl font-bold">{title}</h1>}
              {subtitle && <p className="text-lg text-primary-100">{subtitle}</p>}
              {mediaUrl && (
                <img
                  src={mediaUrl}
                  alt={mediaAlt || ''}
                  className={clsx('mx-auto max-h-80 rounded-xl shadow-xl', variant === 'left' ? 'ml-0' : '')}
                  loading="lazy"
                />
              )}
              {ctaLabel && (
                <div>
                  <a
                    href={ctaHref}
                    className="inline-flex items-center rounded-md bg-white px-6 py-3 font-semibold text-primary-600 shadow-sm transition hover:bg-gray-100"
                  >
                    {ctaLabel}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }
    case 'heading':
    case 'subheading': {
      const level = props.level && Number(props.level) >= 1 && Number(props.level) <= 6
        ? Number(props.level)
        : block.type === 'heading'
          ? 2
          : 3;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag
          className={clsx(
            'font-bold text-gray-900',
            level === 1 ? 'text-4xl' : level === 2 ? 'text-3xl' : 'text-2xl',
          )}
        >
          {props.text || ''}
        </Tag>
      );
    }
    case 'text':
      return <p className="text-lg leading-8 text-gray-700">{props.body || ''}</p>;
    case 'richText':
      return (
        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: props.body || '' }}
        />
      );
    case 'image': {
      const src = props.src || props.mediaUrl;
      if (!src) return null;
      const alt = props.alt || props.caption || '';
      return (
        <figure className="my-10 text-center">
          <img
            src={src}
            alt={alt}
            className="mx-auto rounded-xl shadow-md"
            loading="lazy"
            decoding="async"
          />
          {props.caption && <figcaption className="mt-2 text-sm text-gray-500">{props.caption}</figcaption>}
        </figure>
      );
    }
    case 'gallery': {
      const items = Array.isArray(props.items) ? props.items : [];
      if (items.length === 0) return null;
      return (
        <div className="my-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item: any, index: number) => {
            if (!item?.src) return null;
            return (
              <img
                key={index}
                src={item.src}
                alt={item.alt || props.alt || ''}
                className="h-48 w-full rounded-lg object-cover shadow-sm"
                loading="lazy"
              />
            );
          })}
        </div>
      );
    }
    case 'quote':
      return (
        <blockquote className="my-8 border-l-4 border-primary-500 pl-6 text-xl italic text-gray-700">
          {props.quote || ''}
          {props.attribution && (
            <cite className="mt-3 block text-sm text-gray-500">{props.attribution}</cite>
          )}
        </blockquote>
      );
    case 'list': {
      const listItems = renderListItems(props.items);
      if (!listItems) return null;
      return <ul className="list-disc space-y-2 pl-6 text-gray-700">{listItems}</ul>;
    }
    case 'columns': {
      const columnCount = Number(props.columns) || 2;
      const safeColumnCount = Math.max(1, Math.min(columnCount, 4));
      const gridColumnsClass = {
        1: 'md:grid-cols-1',
        2: 'md:grid-cols-2',
        3: 'md:grid-cols-3',
        4: 'md:grid-cols-4',
      }[safeColumnCount as 1 | 2 | 3 | 4] ?? 'md:grid-cols-2';

      return (
        <div className={clsx('grid gap-6', gridColumnsClass)}>
          {renderChildren(block.children)}
        </div>
      );
    }
    case 'cta':
      return (
        <section className="my-16 rounded-2xl bg-primary-600 px-8 py-12 text-white shadow-lg">
          {props.title && <h2 className="mb-4 text-3xl font-bold">{props.title}</h2>}
          {props.body && <p className="mb-6 text-lg text-primary-50">{props.body}</p>}
          {props.ctaLabel && (
            <a
              href={props.ctaHref || '#'}
              className="inline-flex items-center rounded-md bg-white px-5 py-3 font-semibold text-primary-600 shadow-sm transition hover:bg-gray-100"
            >
              {props.ctaLabel}
            </a>
          )}
        </section>
      );
    case 'button':
      return (
        <a
          href={props.href || '#'}
          className="inline-flex items-center rounded-md bg-primary-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-700"
        >
          {props.label || ''}
        </a>
      );
    case 'video': {
      const src = props.src || props.embedUrl;
      if (!src) return null;
      return (
        <div className="my-8 overflow-hidden rounded-2xl shadow-lg">
          <iframe
            src={src}
            title={props.title || 'Embedded video'}
            className="h-full w-full aspect-video"
            allowFullScreen
            loading="lazy"
          />
        </div>
      );
    }
    case 'embed':
      return (
        <div className="my-6" dangerouslySetInnerHTML={{ __html: props.html || '' }} />
      );
    case 'divider':
      return <hr className="my-10 border-gray-200" />;
    default:
      return renderChildren(block.children);
  }
};

export default function BlockRenderer({ blocks }: BlockRendererProps) {
  const nodes = ensureArray(blocks);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="block-renderer space-y-10">
      {nodes.map((block) => (
        <div key={block.id} className="block-renderer-node">
          {renderBlock(block)}
        </div>
      ))}
    </div>
  );
}
