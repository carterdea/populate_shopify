import { faker } from "@faker-js/faker";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const { SHOP, TOKEN } = process.env;

if (!SHOP || !TOKEN) {
	console.error(
		"Missing required environment variables. Check your .env file.",
	);
	console.error("Required: SHOP, TOKEN");
	process.exit(1);
}

const GRAPHQL_ENDPOINT = `https://${SHOP}/admin/api/2025-04/graphql.json`;

const PRODUCT_CREATE_MUTATION = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_CREATE_MEDIA_MUTATION = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        id
        ... on MediaImage {
          image {
            url
          }
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

const GET_PUBLICATIONS_QUERY = `
  query getPublications {
    publications(first: 10) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

let onlineStorePublicationId = null;

async function getOnlineStorePublicationId() {
	if (onlineStorePublicationId) return onlineStorePublicationId;

	try {
		const response = await axios.post(
			GRAPHQL_ENDPOINT,
			{ query: GET_PUBLICATIONS_QUERY },
			{
				headers: {
					"X-Shopify-Access-Token": TOKEN,
					"Content-Type": "application/json",
				},
			},
		);

		const publications = response.data.data.publications.edges;
		const onlineStore = publications.find(
			(pub) => pub.node.name === "Online Store",
		);

		if (onlineStore) {
			onlineStorePublicationId = onlineStore.node.id;
			console.log(`📱 Found Online Store publication ID: ${onlineStorePublicationId}`);
		}

		return onlineStorePublicationId;
	} catch (error) {
		console.error("Failed to get publication ID:", error.response?.data || error.message);
		return null;
	}
}

function generateProductData(_index, includeTestTag = true, publicationId = null) {
	const title = faker.commerce.productName();
	const description = faker.commerce.productDescription();
	const vendor = faker.company.name();
	const productType = faker.commerce.department();

	// Generate random tags and always include test_product by default
	const randomTags = faker.helpers.arrayElements(
		["New", "Featured", "Limited", "Sale"],
		2,
	);
	const tags = includeTestTag ? [...randomTags, "test_product"] : randomTags;

	const productData = {
		title,
		descriptionHtml: `<p>${description}</p>`,
		vendor,
		productType,
		tags,
		status: "ACTIVE",
	};

	// Add publication if we have the ID
	if (publicationId) {
		productData.productPublications = [
			{
				publicationId,
				publishDate: new Date().toISOString(),
			},
		];
	}

	return productData;
}

async function addImageToProduct(productId, imageUrl, title) {
	console.log(`🖼️  Adding image: ${imageUrl}`);
	try {
		const response = await axios.post(
			GRAPHQL_ENDPOINT,
			{
				query: PRODUCT_CREATE_MEDIA_MUTATION,
				variables: {
					productId,
					media: [
						{
							originalSource: imageUrl,
							alt: title,
							mediaContentType: "IMAGE",
						},
					],
				},
			},
			{
				headers: {
					"X-Shopify-Access-Token": TOKEN,
					"Content-Type": "application/json",
				},
			},
		);

		const { data, errors } = response.data;

		if (errors) {
			console.error(`❌ GraphQL errors adding image:`, errors);
			return false;
		}

		if (data.productCreateMedia.mediaUserErrors.length > 0) {
			console.error(`❌ Media user errors:`, data.productCreateMedia.mediaUserErrors);
			return false;
		}

		console.log(`✅ Image added successfully`);
		return true;
	} catch (error) {
		console.error(`❌ Failed to add image:`, error.response?.data || error.message);
		return false;
	}
}

async function createProduct(index, includeTestTag = true) {
	// Get Online Store publication ID (cached after first call)
	const publicationId = await getOnlineStorePublicationId();
	
	const productData = generateProductData(index, includeTestTag, publicationId);
	const { title } = productData;

	// Generate image URL using picsum.photos with seed for consistency
	const seed = faker.string.alphanumeric(8);
	const imageUrl = `https://picsum.photos/seed/${seed}/400/400.jpg`;

	try {
		// Create the product first
		const response = await axios.post(
			GRAPHQL_ENDPOINT,
			{
				query: PRODUCT_CREATE_MUTATION,
				variables: {
					input: productData,
				},
			},
			{
				headers: {
					"X-Shopify-Access-Token": TOKEN,
					"Content-Type": "application/json",
				},
			},
		);

		const { data, errors } = response.data;

		if (errors) {
			console.error(`GraphQL errors for product ${index}:`, errors);
			return false;
		}

		if (data.productCreate.userErrors.length > 0) {
			console.error(
				`User errors for product ${index}:`,
				data.productCreate.userErrors,
			);
			return false;
		}

		const productId = data.productCreate.product.id;

		// Add image to the product
		const imageAdded = await addImageToProduct(productId, imageUrl, title);
		
		if (imageAdded) {
			console.log(`✅ Created: ${title} with image (${index}/${total})`);
		} else {
			console.log(`✅ Created: ${title} but image failed (${index}/${total})`);
		}
		return true;
	} catch (error) {
		console.error(
			`❌ Failed to create product ${index}:`,
			error.response?.data || error.message,
		);
		return false;
	}
}

async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parse command line arguments
const args = process.argv.slice(2);
const includeTestTag = !args.includes("--no-test-tag");
const total = parseInt(args.find((arg) => !arg.startsWith("--"))) || 100;

if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: node generate.js [count] [options]

Arguments:
  count                 Number of products to generate (default: 100)

Options:
  --no-test-tag        Don't add 'test_product' tag for easy cleanup
  --help, -h           Show this help message

Examples:
  node generate.js                  # Generate 100 products with test_product tag
  node generate.js 50               # Generate 50 products with test_product tag
  node generate.js 200 --no-test-tag   # Generate 200 products without test_product tag
`);
	process.exit(0);
}

if (total <= 0 || !Number.isInteger(total)) {
	console.error("Product count must be a positive integer");
	process.exit(1);
}

console.log(`🚀 Starting generation of ${total} products...`);
console.log(`📍 Store: ${SHOP}`);
console.log(`🔑 Using GraphQL Admin API`);
console.log(`🏷️  Test tag: ${includeTestTag ? "included" : "disabled"}`);
console.log("─".repeat(50));

let successCount = 0;
let failureCount = 0;

(async () => {
	const startTime = Date.now();

	for (let i = 1; i <= total; i++) {
		const success = await createProduct(i, includeTestTag);

		if (success) {
			successCount++;
		} else {
			failureCount++;
		}

		// Rate limiting: GraphQL allows up to 1000 cost units per minute
		// ProductCreate mutation costs ~10 units, so we can do ~100 per minute
		// Adding 600ms delay to be safe (allows ~100 per minute)
		if (i < total) {
			await delay(600);
		}
	}

	const endTime = Date.now();
	const duration = Math.round((endTime - startTime) / 1000);

	console.log("─".repeat(50));
	console.log(`✅ Completed in ${duration}s`);
	console.log(`📊 Success: ${successCount}, Failed: ${failureCount}`);

	if (failureCount > 0) {
		console.log(
			`⚠️  ${failureCount} products failed to create. Check errors above.`,
		);
	}
})();
