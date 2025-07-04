# Shopify Product Populator

Tool for generating thousands of unique fake products in Shopify development stores using Node.js, Faker.js, and Shopify GraphQL Admin API.

## Prerequisites

- Shopify Partner development store
- Node.js ≥ 18
- Admin API access token from custom app

## Setup

### 1. Create Custom App in Shopify

1. Go to your dev store Admin
2. Navigate to **Apps → App and sales channel settings**
3. Click **Develop apps → Create app**
4. Enable **Admin API access** with permissions:
   - `write_products`
   - `read_products`
5. Install app and copy **Admin API access token**

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create `.env` file:

```env
SHOP=your-dev-store.myshopify.com
TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
```

## Usage

Generate products:

```bash
# Generate 100 products (default) with test_product tag
node generate.js

# Generate specific number of products with test_product tag
node generate.js 500

# Generate products without test_product tag for cleanup
node generate.js 200 --no-test-tag

# Show help
node generate.js --help
```

Default: 100 unique products with realistic data including names, descriptions, prices, vendors, tags, and images. All products include a `test_product` tag by default for easy cleanup.

## Rate Limiting

The tool automatically respects Shopify's GraphQL rate limits, which vary by plan:

### Recommended Batch Sizes by Plan

| Shopify Plan | Monthly Cost | Rate Limit | Recommended `--batch-size` |
|--------------|--------------|------------|----------------------------|
| **Basic** | $39/month | 1000 points/minute | 30-40 products |
| **Shopify** | $105/month | 1000 points/minute | 30-40 products |
| **Advanced** | $399/month | 2000 points/minute | 50-65 products |
| **Development Store** | Free (Partner) | 2000 points/minute | 50-65 products |
| **Shopify Plus** | $2,300+/month | 10,000+ points/minute | 100+ products |

### How It Works
- Each product creation costs ~10 points
- Each image upload costs ~21 points  
- Total: ~31 points per complete product
- The tool displays real-time rate limit consumption and remaining capacity

### Usage Examples
```bash
# For Basic/Shopify plans
node generate.js 200 --batch --batch-size=35

# For Advanced plans  
node generate.js 500 --batch --batch-size=60

# For Shopify Plus
node generate.js 1000 --batch --batch-size=100
```

## Product Uniqueness

Each product has:
- Unique faker-generated names and descriptions
- Random UUID-seeded images
- Unique alphanumeric SKUs
- Randomized vendors and product types

## Cleanup

Products are tagged with `test_product` for easy bulk deletion via Shopify Admin or API.

## Development Store Only

**Warning**: Only use on development stores. Never run on live stores.