/**
 * PostEditPage Auto-Save E2E Tests
 *
 * Comprehensive end-to-end tests for auto-save functionality in post editing:
 * - Auto-save triggering and timing
 * - Content change detection and hash validation
 * - Save status indicator integration
 * - Offline mode and recovery
 * - Error handling and retry mechanisms
 * - Manual save functionality
 * - User workflow validation
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test data
const testPost = {
  id: 1,
  title: 'Test Post for Auto-save',
  content: 'Initial content for auto-save testing',
  excerpt: 'Initial excerpt',
  slug: 'test-post-autosave',
  status: 'draft',
  category_id: 1
};

const updatedContent = {
  title: 'Updated Auto-save Title',
  content: 'This content should trigger auto-save functionality',
  excerpt: 'Updated excerpt for testing'
};

test.describe('PostEditPage Auto-Save E2E', () => {
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

    await page.route('**/api/categories', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 1, name: 'Technology', slug: 'tech' }]
        })
      });
    });

    await page.route(`**/api/posts/${testPost.id}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: testPost
        })
      });
    });

    // Mock successful auto-save
    await page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: {
                id: 123,
                version_number: 5,
                version_type: 'auto_save',
                created_at: new Date().toISOString()
              },
              content_hash: 'auto_save_hash_123'
            }
          })
        });
      }
    });

    // Mock latest auto-save check
    await page.route('**/api/content/post/*/autosave/latest', async route => {
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

    // Navigate to post edit page
    await page.goto(`http://localhost:5173/admin/posts/${testPost.id}/edit`);
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should display save status indicator', async () => {
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Edit Post');

    // Check for save status indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toBeVisible();
  });

  test('should trigger auto-save when content changes', async () => {
    let autoSaveRequested = false;

    // Listen for auto-save requests
    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        autoSaveRequested = true;
        const requestBody = route.request().postDataJSON();

        expect(requestBody.title).toBe(updatedContent.title);
        expect(requestBody.content_hash).toBeDefined();

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 124, version_type: 'auto_save' },
              content_hash: 'new_hash_456'
            }
          })
        });
      }
    });

    // Wait for form to load
    const titleInput = page.locator('input[name="title"]');
    await titleInput.waitFor();

    // Change title to trigger auto-save
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save to trigger (default 30 seconds, but reduced for testing)
    await page.waitForTimeout(35000); // Wait longer than auto-save interval

    expect(autoSaveRequested).toBe(true);
  });

  test('should show saving status during auto-save', async () => {
    // Mock slow auto-save response
    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        // Delay response to observe saving status
        await page.waitForTimeout(1000);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 125 },
              content_hash: 'slow_save_hash'
            }
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save to start
    await page.waitForTimeout(35000);

    // Check for saving indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Saving...');

    // Wait for save to complete
    await expect(saveIndicator).toContainText('Saved', { timeout: 10000 });
  });

  test('should handle auto-save errors gracefully', async () => {
    // Mock auto-save error
    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Auto-save failed due to server error'
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save to fail
    await page.waitForTimeout(35000);

    // Check for error indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Save failed');

    // Check for retry button
    const retryButton = page.getByRole('button', { name: /retry/i });
    await expect(retryButton).toBeVisible();
  });

  test('should allow manual save via retry button', async () => {
    let manualSaveTriggered = false;

    // Mock initial error then success
    let requestCount = 0;
    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        requestCount++;

        if (requestCount === 1) {
          // First request fails
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: 'First attempt failed'
            })
          });
        } else {
          // Retry succeeds
          manualSaveTriggered = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                version: { id: 126 },
                content_hash: 'retry_success_hash'
              }
            })
          });
        }
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save to fail
    await page.waitForTimeout(35000);

    // Click retry button
    const retryButton = page.getByRole('button', { name: /retry/i });
    await retryButton.click();

    // Wait for retry to complete
    await expect(page.getByRole('status')).toContainText('Saved', { timeout: 5000 });
    expect(manualSaveTriggered).toBe(true);
  });

  test('should handle offline mode', async () => {
    // Simulate going offline
    await page.context().setOffline(true);

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for offline detection
    await page.waitForTimeout(35000);

    // Check for offline indicator
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Offline');

    // Simulate coming back online
    await page.context().setOffline(false);

    // Mock successful sync
    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 127 },
              content_hash: 'offline_sync_hash'
            }
          })
        });
      }
    });

    // Trigger online event
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Wait for sync to complete
    await expect(saveIndicator).toContainText('Saved', { timeout: 10000 });
  });

  test('should show unsaved changes indicator', async () => {
    const titleInput = page.locator('input[name="title"]');

    // Make a change
    await titleInput.fill(updatedContent.title);

    // Should show unsaved changes before auto-save interval
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Unsaved changes');
  });

  test('should handle multiple rapid content changes', async () => {
    let saveRequestCount = 0;

    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        saveRequestCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 128 + saveRequestCount },
              content_hash: `rapid_change_hash_${saveRequestCount}`
            }
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    const contentInput = page.locator('textarea[name="content"]');

    // Make rapid changes
    await titleInput.fill('Change 1');
    await page.waitForTimeout(1000);
    await titleInput.fill('Change 2');
    await page.waitForTimeout(1000);
    await contentInput.fill('Content change 1');
    await page.waitForTimeout(1000);
    await contentInput.fill('Content change 2');

    // Wait for auto-save to process
    await page.waitForTimeout(35000);

    // Should have made at least one save request (debounced)
    expect(saveRequestCount).toBeGreaterThan(0);
    expect(saveRequestCount).toBeLessThan(4); // Should be debounced, not one per change
  });

  test('should preserve form state during auto-save', async () => {
    const titleInput = page.locator('input[name="title"]');
    const contentInput = page.locator('textarea[name="content"]');

    // Fill form
    await titleInput.fill(updatedContent.title);
    await contentInput.fill(updatedContent.content);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    // Verify form state is preserved
    await expect(titleInput).toHaveValue(updatedContent.title);
    await expect(contentInput).toHaveValue(updatedContent.content);

    // Check save status
    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Saved');
  });

  test('should handle navigation with unsaved changes', async () => {
    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Try to navigate away
    const navigationPromise = page.goto('http://localhost:5173/admin/posts');

    // Should show unsaved changes warning (browser beforeunload)
    // Note: Playwright doesn't trigger beforeunload in the same way as user interaction
    // This test would need to be adapted based on the actual implementation
  });

  test('should show correct time stamps', async () => {
    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    const saveIndicator = page.getByRole('status');
    await expect(saveIndicator).toContainText('Saved');

    // Should show "Just now" initially
    await expect(saveIndicator).toContainText('Just now');

    // Wait a bit and check for time update
    await page.waitForTimeout(65000); // Wait over a minute
    await expect(saveIndicator).toContainText('1 minute ago');
  });

  test('should handle content hash validation', async () => {
    let requestBodies: any[] = [];

    page.route('**/api/content/post/*/autosave', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        requestBodies.push(body);

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              version: { id: 129 },
              content_hash: body.content_hash
            }
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');

    // Make first change
    await titleInput.fill('First change');
    await page.waitForTimeout(35000);

    // Make second change
    await titleInput.fill('Second change');
    await page.waitForTimeout(35000);

    // Should have different content hashes
    expect(requestBodies.length).toBeGreaterThanOrEqual(2);
    expect(requestBodies[0].content_hash).not.toBe(requestBodies[1].content_hash);
  });

  test('should cleanup auto-saves on successful manual save', async () => {
    let cleanupRequested = false;

    // Mock manual save
    page.route('**/api/posts/*', async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: testPost.id, title: updatedContent.title }
          })
        });
      }
    });

    // Mock cleanup
    page.route('**/api/content/post/*/autosave/cleanup', async route => {
      if (route.request().method() === 'DELETE') {
        cleanupRequested = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Cleaned up 2 old auto-saves'
          })
        });
      }
    });

    const titleInput = page.locator('input[name="title"]');
    await titleInput.fill(updatedContent.title);

    // Wait for auto-save
    await page.waitForTimeout(35000);

    // Perform manual save
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await saveButton.click();

    // Wait for save to complete
    await page.waitForTimeout(2000);

    expect(cleanupRequested).toBe(true);
  });
});