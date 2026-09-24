# Automotive Marketplace API

> Production-ready RESTful API for an Automotive Marketplace where sellers list vehicles and buyers browse, filter, and search listings with high performance. Built with **Node.js (Express)**, **MySQL 8.0** using **Raw SQL** (No ORM), Materialized Path for hierarchical categories, and Cursor-based pagination.

---

##  Table of Contents
- [Tech Stack](#-tech-stack)
- [Key Features](#-key-features)
- [Architectural Decisions & Schema Rationale](#-architectural-decisions--schema-rationale)
  - [1. Hierarchical Category Tree (Materialized Path)](#1-hierarchical-category-tree-materialized-path)
  - [2. Dynamic Attributes (Entity-Attribute-Value Pattern)](#2-dynamic-attributes-entity-attribute-value-pattern)
  - [3. Indexing Strategy](#3-indexing-strategy)
  - [4. Cursor-based vs Offset Pagination](#4-cursor-based-vs-offset-pagination)
  - [5. Full-Text & Faceted Search](#5-full-text--faceted-search)
- [Database Schema & ERD](#-database-schema--erd)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Setup](#local-setup)
  - [Docker Setup](#docker-setup)
- [Environment Variables](#-environment-variables)
- [Database Seeding](#-database-seeding)
- [API Documentation](#-api-documentation)
- [Deployment](#-deployment)

---

## 🛠 Tech Stack

| Component | Technology | Rationale / Notes |
| :--- | :--- | :--- |
| **Runtime & Framework** | Node.js (Express.js) | Lightweight, non-blocking I/O, fast JSON serialization |
| **Database** | MySQL 8.0 (InnoDB) | ACID-compliant relational DB with native `FULLTEXT` and JSON support |
| **ORM Policy** | **Raw SQL Only (`mysql2/promise`)** | Zero ORM overhead, full control over query execution plan and indexing |
| **Caching (Bonus)** | Redis (ioredis) | Read-through caching for facets & suggestions with graceful fallback |
| **Containerization** | Docker & Docker Compose | Consistent multi-container development and production environment |
| **API Client & Docs** | Bruno & Swagger UI | Git-friendly offline collection (`/bruno`) + Web interactive UI (`/api-docs`) |

---

## 🚀 Key Features

- **Hierarchical Categories**: Arbitrary-depth category tree (e.g. *Cars > SUV > 7-Seater*) with single-query subtree traversal.
- **Dynamic Category Attributes**: Category-specific attributes (e.g. *Fuel Delivery* under Cars, *Sunroof* under SUV) using EAV modeling.
- **Cursor-based Pagination**: High-performance pagination guaranteed $O(1)$ seek time without offset-induced table scans.
- **Dynamic Multi-column Sorting**: Price, Year, Mileage, and Date sorting with stable tie-breaking on ID.
- **Full-Text & Combined Faceted Search**: MySQL `FULLTEXT` index (`MATCH...AGAINST`) combined with multi-filters and dynamic facet counts (`makes`, `fuel_types`, `transmissions`, price/year range).
- **Soft Deletes**: Listings are preserved with `deleted_at` timestamp and status transitions.

---

## 📐 Architectural Decisions & Schema Rationale

### 1. Hierarchical Category Tree (Materialized Path)
To represent vehicle hierarchies (*Cars > SUV > 7-Seater*), we chose the **Materialized Path** pattern over *Adjacency List* and *Closure Table*:
* **Adjacency List** (`parent_id` only) requires slow recursive Common Table Expressions (CTEs) or multiple database roundtrips to retrieve subcategories.
* **Closure Table** requires an extra junction table and overhead on inserts/updates.
* **Materialized Path** stores a path string (e.g., `/1/2/3/` for `Cars > SUV > 7-Seater`):
  ```sql
  SELECT l.* FROM listings l
  JOIN categories c ON l.category_id = c.id
  WHERE c.path LIKE '/1/%' AND l.deleted_at IS NULL AND l.status = 'available';
  ```
  With a B-Tree index on `categories.path`, prefix searches (`LIKE '/1/%'`) are resolved efficiently using an index range scan.

### 2. Dynamic Attributes (Entity-Attribute-Value Pattern)
Vehicles have varying attributes by category (e.g. Motorcycles don't have *Sunroof*; Electric Cars don't have *Fuel Delivery*). Rather than sparse columns on `listings` or unindexed JSON blobs, we implemented an **EAV schema**:
- `category_attributes`: Defines attribute definition, code, data type (`enum`, `number`, `text`, `boolean`), and `is_filterable` flag.
- `attribute_options`: Stores allowed values for `enum` attributes (e.g., *turbo*, *na*).
- `listing_attribute_values`: Strongly typed values per vehicle listing.

### 3. Indexing Strategy
To guarantee fast and consistent response times across 500+ (and scaling to 100k+) records:
1. **Composite Index for Browsing & Pagination**:
   ```sql
   KEY `idx_listings_browse` (`status`, `deleted_at`, `created_at`, `id`)
   ```
   Filters out soft-deleted and non-available listings while satisfying the `ORDER BY created_at DESC, id DESC` without a filesort (`Using index condition`).
2. **Full-Text Search Index**:
   ```sql
   FULLTEXT KEY `ft_listings_search` (`title`, `make`, `model`, `city`)
   ```
   Enables Boolean Mode search (`MATCH(...) AGAINST('toyota*' IN BOOLEAN MODE)`) bypassing expensive `LIKE '%query%'` full table scans.
3. **Foreign Key & Range Indexes**:
   - `category_id`, `make`, `model`, `city`, `price`, `year` have dedicated B-Tree indexes for fast equality and range filtering.

### 4. Cursor-based vs Offset Pagination
Offset pagination (`LIMIT 20 OFFSET 10000`) forces MySQL to scan and discard 10,000 rows, leading to $O(N)$ degradation and data shifting bugs (missing or duplicate items when new rows are inserted).
We implemented **Keyset / Cursor-based Pagination**:
- The cursor is a base64-encoded tuple `{ sortVal, id, sortKey }`.
- When sorting descending: `WHERE (sort_col < sortVal OR (sort_col = sortVal AND id < idVal))`
- Query performance remains constant $O(1)$ regardless of depth.

### 5. Full-Text & Faceted Search
The endpoint `GET /api/listings/search` combines text relevance with faceted filtering:
- Returns matching vehicle listings matching multi-criteria (make, price range, year range, fuel type, transmission, category).
- Concurrently computes aggregation counts for `makes`, `fuel_types`, `transmissions`, and min/max boundaries matching the current search parameters.

### 6. Caching Strategy (Redis & Graceful Fallback)
To accelerate high-frequency read queries and faceted aggregations:
- **Cached Endpoints**:
  - `GET /api/filters` (Global Facets): TTL 120 seconds.
  - `GET /api/filters/:categoryId` (Category Attributes): TTL 300 seconds.
  - `GET /api/listings/search/suggest` (Autocomplete): TTL 60 seconds.
- **Cache Invalidation**: On create, update, or soft-delete (`POST /api/listings`, `PATCH /api/listings/:id`, `DELETE /api/listings/:id`), facet and suggestion cache keys (`filters:*`, `suggest:*`) are automatically purged.
- **Graceful Fallback**: If Redis server is unreachable or offline, the client logs a warning and seamlessly falls back to direct database execution with zero downtime or user impact.

---

## 🗄 Database Schema & ERD

Diagram created using **dbdiagram.io**:
- **Live Interactive ERD Link**: [View on dbdiagram.io](https://dbdiagram.io/d/automotive_marketplace-6ab4d7430f25a52d01f3de14)
- **Exported Schema PDF**: [`automotive_marketplace.pdf`](./automotive_marketplace.pdf)

### Tables Summary:
1. `categories` — Category tree with `path` and `level`.
2. `category_attributes` — Category-specific dynamic filter definitions.
3. `attribute_options` — Predefined choices for `enum` attributes.
4. `listings` — Core vehicle entity (`make`, `model`, `year`, `price`, `status`, etc.).
5. `listing_images` — Image URLs with `is_primary` flag and display order.
6. `listing_attribute_values` — Polymorphic attribute values linked to listings.

---

## 🏁 Getting Started

### Prerequisites
- Node.js >= 18.x
- MySQL >= 8.0
- Docker & Docker Compose *(optional)*

### Local Setup

1. **Clone the repository**:
   ```bash
   git clone <REPO_URL>
   cd "tes API dri"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your MySQL credentials:
   ```env
   PORT=3000
   NODE_ENV=development
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=automotive_marketplace
   ```

4. **Run Database Seeder**:
   Seeds categories, attributes, and 520 realistic car listings:
   ```bash
   npm run seed
   ```

5. **Start the API Server**:
   ```bash
   # Production mode
   npm start

   # Development mode (with nodemon auto-reload)
   npm run dev
   ```
   The server will run on `http://localhost:3000`.

---

### Docker Setup

Run the entire application along with MySQL 8.0 with a single command:

```bash
docker compose up -d --build
```
Once the containers are running, execute the database seeder inside the container:
```bash
docker compose exec app npm run seed
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port for the Express application |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `DB_HOST` | `localhost` | MySQL database host |
| `DB_PORT` | `3306` | MySQL database port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `""` | MySQL user password |
| `DB_NAME` | `automotive_marketplace` | Database name |

---

## 🌱 Database Seeding

The seed script ([`DatabaseSeeders.js`](automotive-marketplace/database/seeders/DatabaseSeeders.js)) populates:
- **4 Hierarchical Categories**: Cars, SUV, 7-Seater, Sedan.
- **Dynamic Category Attributes**: Fuel Delivery (Enum: Turbo, NA), Sunroof (Boolean).
- **520 Realistic Vehicle Listings**: Varied makes (Toyota, Honda, Mitsubishi, Hyundai, BMW), realistic price ranges, mileage, transmission types, fuels, and cities.
- **Associated Images & Attribute Values**.

Run via:
```bash
npm run seed
```

---

## 📖 API Documentation

### Option 1: Interactive Swagger UI (Browser-based)
- **Live Production Docs**: 👉 **[`https://automotive-marketplace-production-75ab.up.railway.app/api-docs`](https://automotive-marketplace-production-75ab.up.railway.app/api-docs)**
- **Local Development**: `http://localhost:3000/api-docs`

Swagger UI provides an interactive web interface where you can inspect schemas, test all endpoints, and execute real queries directly from the browser.

### Option 2: Bruno API Collection (Offline Client)
A complete, ready-to-test **Bruno API Collection** is included in the [`/bruno`](./bruno) directory of this repository:
1. Open the **Bruno** application.
2. Click **Open Collection**.
3. Select the `bruno` folder in the root of this project.
4. All endpoints are categorized with preconfigured params and sample JSON bodies.

### Endpoint Overview:

#### 1. Listings (`/api/listings`)
- `POST /api/listings` — Create a new vehicle listing
- `GET /api/listings` — Browse listings with filters, dynamic sorting + cursor pagination
- `GET /api/listings/:id` — Get single listing detail with images and attributes
- `PATCH /api/listings/:id` — Partial update listing
- `DELETE /api/listings/:id` — Soft-delete listing (`status -> removed`)

#### 2. Search & Filters (`/api/listings/search`, `/api/filters`)
- `GET /api/listings/search` — Full-text + faceted search with combined multi-filters
- `GET /api/listings/search/suggest` — Autocomplete suggestions (make, model, city)
- `GET /api/filters` — Get global filter facets with vehicle counts
- `GET /api/filters/:categoryId` — Get category-specific dynamic filter attributes

#### 3. Categories (`/api/categories`)
- `GET /api/categories` — Get full category tree
- `GET /api/categories/:id` — Get single category with immediate children
- `GET /api/categories/:id/listings` — Browse listings scoped to category + all subcategories
- `POST /api/categories` — Create category node
- `PATCH /api/categories/:id` — Update category

#### 4. Health Check
- `GET /health` — Check service health status

---

## 🌐 Deployment

| Resource | URL |
| :--- | :--- |
| **Live Production API** | [`https://automotive-marketplace-production-75ab.up.railway.app`](https://automotive-marketplace-production-75ab.up.railway.app) |
| **Interactive API Docs (Swagger UI)** | [`https://automotive-marketplace-production-75ab.up.railway.app/api-docs`](https://automotive-marketplace-production-75ab.up.railway.app/api-docs) |
| **Health Check Endpoint** | [`https://automotive-marketplace-production-75ab.up.railway.app/health`](https://automotive-marketplace-production-75ab.up.railway.app/health) |
| **Cloud Hosting Platform** | Railway (Container Runtime + Managed MySQL) |
| **Database Seeding Status** | Seeded with 520 listings, categories & dynamic attributes |

