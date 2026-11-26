/**
 * Image optimization utilities for LYNQO.
 * Transforms Cloudinary avatar and media URLs on the fly to responsive,
 * compressed, modern WebP/AVIF formats (f_auto, q_auto),
 * and compresses large client-side uploads before sending.
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

/**
 * Compresses large client-side images before upload while preserving aspect ratio,
 * orientation, and transparency for PNGs. Skips already-small optimized images.
 */
export async function compressImageFile(
  file,
  { maxDimension = 1600, quality = 0.82, skipBelowBytes = 250 * 1024 } = {}
) {
  if (!file || typeof window === 'undefined') {
    return { file, width: 400, height: 300, compressed: false };
  }

  let width = 400;
  let height = 300;
  let bmp = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bmp = await createImageBitmap(file);
      width = bmp.width;
      height = bmp.height;
    }

    const needsResize = Math.max(width, height) > maxDimension;
    const isSmallEnough = file.size <= skipBelowBytes && !needsResize;

    if (isSmallEnough || !bmp || typeof document === 'undefined') {
      if (bmp) bmp.close();
      return { file, width, height, compressed: false };
    }

    let targetW = width;
    let targetH = height;
    if (needsResize) {
      const scale = maxDimension / Math.max(width, height);
      targetW = Math.max(1, Math.round(width * scale));
      targetH = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return { file, width, height, compressed: false };
    }

    ctx.drawImage(bmp, 0, 0, targetW, targetH);
    bmp.close();
    bmp = null;

    const origType = (file.type || 'image/jpeg').toLowerCase();
    const outputType = origType === 'image/png' ? 'image/png' : origType === 'image/webp' ? 'image/webp' : 'image/jpeg';

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, outputType, outputType === 'image/png' ? undefined : quality);
    });

    if (!blob || blob.size >= file.size) {
      return { file, width: targetW, height: targetH, compressed: false };
    }

    const ext = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
    const compressedFile = new File([blob], `${baseName}.${ext}`, {
      type: outputType,
      lastModified: Date.now(),
    });

    return { file: compressedFile, width: targetW, height: targetH, compressed: true };
  } catch {
    if (bmp) {
      try { bmp.close(); } catch (_) {}
    }
    return { file, width, height, compressed: false };
  }
}

export default getOptimizedImageUrl;
