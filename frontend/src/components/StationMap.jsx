import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Loader2, MapPin, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Định nghĩa ngoài component để tránh tạo object mới mỗi render
const DEFAULT_LAT = 10.7725;
const DEFAULT_LNG = 106.6679;

// Fix Leaflet icon URLs bị vỡ khi dùng với bundler (chỉ chạy 1 lần)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(dist) {
  if (dist < 1) return `${Math.round(dist * 1000)}m`;
  return `${dist.toFixed(1)} km`;
}

function makeStationIcon(isSelected, hasLockers) {
  const color = isSelected ? '#f59e0b' : hasLockers ? '#10b981' : '#ef4444';
  const size = isSelected ? 24 : 18;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const USER_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:18px;height:18px;
    background:#6366f1;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 0 4px rgba(99,102,241,0.25);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function StationMap({ stations, selectedStationName, onSelectStationName }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const didAutoSelectRef = useRef(false);
  const hasFitBoundsRef = useRef(false);
  const lastSelectedStationNameRef = useRef('');

  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('loading');

  const activeLat = userLat ?? DEFAULT_LAT;
  const activeLng = userLng ?? DEFAULT_LNG;

  // GPS: chỉ chạy 1 lần
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('failed');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGpsStatus('success');
      },
      () => {
        setGpsStatus('failed');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  // Khởi tạo Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [DEFAULT_LAT, DEFAULT_LNG],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Cập nhật marker người dùng khi GPS thay đổi
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([activeLat, activeLng]);
    } else {
      userMarkerRef.current = L.marker([activeLat, activeLng], { icon: USER_ICON })
        .addTo(map)
        .bindPopup('<b>Vị trí của bạn</b>');
    }

    if (gpsStatus === 'success') {
      map.setView([activeLat, activeLng], 14);
    }
  }, [activeLat, activeLng, gpsStatus]);

  const onSelectRef = useRef(onSelectStationName);
  useEffect(() => {
    onSelectRef.current = onSelectStationName;
  });

  // Cập nhật station markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !stations || stations.length === 0) return;

    // Xóa markers không còn trong list
    Object.keys(markersRef.current).forEach((id) => {
      if (!stations.find((s) => String(s.id) === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    stations.forEach((station) => {
      const isSelected = station.name === selectedStationName;
      const hasLockers = station.available_lockers > 0;
      const icon = makeStationIcon(isSelected, hasLockers);
      const popupContent = `
        <div style="min-width:160px;font-family:sans-serif">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">${station.name}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px">${station.address || ''}</div>
          <span style="
            display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;
            background:${hasLockers ? '#d1fae5' : '#fee2e2'};
            color:${hasLockers ? '#065f46' : '#991b1b'};
          ">${station.available_lockers}/${station.total_lockers} ngăn trống</span>
        </div>
      `;

      if (markersRef.current[station.id]) {
        markersRef.current[station.id].setIcon(icon);
        markersRef.current[station.id].setPopupContent(popupContent);
      } else {
        const marker = L.marker([station.latitude, station.longitude], { icon })
          .addTo(map)
          .bindPopup(popupContent);
        marker.on('click', () => onSelectRef.current(station.name));
        markersRef.current[station.id] = marker;
      }
    });

    // Fit bounds lần đầu tiên khi trạm được load
    if (!hasFitBoundsRef.current && stations.length > 0) {
      const allLatLngs = stations.map((s) => [s.latitude, s.longitude]);
      if (allLatLngs.length > 0) {
        const bounds = L.latLngBounds([[activeLat, activeLng], ...allLatLngs]);
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
        hasFitBoundsRef.current = true;
      }
    }
  }, [stations, selectedStationName, activeLat, activeLng]);

  // Fly tới trạm được chọn
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !stations || !selectedStationName) return;
    if (lastSelectedStationNameRef.current === selectedStationName) return;

    const station = stations.find((s) => s.name === selectedStationName);
    if (!station) return;
    map.flyTo([station.latitude, station.longitude], 15, { duration: 0.8 });
    lastSelectedStationNameRef.current = selectedStationName;
  }, [selectedStationName, stations]);

  // Auto-select trạm gần nhất
  const stationsWithDistance = useMemo(() => {
    if (!stations || stations.length === 0) return [];
    return stations
      .map((s) => ({ ...s, distance: getDistance(activeLat, activeLng, s.latitude, s.longitude) }))
      .sort((a, b) => a.distance - b.distance);
  }, [stations, activeLat, activeLng]);

  const nearestStation = stationsWithDistance[0];

  useEffect(() => {
    if (nearestStation && !selectedStationName && !didAutoSelectRef.current) {
      didAutoSelectRef.current = true;
      onSelectRef.current(nearestStation.name);
    }
  }, [nearestStation, selectedStationName]);

  return (
    <div className="space-y-3">
      {/* GPS Status */}
      <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-500 shadow-sm">
        <div className="flex items-center gap-2">
          {gpsStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
          {gpsStatus === 'success' && <Navigation className="h-4 w-4 text-emerald-500" />}
          {gpsStatus === 'failed' && <Compass className="h-4 w-4 text-amber-500" />}
          <span>
            {gpsStatus === 'loading' && 'Đang xác định vị trí GPS...'}
            {gpsStatus === 'success' && 'Đã xác định vị trí của bạn'}
            {gpsStatus === 'failed' && 'Không lấy được GPS — dùng vị trí mặc định (Quận 10)'}
          </span>
        </div>
        {nearestStation && (
          <span className="shrink-0 rounded bg-brand-50 px-2 py-1 font-extrabold text-brand-700">
            Gần nhất: {nearestStation.name} · {formatDistance(nearestStation.distance)}
          </span>
        )}
      </div>

      {/* Leaflet Map */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-md" style={{ height: 320 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        <div className="absolute bottom-2 left-2 z-[1000] rounded-md bg-white/80 px-2 py-1 text-[10px] font-semibold text-slate-500 backdrop-blur-sm shadow-sm">
          🗺️ OpenStreetMap · Leaflet.js
        </div>
      </div>

      {/* Station Cards */}
      <div className="grid gap-2 sm:grid-cols-3">
        {stationsWithDistance.map((station) => {
          const isSelected = selectedStationName === station.name;
          const isNearest = nearestStation?.name === station.name;
          const hasLockers = station.available_lockers > 0;
          return (
            <button
              key={station.id}
              onClick={() => onSelectRef.current(station.name)}
              className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition duration-200 ${
                isSelected
                  ? 'border-brand-600 bg-brand-50/30 ring-2 ring-brand-500/20'
                  : 'border-slate-100 bg-white hover:border-brand-300'
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-extrabold text-slate-800">{station.name}</span>
                  {isNearest && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">
                      Gần nhất
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{station.address || ''}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-xs font-bold text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {formatDistance(station.distance)}
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-extrabold ${
                    hasLockers
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {station.available_lockers}/{station.total_lockers} trống
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
