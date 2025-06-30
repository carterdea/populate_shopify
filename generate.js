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

function generateBatchMutation(size) {
	const variables = Array.from({ length: size }, (_, i) => `$input${i}: ProductInput!`).join(',\n    ');
	const mutations = Array.from({ length: size }, (_, i) => `
    product${i}: productCreate(input: $input${i}) {
      product { id title handle }
      userErrors { field message }
    }`).join('');

	return `
  mutation batchProductCreate(
    ${variables}
  ) {${mutations}
  }
`;
}

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
		
		// Track image upload cost (check both headers and extensions)
		const imageCost = parseInt(response.headers['x-graphql-cost-include-fields']) || 
		                 parseInt(response.headers['X-GraphQL-Cost-Include-Fields']) ||
		                 response.data.extensions?.cost?.actualQueryCost || 0;

		if (errors) {
			console.error(`❌ GraphQL errors adding image:`, errors);
			return { success: false, cost: imageCost };
		}

		if (data.productCreateMedia.mediaUserErrors.length > 0) {
			console.error(`❌ Media user errors:`, data.productCreateMedia.mediaUserErrors);
			return { success: false, cost: imageCost };
		}

		return { success: true, cost: imageCost };
	} catch (error) {
		console.error(`❌ Failed to add image:`, error.response?.data || error.message);
		return { success: false, cost: 0 };
	}
}

async function createProductBatch(batchInputs, startIndex) {
	try {
		// Convert array to individual variables
		const variables = {};
		batchInputs.forEach((input, i) => {
			variables[`input${i}`] = input;
		});
		
		const batchMutation = generateBatchMutation(batchInputs.length);
		
		const response = await axios.post(
			GRAPHQL_ENDPOINT,
			{
				query: batchMutation,
				variables,
			},
			{
				headers: {
					"X-Shopify-Access-Token": TOKEN,
					"Content-Type": "application/json",
				},
			},
		);

		const { data, errors } = response.data;
		
		// Extract cost information from response extensions
		const costInfo = {
			requestedCost: response.data.extensions?.cost?.requestedQueryCost || 0,
			actualCost: response.data.extensions?.cost?.actualQueryCost || 0,
			maxAvailable: response.data.extensions?.cost?.throttleStatus?.maximumAvailable || 0,
			currentlyAvailable: response.data.extensions?.cost?.throttleStatus?.currentlyAvailable || 0,
			restoreRate: response.data.extensions?.cost?.throttleStatus?.restoreRate || 0
		};

		if (errors) {
			console.error(`GraphQL errors for batch starting at ${startIndex}:`, errors);
			if (errors.some(e => e.extensions?.code === 'THROTTLED')) {
				console.log(`⚠️  Rate limit hit. Requested: ${costInfo.requestedCost} units, Available: ${costInfo.currentlyAvailable}/${costInfo.maxAvailable}`);
			}
			return [];
		}
		
		console.log(`💰 Batch cost: ${costInfo.requestedCost} units | Available: ${costInfo.currentlyAvailable}/${costInfo.maxAvailable} (restore: ${costInfo.restoreRate}/sec)`);

		const results = [];
		for (let i = 0; i < batchInputs.length; i++) {
			const productData = data[`product${i}`];
			if (productData && productData.userErrors.length === 0) {
				results.push({
					success: true,
					product: productData.product,
					input: batchInputs[i],
					index: startIndex + i,
				});
			} else {
				console.error(`User errors for product ${startIndex + i}:`, productData?.userErrors || "No product data");
				results.push({
					success: false,
					index: startIndex + i,
				});
			}
		}

		return results;
	} catch (error) {
		console.error(
			`❌ Failed to create batch starting at ${startIndex}:`,
			error.response?.data || error.message,
		);
		return batchInputs.map((_, i) => ({ success: false, index: startIndex + i }));
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
const useBatching = args.includes("--batch");

// Parse batch size argument
let batchSize = 10; // default
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
if (batchSizeArg) {
	batchSize = parseInt(batchSizeArg.split("=")[1]);
}

const total = parseInt(args.find((arg) => !arg.startsWith("--"))) || 100;

if (args.includes("--help") || args.includes("-h")) {
	console.log(`
Usage: node generate.js [count] [options]

Arguments:
  count                 Number of products to generate (default: 100)

Options:
  --no-test-tag        Don't add 'test_product' tag for easy cleanup
  --batch              Use batch processing for faster creation
  --batch-size=N       Set batch size when using --batch (default: 10, max: 100)
  --help, -h           Show this help message

Examples:
  node generate.js                      # Generate 100 products with test_product tag
  node generate.js 50                   # Generate 50 products with test_product tag
  node generate.js 200 --no-test-tag       # Generate 200 products without test_product tag
  node generate.js 500 --batch             # Generate 500 products using batch processing (size 10)
  node generate.js 1000 --batch --batch-size=25  # Generate 1000 products in batches of 25
`);
	process.exit(0);
}

if (total <= 0 || !Number.isInteger(total)) {
	console.error("Product count must be a positive integer");
	process.exit(1);
}

// Validate batch size
if (useBatching) {
	if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
		console.error("Batch size must be an integer between 1 and 100");
		process.exit(1);
	}
}

console.log(`🚀 Starting generation of ${total} products...`);
console.log(`📍 Store: ${SHOP}`);
console.log(`🔑 Using GraphQL Admin API`);
console.log(`🏷️  Test tag: ${includeTestTag ? "included" : "disabled"}`);
if (useBatching) {
	console.log(`⚡ Batching: enabled (size: ${batchSize})`);
} else {
	console.log(`⚡ Batching: disabled`);
}
console.log("─".repeat(50));

let successCount = 0;
let failureCount = 0;

(async () => {
	const startTime = Date.now();

	if (useBatching) {
		// Get Online Store publication ID once for all batches
		const publicationId = await getOnlineStorePublicationId();
		
		for (let i = 1; i <= total; i += batchSize) {
			const currentBatchSize = Math.min(batchSize, total - i + 1);
			const batchInputs = [];
			
			// Generate batch inputs
			for (let j = 0; j < currentBatchSize; j++) {
				batchInputs.push(generateProductData(i + j, includeTestTag, publicationId));
			}
			
			// Create products in batch
			const results = await createProductBatch(batchInputs, i);
			
			// Collect successful products and prepare images
			const imageJobs = [];
			for (const result of results) {
				if (result.success) {
					const seed = faker.string.alphanumeric(8);
					const imageUrl = `https://picsum.photos/seed/${seed}/400/400.jpg`;
					imageJobs.push({
						productId: result.product.id,
						imageUrl,
						title: result.product.title,
						index: result.index
					});
					successCount++;
				} else {
					failureCount++;
				}
			}
			
			// Upload all images concurrently for this batch
			if (imageJobs.length > 0) {
				console.log(`🖼️  Uploading ${imageJobs.length} images concurrently...`);
				const imageResults = await Promise.allSettled(
					imageJobs.map(job => addImageToProduct(job.productId, job.imageUrl, job.title))
				);
				
				// Calculate total image costs
				let totalImageCost = 0;
				let imageSuccessCount = 0;
				
				imageJobs.forEach((job, idx) => {
					const result = imageResults[idx];
					const imageData = result.status === 'fulfilled' ? result.value : { success: false, cost: 0 };
					
					totalImageCost += imageData.cost || 0;
					
					if (imageData.success) {
						imageSuccessCount++;
						console.log(`✅ Batch created: ${job.title} with image (${job.index}/${total})`);
					} else {
						console.log(`✅ Batch created: ${job.title} but image failed (${job.index}/${total})`);
					}
				});
				
				console.log(`💰 Image batch cost: ${totalImageCost} units (${imageSuccessCount}/${imageJobs.length} successful)`);
			}
			
			// No delay needed - GraphQL rate limit is per minute, not per second
		}
	} else {
		// Sequential processing
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
