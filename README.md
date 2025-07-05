# Lightweight CMS System

A modern, lightweight Content Management System built with React, Node.js, and PostgreSQL, designed for deployment on AWS Lightsail.

## 🚀 Features

### Frontend (Public Site)
- **Modern React 18** with TypeScript and Vite
- **Responsive Design** with Tailwind CSS
- **Dynamic Home Page** with hero section, featured posts, and newsletter signup
- **Blog System** with full-text search, pagination, and category filtering
- **Individual Post Pages** with social sharing and related posts
- **Category Pages** with filtering and search
- **Static Pages** for About, Contact, etc.
- **SEO Optimized** with dynamic meta tags

### Admin Interface
- **Secure Authentication** with JWT and role-based access control
- **Dashboard** with statistics and quick actions
- **Post Management** with WYSIWYG editor (Quill.js)
- **Category Management** with hierarchical organization
- **Page Management** for static content
- **Media Library** with file upload and management
- **User Management** with role-based permissions

### Backend API
- **RESTful API** with Express.js and TypeScript
- **PostgreSQL Database** with optimized queries
- **JWT Authentication** with refresh tokens
- **File Upload** with validation and storage
- **Input Validation** and sanitization
- **Rate Limiting** and security middleware
- **Comprehensive Error Handling**

## 🏗️ Architecture

### Single Docker Container
- **Multi-stage Docker build** for optimized production image
- **Nginx** as reverse proxy for frontend and API
- **Supervisor** for process management
- **PostgreSQL** database with connection pooling
- **Environment-based configuration**

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, React Query
- **Backend**: Node.js, Express, TypeScript, PostgreSQL
- **Database**: PostgreSQL with optimized indexes
- **Deployment**: Docker, Nginx, Supervisor
- **Authentication**: JWT with role-based access control

## 📦 Installation

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 15+ (for local development)

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd dprogres_site
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Build and run with Docker**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Public site: http://localhost:3000
   - Admin panel: http://localhost:3000/admin

### Local Development Setup

1. **Install dependencies**
   ```bash
   # Backend
   npm install
   
   # Frontend
   cd frontend
   npm install
   cd ..
   ```

2. **Set up the database**
   ```bash
   # Create PostgreSQL database
   createdb cms_db
   
   # Run migrations
   npm run migrate
   
   # Seed initial data
   npm run seed
   ```

3. **Start development servers**
   ```bash
   # Backend (runs on port 5000)
   npm run dev
   
   # Frontend (runs on port 3000)
   cd frontend
   npm run dev
   ```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/cms_db

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Server
PORT=5000
NODE_ENV=production

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760

# Admin User (for initial setup)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User
```

### Database Schema

The system includes comprehensive database migrations with:
- **Users table** with role-based permissions
- **Posts table** with full-text search and SEO fields
- **Categories table** with hierarchical support
- **Pages table** for static content
- **Media table** for file management
- **Optimized indexes** for performance

## 🚀 Deployment

### AWS Lightsail Deployment

1. **Create Lightsail instance**
   - Choose Ubuntu 20.04 LTS
   - Select appropriate instance size
   - Configure networking and storage

2. **Deploy with Docker**
   ```bash
   # On your Lightsail instance
   git clone <repository-url>
   cd dprogres_site
   cp .env.example .env
   # Configure your .env file
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Set up SSL (optional)**
   ```bash
   # Use Let's Encrypt with Certbot
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

### Production Checklist

- [ ] Configure secure JWT secrets
- [ ] Set up PostgreSQL with proper credentials
- [ ] Configure file upload limits
- [ ] Set up SSL certificates
- [ ] Configure domain DNS
- [ ] Set up backup strategy
- [ ] Configure monitoring and logging

## 📝 Usage

### Admin Panel

1. **Login**: Navigate to `/admin` and log in with your admin credentials
2. **Dashboard**: View site statistics and quick actions
3. **Posts**: Create, edit, and manage blog posts with the WYSIWYG editor
4. **Categories**: Organize content with hierarchical categories
5. **Pages**: Create static pages like About, Contact, etc.
6. **Media**: Upload and manage images and files
7. **Settings**: Configure site settings and user management

### Content Management

- **Rich Text Editor**: Full WYSIWYG editing with Quill.js
- **SEO Optimization**: Meta titles, descriptions, and slug management
- **Media Integration**: Drag-and-drop file uploads
- **Preview Mode**: Preview content before publishing
- **Bulk Operations**: Manage multiple posts simultaneously

## 🔒 Security Features

- **JWT Authentication** with secure token handling
- **Role-based Access Control** (Admin, Editor, Author)
- **Input Validation** and sanitization
- **SQL Injection Protection** with parameterized queries
- **XSS Protection** with content sanitization
- **Rate Limiting** to prevent abuse
- **Secure File Upload** with type validation
- **Environment-based Configuration**

## 🎨 Customization

### Styling
- Modify `frontend/src/index.css` for global styles
- Update `frontend/tailwind.config.js` for theme customization
- Create custom components in `frontend/src/components/`

### Features
- Add new API routes in `src/routes/`
- Create new database tables with migrations
- Extend the admin interface with new pages
- Add custom post types or fields

## 🧪 Testing

```bash
# Run backend tests
npm test

# Run frontend tests
cd frontend
npm test

# Run E2E tests
npm run test:e2e
```

## 📊 Performance

- **Optimized Database Queries** with proper indexing
- **Frontend Code Splitting** with Vite
- **Image Optimization** with responsive loading
- **Caching Strategy** for static assets
- **Lazy Loading** for improved performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the [Issues](https://github.com/yourusername/cms/issues) page
- Review the documentation
- Contact the maintainers

## 🎯 Roadmap

- [ ] Multi-language support
- [ ] Advanced SEO tools
- [ ] Email newsletter integration
- [ ] Comment system
- [ ] Analytics dashboard
- [ ] Theme system
- [ ] Plugin architecture
- [ ] API documentation with Swagger

---

Built with ❤️ for modern web development 