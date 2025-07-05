export interface User {
  id: number;
  email: string;
  password_hash?: string;
  oauth_provider?: string;
  oauth_id?: string;
  role: string;
  first_name?: string;
  last_name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  seo_indexed: boolean;
  created_at: Date;
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
  scheduled_at?: Date;
  view_count: number;
  featured: boolean;
  created_at: Date;
  updated_at: Date;
  category?: Category;
  author?: User;
  tags?: Tag[];
}

export interface Page {
  id: number;
  title: string;
  slug: string;
  content?: string;
  template?: string;
  meta_title?: string;
  meta_description?: string;
  seo_indexed: boolean;
  published: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
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
  created_at: Date;
  uploader?: User;
}

export interface SiteSetting {
  key: string;
  value: string;
  updated_at: Date;
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
  scheduled_at?: Date;
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
  scheduled_at?: Date;
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