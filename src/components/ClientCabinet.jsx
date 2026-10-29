import { useState, useEffect, useRef } from 'react';
import { API_URL, YANDEX_GEO_KEY } from '../config';
import MapPicker from './MapPicker';
import AccountSettings from './AccountSettings';

const POLL_INTERVAL = 3000;

function ClientCabinet({ user, token, authFetch, onLogout }) {
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderKind, setOrderKind] = useState('taxi');
  const [address, setAddress] = useState('');
  const [addressTo, setAddressTo] = useState('');
  const [coords, setCoords] = useState(null);
  const [coordsTo, setCoordsTo] = useState(null);
  const [deliveryItem, setDeliveryItem] = useState('');
  const [deliveryFrom, setDeliveryFrom] = useState('');
  const [comment, setComment] = useState('');
  
  const [orderTimeType, setOrderTimeType] = useState('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showMap, setShowMap] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const [tab, setTab] = useState('order');
  const [history, setHistory] = useState([]);

  const [onlineDrivers, setOnlineDrivers] = useState(0);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingOrder, setRatingOrder] = useState(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);

  // ТАЙМЕР ОЖИДАНИЯ (3 минуты)
  const [timeLeft, setTimeLeft] = useState(180);

  const intervalRef = useRef(null);
  const msgIntervalRef = useRef(null);
  const onlineIntervalRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        if (tab === 'order') {
          const res = await authFetch('/api/orders/my-active');
          const data = await res.json();
          
          if (data && data.status === 'completed' && !data.client_rating) {
            setRatingOrder(data);
            setShowRatingModal(true);
            setActiveOrder(null);
          } else {
            setActiveOrder(data);
          }
        } else if (tab === 'history') {
          const res = await authFetch('/api/orders/my-history');
          setHistory(await res.json());
        }
      } catch (err) {}
    };
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [tab, authFetch]);

  // Таймер для ожидания водителя
  useEffect(() => {
    if (activeOrder && activeOrder.status === 'pending') {
      // Если заказ только что создан, ставим 180 секунд
      // Если у заказа есть created_at, считаем от него
      const created = new Date(activeOrder.created_at + 'Z').getTime(); // SQLite отдает без TZ
      const now = new Date().getTime();
      const diff = Math.floor((now - created) / 1000);
      const left = Math.max(0, 180 - diff);
      setTimeLeft(left);

      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setTimeLeft(180);
    }
  }, [activeOrder]);

  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await fetch(`${API_URL}/api/drivers/online`);
        if (res.ok) {
          const data = await res.json();
          setOnlineDrivers(data.count);
        }
      } catch (err) {}
    };
    fetchOnline();
    onlineIntervalRef.current = setInterval(fetchOnline, 10000);
    return () => clearInterval(onlineIntervalRef.current);
  }, []);

  useEffect(() => {
    if (!activeOrder?.id || !showChat) return;
    const pollMessages = async () => {
      try {
        const res = await authFetch(`/api/orders/${activeOrder.id}/messages`);
        setMessages(await res.json());
      } catch (err) {}
    };
    pollMessages();
    msgIntervalRef.current = setInterval(pollMessages, POLL_INTERVAL);
    return () => clearInterval(msgIntervalRef.current);
  }, [activeOrder?.id, showChat, authFetch]);

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_GEO_KEY}&geocode=${lng},${lat}&format=json&results=1&lang=ru_RU`);
      const data = await res.json();
      return data.response?.GeoObjectCollection?.featureMember[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text || '';
    } catch { return ''; }
  };

  const handleMapSelect = async (selected) => {
    if (showMap === 'from') {
      setCoords(selected);
      const addr = await reverseGeocode(selected.lat, selected.lng);
      if (addr) setAddress(addr);
    } else if (showMap === 'to') {
      setCoordsTo(selected);
      const addr = await reverseGeocode(selected.lat, selected.lng);
      if (addr) setAddressTo(addr);
    }
    setShowMap(null);
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    setError('');

    let finalScheduledAt = null;
    if (orderTimeType === 'scheduled') {
      if (!scheduledDate || !scheduledTime) {
        setError('Выберите дату и время предзаказа');
        return;
      }
      finalScheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      if (new Date(finalScheduledAt) < new Date()) {
        setError('Время предзаказа не может быть в прошлом');
        return;
      }
    }

    setLoading(true);
    try {
      const body = {
        order_kind: orderKind,
        address: orderKind === 'taxi' ? address : null,
        address_to: addressTo,
        delivery_item: orderKind === 'delivery' ? deliveryItem : null,
        delivery_from: orderKind === 'delivery' ? deliveryFrom : null,
        comment: comment.trim() || null,
        scheduled_at: finalScheduledAt,
      };
      const res = await authFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveOrder(data);
      setAddress(''); setAddressTo(''); setDeliveryItem(''); setDeliveryFrom(''); setComment('');
      setOrderTimeType('now'); setScheduledDate(''); setScheduledTime('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!window.confirm('Отменить заказ?')) return;
    try {
      await authFetch(`/api/orders/${activeOrder.id}/cancel`, { method: 'POST' });
      setActiveOrder(null);
    } catch (err) {}
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    try {
      await authFetch(`/api/orders/${activeOrder.id}/messages`, { method: 'POST', body: JSON.stringify({ text: messageText }) });
      setMessageText('');
    } catch (err) {}
  };

  const handleRateSubmit = async () => {
    if (!ratingValue) return alert('Выберите оценку');
    setRatingLoading(true);
    try {
      await authFetch(`/api/orders/${ratingOrder.id}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: ratingValue }),
      });
      setShowRatingModal(false);
      setRatingOrder(null);
      setRatingValue(0);
      if (tab === 'history') {
        const res = await authFetch('/api/orders/my-history');
        setHistory(await res.json());
      }
    } catch (err) {
      alert('Ошибка отправки оценки');
    }
    setRatingLoading(false);
  };

  const getStatusLabel = (status) => {
    const map = { pending: '⏳ Ищем водителя', accepted: '✅ Водитель принял', on_way: '🚗 Водитель в пути', waiting: '⏰ Водитель ожидает' };
    return map[status] || status;
  };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <div>
          <h1>🚖 Такси</h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '4px', background: 'rgba(76, 175, 80, 0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: onlineDrivers > 0 ? '#4caf50' : '#ff6b6b', boxShadow: onlineDrivers > 0 ? '0 0 8px #4caf50' : 'none' }}></div>
            <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
              {onlineDrivers > 0 ? `На смене: ${onlineDrivers}` : 'Нет водителей на смене'}
            </span>
          </div>
        </div>
        
        <div className="header-actions">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {currentUser.avatar_url ? <img src={currentUser.avatar_url} className="avatar-small" /> : <div className="avatar-small">{currentUser.username[0]}</div>}
        </div>
      </header>

      <div className="admin-tabs" style={{ marginBottom: '20px' }}>
        <button className={tab === 'order' ? 'active' : ''} onClick={() => setTab('order')}>🚕 Заказ</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>📋 История</button>
      </div>

      <main className="cabinet-body">
        {tab === 'order' && !activeOrder && (
          <form className="order-form" onSubmit={handleOrder}>
            <div className="kind-toggle">
              <button type="button" className={orderKind === 'taxi' ? 'active' : ''} onClick={() => setOrderKind('taxi')}>🚖 Такси</button>
              <button type="button" className={orderKind === 'delivery' ? 'active' : ''} onClick={() => setOrderKind('delivery')}>📦 Доставка</button>
            </div>
            {orderKind === 'taxi' ? (
              <>
                <label>Откуда<div className="input-with-map"><input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ул. Ленина 15" required /><button type="button" className="map-btn" onClick={() => setShowMap('from')}>📍</button></div></label>
                <label>Куда<div className="input-with-map"><input type="text" value={addressTo} onChange={(e) => setAddressTo(e.target.value)} placeholder="ул. Союзная 20" required /><button type="button" className="map-btn" onClick={() => setShowMap('to')}>📍</button></div></label>
              </>
            ) : (
              <>
                <label>Что доставить<input type="text" value={deliveryItem} onChange={(e) => setDeliveryItem(e.target.value)} placeholder="2 литра молока, хлеб" required /></label>
                <label>Из какого магазина<input type="text" value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} placeholder="Магнит на Ленина" required /></label>
                <label>Куда доставить<div className="input-with-map"><input type="text" value={addressTo} onChange={(e) => setAddressTo(e.target.value)} placeholder="ул. Союзная 20" required /><button type="button" className="map-btn" onClick={() => setShowMap('to')}>📍</button></div></label>
              </>
            )}
            
            <label>Комментарий водителю (необязательно)
              <input 
                type="text" 
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                placeholder="Например: 2-й подъезд, код 1234" 
                maxLength={100}
              />
            </label>

            <div className="kind-toggle" style={{ marginTop: '10px' }}>
              <button type="button" className={orderTimeType === 'now' ? 'active' : ''} onClick={() => setOrderTimeType('now')}>Сейчас</button>
              <button type="button" className={orderTimeType === 'scheduled' ? 'active' : ''} onClick={() => setOrderTimeType('scheduled')}>⏰ Ко времени</button>
            </div>

            {orderTimeType === 'scheduled' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <label style={{ flex: 1 }}>Дата
                  <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} required />
                </label>
                <label style={{ flex: 1 }}>Время
                  <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} required />
                </label>
              </div>
            )}

            {error && <div className="error-box">⚠️ {error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Отправка...' : (orderTimeType === 'now' ? '🚖 Вызвать такси' : '⏰ Заказать ко времени')}</button>
          </form>
        )}

        {tab === 'order' && activeOrder && (
          <div className="active-order">
            <div className="order-status">
              {getStatusLabel(activeOrder.status)}
              {/* ТАЙМЕР ОЖИДАНИЯ */}
              {activeOrder.status === 'pending' && timeLeft > 0 && (
                <div style={{ fontSize: '12px', fontWeight: 'normal', marginTop: '5px', color: 'var(--text-soft)' }}>
                  Переназначение через: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>
            
            {activeOrder.scheduled_at && (
              <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--yellow)', marginBottom: '10px' }}>
                ⏰ Предзаказ на: {new Date(activeOrder.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}

            <div className="order-info">
              {activeOrder.order_kind === 'taxi' ? (
                <><div className="order-row"><span>Откуда:</span> {activeOrder.address}</div><div className="order-row"><span>Куда:</span> {activeOrder.address_to}</div></>
              ) : (
                <><div className="order-row"><span>Доставить:</span> {activeOrder.delivery_item}</div><div className="order-row"><span>Из:</span> {activeOrder.delivery_from}</div><div className="order-row"><span>Куда:</span> {activeOrder.address_to}</div></>
              )}
              {activeOrder.comment && <div className="order-row"><span>Комментарий:</span> <i>{activeOrder.comment}</i></div>}
              <div className="order-row"><span>Цена:</span> <strong>{activeOrder.price} ₽</strong></div>
            </div>
            {activeOrder.driver_name && (
              <div className="driver-info">
                <div className="driver-title">🚗 Водитель</div>
                <div className="driver-name">{activeOrder.driver_name}</div>
                {activeOrder.car_model && <div className="driver-car">{activeOrder.car_model} — {activeOrder.car_number}</div>}
                {activeOrder.car_photo_url && <img src={`${API_URL}${activeOrder.car_photo_url}`} alt="car" className="car-photo-preview" style={{ height: '120px', width: '100%', objectFit: 'cover', marginTop: '10px', borderRadius: '10px' }} />}
                {activeOrder.driver_phone && <a href={`tel:${activeOrder.driver_phone}`} className="driver-phone" style={{ marginTop: '10px', display: 'inline-block' }}>📞 {activeOrder.driver_phone}</a>}
              </div>
            )}
            <div className="order-actions">
              <button className="btn-secondary" onClick={() => setShowChat(!showChat)}>💬 {showChat ? 'Скрыть чат' : 'Написать диспетчеру'}</button>
              <button className="btn-danger" onClick={handleCancel}>❌ Отменить заказ</button>
            </div>
            {showChat && (
              <div className="chat">
                <div className="chat-messages">{messages.map((m) => (<div key={m.id} className={`msg msg-${m.sender_role}`}><div className="msg-author">{m.username}</div><div className="msg-text">{m.text}</div></div>))}</div>
                <form className="chat-form" onSubmit={handleSendMessage}><input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Сообщение..." /><button type="submit">➤</button></form>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="history-section">
            {history.length === 0 && <div className="empty-state">Поездок пока нет</div>}
            {history.map((o) => (
              <div key={o.id} className="admin-item" style={{ cursor: 'default' }}>
                <div className="item-row"><span>Заказ #{o.id}</span><span>{o.price} ₽</span></div>
                <div className="item-meta">{new Date(o.created_at).toLocaleDateString()} • {o.address || o.delivery_from} → {o.address_to}</div>
                {o.client_rating && <div className="item-meta" style={{color: 'var(--yellow)'}}>Ваша оценка: {'★'.repeat(o.client_rating)}{'☆'.repeat(5 - o.client_rating)}</div>}
              </div>
            ))}
          </div>
        )}
      </main>

      {showMap && <MapPicker initialCoords={showMap === 'from' ? coords : coordsTo} onSelect={handleMapSelect} onClose={() => setShowMap(null)} />}
      {showSettings && <AccountSettings user={currentUser} token={token} authFetch={authFetch} onClose={() => setShowSettings(false)} onLogout={onLogout} onUpdate={setCurrentUser} />}

      {showRatingModal && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="settings-modal" style={{ maxWidth: '350px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--yellow)', marginBottom: '10px' }}>Оцените поездку</h2>
            <p style={{ color: 'var(--text-soft)', marginBottom: '20px' }}>Как вам водитель?</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatingValue(star)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '40px',
                    cursor: 'pointer',
                    color: star <= ratingValue ? 'var(--yellow)' : 'var(--black-hover)',
                    transition: 'color 0.2s'
                  }}
                >
                  ★
                </button>
              ))}
            </div>

            <button 
              className="btn-primary" 
              onClick={handleRateSubmit} 
              disabled={ratingLoading || !ratingValue}
              style={{ width: '100%', padding: '15px' }}
            >
              {ratingLoading ? 'Отправка...' : 'Отправить оценку'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientCabinet;