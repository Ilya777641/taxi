import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL = 4000;

function AdminCabinet({ user, token, authFetch, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [tab, setTab] = useState('orders'); // 'orders' | 'pending' | 'drivers'
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');

  const intervalRef = useRef(null);
  const msgIntervalRef = useRef(null);

  const poll = async () => {
    try {
      if (tab === 'orders') {
        const res = await authFetch('/api/admin/orders');
        setOrders(await res.json());
      } else if (tab === 'pending') {
        const res = await authFetch('/api/admin/drivers/pending');
        setPendingDrivers(await res.json());
      } else if (tab === 'drivers') {
        const res = await authFetch('/api/admin/drivers');
        setDrivers(await res.json());
      }
    } catch (err) {}
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [tab, authFetch]);

  // Опрос сообщений выбранного заказа
  useEffect(() => {
    if (!selectedOrder?.id) return;

    const pollMessages = async () => {
      try {
        const res = await authFetch(`/api/orders/${selectedOrder.id}/messages`);
        setMessages(await res.json());
      } catch (err) {}
    };

    pollMessages();
    msgIntervalRef.current = setInterval(pollMessages, POLL_INTERVAL);
    return () => clearInterval(msgIntervalRef.current);
  }, [selectedOrder?.id, authFetch]);

  const approveDriver = async (id) => {
    await authFetch(`/api/admin/drivers/${id}/approve`, { method: 'POST' });
    poll();
  };

  const blockDriver = async (id) => {
    if (!confirm('Заблокировать водителя?')) return;
    await authFetch(`/api/admin/drivers/${id}/block`, { method: 'POST' });
    poll();
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedOrder) return;
    try {
      await authFetch(`/api/orders/${selectedOrder.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: messageText }),
      });
      setMessageText('');
    } catch (err) {}
  };

  const getStatusLabel = (status) => {
    const map = {
      pending: '⏳ Ищем водителя',
      accepted: '✅ Принят',
      on_way: '🚗 В пути',
      waiting: '⏰ Ожидает',
      completed: '✔️ Завершён',
      cancelled: '❌ Отменён',
    };
    return map[status] || status;
  };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>🚖 Админ</h1>
        <button className="logout-btn" onClick={onLogout}>{user.username} ↪</button>
      </header>

      <div className="admin-tabs">
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
          📋 Заказы
        </button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          ⏳ Модерация {pendingDrivers.length > 0 && `(${pendingDrivers.length})`}
        </button>
        <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')}>
          🚗 Водители
        </button>
      </div>

      <main className="cabinet-body">
        {/* ВКЛАДКА ЗАКАЗЫ */}
        {tab === 'orders' && !selectedOrder && (
          <div className="admin-list">
            {orders.length === 0 && <div className="empty-state">Заказов нет</div>}
            {orders.map((o) => (
              <div key={o.id} className="admin-item" onClick={() => setSelectedOrder(o)}>
                <div className="item-row">
                  <span className="item-kind">
                    {o.order_kind === 'taxi' ? '🚖' : '📦'} #{o.id}
                  </span>
                  <span className={`item-status status-${o.status}`}>
                    {getStatusLabel(o.status)}
                  </span>
                </div>
                <div className="item-desc">
                  {o.address || o.delivery_from} → {o.address_to}
                </div>
                <div className="item-meta">
                  {o.client_name && `Клиент: ${o.client_name}`}
                  {o.driver_name && ` • Водитель: ${o.driver_name}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ДЕТАЛИ ЗАКАЗА + ЧАТ */}
        {tab === 'orders' && selectedOrder && (
          <div className="order-detail">
            <button className="btn-back" onClick={() => setSelectedOrder(null)}>← Назад</button>

            <h3>Заказ #{selectedOrder.id}</h3>

            <div className="order-info">
              <div className="order-row"><span>Тип:</span> {selectedOrder.order_kind === 'taxi' ? '🚖 Такси' : '📦 Доставка'}</div>
              {selectedOrder.order_kind === 'taxi' ? (
                <>
                  <div className="order-row"><span>Откуда:</span> {selectedOrder.address}</div>
                  <div className="order-row"><span>Куда:</span> {selectedOrder.address_to}</div>
                </>
              ) : (
                <>
                  <div className="order-row"><span>Доставить:</span> {selectedOrder.delivery_item}</div>
                  <div className="order-row"><span>Из:</span> {selectedOrder.delivery_from}</div>
                  <div className="order-row"><span>Куда:</span> {selectedOrder.address_to}</div>
                </>
              )}
              <div className="order-row"><span>Статус:</span> {getStatusLabel(selectedOrder.status)}</div>
              <div className="order-row"><span>Клиент:</span> {selectedOrder.client_name}</div>
              {selectedOrder.client_phone && (
                <div className="order-row">
                  <span>Телефон:</span>
                  <a href={`tel:${selectedOrder.client_phone}`}>📞 {selectedOrder.client_phone}</a>
                </div>
              )}
              {selectedOrder.driver_name && (
                <div className="order-row"><span>Водитель:</span> {selectedOrder.driver_name}</div>
              )}
              <div className="order-row"><span>Цена:</span> <strong>{selectedOrder.price} ₽</strong></div>
            </div>

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
              <form className="chat-form" onSubmit={sendMessage}>
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Написать клиенту..."
                />
                <button type="submit">➤</button>
              </form>
            </div>
          </div>
        )}

        {/* ВКЛАДКА МОДЕРАЦИЯ */}
        {tab === 'pending' && (
          <div className="admin-list">
            {pendingDrivers.length === 0 && <div className="empty-state">Нет заявок</div>}
            {pendingDrivers.map((d) => (
              <div key={d.id} className="admin-item">
                <div className="item-row">
                  <span className="item-kind">🚗 {d.username}</span>
                </div>
                <div className="item-meta">
                  {d.phone && `📞 ${d.phone}`}
                  {d.car_model && ` • ${d.car_model}`}
                  {d.car_number && ` (${d.car_number})`}
                </div>
                <div className="item-buttons">
                  <button className="btn-success" onClick={() => approveDriver(d.id)}>
                    ✅ Одобрить
                  </button>
                  <button className="btn-danger" onClick={() => blockDriver(d.id)}>
                    ❌ Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ВКЛАДКА ВОДИТЕЛИ */}
        {tab === 'drivers' && (
          <div className="admin-list">
            {drivers.map((d) => (
              <div key={d.id} className="admin-item">
                <div className="item-row">
                  <span className="item-kind">
                    {d.is_on_shift ? '🟢' : '⚫'} {d.username}
                  </span>
                  <span className="item-status">#{d.queue_position}</span>
                </div>
                <div className="item-meta">
                  {d.car_model} • {d.car_number}
                </div>
                <div className="item-meta">
                  {d.accepts_delivery ? '📦 Доставка: да' : '📦 Доставка: нет'}
                </div>
                <div className="item-buttons">
                  <button className="btn-danger" onClick={() => blockDriver(d.id)}>Заблокировать</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminCabinet;