/**
 * Image optimization utilities for LYNQO.
 * Transforms Cloudinary avatar and media URLs on the fly to responsive,
 * compressed, modern WebP/AVIF formats (f_auto, q_auto).
 */

export function getOptimizedImageUrl(url, options = {}) {
  if (!url || typeof url !== 'string') return url;
  const { width = 120, height = 120, crop = 'fill' } = options;

  // Only transform Cloudinary upload URLs that haven't already been transformed
  if (url.includes('res.cloudinary.com') && url.includes('/image/upload/') && !url.includes('/f_auto')) {
    const transform = `f_auto,q_auto,w_${width},h_${height},c_${crop}`;
    return url.replace('/image/upload/', `/image/upload/${transform}/`);
  }
  return url;
}

export default getOptimizedImageUrl;
