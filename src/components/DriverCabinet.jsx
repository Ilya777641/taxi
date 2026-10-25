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

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  // СТЕЙТЫ ДЛЯ ОТЧЕТА
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSent, setReportSent] = useState(false);

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

  const handleDriverCancel = async () => {
    if (!cancelReason.trim()) return alert('Введите причину отмены');
    setCancelLoading(true);
    try {
      const res = await authFetch(`/api/orders/${currentOrder.id}/driver-cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        setShowCancelModal(false);
        setCancelReason('');
        await poll();
      } else {
        const data = await res.json();
        alert(data.error || 'Ошибка отмены');
      }
    } catch (err) {
      alert('Ошибка соединения');
    }
    setCancelLoading(false);
  };

  // ОТПРАВКА ОТЧЕТА
  const handleSendReport = async () => {
    setReportLoading(true);
    try {
      const res = await authFetch('/api/driver/report', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setReportSent(true);
        setTimeout(() => setReportSent(false), 5000);
      } else {
        alert(data.error || 'Ошибка отправки отчета');
      }
    } catch (err) {
      alert('Ошибка соединения');
    }
    setReportLoading(false);
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

  const getUserLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Ошибка геолокации:', error);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  };

  const openInApp = async (app) => {
    if (!currentOrder) return;
    setGeocoding(true);

    const isGoingToClient = ['assigned', 'accepted'].includes(currentOrder.status) || orderType === 'assigned';
    
    let fromText, toText;
    
    if (isGoingToClient) {
      fromText = null;
      toText = currentOrder.address || currentOrder.delivery_from;
    } else {
      fromText = currentOrder.address || currentOrder.delivery_from;
      toText = currentOrder.address_to;
    }

    const fromCoords = fromText ? await getCoords(fromText) : null;
    const toCoords = await getCoords(toText);
    const userCoords = await getUserLocation();

    setGeocoding(false);
    setShowNavChoice(false);

    let url = '';

    if (app === 'yandex') {
      let startPoint;
      if (isGoingToClient && userCoords) {
        startPoint = `${userCoords.lon},${userCoords.lat}`;
      } else if (fromCoords) {
        startPoint = `${fromCoords.lon},${fromCoords.lat}`;
      } else {
        startPoint = encodeURIComponent(fromText || '');
      }
      
      const endPoint = toCoords ? `${toCoords.lon},${toCoords.lat}` : encodeURIComponent(toText);
      url = `yandexmaps://maps.yandex.ru/?rtext=${startPoint}~${endPoint}&rtt=auto`;
    } else if (app === '2gis') {
      if (isGoingToClient && userCoords && toCoords) {
        url = `dgis://2gis.ru/routeSearch/rsType/car/from/${userCoords.lon},${userCoords.lat}/to/${toCoords.lon},${toCoords.lat}`;
      } else if (fromCoords && toCoords) {
        url = `dgis://2gis.ru/routeSearch/rsType/car/from/${fromCoords.lon},${fromCoords.lat}/to/${toCoords.lon},${toCoords.lat}`;
      } else if (toCoords) {
        url = `dgis://2gis.ru/routeSearch/rsType/car/to/${toCoords.lon},${toCoords.lat}`;
      } else {
        alert('Не удалось определить координаты для 2ГИС.');
        return;
      }
    } else if (app === 'google') {
      let startPoint;
      if (isGoingToClient && userCoords) {
        startPoint = `${userCoords.lat},${userCoords.lon}`;
      } else if (fromCoords) {
        startPoint = `${fromCoords.lat},${fromCoords.lon}`;
      } else {
        startPoint = encodeURIComponent(fromText || '');
      }
      
      const endPoint = toCoords ? `${toCoords.lat},${toCoords.lon}` : encodeURIComponent(toText);
      url = `https://www.google.com/maps/dir/?api=1&origin=${startPoint}&destination=${endPoint}&travelmode=driving`;
    }

    if (url) {
      window.location.href = url;
      setTimeout(() => {
        if (app === 'yandex') {
          let startPoint;
          if (isGoingToClient && userCoords) {
            startPoint = `${userCoords.lon},${userCoords.lat}`;
          } else if (fromCoords) {
            startPoint = `${fromCoords.lon},${fromCoords.lat}`;
          } else {
            startPoint = encodeURIComponent(fromText || '');
          }
          const endPoint = toCoords ? `${toCoords.lon},${toCoords.lat}` : encodeURIComponent(toText);
          window.open(`https://yandex.ru/maps/?rtext=${startPoint}~${endPoint}&rtt=auto`, '_blank');
        } else if (app === '2gis') {
          if (isGoingToClient && userCoords && toCoords) {
            window.open(`https://2gis.ru/routeSearch/rsType/car/from/${userCoords.lon},${userCoords.lat}/to/${toCoords.lon},${toCoords.lat}`, '_blank');
          } else if (fromCoords && toCoords) {
            window.open(`https://2gis.ru/routeSearch/rsType/car/from/${fromCoords.lon},${fromCoords.lat}/to/${toCoords.lon},${toCoords.lat}`, '_blank');
          } else if (toCoords) {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--black-card)', padding: '5px 10px', borderRadius: '20px', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--yellow)', fontSize: '18px' }}>★</span>
            <span style={{ fontWeight: 'bold' }}>{me.rating ? me.rating.toFixed(1) : '5.0'}</span>
          </div>
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
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {currentOrder.order_kind === 'taxi' ? '🚖 Такси' : '📦 Доставка'}
                    </div>
                    {currentOrder.scheduled_at && (
                      <div style={{ color: '#ffb74d', fontSize: '13px', background: 'rgba(255, 152, 0, 0.15)', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
                        ⏰ Предзаказ: {new Date(currentOrder.scheduled_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {currentOrder.order_kind === 'taxi' ? (
                      <>
                        <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '4px' }}>📍 Откуда (Клиент)</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{currentOrder.address}</div>
                        </div>
                        <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--yellow)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--yellow)', marginBottom: '4px' }}>🏁 Куда</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{currentOrder.address_to}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '4px' }}>📦 Что доставить</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{currentOrder.delivery_item}</div>
                        </div>
                        <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '4px' }}>🏪 Из магазина</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{currentOrder.delivery_from}</div>
                        </div>
                        <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--yellow)' }}>
                          <div style={{ fontSize: '12px', color: 'var(--yellow)', marginBottom: '4px' }}>🏁 Куда</div>
                          <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{currentOrder.address_to}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {currentOrder.comment && (
                    <div style={{ padding: '12px', background: 'rgba(255, 215, 0, 0.1)', borderLeft: '4px solid var(--yellow)', borderRadius: '8px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '4px' }}>💬 Комментарий клиента:</div>
                      <div style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 'bold' }}>{currentOrder.comment}</div>
                    </div>
                  )}

                  <div style={{ background: 'var(--black)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-soft)', marginBottom: '2px' }}>Клиент</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{currentOrder.client_name}</div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--yellow)' }}>{currentOrder.price} ₽</div>
                  </div>
                  
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
                        marginBottom: '15px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 15px rgba(76, 175, 80, 0.3)'
                      }}
                    >
                      📞 Позвонить клиенту
                    </a>
                  )}

                  <button 
                    className="btn-primary" 
                    style={{ 
                      marginBottom: '15px',
                      width: '100%', 
                      padding: '16px', 
                      fontSize: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)'
                    }}
                    onClick={() => setShowNavChoice(true)}
                  >
                    {['accepted', 'assigned'].includes(currentOrder.status) || orderType === 'assigned' 
                      ? '🗺️ Маршрут до клиента' 
                      : '🗺️ Маршрут до точки Б'}
                  </button>

                  {orderType === 'assigned' && (
                    <div className="order-buttons" style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-primary" onClick={acceptOrder} disabled={loading} style={{ flex: 1 }}>✅ Принять</button>
                      <button className="btn-secondary" onClick={declineOrder} disabled={loading} style={{ flex: 1 }}>❌ Отказаться</button>
                    </div>
                  )}

                  {orderType === 'active' && (
                    <div className="order-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {currentOrder.status === 'accepted' && <button className="btn-primary" onClick={() => setStatus('on_way')} disabled={loading} style={{ width: '100%', padding: '16px', fontSize: '18px' }}>🚗 В путь</button>}
                      {currentOrder.status === 'on_way' && <button className="btn-primary" onClick={() => setStatus('waiting')} disabled={loading} style={{ width: '100%', padding: '16px', fontSize: '18px' }}>⏰ Ожидаю</button>}
                      
                      {currentOrder.status === 'waiting' && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn-success" onClick={() => setStatus('completed')} disabled={loading} style={{ flex: 1, padding: '16px', fontSize: '18px' }}>✅ Завершить</button>
                          <button className="btn-danger" onClick={() => setShowCancelModal(true)} disabled={loading} style={{ flex: 1, padding: '16px', fontSize: '18px', background: 'rgba(244, 67, 54, 0.15)', borderColor: 'var(--danger)', color: '#ff6b6b' }}>❌ Отменить</button>
                        </div>
                      )}
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
                  {o.client_rating && <div className="item-meta" style={{color: 'var(--yellow)'}}>Оценка клиента: {'★'.repeat(o.client_rating)}{'☆'.repeat(5 - o.client_rating)}</div>}
                </div>
              ))}
            </div>

            {/* КНОПКА ОТПРАВКИ ОТЧЕТА */}
            <div style={{ marginTop: '30px', padding: '20px', background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: '15px', textAlign: 'center' }}>
              <h3 style={{ marginBottom: '10px' }}>Завершение смены</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-soft)', marginBottom: '15px' }}>Отправьте отчет администратору о проделанной работе</p>
              
              {reportSent ? (
                <div style={{ color: 'var(--success)', fontSize: '16px', fontWeight: 'bold' }}>✅ Отчет успешно отправлен!</div>
              ) : (
                <button 
                  className="btn-primary" 
                  onClick={handleSendReport} 
                  disabled={reportLoading || !me.is_on_shift}
                  style={{ width: '100%', padding: '15px', fontSize: '16px' }}
                >
                  {reportLoading ? 'Отправка...' : '📊 Отправить отчет'}
                </button>
              )}
              {!me.is_on_shift && <p style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '10px' }}>Вы должны быть на смене, чтобы отправить отчет</p>}
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

      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)} style={{ zIndex: 1100 }}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="settings-header">
              <h2 style={{ fontSize: '18px', color: 'var(--danger)' }}>❌ Отмена заказа</h2>
              <button className="modal-close" onClick={() => setShowCancelModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-soft)', marginBottom: '15px' }}>
              Пожалуйста, укажите причину отмены. Клиент получит уведомление, а администратор увидит её в системе.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Например: Клиент не выходит на связь, или неверный адрес"
              style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '10px', background: 'var(--black)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: '15px', resize: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-danger" onClick={handleDriverCancel} disabled={cancelLoading} style={{ flex: 1, padding: '14px' }}>
                {cancelLoading ? 'Отмена...' : 'Подтвердить отмену'}
              </button>
              <button className="btn-secondary" onClick={() => setShowCancelModal(false)} disabled={cancelLoading} style={{ flex: 1, padding: '14px' }}>
                Назад
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverCabinet;