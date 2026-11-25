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

  useEffect(() => {
    const fetchOnline = async () => {
      try {
        const res = await fetch(`${API_URL}/api/drivers/online`);
        if (res.ok) setOnlineDrivers((await res.json()).count);
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
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';

    try {
      if (window.ymaps?.geocode) {
        await new Promise((resolve) => window.ymaps.ready(resolve));
        const result = await window.ymaps.geocode([latitude, longitude], { results: 1 });
        const geoObject = result.geoObjects.get(0);
        const metadata = geoObject?.properties?.get('metaDataProperty.GeocoderMetaData');
        const address = metadata?.text || geoObject?.getAddressLine?.();
        if (address) return address;
      }
    } catch (err) {
      console.warn('Не удалось получить адрес через API карт', err);
    }

    if (!YANDEX_GEO_KEY) return '';
    try {
      const query = new URLSearchParams({
        apikey: YANDEX_GEO_KEY,
        geocode: `${longitude},${latitude}`,
        sco: 'longlat',
        format: 'json',
        results: '1',
        lang: 'ru_RU',
      });
      const res = await fetch(`https://geocode-maps.yandex.ru/v1/?${query}`);
      if (!res.ok) return '';
      const data = await res.json();
      return data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.text || '';
    } catch {
      return '';
    }
  };

  const handleMapSelect = async (selected) => {
    setError('');
    if (showMap === 'from') {
      setCoords(selected);
      const addr = await reverseGeocode(selected.lat, selected.lng);
      if (addr) setAddress(addr);
      else setError('Не удалось определить полный адрес по точке. Введите адрес вручную.');
    } else if (showMap === 'to') {
      setCoordsTo(selected);
      const addr = await reverseGeocode(selected.lat, selected.lng);
      if (addr) setAddressTo(addr);
      else setError('Не удалось определить полный адрес по точке. Введите адрес вручную.');
    }
    setShowMap(null);
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    setError('');
    let finalScheduledAt = null;
    if (orderTimeType === 'scheduled') {
      if (!scheduledDate || !scheduledTime) { setError('Выберите дату и время'); return; }
      finalScheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      if (new Date(finalScheduledAt) < new Date()) { setError('Время в прошлом'); return; }
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

  // ОТВЕТ НА ЦЕНУ
  const handleConfirmPrice = async (agreed) => {
    try {
      await authFetch(`/api/orders/${activeOrder.id}/confirm-price`, {
        method: 'POST',
        body: JSON.stringify({ agreed }),
      });
      if (!agreed) {
        setActiveOrder(null); // Если отказ, просто убираем заказ с экрана
      }
    } catch (err) { alert('Ошибка'); }
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
      await authFetch(`/api/orders/${ratingOrder.id}/rate`, { method: 'POST', body: JSON.stringify({ rating: ratingValue }) });
      setShowRatingModal(false); setRatingOrder(null); setRatingValue(0);
      if (tab === 'history') setHistory(await (await authFetch('/api/orders/my-history')).json());
    } catch (err) { alert('Ошибка'); }
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
            <span style={{ fontSize: '12px', color: 'var(--text-soft)' }}>{onlineDrivers > 0 ? `На смене: ${onlineDrivers}` : 'Нет водителей'}</span>
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
                <label>Что доставить<input type="text" value={deliveryItem} onChange={(e) => setDeliveryItem(e.target.value)} placeholder="Молоко" required /></label>
                <label>Из какого магазина<input type="text" value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} placeholder="Магнит" required /></label>
                <label>Куда доставить<div className="input-with-map"><input type="text" value={addressTo} onChange={(e) => setAddressTo(e.target.value)} placeholder="ул. Союзная 20" required /><button type="button" className="map-btn" onClick={() => setShowMap('to')}>📍</button></div></label>
              </>
            )}
            <label>Комментарий (необязательно)<input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="2-й подъезд" maxLength={100} /></label>
            <div className="kind-toggle" style={{ marginTop: '10px' }}>
              <button type="button" className={orderTimeType === 'now' ? 'active' : ''} onClick={() => setOrderTimeType('now')}>Сейчас</button>
              <button type="button" className={orderTimeType === 'scheduled' ? 'active' : ''} onClick={() => setOrderTimeType('scheduled')}>⏰ Ко времени</button>
            </div>
            {orderTimeType === 'scheduled' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <label style={{ flex: 1 }}>Дата<input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} required /></label>
                <label style={{ flex: 1 }}>Время<input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} required /></label>
              </div>
            )}
            {error && <div className="error-box">⚠️ {error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Отправка...' : (orderTimeType === 'now' ? '🚖 Вызвать такси' : '⏰ Заказать')}</button>
          </form>
        )}

        {tab === 'order' && activeOrder && (
          <div className="active-order">
            <div className="order-status">
              {activeOrder.price_status === 'offered' && activeOrder.proposed_price ? '💰 Водитель предлагает цену' : getStatusLabel(activeOrder.status)}
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
              
              {/* БЛОК ЦЕНЫ */}
              {activeOrder.price_status === 'offered' && activeOrder.proposed_price ? (
                <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid var(--yellow)', borderRadius: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: 'var(--text-soft)', marginBottom: '10px' }}>Водитель предложил:</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--yellow)', marginBottom: '15px' }}>{activeOrder.proposed_price} ₽</div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleConfirmPrice(true)} className="btn-success" style={{ flex: 1, padding: '12px' }}>✅ Согласен</button>
                    <button onClick={() => handleConfirmPrice(false)} className="btn-danger" style={{ flex: 1, padding: '12px' }}>❌ Отказаться</button>
                  </div>
                </div>
              ) : (
                <div className="order-row"><span>Цена:</span> <strong>{activeOrder.price ? `${activeOrder.price} ₽` : 'Таксометр (уточните)'}</strong></div>
              )}
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
              <button className="btn-secondary" onClick={() => setShowChat(!showChat)}>💬 {showChat ? 'Скрыть чат' : 'Написать'}</button>
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
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setRatingValue(star)} style={{ background: 'none', border: 'none', fontSize: '40px', cursor: 'pointer', color: star <= ratingValue ? 'var(--yellow)' : 'var(--black-hover)' }}>★</button>
              ))}
            </div>
            <button className="btn-primary" onClick={handleRateSubmit} disabled={ratingLoading || !ratingValue} style={{ width: '100%', padding: '15px' }}>{ratingLoading ? 'Отправка...' : 'Отправить'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientCabinet;
