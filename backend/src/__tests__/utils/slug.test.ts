import { generateSlug, generateUniqueSlug } from '../../utils/slug';

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    it('should generate slug from title', () => {
      const title = 'This is a Test Title';
      const slug = generateSlug(title);
      expect(slug).toBe('this-is-a-test-title');
    });

    it('should handle special characters', () => {
      const title = 'Special & Characters! @#$%';
      const slug = generateSlug(title);
      expect(slug).toBe('special-and-characters-dollarpercent');
    });

    it('should handle numbers', () => {
      const title = 'Title with 123 Numbers';
      const slug = generateSlug(title);
      expect(slug).toBe('title-with-123-numbers');
    });

    it('should handle multiple spaces', () => {
      const title = 'Title   with    multiple    spaces';
      const slug = generateSlug(title);
      expect(slug).toBe('title-with-multiple-spaces');
    });

    it('should handle empty string', () => {
      const slug = generateSlug('');
      expect(slug).toBe('');
    });

    it('should handle unicode characters', () => {
      const title = 'Café & Résumé';
      const slug = generateSlug(title);
      expect(slug).toBe('cafe-and-resume');
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return original slug if not taken', () => {
      const title = 'Unique Title';
      const existingSlugs: string[] = [];
      const slug = generateUniqueSlug(title, existingSlugs);
      expect(slug).toBe('unique-title');
    });

    it('should append number if slug exists', () => {
      const title = 'Duplicate Title';
      const existingSlugs = ['duplicate-title'];
      const slug = generateUniqueSlug(title, existingSlugs);
      expect(slug).toBe('duplicate-title-1');
    });

    it('should find next available number', () => {
      const title = 'Popular Title';
      const existingSlugs = ['popular-title', 'popular-title-1', 'popular-title-2'];
      const slug = generateUniqueSlug(title, existingSlugs);
      expect(slug).toBe('popular-title-3');
    });

    it('should handle empty existing slugs array', () => {
      const title = 'New Title';
      const slug = generateUniqueSlug(title, []);
      expect(slug).toBe('new-title');
    });

    it('should handle case variations', () => {
      const title = 'Case Title';
      const existingSlugs = ['CASE-TITLE', 'case-title'];
      const slug = generateUniqueSlug(title, existingSlugs);
      expect(slug).toBe('case-title-1');
    });
  });
}); 