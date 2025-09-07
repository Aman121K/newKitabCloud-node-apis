# Admin API Pagination Guide

## Overview
All listing endpoints in the admin section now support pagination, search, and sorting functionality. This provides better performance and user experience when dealing with large datasets.

## Features Added

### 1. Pagination
- **Page-based navigation**: Navigate through results using page numbers
- **Configurable page size**: Control how many items are returned per page
- **Total count**: Get information about total items and pages

### 2. Search
- **Multi-field search**: Search across multiple relevant fields
- **Case-insensitive**: Search is case-insensitive
- **Partial matching**: Uses LIKE queries for flexible matching

### 3. Sorting
- **Custom sort fields**: Sort by any field in the table
- **Sort direction**: Ascending (ASC) or Descending (DESC) order
- **Default sorting**: Defaults to `created_at DESC`

## API Parameters

### Query Parameters
All paginated endpoints accept the following query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (minimum: 1) |
| `limit` | number | 10 | Items per page (minimum: 1, maximum: 100) |
| `search` | string | '' | Search term for filtering results |
| `sortBy` | string | 'created_at' | Field to sort by |
| `sortOrder` | string | 'DESC' | Sort direction ('ASC' or 'DESC') |

### Example Requests

```bash
# Basic pagination
GET /admin/users?page=1&limit=20

# Search with pagination
GET /admin/books?search=javascript&page=1&limit=15

# Sort by name ascending
GET /admin/authors?sortBy=name&sortOrder=ASC&page=1&limit=10

# Combined parameters
GET /admin/books?search=react&sortBy=title&sortOrder=ASC&page=2&limit=25
```

## Response Format

All paginated endpoints return data in the following format:

```json
{
  "success": true,
  "data": [
    // Array of items for current page
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 47,
    "itemsPerPage": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Indicates if the request was successful |
| `data` | array | Array of items for the current page |
| `pagination.currentPage` | number | Current page number |
| `pagination.totalPages` | number | Total number of pages |
| `pagination.totalItems` | number | Total number of items across all pages |
| `pagination.itemsPerPage` | number | Number of items per page |
| `pagination.hasNextPage` | boolean | Whether there's a next page |
| `pagination.hasPrevPage` | boolean | Whether there's a previous page |

## Updated Endpoints

### Admin Routes (`/admin/`)
- `GET /admin/categories` - Categories with search on name, color
- `GET /admin/users` - Users with search on name, email, phone, country, role
- `GET /admin/authors` - Authors with search on name, email, phone, about
- `GET /admin/languages` - Languages with search on name, code, native_name
- `GET /admin/tags` - Tags with search on name, description, color
- `GET /admin/publishers` - Publishers with search on name, about, address
- `GET /admin/readers` - Readers with search on name, email, phone, about
- `GET /admin/books` - Books with search on title, description, author, reader, publisher, category, language
- `GET /admin/videos` - Videos with search on title, book_name, description, category, sub_category

### Admin Extended Routes (`/admin/`)
- `GET /admin/podcasts` - Podcasts with search on name, description, author, reader, category
- `GET /admin/sub-categories` - Sub-categories with search on name, description, category
- `GET /admin/notifications` - Notifications with search on title, message, type
- `GET /admin/roles` - Roles with search on name, description
- `GET /admin/permissions` - Permissions with search on name, description
- `GET /admin/coming-soon-books` - Coming soon books with search on title, description, author, category, language
- `GET /admin/advertisements` - Advertisements with search on title, description, url, position
- `GET /admin/episodes` - Episodes with search on title, description, podcast, author

## Search Fields by Endpoint

### Categories
- `category_name`
- `category_color`

### Users
- `full_name`
- `email`
- `phone`
- `country`
- `role`

### Authors
- `name`
- `email`
- `phone`
- `about`

### Books
- `b.title`
- `b.description`
- `a.name` (author name)
- `r.name` (reader name)
- `p.name` (publisher name)
- `c.category_name`
- `l.name` (language name)

### And many more...

## Performance Considerations

1. **Database Indexing**: Ensure proper indexes on searchable fields for optimal performance
2. **Page Size Limits**: Maximum 100 items per page to prevent performance issues
3. **Search Optimization**: Search queries use LIKE with wildcards, consider full-text search for better performance on large datasets

## Error Handling

If invalid parameters are provided:
- Invalid page numbers default to 1
- Invalid limits are clamped between 1 and 100
- Invalid sort orders default to 'DESC'
- Invalid sort fields may cause database errors (ensure valid field names)

## Migration Notes

- **Backward Compatibility**: All endpoints maintain backward compatibility
- **Default Behavior**: Without parameters, endpoints return first 10 items sorted by created_at DESC
- **No Breaking Changes**: Existing API consumers will continue to work without modification

## Example Frontend Implementation

```javascript
// Fetch paginated data
const fetchUsers = async (page = 1, limit = 10, search = '', sortBy = 'created_at', sortOrder = 'DESC') => {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(search && { search }),
    sortBy,
    sortOrder
  });
  
  const response = await fetch(`/admin/users?${params}`);
  const result = await response.json();
  
  return result;
};

// Usage
const users = await fetchUsers(1, 20, 'john', 'name', 'ASC');
console.log(users.data); // Array of users
console.log(users.pagination); // Pagination info
```

This pagination system provides a robust, scalable solution for handling large datasets in your admin interface while maintaining excellent user experience and performance.
