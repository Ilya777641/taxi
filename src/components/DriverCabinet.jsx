import { useState, useEffect, useRef } from 'react';
import AccountSettings from './AccountSettings';
import { YANDEX_GEO_KEY } from '../config';

const POLL_INTERVAL = 3000;

function DriverCabinet({ user, token, authFetch, onLogout }) {
  const [me, setMe] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderType, setOrderType] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [tab, setTab] = useState('work');
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  
  const [showNavChoice, setShowNavChoice] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const intervalRef = useRef(null);

  const poll = async () => {
    try {
      const meRes = await authFetch('/api/auth/me');
      setMe(await meRes.json());

      if (tab === 'work') {
        const orderRes = await authFetch('/api/driver/my-order');
        const orderData = await orderRes.json();
        setCurrentOrder(orderData.order);
        setOrderType(orderData.type);
      } else if (tab === 'history') {
        const histRes = await authFetch('/api/driver/my-history');
        const histData = await histRes.json();
        setHistory(histData.orders || []);
        setStats(histData.stats || null);
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  };

  useEffect(() => {
    const saveOneSignalId = async () => {
      for (let i = 0; i < 20; i++) {
        if (window.OneSignal && window.OneSignal.getUserId) {
          try {
            const userId = await window.OneSignal.getUserId();
            if (userId) {
              await authFetch('/api/auth/onesignal', {
                method: 'POST',
                body: JSON.stringify({ onesignal_id: userId }),
              });
              return;
            }
          } catch (err) {}
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };
    saveOneSignalId();
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [tab, authFetch]);

  const toggleShift = async () => {
    setLoading(true);
    try {
      await authFetch('/api/driver/shift', { method: 'POST', body: JSON.stringify({ is_on_shift: !me?.is_on_shift }) });
      await poll();
    } catch (err) {}
    setLoading(false);
  };

  const toggleDelivery = async () => {
    try {
      await authFetch('/api/driver/delivery', { method: 'POST', body: JSON.stringify({ accepts_delivery: !me?.accepts_delivery }) });
      await poll();
    } catch (err) {}
  };

  const acceptOrder = async () => {
    if (!currentOrder) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/orders/${currentOrder.id}/accept`, { method: 'POST' });
      if (res.ok) await poll(); else alert('Заказ уже занят');
    } catch (err) {}
    setLoading(false);
  };

  const declineOrder = async () => {
    if (!currentOrder || !window.confirm('Отказаться?')) return;
    setLoading(true);
    try {
      await authFetch(`/api/orders/${currentOrder.id}/decline`, { method: 'POST' });
      await poll();
    } catch (err) {}
    setLoading(false);
  };

  const setStatus = async (status) => {
    if (!currentOrder) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/orders/${currentOrder.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      if (res.ok) await poll();
    } catch (err) {}
    setLoading(false);
  };

  const getCoords = async (address) => {
    if (!address) return null;
    try {
      const res = await fetch(`https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${encodeURIComponent(address)}&format=json&results=1&lang=ru_RU`);
      const data = await res.json();
      const member = data.response?.GeoObjectCollection?.featureMember?.[0];
      if (!member) return null;
      const [lon, lat] = member.GeoObject.Point.pos.split(' ');
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    } catch (e) {
      return null;
    }
  };

  const openInApp = async (app) => {
    if (!currentOrder) return;
    setGeocoding(true);

    const fromText = currentOrder.address || currentOrder.delivery_from;
    const toText = currentOrder.address_to;

    const fromCoords = await getCoords(fromText);
    const toCoords = await getCoords(toText);

    setGeocoding(false);
    setShowNavChoice(false);

    let url = '';

    if (app === 'yandex') {
      const fromStr = fromCoords ? `${fromCoords.lon},${fromCoords.lat}` : encodeURIComponent(fromText);
      const toStr = toCoords ? `${toCoords.lon},${toCoords.lat}` : encodeURIComponent(toText);
      url = `yandexmaps://maps.yandex.ru/?rtext=${fromStr}~${toStr}&rtt=auto`;
    } else if (app === '2gis') {
      if (fromCoords && toCoords) {
        url = `dgis://2gis.ru/routeSearch/rsType/car/from/${fromCoords.lon},${fromCoords.lat}/to/${toCoords.lon},${toCoords.lat}`;
      } else {
        if (toCoords) {
          url = `dgis://2gis.ru/routeSearch/rsType/car/to/${toCoords.lon},${toCoords.lat}`;
        } else {
          alert('Не удалось определить координаты для 2ГИС. Попробуйте Яндекс или Google.');
          return;
        }
      }
    } else if (app === 'google') {
      const fromStr = fromCoords ? `${fromCoords.lat},${fromCoords.lon}` : encodeURIComponent(fromText);
      const toStr = toCoords ? `${toCoords.lat},${toCoords.lon}` : encodeURIComponent(toText);
      url = `https://www.google.com/maps/dir/?api=1&origin=${fromStr}&destination=${toStr}&travelmode=driving`;
    }

    if (url) {
      window.location.href = url;
      setTimeout(() => {
        if (app === 'yandex') {
          const fromStr = fromCoords ? `${fromCoords.lon},${fromCoords.lat}` : encodeURIComponent(fromText);
          const toStr = toCoords ? `${toCoords.lon},${toCoords.lat}` : encodeURIComponent(toText);
          window.open(`https://yandex.ru/maps/?rtext=${fromStr}~${toStr}&rtt=auto`, '_blank');
        } else if (app === '2gis') {
          if (toCoords) {
            window.open(`https://2gis.ru/routeSearch/rsType/car/to/${toCoords.lon},${toCoords.lat}`, '_blank');
          } else {
            window.open(`https://2gis.ru/`, '_blank');
          }
        } else if (app === 'google') {
          window.open(url, '_blank');
        }
      }, 1500);
    }
  };

  if (!me) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" />
      </div>
    );
  }

  const statusLabels = { assigned: '🔔 Новый заказ', active: '🚗 Активный заказ', idle: '⏳ Ожидание' };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>🚖 Водитель</h1>
        <div className="header-actions">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {currentUser.avatar_url ? <img src={currentUser.avatar_url} className="avatar-small" alt="avatar" /> : <div className="avatar-small">{currentUser.username[0]}</div>}
        </div>
      </header>

      <div className="admin-tabs" style={{ marginBottom: '20px' }}>
        <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')}>🚕 Работа</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>💰 Заработок</button>
      </div>

      <main className="cabinet-body">
        {tab === 'work' && (
          <>
            <div className="driver-panel">
              <button className={`shift-btn ${me.is_on_shift ? 'on' : 'off'}`} onClick={toggleShift} disabled={loading}>
                {me.is_on_shift ? '🟢 На смене' : '🔴 Не на смене'}
              </button>
              <button className={`shift-btn ${me.accepts_delivery ? 'on' : 'off'}`} onClick={toggleDelivery}>
                {me.accepts_delivery ? '📦 Доставка вкл' : '📦 Доставка выкл'}
              </button>
              <div className="queue-info">Очередь: <strong>#{me.queue_position}</strong></div>
            </div>

            <div className="driver-order">
              <div className="order-status-label">{statusLabels[orderType]}</div>
              {!currentOrder ? (
                <div className="empty-state">Ожидание заказов...</div>
              ) : (
                <div className="order-card">
                  <div className="order-card-kind">{currentOrder.order_kind === 'taxi' ? '🚖 Такси' : '📦 Доставка'}</div>
                  {currentOrder.order_kind === 'taxi' ? (
                    <>
                      <div className="order-row"><span>Откуда:</span> {currentOrder.address}</div>
                      <div className="order-row"><span>Куда:</span> {currentOrder.address_to}</div>
                    </>
                  ) : (
                    <>
                      <div className="order-row"><span>Доставить:</span> {currentOrder.delivery_item}</div>
                      <div className="order-row"><span>Из:</span> {currentOrder.delivery_from}</div>
                      <div className="order-row"><span>Куда:</span> {currentOrder.address_to}</div>
                    </>
                  )}
                  
                  {/* НОВЫЙ БЛОК: Отображение комментария */}
                  {currentOrder.comment && (
                    <div style={{ padding: '10px', background: 'rgba(255, 215, 0, 0.1)', borderLeft: '4px solid var(--yellow)', borderRadius: '4px', margin: '8px 0' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '4px' }}>Комментарий клиента:</div>
                      <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 'bold' }}>💬 {currentOrder.comment}</div>
                    </div>
                  )}

                  <div className="order-row"><span>Клиент:</span> {currentOrder.client_name}</div>
                  
                  {/* НОВАЯ БОЛЬШАЯ КНОПКА ПОЗВОНИТЬ */}
                  {currentOrder.client_phone && (
                    <a 
                      href={`tel:${currentOrder.client_phone}`} 
                      className="btn-success" 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '10px', 
                        padding: '16px', 
                        fontSize: '18px', 
                        marginTop: '10px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 15px rgba(76, 175, 80, 0.3)'
                      }}
                    >
                      📞 Позвонить клиенту
                    </a>
                  )}

                  <div className="order-row" style={{ marginTop: '10px' }}><span>Цена:</span> <strong>{currentOrder.price} ₽</strong></div>

                  <button 
                    className="btn-secondary" 
                    style={{ marginTop: '10px', width: '100%', borderColor: 'var(--yellow)', color: 'var(--yellow)' }}
                    onClick={() => setShowNavChoice(true)}
                  >
                    🗺️ Построить маршрут
                  </button>

                  {orderType === 'assigned' && (
                    <div className="order-buttons">
                      <button className="btn-primary" onClick={acceptOrder} disabled={loading}>✅ Принять</button>
                      <button className="btn-secondary" onClick={declineOrder} disabled={loading}>❌ Отказаться</button>
                    </div>
                  )}

                  {orderType === 'active' && (
                    <div className="order-buttons">
                      {currentOrder.status === 'accepted' && <button className="btn-primary" onClick={() => setStatus('on_way')} disabled={loading}>🚗 В путь</button>}
                      {currentOrder.status === 'on_way' && <button className="btn-primary" onClick={() => setStatus('waiting')} disabled={loading}>⏰ Ожидаю</button>}
                      {currentOrder.status === 'waiting' && <button className="btn-success" onClick={() => setStatus('completed')} disabled={loading}>✅ Завершить</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'history' && stats && (
          <div className="history-section">
            <h3>Мой заработок</h3>
            <div className="stats-grid">
              <div className="stat-card"><div>Сегодня</div><strong>{stats.today || 0} ₽</strong></div>
              <div className="stat-card"><div>Неделя</div><strong>{stats.week || 0} ₽</strong></div>
              <div className="stat-card"><div>Месяц</div><strong>{stats.month || 0} ₽</strong></div>
              <div className="stat-card"><div>Все время</div><strong>{stats.all_time || 0} ₽</strong></div>
            </div>

            <h3 style={{ marginTop: '20px' }}>Последние поездки</h3>
            <div className="admin-list">
              {history.map((o) => (
                <div key={o.id} className="admin-item" style={{ cursor: 'default' }}>
                  <div className="item-row"><span>Заказ #{o.id}</span><span>{o.price} ₽</span></div>
                  <div className="item-meta">{new Date(o.completed_at).toLocaleDateString()} • {o.address} → {o.address_to}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
      {showSettings && <AccountSettings user={currentUser} token={token} authFetch={authFetch} onClose={() => setShowSettings(false)} onLogout={onLogout} onUpdate={setCurrentUser} />}
      
      {showNavChoice && (
        <div className="modal-overlay" onClick={() => setShowNavChoice(false)} style={{ zIndex: 1100 }}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '350px', textAlign: 'center' }}>
            <div className="settings-header" style={{ justifyContent: 'center' }}>
              <h2 style={{ fontSize: '18px' }}>{geocoding ? 'Определяем координаты...' : 'Выберите приложение'}</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <button className="btn-primary" onClick={() => openInApp('yandex')} disabled={geocoding} style={{ padding: '15px', fontSize: '16px' }}>
                🟡 Яндекс.Карты
              </button>
              <button className="btn-primary" onClick={() => openInApp('2gis')} disabled={geocoding} style={{ padding: '15px', fontSize: '16px', background: '#00b341', color: 'white' }}>
                🟢 2ГИС
              </button>
              <button className="btn-primary" onClick={() => openInApp('google')} disabled={geocoding} style={{ padding: '15px', fontSize: '16px', background: '#4285F4', color: 'white' }}>
                🔵 Google Maps
              </button>
              <button className="btn-secondary" onClick={() => setShowNavChoice(false)} disabled={geocoding} style={{ marginTop: '10px' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverCabinet;