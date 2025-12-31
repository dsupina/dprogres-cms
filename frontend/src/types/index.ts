export interface User {
  id: number;
  email: string;
  role: string;
  is_super_admin?: boolean;
  first_name?: string;
  last_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  seo_indexed: boolean;
  created_at: string;
  post_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  featured_image?: string;
  status: 'draft' | 'published' | 'scheduled';
  category_id?: number;
  author_id: number;
  meta_title?: string;
  meta_description?: string;
  seo_indexed: boolean;
  scheduled_at?: string;
  view_count: number;
  featured: boolean;
  created_at: string;
  updated_at: string;
  category_name?: string;
  category_slug?: string;
  first_name?: string;
  last_name?: string;
  author_email?: string;
  tags?: Tag[];
}

export interface Page {
  id: number;
  title: string;
  slug: string;
  content?: string;
  excerpt?: string;
  featured_image?: string;
  template?: string;
  meta_title?: string;
  meta_description?: string;
  seo_indexed: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
  first_name?: string;
  last_name?: string;
  author_email?: string;
  data?: any;
}

export interface MediaFile {
  id: number;
  filename: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  alt_text?: string;
  uploaded_by: number;
  created_at: string;
  first_name?: string;
  last_name?: string;
  uploader_email?: string;
}

export interface SiteSetting {
  key: string;
  value: string;
  updated_at: string;
}

export interface CreatePostData {
  title: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  featured_image?: string;
  status?: 'draft' | 'published' | 'scheduled';
  category_id?: number;
  meta_title?: string;
  meta_description?: string;
  seo_indexed?: boolean;
  scheduled_at?: string;
  featured?: boolean;
  tags?: string[];
}

export interface UpdatePostData {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  featured_image?: string;
  status?: 'draft' | 'published' | 'scheduled';
  category_id?: number;
  meta_title?: string;
  meta_description?: string;
  seo_indexed?: boolean;
  scheduled_at?: string;
  featured?: boolean;
  tags?: string[];
}

export interface CreateCategoryData {
  name: string;
  slug?: string;
  description?: string;
  seo_indexed?: boolean;
}

export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string;
  seo_indexed?: boolean;
}

export interface CreatePageData {
  title: string;
  slug?: string;
  content?: string;
  template?: string;
  meta_title?: string;
  meta_description?: string;
  seo_indexed?: boolean;
  published?: boolean;
  data?: any;
}

export interface UpdatePageData {
  title?: string;
  slug?: string;
  content?: string;
  template?: string;
  meta_title?: string;
  meta_description?: string;
  seo_indexed?: boolean;
  published?: boolean;
  data?: any;
}

export interface PublishingTarget {
  id: number;
  name: string;
  channel: string;
  credentials: Record<string, any>;
  default_payload: Record<string, any>;
  is_active: boolean;
  rate_limit_per_hour?: number | null;
  created_at: string;
  updated_at: string;
}

export interface PublishingSchedule {
  id: number;
  post_id: number;
  target_id: number;
  scheduled_for: string;
  status: 'pending' | 'queued' | 'sent' | 'failed' | 'cancelled' | 'retrying';
  options?: Record<string, any> | null;
  dispatch_payload?: Record<string, any> | null;
  dispatched_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  post_title?: string;
  target_name?: string;
  target_channel?: string;
}

export interface DistributionLog {
  id: number;
  schedule_id?: number | null;
  post_id: number;
  target_id: number;
  status: 'queued' | 'sent' | 'failed' | 'retrying' | 'cancelled';
  payload?: Record<string, any> | null;
  response?: Record<string, any> | null;
  error?: string | null;
  feedback?: Record<string, any> | null;
  retry_count: number;
  next_retry_at?: string | null;
  alert_sent: boolean;
  created_at: string;
  updated_at: string;
  post_title?: string;
  target_name?: string;
  target_channel?: string;
}

export interface DistributionMetrics {
  channelPerformance: Array<{
    channel: string;
    sent: number;
    failed: number;
    queued: number;
    retrying: number;
  }>;
  upcomingSchedules: PublishingSchedule[];
  recentDeliveries: DistributionLog[];
  alerts: DistributionLog[];
}

export interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  tag?: string;
  status?: string;
  featured?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  posts?: Post[];
  post?: Post;
  relatedPosts?: Post[];
  categories?: Category[];
  category?: Category;
  pages?: Page[];
  page?: Page;
  mediaFiles?: MediaFile[];
  mediaFile?: MediaFile;
  user?: User;
  token?: string;
  pagination?: PaginationMeta;
  total?: number;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface UpdateProfileData {
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
} 