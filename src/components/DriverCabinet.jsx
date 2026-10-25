import { useState, useEffect, useRef } from 'react';
import AccountSettings from './AccountSettings';

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
  
  // Состояние для показа выбора навигатора
  const [showNavChoice, setShowNavChoice] = useState(false);

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

  // ФУНКЦИЯ ОТКРЫТИЯ НАВИГАЦИИ В ВЫБРАННОМ ПРИЛОЖЕНИИ
  const openInApp = (app) => {
    if (!currentOrder) return;
    
    const from = encodeURIComponent(currentOrder.address || currentOrder.delivery_from || '');
    const to = encodeURIComponent(currentOrder.address_to || '');
    
    let url = '';

    if (app === 'yandex') {
      // Официальная схема Яндекс.Карт для маршрута
      url = `yandexmaps://maps.yandex.ru/?rtext=${from}~${to}&rtt=auto`;
    } else if (app === '2gis') {
      // Официальная схема 2ГИС (требует координаты, но мы попробуем передать адреса, часто работает)
      // Если не сработает, 2ГИС откроет просто карту, но водитель сможет ввести адрес сам
      url = `dgis://2gis.ru/routeSearch/rsType/car/to/${to}`;
    } else if (app === 'google') {
      // Универсальная ссылка Google Maps (откроет приложение, если установлено)
      url = `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}&travelmode=driving`;
    }

    if (url) {
      // Пробуем открыть приложение
      window.location.href = url;
      
      // Через 1.5 секунды, если ничего не произошло (приложение не установлено), открываем веб-версию
      setTimeout(() => {
        if (app === 'google') {
          window.open(url, '_blank');
        } else if (app === 'yandex') {
          window.open(`https://yandex.ru/maps/?rtext=${from}~${to}&rtt=auto`, '_blank');
        } else if (app === '2gis') {
          window.open(`https://2gis.ru/directions/tab/car/to/${to}`, '_blank');
        }
      }, 1500);
    }
    
    setShowNavChoice(false);
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
                  <div className="order-row"><span>Клиент:</span> {currentOrder.client_name}</div>
                  {currentOrder.client_phone && <div className="order-row"><span>Телефон:</span> <a href={`tel:${currentOrder.client_phone}`}>📞 {currentOrder.client_phone}</a></div>}
                  <div className="order-row"><span>Цена:</span> <strong>{currentOrder.price} ₽</strong></div>

                  {/* Кнопка открытия выбора навигатора */}
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
      
      {/* МОДАЛЬНОЕ ОКНО ВЫБОРА НАВИГАТОРА */}
      {showNavChoice && (
        <div className="modal-overlay" onClick={() => setShowNavChoice(false)} style={{ zIndex: 1100 }}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '350px', textAlign: 'center' }}>
            <div className="settings-header" style={{ justifyContent: 'center' }}>
              <h2 style={{ fontSize: '18px' }}>Выберите приложение</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <button className="btn-primary" onClick={() => openInApp('yandex')} style={{ padding: '15px', fontSize: '16px' }}>
                🟡 Яндекс.Карты
              </button>
              <button className="btn-primary" onClick={() => openInApp('2gis')} style={{ padding: '15px', fontSize: '16px', background: '#00b341', color: 'white' }}>
                🟢 2ГИС
              </button>
              <button className="btn-primary" onClick={() => openInApp('google')} style={{ padding: '15px', fontSize: '16px', background: '#4285F4', color: 'white' }}>
                🔵 Google Maps
              </button>
              <button className="btn-secondary" onClick={() => setShowNavChoice(false)} style={{ marginTop: '10px' }}>
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