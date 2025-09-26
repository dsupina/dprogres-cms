import { siteService } from '../../services/siteService';
import { pool } from '../../utils/database';
import { clearSiteCache, clearSiteCacheEntry } from '../../middleware/siteResolver';

jest.mock('../../utils/database');
jest.mock('../../middleware/siteResolver', () => ({
  clearSiteCache: jest.fn(),
  clearSiteCacheEntry: jest.fn(),
}));

describe('Site Service', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    (pool.query as jest.Mock).mockClear();
    mockClient.query.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllSites', () => {
    it('should return all sites', async () => {
      const mockSites = [
        { id: 1, domain_id: 1, name: 'Site 1', base_path: '/' },
        { id: 2, domain_id: 1, name: 'Site 2', base_path: '/blog' },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockSites });

      const result = await siteService.getAllSites();

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*, d.hostname'),
        []
      );
      expect(result).toEqual(mockSites);
    });

    it('should filter sites by domain', async () => {
      const mockSites = [
        { id: 1, domain_id: 1, name: 'Site 1', base_path: '/' },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockSites });

      const result = await siteService.getAllSites(1);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.domain_id = $1'),
        [1]
      );
      expect(result).toEqual(mockSites);
    });
  });

  describe('getSiteById', () => {
    it('should return site by ID', async () => {
      const mockSite = { id: 1, domain_id: 1, name: 'Site 1' };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockSite] });

      const result = await siteService.getSiteById(1);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.id = $1'),
        [1]
      );
      expect(result).toEqual(mockSite);
    });

    it('should return null if site not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await siteService.getSiteById(999);

      expect(result).toBeNull();
    });
  });

  describe('createSite', () => {
    it('should create a new site', async () => {
      const newSite = {
        domain_id: 1,
        name: 'New Site',
        base_path: '/new',
      };

      const createdSite = { id: 1, ...newSite };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, hostname: 'example.com' }] }) // Domain check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Site count
        .mockResolvedValueOnce({ rows: [createdSite] }) // Insert
        .mockResolvedValueOnce({}); // COMMIT

      const result = await siteService.createSite(newSite);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sites'),
        expect.arrayContaining([1, 'New Site', '/new'])
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual(createdSite);
      expect(clearSiteCacheEntry).toHaveBeenCalledWith('example.com', '/new');
    });

    it('should make first site default', async () => {
      const newSite = {
        domain_id: 1,
        name: 'First Site',
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, hostname: 'example.com' }] }) // Domain check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Site count - 0 means first site
        .mockResolvedValueOnce({ rows: [{ id: 1, ...newSite, is_default: true }] }) // Insert
        .mockResolvedValueOnce({}); // COMMIT

      const result = await siteService.createSite(newSite);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sites'),
        expect.arrayContaining([1, 'First Site', '/', expect.any(String), expect.any(String), true])
      );
    });

    it('should throw error if domain not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Domain not found
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        siteService.createSite({ domain_id: 999, name: 'Test' })
      ).rejects.toThrow('Domain not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('updateSite', () => {
    it('should update site', async () => {
      const updates = { name: 'Updated Site', is_active: false };
      const currentSite = {
        id: 1,
        domain_id: 1,
        hostname: 'example.com',
        base_path: '/',
      };
      const updatedSite = { ...currentSite, ...updates };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [currentSite] }) // Get current site
        .mockResolvedValueOnce({ rows: [updatedSite] }) // Update
        .mockResolvedValueOnce({}); // COMMIT

      const result = await siteService.updateSite(1, updates);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sites SET'),
        expect.arrayContaining(['Updated Site', false, 1])
      );
      expect(result).toEqual(updatedSite);
      expect(clearSiteCacheEntry).toHaveBeenCalledWith('example.com', '/');
    });

    it('should unset other defaults when setting as default', async () => {
      const updates = { is_default: true };
      const currentSite = {
        id: 2,
        domain_id: 1,
        hostname: 'example.com',
        base_path: '/blog',
        is_default: false,
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [currentSite] }) // Get current site
        .mockResolvedValueOnce({ rows: [] }) // Unset other defaults
        .mockResolvedValueOnce({ rows: [{ ...currentSite, is_default: true }] }) // Update
        .mockResolvedValueOnce({}); // COMMIT

      await siteService.updateSite(2, updates);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE sites SET is_default = false WHERE domain_id = $1 AND id != $2',
        [1, 2]
      );
    });

    it('should return null if site not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Site not found

      const result = await siteService.updateSite(999, { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('deleteSite', () => {
    it('should delete site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ base_path: '/', hostname: 'example.com' }] }) // Get site info
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Site count - more than 1
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Delete
        .mockResolvedValueOnce({}); // COMMIT

      const result = await siteService.deleteSite(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM sites WHERE id = $1 RETURNING id',
        [1]
      );
      expect(result).toBe(true);
      expect(clearSiteCacheEntry).toHaveBeenCalledWith('example.com', '/');
    });

    it('should prevent deleting last site', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ base_path: '/', hostname: 'example.com' }] }) // Get site info
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Only 1 site
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(siteService.deleteSite(1)).rejects.toThrow(
        'Cannot delete the last site for a domain'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should return false if site not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Site not found

      const result = await siteService.deleteSite(999);

      expect(result).toBe(false);
    });
  });

  describe('resolveSiteByHostAndPath', () => {
    it('should resolve site by host and path', async () => {
      const mockSite = { id: 1, name: 'Blog Site', base_path: '/blog' };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockSite] });

      const result = await siteService.resolveSiteByHostAndPath('example.com', '/blog/post');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE d.hostname = $1 AND s.base_path = $2'),
        ['example.com', '/blog']
      );
      expect(result).toEqual(mockSite);
    });

    it('should fall back to root path', async () => {
      const mockSite = { id: 1, name: 'Main Site', base_path: '/' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No site for /unknown
        .mockResolvedValueOnce({ rows: [mockSite] }); // Root site

      const result = await siteService.resolveSiteByHostAndPath('example.com', '/unknown/path');

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockSite);
    });

    it('should fall back to default site', async () => {
      const mockDefaultSite = { id: 1, name: 'Default', base_path: '/', is_default: true };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No site for path
        .mockResolvedValueOnce({ rows: [] }) // No root site
        .mockResolvedValueOnce({ rows: [mockDefaultSite] }); // Default site

      const result = await siteService.resolveSiteByHostAndPath('example.com', '/test');

      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockDefaultSite);
    });

    it('should return null if no site found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await siteService.resolveSiteByHostAndPath('unknown.com', '/');

      expect(result).toBeNull();
    });
  });
});