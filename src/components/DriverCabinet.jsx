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

  const intervalRef = useRef(null);

  const poll = async () => {
    try {
      const meRes = await authFetch('/api/auth/me');
      const meData = await meRes.json();
      setMe(meData);
      setCurrentUser(meData);

      const orderRes = await authFetch('/api/driver/my-order');
      const orderData = await orderRes.json();
      setCurrentOrder(orderData.order);
      setOrderType(orderData.type);
    } catch (err) {}
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [authFetch]);

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

  if (!me) return <div className="loading-page"><div className="loading-spinner" /></div>;

  const statusLabels = { assigned: '🔔 Новый заказ', active: '🚗 Активный заказ', idle: '⏳ Ожидание' };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>🚖 Водитель</h1>
        <div className="header-actions">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {currentUser.avatar_url ? (
            <img src={currentUser.avatar_url} className="avatar-small" alt="avatar" />
          ) : (
            <div className="avatar-small">{currentUser.username[0]}</div>
          )}
        </div>
      </header>

      <main className="cabinet-body">
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
      </main>

      {showSettings && <AccountSettings user={currentUser} token={token} authFetch={authFetch} onClose={() => setShowSettings(false)} onLogout={onLogout} onUpdate={setCurrentUser} />}
    </div>
  );
}

export default DriverCabinet;