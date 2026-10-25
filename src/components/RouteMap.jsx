import { useEffect, useRef, useState } from 'react';

function RouteMap({ fromAddress, toAddress, onClose }) {
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mapInstance = null;
    let multiRoute = null;

    const initMap = async () => {
      if (!window.ymaps) {
        setTimeout(initMap, 200);
        return;
      }

      // Ждем полной загрузки API
      await new Promise((resolve) => window.ymaps.ready(resolve));

      // Принудительно подгружаем модуль маршрутизации, если его нет
      if (!window.ymaps.multiRouter) {
        try {
          await window.ymaps.modules.require(['multiRouter.MultiRoute']);
        } catch (e) {
          console.error('Ошибка загрузки модуля маршрутизации:', e);
          setError('Не удалось загрузить модуль маршрутизации.');
          return;
        }
      }

      setTimeout(() => {
        if (!mapRef.current) return;

        if (mapInstance) mapInstance.destroy();

        // Создаем карту
        mapInstance = new window.ymaps.Map(mapRef.current, {
          center: [54.6917, 55.0095], // Центр по умолчанию
          zoom: 12,
          controls: ['zoomControl', 'fullscreenControl'],
        });

        // Строим маршрут
        if (window.ymaps.multiRouter) {
          multiRoute = new window.ymaps.multiRouter.MultiRoute({
            referencePoints: [fromAddress, toAddress],
            params: {
              routingMode: 'auto', // Автомобильный маршрут
              results: 1, // Показывать только один маршрут
            },
          }, {
            boundsAutoApply: true, // Автоматически подстроить карту под маршрут
            wayPointVisible: false, // Скрыть метки А и Б
          });

          mapInstance.geoObjects.add(multiRoute);
        } else {
          setError('Модуль маршрутизации не загружен.');
        }

        setMapReady(true);
      }, 300);
    };

    initMap();

    return () => {
      if (mapInstance) mapInstance.destroy();
      if (mapRef.current) mapRef.current.innerHTML = '';
      setMapReady(false);
    };
  }, [fromAddress, toAddress]);

  return (
    <div className="map-modal-overlay" onClick={onClose}>
      <div className="map-modal" onClick={(e) => e.stopPropagation()}>
        <div className="map-modal-header">
          <h3>🗺️ Маршрут</h3>
          <button className="map-modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '12px' }} />
          {!mapReady && !error && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--yellow)' }}>
              Загрузка маршрута...
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#ff6b6b', textAlign: 'center', padding: '20px' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="map-modal-footer" style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-soft)', flex: 1, minWidth: '200px' }}>
            <div>📍 Откуда: {fromAddress}</div>
            <div>🏁 Куда: {toAddress}</div>
          </div>
          <button className="btn-primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

export default RouteMap;