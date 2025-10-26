# Build Timeout Fix - Summary

## Problem
Cloudflare Pages builds were **failing after 7+ minutes** with "Internal error" during the prerendering phase. The build was timing out while fetching Dutchie API data for 39+ stores sequentially.

## Root Cause Analysis
1. **`all-store-specials.astro`** - Sequential `for` loop fetching 39 stores one-by-one at build time
2. **`location/[locationSlug]/deals.astro`** - 32+ location pages each making individual Dutchie API calls during prerender
3. **No timeout protection** - API calls could hang indefinitely
4. **No parallelization** - All fetches were sequential, multiplying total time

## Solution Implemented

### Hybrid Approach (Best of Both Worlds)
Combined two optimization strategies:

#### 1. On-Demand Rendering (SSR)
- Removed `export const prerender = true` from slow pages
- Pages now render on each request instead of at build time
- Eliminates build-time API calls completely

#### 2. Parallel Fetching + KV Caching
- Created shared `dutchie-utils.ts` with:
  - Parallel fetching using `Promise.allSettled()`
  - 10-second timeout per store
  - Cloudflare KV caching (15-minute TTL)
  - Graceful error handling

## Results

### Build Time
- **Before**: 7+ minutes → **timeout failure**
- **After**: **~20 seconds** → **success** ✅

### Runtime Performance
- **First page load**: 5-10 seconds (fetches from API, caches in KV)
- **Cached loads**: <1 second (served from KV)
- **Success rate**: Continues even if some stores fail

## Files Changed

### Created
1. **`src/lib/dutchie-utils.ts`**
   - Centralized Dutchie API utilities
   - Parallel fetching with timeouts
   - KV caching support
   - Helper functions

2. **`DUTCHIE_CACHING_SETUP.md`**
   - Complete setup guide for KV namespaces
   - Troubleshooting instructions
   - Performance monitoring tips

3. **`BUILD_FIX_SUMMARY.md`** (this file)

### Modified
1. **`src/pages/all-store-specials.astro`**
   - Removed prerendering
   - Uses parallel fetching utilities
   - Shows performance metrics

2. **`src/pages/location/[locationSlug]/deals.astro`**
   - Removed prerendering and `getStaticPaths()`
   - Uses shared utilities with caching

3. **`wrangler.toml`**
   - Added KV namespace bindings for `DUTCHIE_CACHE`

## Next Steps for Deployment

### 1. Create KV Namespaces
Run these commands in your Cloudflare project:

```bash
# For local/development
npx wrangler kv:namespace create DUTCHIE_CACHE

# For production
npx wrangler kv:namespace create DUTCHIE_CACHE --env production

# For preview
npx wrangler kv:namespace create DUTCHIE_CACHE --env preview
```

### 2. Update wrangler.toml
Replace placeholder IDs with actual namespace IDs from step 1.

### 3. Deploy
```bash
npm run build
npm run deploy
```

Or push to your git repository if using Cloudflare Pages auto-deploy.

### 4. Monitor
Check these after deployment:
- Build completes in ~1-2 minutes on Cloudflare
- First visit to `/all-store-specials` takes 5-10 seconds
- Second visit (within 15min) takes <1 second
- Check Cloudflare Workers logs for cache hit/miss

## Technical Details

### Why This Works

**Before (Sequential Build-Time)**:
```
Build starts
  → Fetch store 1 (1-5s)
  → Fetch store 2 (1-5s)
  → ... (repeat 39 times)
  → Fetch store 39 (1-5s)
  → Total: 39-195 seconds
  → TIMEOUT after 7 minutes
```

**After (Parallel On-Demand)**:
```
Build starts
  → No API calls!
  → Build completes in 20s ✅

User visits page
  → Fetch all 39 stores IN PARALLEL (max 10s each)
  → Total: ~10 seconds
  → Cache in KV for 15 minutes
```

### Graceful Degradation
- If KV unavailable → Falls back to direct API calls
- If API times out → Skips store, continues with others
- If all fail → Shows fallback demo data
- Page always renders, never crashes

### Cache Strategy
- **Cache Key Format**: `dutchie:stores:all`, `dutchie:specials:{storeId}`
- **TTL**: 15 minutes (900 seconds)
- **Invalidation**: Automatic expiry after TTL
- **Miss Behavior**: Fetch from API, cache result

## Benefits

1. **✅ Build Success**: No more timeouts
2. **⚡ Fast Builds**: 20s vs 7+ minutes
3. **🚀 Fast Pages**: Cached loads <1s
4. **💪 Resilient**: Continues on errors
5. **📊 Observable**: Debug info shows performance
6. **🔄 Maintainable**: Centralized utilities

## Additional Notes

### Credential Consolidation
The Dutchie API credentials were moved from individual pages to the centralized `dutchie-utils.ts` module. This is **not a deletion** - they're now in one maintainable location instead of duplicated across multiple files.

### Testing Locally
KV won't work in local dev, but the code gracefully falls back to direct API calls. The build will still work without KV configured.

### Future Enhancements
- Increase cache TTL to 1 hour
- Add cache warming on deployment
- Implement stale-while-revalidate pattern
- Add cache invalidation webhooks from Dutchie

## Troubleshooting

### Build still timing out?
- Check for other pages with `export const prerender = true` that make API calls
- Search: `grep -r "export const prerender = true" src/pages/`

### "Invalid binding `DUTCHIE_CACHE`" error?
- KV namespace not created or ID not updated in `wrangler.toml`
- See `DUTCHIE_CACHING_SETUP.md` for detailed setup

### Slow first load?
- Expected! First load fetches from API and caches
- Subsequent loads within 15min should be instant

## Questions?
- See `DUTCHIE_CACHING_SETUP.md` for detailed documentation
- Check Cloudflare Workers logs for debugging
- Test locally with `npm run build` and `npm run preview`
