# Shopify Product Populator - CLAUDE.md

Project-specific coding standards and development guidelines for the Shopify fake product generation tool.

## Project Overview

Node.js tool for populating Shopify development stores with unique fake products using Faker.js and Shopify GraphQL Admin API.

## Critical Requirements

### Rate Limiting
- **ALWAYS** use GraphQL Admin API with 1000 cost units/minute limit
- **ALWAYS** implement batching for bulk mutations when possible
- **ALWAYS** include exponential backoff for 429 responses
- **ALWAYS** monitor query costs and stay within limits
- **NEVER** exceed rate limits or risk API access suspension

### Product Uniqueness
- **ALWAYS** use faker seed values or UUIDs for unique data generation
- **ALWAYS** generate unique SKUs using alphanumeric strings
- **ALWAYS** use UUID-seeded image URLs from picsum.photos
- **NEVER** create products with numbered suffixes like "product-1", "product-2"

### Environment & Security
- **ALWAYS** store API tokens in `.env` files
- **ALWAYS** add `.env` to `.gitignore`
- **ALWAYS** validate environment variables exist before execution
- **NEVER** commit API tokens or store credentials

## Code Standards

### Error Handling
- **ALWAYS** wrap API calls in try/catch blocks
- **ALWAYS** log meaningful error messages with request context
- **ALWAYS** handle Shopify API error responses gracefully
- **ALWAYS** implement retry logic for transient failures

### API Integration
- **ALWAYS** use GraphQL Admin API endpoint (`/admin/api/2024-04/graphql.json`)
- **ALWAYS** include `X-Shopify-Access-Token` header
- **ALWAYS** set `Content-Type: application/json`
- **ALWAYS** use productCreate mutations for bulk operations
- **NEVER** use REST API endpoints

### Data Generation
- **ALWAYS** use `@faker-js/faker` for realistic product data
- **ALWAYS** generate products with varied:
  - Names (`faker.commerce.productName()`)
  - Descriptions (`faker.commerce.productDescription()`)
  - Prices (`faker.commerce.price()`)
  - Vendors (`faker.company.name()`)
  - SKUs (`faker.string.alphanumeric()`)

### Development Store Safety
- **ALWAYS** tag generated products with `test_product` for cleanup
- **ALWAYS** verify working with development store before execution
- **NEVER** run on production Shopify stores
- **ALWAYS** include store environment validation

### Command Line Interface
- **ALWAYS** accept product count as first command line argument
- **ALWAYS** default to 100 products when no argument provided
- **ALWAYS** validate argument is a positive integer
- **ALWAYS** log the number of products to be generated

## File Structure

```
├── generate.js       # Main product generation script
├── .env             # Environment variables (not committed)
├── .env.example     # Example environment file
├── package.json     # Dependencies and scripts
├── README.md        # Setup and usage instructions
└── CLAUDE.md        # This file
```

## Dependencies

- `axios` - HTTP client for Shopify API
- `@faker-js/faker` - Fake data generation
- `dotenv` - Environment variable management

## Testing Approach

- Manual testing against development stores
- Verify rate limiting behavior
- Confirm product uniqueness
- Test cleanup functionality

## Deployment Notes

- Development tool only - no production deployment
- Run locally against Shopify development stores
- Monitor API usage and respect rate limits