# Auto-Save Testing Instructions

## Setup Complete
✅ Backend server running on port 5000
✅ Frontend server running on port 5174
✅ Database migration applied (content_hash column added)
✅ Auto-save hooks integrated in PostEditPage and PageEditPage

## Test Steps

1. **Open the application**
   - Navigate to http://localhost:5174
   - Log in to admin panel at http://localhost:5174/admin/login

2. **Test Post Auto-Save**
   - Go to Posts section
   - Edit an existing post or create a new one
   - Look for the SaveStatusIndicator near the Cancel button
   - Make changes to the content
   - Wait 30 seconds (or press Ctrl+S for manual save)
   - Verify the indicator shows:
     - "Saving..." during save
     - "Saved" with timestamp after successful save
     - "Unsaved changes" when you make more edits

3. **Test Page Auto-Save**
   - Go to Pages section
   - Edit an existing page
   - Similar test as above

4. **Test Offline Support**
   - Edit a post/page
   - Disconnect from network
   - Make changes
   - Verify indicator shows "Offline - will sync"
   - Reconnect
   - Verify auto-sync happens

## API Endpoints Created

- `POST /api/content/:contentType/:contentId/autosave` - Create auto-save
- `GET /api/content/:contentType/:contentId/autosave/latest` - Get latest auto-save
- `GET /api/content/:contentType/:contentId/autosave/status` - Check save status
- `DELETE /api/content/:contentType/:contentId/autosave/cleanup` - Clean old auto-saves

## Components Created

- `SaveStatusIndicator` - Visual feedback component
- `useAutoSave` hook - Auto-save logic with offline support
- `autoSaveApi` service - API communication layer

## Database Changes

- Added `content_hash` column to `content_versions` table
- Added index `idx_content_versions_autosave` for performance
- Added index `idx_content_versions_hash` for hash lookups

## Features Implemented

✅ Auto-save every 30 seconds
✅ Manual save with Ctrl+S
✅ Content change detection via SHA-256 hash
✅ Offline support with localStorage fallback
✅ Visual status indicators
✅ Retry logic with exponential backoff
✅ Automatic cleanup of old auto-saves (keeps last 5)