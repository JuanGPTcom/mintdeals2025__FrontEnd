/**
 * Image transformation utilities for Cloudinary URLs
 * Converts images to WebP format for better performance
 */

export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'avif' | 'auto';
  quality?: 'auto' | number;
  crop?: 'fill' | 'fit' | 'scale' | 'crop';
}

/**
 * Transforms a Cloudinary URL to use WebP format with optional transformations
 *
 * @param url - Original image URL (Cloudinary or Strapi)
 * @param options - Transformation options
 * @returns Transformed Cloudinary URL with WebP format
 *
 * @example
 * transformToWebP('https://res.cloudinary.com/dcltaajwj/image/upload/v1759857089/mintdeals/image.jpg')
 * // Returns: 'https://res.cloudinary.com/dcltaajwj/image/upload/f_webp,q_auto/v1759857089/mintdeals/image.jpg'
 *
 * @example
 * transformToWebP('https://res.cloudinary.com/dcltaajwj/image/upload/v1759857089/mintdeals/image.jpg', { width: 800, height: 600 })
 * // Returns: 'https://res.cloudinary.com/dcltaajwj/image/upload/w_800,h_600,f_webp,q_auto/v1759857089/mintdeals/image.jpg'
 */
export function transformToWebP(
  url: string | null | undefined,
  options: CloudinaryTransformOptions = {}
): string | null {
  if (!url) return null;

  // Check if it's a Cloudinary URL
  if (!url.includes('res.cloudinary.com')) {
    // If it's a Railway/Strapi URL with Cloudinary path, return as-is
    // (these are already being handled by the Image component)
    return url;
  }

  // Default options
  const {
    width,
    height,
    format = 'webp',
    quality = 'auto',
    crop = 'fill'
  } = options;

  // Build transformation string
  const transformations: string[] = [];

  if (width) transformations.push(`w_${width}`);
  if (height) transformations.push(`h_${height}`);
  if (width || height) transformations.push(`c_${crop}`);
  transformations.push(`f_${format}`);
  transformations.push(`q_${quality}`);

  const transformString = transformations.join(',');

  // Insert transformations into Cloudinary URL
  // Pattern: https://res.cloudinary.com/{cloud}/image/upload/{transforms}/{path}
  const cloudinaryPattern = /^(https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/)(v\d+\/)(.+)$/;
  const match = url.match(cloudinaryPattern);

  if (match) {
    const [, base, version, path] = match;
    return `${base}${transformString}/${version}${path}`;
  }

  // If URL doesn't match expected pattern, try simpler pattern without version
  const simplePattern = /^(https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/)(.+)$/;
  const simpleMatch = url.match(simplePattern);

  if (simpleMatch) {
    const [, base, path] = simpleMatch;
    return `${base}${transformString}/${path}`;
  }

  // If we can't parse it, return original URL
  console.warn(`Could not transform Cloudinary URL: ${url}`);
  return url;
}

/**
 * Helper function to transform image URLs for different use cases
 */
export const imageTransforms = {
  /**
   * Card/thumbnail images (400x192)
   */
  card: (url: string | null | undefined) => transformToWebP(url, { width: 400, height: 192 }),

  /**
   * Hero images (800x400)
   */
  hero: (url: string | null | undefined) => transformToWebP(url, { width: 800, height: 400 }),

  /**
   * Small thumbnails (200x100)
   */
  thumbnail: (url: string | null | undefined) => transformToWebP(url, { width: 200, height: 100 }),

  /**
   * Large images (1200x600)
   */
  large: (url: string | null | undefined) => transformToWebP(url, { width: 1200, height: 600 }),

  /**
   * Auto-sized WebP only (no dimensions)
   */
  auto: (url: string | null | undefined) => transformToWebP(url),
};
