// (storefront)/components/ProductImage.jsx — P16-9
// next/image wrapper with graceful fallback for broken S3 URLs.
'use client';
import Image from 'next/image';
import { useState } from 'react';

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjM2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmaWxsPSIjOWNhM2FmIj7wn5qFPC90ZXh0Pjwvc3ZnPg==';

/**
 * ProductImage — drop-in replacement for <img> on product cards.
 * Uses next/image for optimization (avif/webp, lazy load, responsive sizes).
 * Falls back to SVG placeholder if image errors.
 *
 * Props: src, alt, width, height, className, style, fill, sizes, priority
 */
export default function ProductImage({ src, alt = 'Product', width, height, className, style, fill, sizes, priority = false }) {
  const [errored, setErrored] = useState(false);
  const imgSrc = errored || !src ? PLACEHOLDER : src;

  if (fill) {
    return (
      <Image
        src={imgSrc}
        alt={alt}
        fill
        sizes={sizes || '(max-width: 640px) 50vw, 25vw'}
        className={className}
        style={{ objectFit: 'cover', ...style }}
        onError={() => setErrored(true)}
        priority={priority}
      />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={width || 200}
      height={height || 200}
      sizes={sizes || '(max-width: 640px) 50vw, 200px'}
      className={className}
      style={{ objectFit: 'cover', ...style }}
      onError={() => setErrored(true)}
      priority={priority}
    />
  );
}
