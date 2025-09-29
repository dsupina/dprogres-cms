# Modern CMS Platform - Product Requirements Document  
Generated: 2025-09-26 | Updated: 2025-09-26

## Vision Statement  
Build a startup-friendly, SaaS-first headless CMS with best-in-class on-page visual editing, AI-assisted content authoring, scalable content federation, and multi-domain/site management that grows with customers from startup to enterprise.

## Business Context  
- **Target users and their pain points:**  
  - Content creators want immediate visual feedback and intuitive editing without technical friction.  
  - Developers seek extensible, API-first CMS with simplified infrastructure needs.  
  - Businesses require managing multiple domains and complex localization with clean authoring and SEO-safe delivery.  
  - Growing companies need integrated personalization via CDPs without complex AI infra upfront.  
- **Market opportunity and constraints:**  
  - Demand for seamless omnichannel delivery, personalized content, and multi-site management with enterprise compliance readiness.  
  - Constraints: limited early dev resources, need for pragmatic MVP then incremental buildout.  
- **Success metrics and timelines:**  
  - MVP launch within 6 months with core editing, versioning, personalization, and multi-site support.  
  - Validate +8–12% conversion uplift on personalized content within 3 months.  
  - Maintain API p95 latency ≤ 300 ms, 99.9% uptime, publish-to-live p99 ≤ 10 seconds.  
  - Expand to federation, real-time CDP audience sync, edge features, and advanced governance by 12–18 months.

## Technical Architecture  
- **Recommended tech stack:**  
  - Backend monolith (Node.js or Go) with PostgreSQL/JSONB storing versioned content and site/domain data.  
  - React frontend for visual editing with draft preview tokens mapping DOM to backend entries.  
  - AI assistance via multi-LLM router (Google Gemini Flash default, Azure OpenAI mini backup, Cohere batch, Claude premium).  
  - SaaS cloud hosting with phased edge integration: Phase 1 edge flag assignment, later caching and transformation.  
- **Database schema requirements:**  
  - Postgres JSONB for content, multi-tenant sites, locales, domains, pages, slots/components, and entries.  
  - Append-only versioning for localized pages and entries.  
- **Third-party integrations needed:**  
  - CDPs (Segment first, extendable to mParticle, RudderStack) for real-time audience segmentation and personalization.  
  - Localization platforms (Lokalise, Phrase).  
  - Marketing/analytics tools via webhooks and APIs.  
- **Performance and security requirements:**  
  - p95 API latency ≤ 300ms; 99.9% uptime SLA.  
  - OAuth2/JWT auth with RBAC; plan ABAC/OPA in future phases.  
  - GDPR/CCPA support with consent management.  

## Multi-Domain, Sites & Routing

### Summary  
Support multiple domains (e.g., dprogres.hr, dprogres.com) with clean authoring, deterministic routing, and SEO-safe delivery. Authors work at the Site level; each Site owns its domains, locales, navigation, and defaults. Pages are localized per Site/Locale and rendered via a slot-based layout.

### Hierarchy  
Organization → Project → Environment (dev/stage/prod) → Site → Domain(s) → Locale(s) → Page → Slots/Sections → Components → Entries/Assets  
- Site is the pivot for brand/region settings, navigation, SEO defaults, theming, and publishing flows.  
- Domain attaches to exactly one Site within an Environment (primary + aliases).  
- Locale is scoped to a Site (supports fallbacks).  
- Page is route aware, localized, and composed from Components via named Slots.

### Core Objects (Schema Sketch)  
| Object      | Fields                                                                                       | Notes                                   |
|-------------|----------------------------------------------------------------------------------------------|-----------------------------------------|
| Organization| id, name                                                                                     |                                         |
| Project     | id, org_id, name                                                                            |                                         |
| Environment | id, project_id, name                                                                         | e.g., dev, stage, prod                   |
| Site        | id, env_id, name, default_locale, settings_json, seo_defaults_json, theme_tokens_json         |                                         |
| Domain      | id, site_id, host, is_primary, locale_strategy, redirects_json                              | locale_strategy: 'cctld'|'path'|'subdomain' |
| Locale      | site_id, code, fallback_code                                                                | composite key (site_id,code)             |
| Page        | id, site_id, route, layout_id, status, publish_at, expire_at                               | status: draft, scheduled, published      |
| PageLocale  | page_id, locale, seo_json, slots_json                                                      | localized page payload                   |
| Entry       | id, site_id, type, created_by, updated_at                                                 |                                         |
| EntryLocale | entry_id, locale, data_json                                                                 | localized content                        |
| Redirect    | id, site_id, source, destination, status, regex                                            | site-scoped, 301/302 and regex support |
| Navigation  | id, site_id, locale, items_json                                                            | per Site/Locale menus                    |

- Append-only versioning for PageLocale and EntryLocale.

### Routing Algorithm (Deterministic)  
1. **Host → Site:** Resolve Domain.host in environment; alias domains redirect (301) to primary domain.  
2. **Locale Resolution:**  
   - `cctld`: from TLD (e.g., `.hr` → hr-HR).  
   - `path`: first path segment (e.g., `/en/`).  
   - `subdomain`: subdomain prefix (e.g., `en.example.com`).  
3. **Route → Page:** Match site_id + locale + route; fallback locale chain; else 404.  
4. Personalization & variants via edge flags with sticky cookies.  
5. Compose page layout from slots filled by components and entries.

### SEO & Sitemaps  
- One canonical URL per page, emitting correct hreflang.  
- Auto-regenerate Sitemaps per Site and Locale on publish.  
- Redirect rules scoped per Site.

### Localization  
- Localize Pages, Navigation, SEO per Locale with fallback chains.  
- Block fallback on regulated/legal pages (page level flag).

### Theming & Shared Content  
- Site-level theme tokens (colors, typography).  
- Shared localized content referenced by Pages/Components.

### Permissions & Workflow  
- MVP Roles: Org Admin, Project Admin, Editor, Publisher, Viewer (scoped per Site).  
- Workflow: Draft → Review/Approve → Publish; optional scheduled publish/expire.  
- Phase 3: ABAC, OPA, SCIM, SSO.

### Caching & Edge  
- Cache key: `{domain}:{path}:{locale}` for public GETs.  
- Preview bypasses cache using signed tokens.  
- Publish fan-out purges and rehydrates affected paths and sitemaps.  
- Phased rollout:  
  - Phase 1: edge assignment only (flags/A-B), origin renders.  
  - Phase 2: edge cache + webhook revalidation.  
  - Phase 3: selective full-page caching & transforms.

### API Additions (MVP)  
- `GET /v1/sites` , `GET /v1/sites/{id}`  
- `GET /v1/sites/{id}/domains` (CRUD)  
- `GET /v1/sites/{id}/locales` (CRUD)  
- `GET /v1/pages?site_id&locale&route` (resolve route)  
- `POST /v1/pages`, `PUT /v1/pages/{id}` (Page + PageLocale payload)  
- `POST /v1/preview-tokens` → {token, expires_at}  
- `GET /v1/navigation?site_id&locale`  
- `POST /v1/publish` → triggers fan-out + webhooks  
- `GET /v1/sitemaps?site_id&locale`  

### Sample PageLocale Payload (trimmed)  
{
"page_id": "pg_123",
"locale": "hr-HR",
"route": "/o-nama",
"seo": { "title": "O nama", "canonical": "https://dprogres.hr/o-nama" },
"slots": {
"hero": [{ "type": "hero", "props": { "title": "DProgres", "image_id": "asset_1" } }],
"body": [{ "type": "rich_text", "props": { "entry_id": "entry_42" } }]
}
}

text

### Non-Functional (Multi-Domain Impacts)  
| Metric               | Target                        | Note                        |
|----------------------|------------------------------|-----------------------------|
| Host → Site Routing   | ≤ 5 ms p95                   | In-memory map with watch     |
| Publish → Live        | p99 ≤ 10 s (MVP), ≤ 5 s (Ph2)|                             |
| Cache Hit            | ≥ 85% on public GETs (Ph2)   |                             |
| Sitemap Regeneration  | ≤ 30 s after publish          |                             |

### Rollout Plan (Phased)  

| Phase     | Timeline     | Features                                                                                        |
|-----------|--------------|------------------------------------------------------------------------------------------------|
| Phase 1   | 0–6 months   | Sites, Domains, Locales + fallback, Pages, Preview tokens, Basic sitemaps & redirects, Edge assignment (flags/A-B) |
| Phase 2   | 6–12 months  | Edge cache + webhook revalidation, Navigation, Federation-lite fields, CDP audience edge sync, Experiments dashboard |
| Phase 3   | 12–18 months | ABAC/OPA policies, SCIM/SSO, Marketplace plugins, Full-page edge caching & transforms, Data residency options |

### Authoring UX (Key Behaviors)  
- Authors select Site first → filtered content, domains, locales, navigation menus.  
- Page list displays URL preview with primary domain, locale, path, and localized publish status.  
- Global headers/footers editable across Site+Locale scopes; individual pages override when needed.  
- Locale creation prompts content copy and translation status management.

### Defaults Example  
| Site Name           | Primary Domain      | Locales                  | Notes                      |
|---------------------|---------------------|--------------------------|----------------------------|
| DProgres Croatia    | dprogres.hr          | hr-HR (default), hr (fallback) | Locale strategy: cctld     |
| DProgres Global     | dprogres.com         | en-US (default), en-GB   |                            |

- Shared localized Entries referenced across Sites.  
- HTTPS enforced; primary domain canonicalization applied.

### MVP Acceptance Criteria  
- Host+path resolve deterministically to Site, Locale, and Page with canonical URL and hreflang tags.  
- Publishing updates selectively purge caches and regenerate sitemaps only for impacted Site and Locale paths.  
- Preview tokens enable secure on-page editing scoped by Site and Locale without public cache disturbance.  
- Domain aliasing enforces 301 redirects preserving path/query parameters.

---

## Feature Breakdown (Atomic Level)

### Core Features  
- Multi-Domain, Sites & Routing (as detailed).  
- Content Modeling, Visual Editing, AI Assistance, Personalization, Localization, Permissions.

### Nice-to-Have Features  
- Content Federation via proxy/resolver fields.  
- Advanced CDP-driven personalization & audience gating.  
- Plugin marketplace with UI & serverless hooks.  
- Edge caching & signed assets.

## Development Phases  
See rollout plan above.

## Questions to Resolve  
1. LLM providers balancing latency, cost, editorial quality for tagging/summarization?  
2. Best CDP audience APIs for startup real-time integration?  
3. Expand Postgres storage with analytics replicas or warehouse sync safely?  
4. MVP role granularity & workflow design to balance UX and security?  
5. Phased edge feature rollout minimizing system risk?

---