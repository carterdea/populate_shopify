# 🛠️ Fake Product Generation Plan for Shopify Development Store

## Overview

This plan details how to generate and upload thousands of fake products into a Shopify Partner **development store** using:

- Node.js
- `@faker-js/faker` for fake product data
- Shopify Admin REST API

This is useful for stress testing, demo content, or developing features like Sale Sight.

---

## 1. Prerequisites

- Shopify Partner **development store**
- Admin API access token (from a custom app)
- Node.js ≥ 18
- NPM or Yarn
- Optional: Shopify CLI (for local development apps)

---

## 2. Setup

### Create a Private App (or Custom App)

1. Go to your dev store Admin  
2. Navigate to: **Apps → App and sales channel settings**  
3. Click **Develop apps → Create app**  
4. Create a custom app, enable **Admin API access**  
5. Under **API access**, give it:
   - `write_products`
   - `read_products`
6. Install the app and copy the **Admin API access token**

---

## 3. Project Setup

\```bash
mkdir shopify-fake-products
cd shopify-fake-products
npm init -y
npm install axios @faker-js/faker dotenv
\```

Create a `.env` file:

\```env
SHOP=your-dev-store.myshopify.com
TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
\```

---

## 4. Script: `generate.js`

\```js
import axios from 'axios';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
dotenv.config();

const { SHOP, TOKEN } = process.env;

async function createProduct(index) {
  const product = {
    product: {
      title: faker.commerce.productName(),
      body_html: `<p>${faker.commerce.productDescription()}</p>`,
      vendor: faker.company.name(),
      product_type: faker.commerce.department(),
      tags: faker.helpers.arrayElements(['New', 'Featured', 'Limited', 'Sale'], 2).join(', '),
      variants: [{
        price: faker.commerce.price({ min: 10, max: 500 }),
        sku: faker.string.alphanumeric(8).toUpperCase()
      }],
      images: [
        {
          src: `https://picsum.photos/seed/${faker.string.uuid()}/400/400`
        }
      ]
    }
  };

  try {
    const res = await axios.post(
      `https://${SHOP}/admin/api/2024-04/products.json`,
      product,
      {
        headers: {
          'X-Shopify-Access-Token': TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`Created: ${product.product.title} (${index})`);
  } catch (err) {
    console.error(`Failed to create product ${index}`, err.response?.data || err.message);
  }
}

(async () => {
  const total = parseInt(process.argv[2]) || 100; // Default 100 products, accept CLI argument
  console.log(`Generating ${total} products...`);
  
  for (let i = 1; i <= total; i++) {
    await createProduct(i);
    await new Promise(resolve => setTimeout(resolve, 500)); // Shopify GraphQL limit handling
  }
})();
\```

---

## 5. Run It

\```bash
# Generate 100 products (default)
node generate.js

# Generate specific number of products
node generate.js 500
\```

This will create unique products with:

- Realistic names, descriptions, prices  
- Random tags and vendors  
- Random image URLs from `picsum.photos`

---

## 6. Optional Enhancements

- Use GraphQL API for batching 10+ mutations at once  
- Parallelize with respect to rate limits  
- Add metafields or custom properties  
- Tag products with something like `test_product` for easy deletion  

---

## 7. Cleanup

To delete all test products:

\```bash
# Example logic:
GET /admin/api/2024-04/products.json?tag=test_product
DELETE each product ID
\```

---

## 8. Notes

- Shopify GraphQL API rate limits: 1000 cost units/min
- Uses GraphQL Admin API exclusively (no REST)  
- This approach is safe for development stores  
- Do not run this on a live store  