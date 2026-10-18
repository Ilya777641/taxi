import { useEffect, useRef, useState } from 'react';
import { YANDEX_KEY } from '../config';

function MapPicker({ initialCoords, onSelect, onClose }) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [coords, setCoords] = useState(initialCoords || [54.6917, 55.0095]);

  useEffect(() => {
    // Ждём загрузки API
    const initMap = () => {
      if (!window.ymaps) {
        setTimeout(initMap, 200);
        return;
      }

      window.ymaps.ready(() => {
        if (!mapRef.current) return;

        const map = new window.ymaps.Map(mapRef.current, {
          center: coords,
          zoom: 15,
          controls: ['zoomControl', 'fullscreenControl'],
        });

        const placemark = new window.ymaps.Placemark(coords, {}, {
          preset: 'islands#yellowDotIcon',
          draggable: true,
        });
        map.geoObjects.add(placemark);

        // Клик по карте — перемещаем метку
        map.events.add('click', (e) => {
          const newCoords = e.get('coords');
          placemark.geometry.setCoordinates(newCoords);
          setCoords(newCoords);
        });

        // Перетаскивание метки
        placemark.events.add('dragend', () => {
          setCoords(placemark.geometry.getCoordinates());
        });

        setMapReady(true);
      });
    };

    initMap();

    return () => {
      if (mapRef.current) mapRef.current.innerHTML = '';
    };
  }, []);

  const handleConfirm = () => {
    onSelect({
      lat: coords[0],
      lng: coords[1],
    });
    if (onClose) onClose();
  };

  return (
    <div className="map-modal-overlay" onClick={onClose}>
      <div className="map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="map-modal-header">
          <h3>📍 Выберите точку на карте</h3>
          <button className="map-modal-close" onClick={onClose}>✕</button>
        </div>

        <div ref={mapRef} className="map-container" />

        <div className="map-modal-footer">
          {mapReady && (
            <div className="map-coords">
              Координаты: {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
            </div>
          )}
          <div className="map-buttons">
            <button className="btn-secondary" onClick={onClose}>Отмена</button>
            <button className="btn-primary" onClick={handleConfirm} disabled={!mapReady}>
              ✅ Выбрать точку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MapPicker;