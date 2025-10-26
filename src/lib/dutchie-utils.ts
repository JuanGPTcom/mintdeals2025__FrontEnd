// Dutchie API Utilities with timeout, parallel fetching, and Cloudflare KV caching

export const DUTCHIE_API_URL = 'https://plus.dutchie.com/plus/2021-07/graphql';
export const DUTCHIE_API_KEY = 'public-eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJBUEktQ0xJRU5UIiwiZXhwIjozMzI4NzcyNTY2OCwiaWF0IjoxNzMwODE2ODY4LCJpc3MiOiJodHRwczovL2R1dGNoaWUuY29tIiwianRpIjoiNzFmYjcyYjItMThmNy00OWE0LTkwYjgtYjVjMDY0NWZhMjZlIiwiZW50ZXJwcmlzZV9pZCI6IjQ1ODZkZmZkLTVmOTEtNGUxZi04OThhLWJmMjMzMjQ4MzBjMSIsInV1aWQiOiJhNzM4MGE0MC1iMmM5LTQ2ZDktOWY5My1jZTEwM2JjZGM0MjkifQ.XZyCX1ZrNy75e3RcqukMUPffIqxEBnWUZ_o52V4VGco';

// Timeout for individual API calls (10 seconds)
const API_TIMEOUT_MS = 10000;

// Cache TTL - 15 minutes (900 seconds)
const CACHE_TTL_SECONDS = 900;

// GraphQL query to fetch all stores
export const STORES_QUERY = `
  query GetStores {
    retailers {
      id
      name
      address
      phone
    }
  }
`;

// GraphQL query to fetch products on special for a specific store
export const SPECIALS_QUERY = `
  query GetSpecialProducts($retailerId: ID!) {
    menu(retailerId: $retailerId) {
      products {
        id
        name
        brand {
          name
        }
        category
        subcategory
        image
        description
        potencyCbd {
          formatted
        }
        potencyThc {
          formatted
        }
        variants {
          id
          option
          priceRec
          specialPriceRec
          quantity
        }
      }
    }
  }
`;

/**
 * Get KV namespace from Astro.locals (runtime) or undefined (build time)
 */
function getKVNamespace(locals?: any): KVNamespace | undefined {
  return locals?.runtime?.env?.DUTCHIE_CACHE;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Fetch data from Dutchie API with timeout
 */
export async function fetchFromDutchie(query: string, variables: Record<string, any> = {}, timeoutMs: number = API_TIMEOUT_MS) {
  const response = await fetchWithTimeout(
    DUTCHIE_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DUTCHIE_API_KEY}`,
      },
      body: JSON.stringify({ query, variables })
    },
    timeoutMs
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);

  if (data.errors) {
    throw new Error(`GraphQL Error: ${data.errors.map((e: any) => e.message).join(', ')}`);
  }

  return data.data;
}

/**
 * Fetch all Dutchie stores with KV caching
 */
export async function fetchDutchieStores(locals?: any) {
  const kv = getKVNamespace(locals);
  const cacheKey = 'dutchie:stores:all';

  // Try cache first
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json');
      if (cached) {
        console.log('✅ Retrieved stores from cache');
        return cached;
      }
    } catch (error) {
      console.warn('⚠️  Cache read failed:', error);
    }
  }

  // Fetch from API
  try {
    console.log('🚀 Fetching all Dutchie stores from API');
    const data = await fetchFromDutchie(STORES_QUERY, {});
    const stores = data?.retailers || [];
    console.log(`✅ Found ${stores.length} Dutchie stores`);

    // Store in cache
    if (kv && stores.length > 0) {
      try {
        await kv.put(cacheKey, JSON.stringify(stores), {
          expirationTtl: CACHE_TTL_SECONDS
        });
        console.log('💾 Cached stores list');
      } catch (error) {
        console.warn('⚠️  Cache write failed:', error);
      }
    }

    return stores;
  } catch (error) {
    console.error('❌ Error fetching Dutchie stores:', error);
    return [];
  }
}

/**
 * Fetch specials for a single store with timeout and KV caching
 */
export async function fetchStoreSpecials(storeId: string, storeName: string = 'Unknown Store', locals?: any) {
  const kv = getKVNamespace(locals);
  const cacheKey = `dutchie:specials:${storeId}`;

  // Try cache first
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json');
      if (cached) {
        console.log(`✅ Retrieved specials for ${storeName} from cache`);
        return cached;
      }
    } catch (error) {
      console.warn(`⚠️  Cache read failed for ${storeName}:`, error);
    }
  }

  // Fetch from API
  try {
    console.log(`🔍 Fetching specials for ${storeName} (ID: ${storeId}) from API`);

    const specialsData = await fetchFromDutchie(SPECIALS_QUERY, {
      retailerId: storeId
    });

    if (specialsData?.menu?.products) {
      // Filter products that have special prices
      const specialProducts = specialsData.menu.products.filter((product: any) => {
        return product.variants?.some((v: any) => v.specialPriceRec && v.specialPriceRec !== v.priceRec);
      });

      console.log(`✅ Found ${specialProducts.length} special products at ${storeName}`);

      // Store in cache
      if (kv) {
        try {
          await kv.put(cacheKey, JSON.stringify(specialProducts), {
            expirationTtl: CACHE_TTL_SECONDS
          });
          console.log(`💾 Cached specials for ${storeName}`);
        } catch (error) {
          console.warn(`⚠️  Cache write failed for ${storeName}:`, error);
        }
      }

      return specialProducts;
    } else {
      console.log(`📝 No menu data found for ${storeName}`);
      return [];
    }
  } catch (error) {
    console.error(`❌ Error fetching specials for ${storeName}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch specials for multiple stores in parallel
 * Uses Promise.allSettled to continue even if some stores fail
 */
export async function fetchMultipleStoreSpecials(
  stores: Array<{ id: string; name: string; [key: string]: any }>,
  locals?: any
) {
  console.log(`🚀 Fetching specials for ${stores.length} stores in parallel...`);

  const startTime = Date.now();

  // Fetch all stores in parallel using Promise.allSettled
  const results = await Promise.allSettled(
    stores.map(store =>
      fetchStoreSpecials(store.id, store.name, locals)
        .then(products => ({ store, products }))
    )
  );

  // Process results
  const storeSpecials = [];
  const errors = [];
  let totalSpecials = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const store = stores[i];

    if (result.status === 'fulfilled') {
      const { products } = result.value;
      if (products.length > 0) {
        storeSpecials.push({
          store,
          products,
          specialCount: products.length
        });
        totalSpecials += products.length;
      }
    } else {
      console.error(`❌ Failed to fetch specials for ${store.name}:`, result.reason);
      errors.push(`${store.name}: ${result.reason?.message || 'Unknown error'}`);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`🎯 Completed in ${duration}s: ${storeSpecials.length} stores with specials, ${totalSpecials} total products`);
  console.log(`📊 Success rate: ${storeSpecials.length}/${stores.length} stores (${((storeSpecials.length/stores.length)*100).toFixed(1)}%)`);

  if (errors.length > 0) {
    console.warn(`⚠️  ${errors.length} stores had errors but request will continue`);
  }

  return {
    storeSpecials,
    totalSpecials,
    errors,
    duration: parseFloat(duration)
  };
}

/**
 * Fetch specials for stores in batches to avoid overwhelming the API
 */
export async function fetchStoreSpecialsInBatches(
  stores: Array<{ id: string; name: string; [key: string]: any }>,
  batchSize: number = 10,
  locals?: any
) {
  console.log(`🚀 Fetching specials for ${stores.length} stores in batches of ${batchSize}...`);

  const allStoreSpecials = [];
  let totalSpecials = 0;
  const allErrors = [];

  // Process in batches
  for (let i = 0; i < stores.length; i += batchSize) {
    const batch = stores.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(stores.length/batchSize)} (${batch.length} stores)`);

    const { storeSpecials, totalSpecials: batchTotal, errors } = await fetchMultipleStoreSpecials(batch, locals);

    allStoreSpecials.push(...storeSpecials);
    totalSpecials += batchTotal;
    allErrors.push(...errors);
  }

  console.log(`✅ Final results: ${allStoreSpecials.length} stores with specials, ${totalSpecials} total products`);

  return {
    storeSpecials: allStoreSpecials,
    totalSpecials,
    errors: allErrors
  };
}

/**
 * Helper functions for formatting
 */
export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'FLOWER': '🌿',
    'PRE_ROLLS': '🚬',
    'VAPORIZERS': '💨',
    'CONCENTRATES': '🍯',
    'EDIBLES': '🍭',
    'TOPICALS': '🧴',
    'CARTRIDGES': '🖊️',
    'TINCTURES': '💧',
    'ACCESSORIES': '🔧',
    'CBD': '🌱'
  };
  return icons[category] || '🌿';
}

export function calculateDiscount(regular: number, special: number): number {
  if (!regular || !special || special >= regular) return 0;
  return Math.round(((regular - special) / regular) * 100);
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(price / 100);
}
