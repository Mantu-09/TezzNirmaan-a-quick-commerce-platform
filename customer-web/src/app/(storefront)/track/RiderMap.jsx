// ─────────────────────────────────────────────────────────────
// (storefront)/track/RiderMap.jsx — P13-1
//
// Leaflet map with animated rider pin and destination pin.
// Loaded dynamically (no SSR) from track/page.jsx.
// ─────────────────────────────────────────────────────────────
'use client';
import { useEffect, useRef } from 'react';

// Patna city center as default
const DEFAULT_CENTER = [25.5941, 85.1376];
const DEFAULT_ZOOM   = 14;

export default function RiderMap({ riderPos, destPos, etaText }) {
  const mapRef       = useRef(null);  // Leaflet map instance
  const containerRef = useRef(null);  // DOM element
  const riderMarker  = useRef(null);  // Rider marker
  const destMarker   = useRef(null);  // Destination marker

  useEffect(() => {
    // Dynamically import leaflet after mount (client-only)
    let L;
    let mounted = true;

    (async () => {
      // Import leaflet CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link   = document.createElement('link');
        link.rel     = 'stylesheet';
        link.href    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      L = (await import('leaflet')).default;

      // Fix default marker icon (webpack bundling issue)
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mounted || !containerRef.current) return;

      // Create map centered on rider or destination or Patna
      const center = riderPos
        ? [riderPos.lat, riderPos.lng]
        : destPos ? [destPos.lat, destPos.lng] : DEFAULT_CENTER;

      const map = L.map(containerRef.current, {
        center,
        zoom:          DEFAULT_ZOOM,
        zoomControl:   true,
        scrollWheelZoom: false, // Disable scroll zoom for embedded map
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Rider marker (emoji-style)
      const riderIcon = L.divIcon({
        html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🛵</div>',
        iconSize:   [32, 32],
        iconAnchor: [16, 32],
        className:  '',
      });

      // Destination marker (home emoji)
      const destIcon = L.divIcon({
        html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">📍</div>',
        iconSize:   [32, 32],
        iconAnchor: [16, 32],
        className:  '',
      });

      if (riderPos) {
        riderMarker.current = L.marker([riderPos.lat, riderPos.lng], { icon: riderIcon })
          .addTo(map)
          .bindPopup('🛵 Your rider');
      }

      if (destPos) {
        destMarker.current = L.marker([destPos.lat, destPos.lng], { icon: destIcon })
          .addTo(map)
          .bindPopup('📍 Delivery address');
      }

      // Fit bounds to show both pins
      if (riderPos && destPos) {
        map.fitBounds([[riderPos.lat, riderPos.lng], [destPos.lat, destPos.lng]], { padding: [40, 40] });
      }
    })();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Only init once

  // Animate rider marker when position updates
  useEffect(() => {
    if (!mapRef.current || !riderPos) return;

    (async () => {
      const L = (await import('leaflet')).default;

      const riderIcon = L.divIcon({
        html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">🛵</div>',
        iconSize:   [32, 32],
        iconAnchor: [16, 32],
        className:  '',
      });

      if (riderMarker.current) {
        // Smoothly animate to new position
        riderMarker.current.setLatLng([riderPos.lat, riderPos.lng]);
      } else {
        riderMarker.current = L.marker([riderPos.lat, riderPos.lng], { icon: riderIcon })
          .addTo(mapRef.current)
          .bindPopup('🛵 Your rider');
      }
    })();
  }, [riderPos?.lat, riderPos?.lng]);

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
      <div
        ref={containerRef}
        style={{ height: 280, width: '100%', background: '#e2e8f0' }}
      />
      {/* ETA overlay */}
      {etaText && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 20,
          padding: '6px 16px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
        }}>
          🛵 {etaText}
        </div>
      )}
    </div>
  );
}
