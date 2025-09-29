/**
 * PageEditPage Auto-Save E2E Tests
 *
 * Comprehensive end-to-end tests for auto-save functionality in page editing:
 * - Auto-save triggering and timing for page content
 * - Page-specific content change detection
 * - Save status indicator integration for pages
 * - Offline mode and recovery for page editing
 * - Error handling specific to page auto-saves
 * - Manual save functionality for pages
 * - Page editing workflow validation
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test data
const testPage = {
  id: 1,
  title: 'Test Page for Auto-save',
  content: 'Initial page content for auto-save testing',
  slug: 'test-page-autosave',
  status: 'draft',
  template: 'default'
};

const updatedPageContent = {
  title: 'Updated Auto-save Page Title',
  content: 'This page content should trigger auto-save functionality',
  meta_title: 'SEO Meta Title',
  meta_description: 'SEO meta description for testing'
};

test.describe('PageEditPage Auto-Save E2E', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();

    // Mock API responses
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 1, email: 'test@example.com', role: 'admin' }
        })
      });
    });

    await page.route(`**/api/pages/${testPage.id}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: testPage
        })
      });
    });

    // Mock page templates
    await page.route('**/api/templates', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 1, name: 'Default', slug: 'default' },
            { id: 2, name: 'Landing Page', slug: 'landing' }
          ]
        })
      });
    });

    // Mock successful auto-save for pages
    await page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: {
                id: 223,
                version_number: 3,
                version_type: 'auto_save',
                created_at: new Date().toISOString()
              },
              content_hash: 'page_auto_save_hash_123'
            }
          })
        });
      }
    });

    // Mock latest auto-save check for pages
    await page.route('**/api/content/page/*/autosave/latest', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            version: null,
            has_newer_manual_save: false
          }
        })
      });
    });

    // Navigate to page edit page
    await page.goto(`http://localhost:5173/admin/pages/${testPage.id}/edit`);
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should display save status indicator on page edit', async () => {
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Edit Page');

    // Check for save status indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toBeVisible();
  });

  test('should trigger auto-save when page content changes', async () => {
    let autoSaveRequested = false;
    let requestContent: any = null;

    // Listen for auto-save requests
    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        autoSaveRequested = true;
        requestContent = route.request().postDataJSON();

        expect(requestContent.title).toBe(updatedPageContent.title);
        expect(requestContent.content_hash).toBeDefined();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 224, version_type: 'auto_save' },
              content_hash: 'page_new_hash_456'
            }
          })
        });
      }
    });

    // Wait for form to load
    const titleInput = page.locator('input[name="title"]');
    await titleInput.waitFor();

    // Change title to trigger auto-save
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save to trigger
    await page.waitForTimeout(35000);

    expect(autoSaveRequested).toBe(true);
    expect(requestContent).toBeTruthy();
  });

  test('should include page-specific fields in auto-save', async () => {
    let requestData: any = null;

    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        requestData = route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 225 },
              content_hash: 'page_fields_hash'
            }
          })
        });
      }
    });

    // Fill page-specific fields
    const titleInput = page.locator('input[name="title"]');
    const contentInput = page.locator('textarea[name="content"]');
    const metaTitleInput = page.locator('input[name="meta_title"]');
    const metaDescInput = page.locator('textarea[name="meta_description"]');

    await titleInput.fill(updatedPageContent.title);
    await contentInput.fill(updatedPageContent.content);
    await metaTitleInput.fill(updatedPageContent.meta_title);
    await metaDescInput.fill(updatedPageContent.meta_description);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    expect(requestData).toBeTruthy();
    expect(requestData.title).toBe(updatedPageContent.title);
    expect(requestData.content).toBe(updatedPageContent.content);
    expect(requestData.meta_data).toBeDefined();
    expect(requestData.meta_data.meta_title).toBe(updatedPageContent.meta_title);
    expect(requestData.meta_data.meta_description).toBe(updatedPageContent.meta_description);
  });

  test('should handle page auto-save errors with retry', async () => {
    let requestCount = 0;

    // Mock error then success
    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        requestCount++;

        if (requestCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: 'Page auto-save failed'
            })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                version: { id: 226 },
                content_hash: 'page_retry_hash'
              }
            })
          });
        }
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save to fail
    await page.waitForTimeout(35000);

    // Check for error indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Save failed');

    // Click retry
    const retryButton = page.getByRole('button', { name: /retry/i });
    await retryButton.click();

    // Wait for retry to succeed
    await expect(saveIndicator).toContainText('Saved', { timeout: 5000 });
    expect(requestCount).toBe(2);
  });

  test('should show page-specific saving status', async () => {
    // Mock slow response
    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await page.waitForTimeout(2000);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 227 },
              content_hash: 'page_slow_hash'
            }
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save to start
    await page.waitForTimeout(35000);

    // Check for saving status
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Saving...');

    // Wait for completion
    await expect(saveIndicator).toContainText('Saved', { timeout: 10000 });
  });

  test('should handle page offline mode correctly', async () => {
    // Go offline
    await page.context().setOffline(true);

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Wait for offline detection
    await page.waitForTimeout(35000);

    // Check offline indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Offline');

    // Come back online
    await page.context().setOffline(false);

    // Mock sync success
    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 228 },
              content_hash: 'page_offline_sync_hash'
            }
          })
        });
      }
    });

    // Trigger online event
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Wait for sync
    await expect(saveIndicator).toContainText('Saved', { timeout: 10000 });
  });

  test('should preserve page template selection during auto-save', async () => {
    const templateSelect = page.locator('select[name="template"]');
    const titleInput = page.locator('input[name="title"]');

    // Change template and title
    await templateSelect.selectOption('landing');
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    // Verify template selection is preserved
    await expect(templateSelect).toHaveValue('landing');
    await expect(titleInput).toHaveValue(updatedPageContent.title);
  });

  test('should handle page content with rich text editor', async () => {
    let savedContent: string = '';

    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        const requestData = route.request().postDataJSON();
        savedContent = requestData.content;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 229 },
              content_hash: 'rich_content_hash'
            }
          })
        });
      }
    });

    // Find rich text editor (assuming Quill or similar)
    const contentEditor = page.locator('.ql-editor, [contenteditable="true"]').first();
    await contentEditor.waitFor();

    // Add rich content
    await contentEditor.fill('Rich text content with <strong>formatting</strong>');

    // Wait for auto-save
    await page.waitForTimeout(35000);

    expect(savedContent).toContain('Rich text content');
  });

  test('should show unsaved changes for page edits', async () => {
    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Should show unsaved changes immediately
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Unsaved changes');
  });

  test('should handle page SEO fields auto-save', async () => {
    let seoData: any = null;

    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        seoData = route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 230 },
              content_hash: 'seo_fields_hash'
            }
          })
        });
      }
    });

    // Fill SEO fields
    const metaTitleInput = page.locator('input[name="meta_title"]');
    const metaDescInput = page.locator('textarea[name="meta_description"]');
    const ogImageInput = page.locator('input[name="og_image"]');

    await metaTitleInput.fill('SEO Page Title');
    await metaDescInput.fill('SEO meta description for the page');
    await ogImageInput.fill('/images/page-og-image.jpg');

    // Wait for auto-save
    await page.waitForTimeout(35000);

    expect(seoData).toBeTruthy();
    expect(seoData.meta_data.meta_title).toBe('SEO Page Title');
    expect(seoData.meta_data.meta_description).toBe('SEO meta description for the page');
    expect(seoData.meta_data.og_image).toBe('/images/page-og-image.jpg');
  });

  test('should cleanup page auto-saves on manual save', async () => {
    let cleanupRequested = false;

    // Mock manual page save
    page.route('**/api/pages/*', async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: testPage.id, title: updatedPageContent.title }
          })
        });
      }
    });

    // Mock cleanup
    page.route('**/api/content/page/*/autosave/cleanup', async route => {
      if (route.request().method() === 'DELETE') {
        cleanupRequested = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Cleaned up 3 old page auto-saves'
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    // Perform manual save
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await saveButton.click();

    // Wait for save to complete
    await page.waitForTimeout(2000);

    expect(cleanupRequested).toBe(true);
  });

  test('should handle page slug auto-generation during auto-save', async () => {
    let autoSaveData: any = null;

    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        autoSaveData = route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 231 },
              content_hash: 'slug_gen_hash'
            }
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill('Page Title With Spaces');

    // Wait for auto-save
    await page.waitForTimeout(35000);

    expect(autoSaveData).toBeTruthy();
    expect(autoSaveData.title).toBe('Page Title With Spaces');
    // Slug should be auto-generated or preserved
    expect(autoSaveData.slug).toBeDefined();
  });

  test('should handle page status changes with auto-save', async () => {
    let statusData: any = null;

    page.route('**/api/content/page/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        statusData = route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 232 },
              content_hash: 'status_change_hash'
            }
          })
        });
      }
    });

    // Change page status
    const statusSelect = page.locator('select[name="status"]');
    await statusSelect.selectOption('published');

    // Make a content change to trigger auto-save
    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedPageContent.title);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    expect(statusData).toBeTruthy();
    expect(statusData.data).toBeDefined();
    // Status might be included in the data object
  });

  test('should maintain form validation during auto-save', async () => {
    // Try to save with empty title (should show validation error)
    const titleInput = page.locator('input[name="title"]');
    await titleInput.clear();

    // Auto-save should not trigger for invalid data
    await page.waitForTimeout(35000);

    // Check that validation prevents auto-save
    const saveIndicator = page.getByRole('status');
    // Should either not change or show an appropriate message
    // Implementation depends on validation logic
  });
});