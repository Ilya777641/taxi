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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showMap, setShowMap] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const intervalRef = useRef(null);
  const msgIntervalRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await authFetch('/api/orders/my-active');
        const data = await res.json();
        setActiveOrder(data);
      } catch (err) {}
    };
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [authFetch]);

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
    setLoading(true);
    try {
      const body = {
        order_kind: orderKind,
        address: orderKind === 'taxi' ? address : null,
        address_to: addressTo,
        delivery_item: orderKind === 'delivery' ? deliveryItem : null,
        delivery_from: orderKind === 'delivery' ? deliveryFrom : null,
      };
      const res = await authFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActiveOrder(data);
      setAddress(''); setAddressTo(''); setDeliveryItem(''); setDeliveryFrom('');
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

  const getStatusLabel = (status) => {
    const map = { pending: '⏳ Ищем водителя', accepted: '✅ Водитель принял', on_way: '🚗 Водитель в пути', waiting: '⏰ Водитель ожидает' };
    return map[status] || status;
  };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>🚖 Такси</h1>
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
        {!activeOrder ? (
          <form className="order-form" onSubmit={handleOrder}>
            <div className="kind-toggle">
              <button type="button" className={orderKind === 'taxi' ? 'active' : ''} onClick={() => setOrderKind('taxi')}>🚖 Такси</button>
              <button type="button" className={orderKind === 'delivery' ? 'active' : ''} onClick={() => setOrderKind('delivery')}>📦 Доставка</button>
            </div>

            {orderKind === 'taxi' ? (
              <>
                <label>Откуда
                  <div className="input-with-map">
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ул. Ленина 15" required />
                    <button type="button" className="map-btn" onClick={() => setShowMap('from')}>📍</button>
                  </div>
                </label>
                <label>Куда
                  <div className="input-with-map">
                    <input type="text" value={addressTo} onChange={(e) => setAddressTo(e.target.value)} placeholder="ул. Союзная 20" required />
                    <button type="button" className="map-btn" onClick={() => setShowMap('to')}>📍</button>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label>Что доставить
                  <input type="text" value={deliveryItem} onChange={(e) => setDeliveryItem(e.target.value)} placeholder="2 литра молока, хлеб" required />
                </label>
                <label>Из какого магазина
                  <input type="text" value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} placeholder="Магнит на Ленина" required />
                </label>
                <label>Куда доставить
                  <div className="input-with-map">
                    <input type="text" value={addressTo} onChange={(e) => setAddressTo(e.target.value)} placeholder="ул. Союзная 20" required />
                    <button type="button" className="map-btn" onClick={() => setShowMap('to')}>📍</button>
                  </div>
                </label>
              </>
            )}

            {error && <div className="error-box">⚠️ {error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Отправка...' : '🚖 Вызвать такси'}
            </button>
          </form>
        ) : (
          <div className="active-order">
            <div className="order-status">{getStatusLabel(activeOrder.status)}</div>

            <div className="order-info">
              {activeOrder.order_kind === 'taxi' ? (
                <>
                  <div className="order-row"><span>Откуда:</span> {activeOrder.address}</div>
                  <div className="order-row"><span>Куда:</span> {activeOrder.address_to}</div>
                </>
              ) : (
                <>
                  <div className="order-row"><span>Доставить:</span> {activeOrder.delivery_item}</div>
                  <div className="order-row"><span>Из:</span> {activeOrder.delivery_from}</div>
                  <div className="order-row"><span>Куда:</span> {activeOrder.address_to}</div>
                </>
              )}
              <div className="order-row"><span>Цена:</span> <strong>{activeOrder.price} ₽</strong></div>
            </div>

            {activeOrder.driver_name && (
              <div className="driver-info">
                <div className="driver-title">🚗 Водитель</div>
                <div className="driver-name">{activeOrder.driver_name}</div>
                {activeOrder.car_model && <div className="driver-car">{activeOrder.car_model} — {activeOrder.car_number}</div>}
                {activeOrder.car_photo_url && <img src={activeOrder.car_photo_url} alt="car" className="car-photo-preview" style={{ height: '100px', width: '100%', objectFit: 'cover', marginTop: '10px' }} />}
                {activeOrder.driver_phone && <a href={`tel:${activeOrder.driver_phone}`} className="driver-phone" style={{ marginTop: '10px', display: 'inline-block' }}>📞 {activeOrder.driver_phone}</a>}
              </div>
            )}

            <div className="order-actions">
              <button className="btn-secondary" onClick={() => setShowChat(!showChat)}>
                💬 {showChat ? 'Скрыть чат' : 'Написать диспетчеру'}
              </button>
              <button className="btn-danger" onClick={handleCancel}>❌ Отменить заказ</button>
            </div>

            {showChat && (
              <div className="chat">
                <div className="chat-messages">
                  {messages.length === 0 && <div className="chat-empty">Сообщений пока нет</div>}
                  {messages.map((m) => (
                    <div key={m.id} className={`msg msg-${m.sender_role}`}>
                      <div className="msg-author">{m.username}</div>
                      <div className="msg-text">{m.text}</div>
                    </div>
                  ))}
                </div>
                <form className="chat-form" onSubmit={handleSendMessage}>
                  <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Сообщение..." />
                  <button type="submit">➤</button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {showMap && <MapPicker initialCoords={showMap === 'from' ? coords : coordsTo} onSelect={handleMapSelect} onClose={() => setShowMap(null)} />}
      {showSettings && <AccountSettings user={currentUser} token={token} authFetch={authFetch} onClose={() => setShowSettings(false)} onLogout={onLogout} onUpdate={setCurrentUser} />}
    </div>
  );
}

export default ClientCabinet;