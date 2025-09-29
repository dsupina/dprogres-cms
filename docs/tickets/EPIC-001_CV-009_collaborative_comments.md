# CV-009: Collaborative Comments System

**Epic:** EPIC-001 - Content Versioning & Draft Preview System
**Priority:** Medium
**Status:** TODO

## User Story
As a **content reviewer**, I want to leave comments on specific versions of content, so that I can provide feedback, request changes, and approve content for publishing in a structured way.

## Background
Content review is often a collaborative process involving multiple stakeholders. A commenting system tied to specific versions allows reviewers to provide contextual feedback, track discussions, and maintain a clear audit trail of the review process.

## Requirements

### Functional Requirements
- Add comments to specific versions
- Reply to create comment threads
- Mention other users with @notation
- Mark comments as resolved
- Filter comments by type (feedback, approval, etc.)
- Email notifications for mentions/replies
- Rich text formatting in comments
- Attach files to comments
- Comment templates for common feedback

### Technical Requirements
- Real-time comment updates
- Markdown support
- User presence indicators
- Efficient threading structure
- Comment versioning
- Search within comments
- Export comment history

## Acceptance Criteria
- [ ] Comments appear instantly when added
- [ ] Threaded replies display correctly
- [ ] @mentions trigger notifications
- [ ] Resolved comments can be hidden
- [ ] Comment types are visually distinct
- [ ] Email notifications sent within 1 minute
- [ ] Markdown renders correctly
- [ ] File attachments upload and display
- [ ] Templates speed up common feedback
- [ ] Search finds comments by content/author

## Implementation Details

### Data Model

**Comment Structure**
```typescript
interface VersionComment {
  id: number;
  versionId: number;
  parentId?: number; // For threading
  authorId: number;
  content: string;
  type: CommentType;
  status: 'active' | 'resolved' | 'deleted';
  attachments: Attachment[];
  mentions: number[]; // User IDs
  reactions: Reaction[];
  editedAt?: Date;
  resolvedBy?: number;
  resolvedAt?: Date;
  createdAt: Date;
}

type CommentType =
  | 'feedback'
  | 'approval'
  | 'rejection'
  | 'question'
  | 'change_request'
  | 'note';
```

### UI Components

**CommentThread Component**
```typescript
interface CommentThreadProps {
  versionId: number;
  comments: VersionComment[];
  currentUser: User;
  onAddComment: (comment: CommentData) => void;
  onResolve: (commentId: number) => void;
  onReply: (parentId: number, content: string) => void;
}
```

**CommentComposer**
- Rich text editor
- @mention autocomplete
- Type selector
- Template dropdown
- File attachment area
- Submit/Cancel buttons

**CommentCard**
```typescript
interface CommentCardProps {
  comment: VersionComment;
  isThreadParent: boolean;
  depth: number;
  onReply: () => void;
  onEdit: () => void;
  onResolve: () => void;
  onReact: (reaction: string) => void;
}
```

### Comment Features

**Mention System**
- `@` triggers user search
- Autocomplete dropdown
- Creates notification on submit
- Links to user profile

**Comment Templates**
```typescript
interface CommentTemplate {
  name: string;
  type: CommentType;
  content: string;
  category: 'approval' | 'feedback' | 'legal';
}

// Example templates
const templates = [
  {
    name: "Approve with minor changes",
    type: "approval",
    content: "Approved pending the following minor changes:\n- \n- "
  },
  {
    name: "Request source verification",
    type: "change_request",
    content: "Please provide sources for the claims in paragraph..."
  }
];
```

**Notification System**
```typescript
interface CommentNotification {
  type: 'mention' | 'reply' | 'status_change';
  commentId: number;
  versionId: number;
  fromUser: User;
  toUsers: User[];
  message: string;
  link: string;
}
```

### Real-time Updates
- WebSocket connection for live updates
- Presence indicators (who's viewing)
- Typing indicators
- Optimistic UI updates
- Conflict resolution

### Comment Actions

**Bulk Operations**
- Mark all as read
- Resolve all feedback
- Export to PDF/CSV
- Archive old threads

**Search & Filter**
```typescript
interface CommentFilters {
  type?: CommentType[];
  author?: number[];
  status?: ('active' | 'resolved')[];
  dateRange?: { from: Date; to: Date };
  hasAttachments?: boolean;
  searchTerm?: string;
}
```

## Testing Considerations
- Real-time sync testing
- Notification delivery
- Threading logic
- Mention system
- File upload handling
- Performance with many comments

## Documentation Requirements
- Comment etiquette guide
- Template creation guide
- Notification settings
- Keyboard shortcuts

## Dependencies
- CV-003: Version service
- WebSocket infrastructure
- Notification service
- File storage service

## Related Tickets
- CV-010: Email notification templates
- CV-011: Comment activity dashboard
- CV-012: Comment moderation tools