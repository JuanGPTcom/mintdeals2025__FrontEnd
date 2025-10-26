# Dutchie API Caching Setup

## Overview

This project uses a hybrid rendering approach to optimize build times and runtime performance:

- **On-Demand Rendering (SSR)**: Deal pages render on each request instead of at build time
- **Parallel Fetching**: Multiple store API calls happen simultaneously with `Promise.allSettled()`
- **Cloudflare KV Caching**: Results are cached for 15 minutes to reduce API calls
- **Timeout Protection**: Each API call has a 10-second timeout to prevent hanging

## What Was Changed

### Before (Sequential Build-Time Rendering)
- `all-store-specials.astro` and `location/[locationSlug]/deals.astro` had `export const prerender = true`
- During build, fetched Dutchie data for 39+ stores sequentially (one after another)
- Build would timeout after 7+ minutes with "Internal error"

### After (Parallel On-Demand Rendering)
- Removed `prerender` from deal pages
- Pages now render on-demand when users visit them
- API calls happen in parallel with timeouts
- Results cached in Cloudflare KV for 15 minutes

## Files Modified

1. **`src/lib/dutchie-utils.ts`** (NEW)
   - Centralized Dutchie API utilities
   - Parallel fetching with `Promise.allSettled()`
   - KV caching support
   - 10-second timeout per store
   - Helper functions (formatPrice, calculateDiscount, etc.)

2. **`src/pages/all-store-specials.astro`**
   - Removed `export const prerender = true`
   - Now uses `fetchMultipleStoreSpecials()` for parallel fetching
   - Displays performance metrics (fetch duration, cache status)

3. **`src/pages/location/[locationSlug]/deals.astro`**
   - Removed `export const prerender = true` and `getStaticPaths()`
   - Now uses `fetchStoreSpecials()` with KV caching

4. **`wrangler.toml`**
   - Added KV namespace binding `DUTCHIE_CACHE`
   - Configured for production and preview environments

## Cloudflare KV Setup

### Step 1: Create KV Namespaces

You need to create KV namespaces in your Cloudflare account. Run these commands:

```bash
# For local development
npx wrangler kv:namespace create DUTCHIE_CACHE

# For production
npx wrangler kv:namespace create DUTCHIE_CACHE --env production

# For preview
npx wrangler kv:namespace create DUTCHIE_CACHE --env preview
```

Each command will output a namespace ID like:
```
{ binding = "DUTCHIE_CACHE", id = "abc123def456..." }
```

### Step 2: Update wrangler.toml

Replace the placeholder IDs in `wrangler.toml` with your actual namespace IDs:

```toml
[[kv_namespaces]]
binding = "DUTCHIE_CACHE"
id = "your-actual-kv-namespace-id"  # Replace this

[[env.production.kv_namespaces]]
binding = "DUTCHIE_CACHE"
id = "your-production-kv-namespace-id"  # Replace this

[[env.preview.kv_namespaces]]
binding = "DUTCHIE_CACHE"
id = "your-preview-kv-namespace-id"  # Replace this
```

### Step 3: Bind KV in Cloudflare Dashboard

If deploying via Cloudflare Pages dashboard:

1. Go to your Pages project
2. Navigate to **Settings** → **Functions**
3. Scroll to **KV Namespace Bindings**
4. Add binding:
   - Variable name: `DUTCHIE_CACHE`
   - KV namespace: Select the namespace you created

## How Caching Works

### Cache Keys
- **Store list**: `dutchie:stores:all`
- **Store specials**: `dutchie:specials:{storeId}`

### Cache TTL
- **15 minutes** (900 seconds)
- After 15 minutes, data is automatically evicted and refetched on next request

### Cache Behavior
1. **First request**: Fetches from Dutchie API, stores in KV
2. **Subsequent requests (within 15min)**: Served from KV cache instantly
3. **After 15min**: Cache expires, next request refetches and re-caches

### Graceful Degradation
- If KV is unavailable, falls back to direct API calls
- If API calls timeout (10s), skips that store and continues
- Errors are logged but don't break the entire page

## Performance Improvements

### Build Time
- **Before**: 7+ minutes, then timeout failure
- **After**: ~1-2 minutes (no Dutchie API calls during build)

### Runtime Performance
- **First load**: ~5-10 seconds (fetches and caches all stores in parallel)
- **Cached load**: <1 second (served from KV)
- **Per-store timeout**: 10 seconds max (prevents hanging)

### Success Rate
- Uses `Promise.allSettled()` to handle failures gracefully
- Even if some stores fail, page still renders with available data
- Displays success rate in debug info

## Monitoring

### Debug Information
The `/all-store-specials` page displays debug info:
- **Rendering Mode**: Shows "On-Demand (SSR)"
- **Fetch Duration**: How long parallel fetching took
- **Cache Status**: Shows if KV caching is active
- **Errors**: Lists any stores that failed to fetch

### Console Logs
Look for these in Cloudflare Workers logs:
- `✅ Retrieved stores from cache` - Cache hit
- `🚀 Fetching all Dutchie stores from API` - Cache miss
- `💾 Cached stores list` - Successfully cached
- `📊 Success rate: X/Y stores` - Parallel fetch results

## Testing

### Local Development
KV won't be available locally, but the code gracefully falls back to direct API calls:

```bash
npm run dev
```

Visit `http://localhost:4321/all-store-specials` - should work but slower without caching.

### Production Testing
After deploying with KV configured:

1. First visit: Check logs for "Fetching from API" messages
2. Second visit (within 15min): Should be much faster, see "Retrieved from cache"
3. Check debug panel on page for cache status

## Troubleshooting

### "Invalid binding `DUTCHIE_CACHE`" error
- KV namespace not created or not bound correctly
- Check wrangler.toml has correct IDs
- Verify binding in Cloudflare dashboard

### Build still timing out
- Check if other pages still have `export const prerender = true`
- Run `npm run build` locally to see which pages cause issues
- Consider removing prerender from more pages

### Slow first load
- Expected behavior - first load fetches from Dutchie API
- Subsequent loads within 15min should be fast
- Increase parallel batch size in `fetchMultipleStoreSpecials()` if needed

### Cache not working
- Check Cloudflare Workers logs for cache read/write errors
- Verify KV namespace has correct permissions
- Try clearing KV namespace: `npx wrangler kv:key delete --binding DUTCHIE_CACHE "dutchie:stores:all"`

## Future Improvements

1. **Longer cache TTL**: Increase from 15min to 1 hour for less volatile data
2. **Cache warming**: Pre-populate cache on deployment
3. **Stale-while-revalidate**: Serve stale cache while fetching fresh data in background
4. **Per-store caching**: Allow different TTLs for different stores
5. **Cache invalidation API**: Webhook to clear cache when Dutchie inventory updates

## Additional Resources

- [Cloudflare KV Docs](https://developers.cloudflare.com/kv/)
- [Astro SSR Docs](https://docs.astro.build/en/guides/server-side-rendering/)
- [Dutchie API Docs](https://dutchie.com/developers)
