import { useState, useEffect } from 'react';
import AccountSettings from './AccountSettings';
import SwipeableItem from './SwipeableItem';

const POLL_INTERVAL = 4000;

function AdminCabinet({ user, token, authFetch, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [prices, setPrices] = useState({ streets: [], locations: [] });

  const [tab, setTab] = useState('dashboard');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [expandedReportOrders, setExpandedReportOrders] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');

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
      } else if (tab === 'admins') {
        const res = await authFetch('/api/admin/admins');
        setAdmins(await res.json());
      } else if (tab === 'dashboard') {
        const res = await authFetch('/api/admin/stats');
        setStats(await res.json());
      } else if (tab === 'prices') {
        const res = await authFetch('/api/admin/prices');
        setPrices(await res.json());
      } else if (tab === 'reports') {
        const res = await authFetch('/api/admin/reports');
        setReports(await res.json());
      }
    } catch (err) {}
  };

  useEffect(() => {
    poll();
    const intervalRef = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef);
  }, [tab, authFetch]);

  const approveDriver = async (id) => {
    await authFetch(`/api/admin/drivers/${id}/approve`, { method: 'POST' });
    poll();
  };

  const blockDriver = async (id) => {
    await authFetch(`/api/admin/drivers/${id}/block`, { method: 'POST' });
    poll();
  };

  const deleteDriver = async (id) => {
    if (!window.confirm('Удалить водителя?')) return;
    await authFetch(`/api/admin/drivers/${id}`, { method: 'DELETE' });
    poll();
  };

  const deleteOrder = async (id) => {
    if (!window.confirm('Удалить заказ?')) return;
    await authFetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
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

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ username: newAdminName, password: newAdminPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewAdminName(''); setNewAdminPass(''); poll(); alert('Админ добавлен');
    } catch (err) { alert(err.message); }
  };

  const handleDeleteAdmin = async (id) => {
    if (!window.confirm('Удалить админа?')) return;
    try {
      const res = await authFetch(`/api/admin/admins/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      poll();
    } catch (err) { alert(err.message); }
  };

  const updatePrice = async (type, id, value) => {
    if (isNaN(value) || value === '') return;
    try {
      await authFetch('/api/admin/prices/update', {
        method: 'POST',
        body: JSON.stringify({ type, id, price: Number(value) }),
      });
    } catch (err) { alert('Ошибка сохранения цены'); }
  };

  const getStatusLabel = (status) => {
    const map = {
      pending: '⏳ Ищем', accepted: '✅ Принят', on_way: '🚗 В пути',
      waiting: '⏰ Ожидает', completed: '✔️ Завершён', cancelled: '❌ Отменён',
    };
    return map[status] || status;
  };

  const getDriverStatus = (driver) => {
    if (!driver.is_on_shift) return '⚫ Не на смене';
    if (driver.status === 'pending') return '⏳ На модерации';
    if (driver.status === 'blocked') return '🚫 Заблокирован';
    const activeOrder = orders.find((o) => o.driver_id === driver.id && o.status !== 'completed' && o.status !== 'cancelled');
    if (activeOrder) {
      if (activeOrder.status === 'on_way') return `🚗 В пути (#${activeOrder.id})`;
      if (activeOrder.status === 'waiting') return `⏰ Ожидает (#${activeOrder.id})`;
      if (activeOrder.status === 'accepted') return `✅ Едет (#${activeOrder.id})`;
    }
    return '🟢 Свободен';
  };

  const getRatingColor = (rating) => {
    if (!rating || rating < 3.5) return '#ff6b6b';
    if (rating < 4.5) return '#ffb74d';
    return '#4caf50';
  };

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>🚖 Админ</h1>
        <div className="header-actions">
          <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {currentUser.avatar_url ? <img src={currentUser.avatar_url} className="avatar-small" /> : <div className="avatar-small">{currentUser.username[0]}</div>}
        </div>
      </header>

      <div className="admin-tabs" style={{ flexWrap: 'wrap', gap: '5px' }}>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>📊 Стата</button>
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>📋 Заказы</button>
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>📄 Отчеты</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          ⏳ Модер {pendingDrivers.length > 0 && `(${pendingDrivers.length})`}
        </button>
        <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')}>🚗 Водители</button>
        <button className={tab === 'prices' ? 'active' : ''} onClick={() => setTab('prices')}>💵 Цены</button>
        <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>👑 Админы</button>
      </div>

      <main className="cabinet-body">
        {tab === 'dashboard' && stats && (
          <div className="stats-grid">
            <div className="stat-card"><div>Заказов сегодня</div><strong>{stats.ordersToday}</strong></div>
            <div className="stat-card"><div>Выполнено</div><strong>{stats.completedToday}</strong></div>
            <div className="stat-card"><div>На смене</div><strong>{stats.driversOnShift}</strong></div>
            <div className="stat-card"><div>Выручка сегодня</div><strong>{stats.revenueToday} ₽</strong></div>
            <div className="stat-card"><div>Выручка всего</div><strong>{stats.revenueAll} ₽</strong></div>
          </div>
        )}

        {tab === 'prices' && (
          <div className="prices-section">
            <h3>Улицы села</h3>
            {prices.streets.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{s.display_name}</span>
                <input type="number" defaultValue={s.price} onBlur={(e) => updatePrice('street', s.id, e.target.value)} style={{ width: '80px', padding: '5px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--black)', color: 'white' }} />
              </div>
            ))}
            <h3 style={{ marginTop: '20px' }}>Населенные пункты</h3>
            {prices.locations.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{l.display_name}</span>
                <input type="number" defaultValue={l.price} onBlur={(e) => updatePrice('location', l.id, e.target.value)} style={{ width: '80px', padding: '5px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--black)', color: 'white' }} />
              </div>
            ))}
          </div>
        )}

        {tab === 'orders' && !selectedOrder && (
          <div className="admin-list">
            {orders.map((o) => (
              <SwipeableItem key={o.id} onDelete={() => deleteOrder(o.id)}>
                <div onClick={() => setSelectedOrder(o)}>
                  <div className="item-row"><span className="item-kind">{o.order_kind === 'taxi' ? '🚖' : '📦'} #{o.id}</span><span className={`item-status status-${o.status}`}>{getStatusLabel(o.status)}</span></div>
                  <div className="item-meta" style={{ color: 'var(--text)' }}>{o.address || o.delivery_from} → {o.address_to}</div>
                  <div className="item-meta">{o.client_name && `Клиент: ${o.client_name}`}{o.driver_name && ` • Водитель: ${o.driver_name}`}</div>
                </div>
              </SwipeableItem>
            ))}
          </div>
        )}

        {tab === 'orders' && selectedOrder && (
          <div className="order-detail">
            <button className="btn-back" onClick={() => setSelectedOrder(null)}>← Назад</button>
            <h3>Заказ #{selectedOrder.id}</h3>
            <div className="order-info">
              <div className="order-row"><span>Откуда:</span> {selectedOrder.address}</div>
              <div className="order-row"><span>Куда:</span> {selectedOrder.address_to}</div>
              <div className="order-row"><span>Клиент:</span> {selectedOrder.client_name}</div>
              {selectedOrder.driver_name && <div className="order-row"><span>Водитель:</span> {selectedOrder.driver_name}</div>}
              <div className="order-row"><span>Цена:</span> <strong>{selectedOrder.price} ₽</strong></div>
              
              {selectedOrder.status === 'cancelled' && selectedOrder.cancel_reason && (
                <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(244, 67, 54, 0.1)', borderLeft: '4px solid var(--danger)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '4px' }}>Причина отмены (водитель):</div>
                  <div style={{ fontSize: '15px', color: 'var(--text)' }}>{selectedOrder.cancel_reason}</div>
                </div>
              )}
            </div>
            <div className="chat">
              <div className="chat-messages">{messages.map((m) => (<div key={m.id} className={`msg msg-${m.sender_role}`}><div className="msg-author">{m.username}</div><div className="msg-text">{m.text}</div></div>))}</div>
              <form className="chat-form" onSubmit={sendMessage}><input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Написать..." /><button type="submit">➤</button></form>
            </div>
          </div>
        )}

        {tab === 'reports' && !selectedReport && (
          <div className="admin-list">
            {reports.length === 0 && <div className="empty-state">Отчетов пока нет</div>}
            {reports.map((r) => (
              <div key={r.id} onClick={() => setSelectedReport(r)} style={{ cursor: 'pointer', background: 'var(--black-card)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                <div className="item-row">
                  <span className="item-kind">📄 Отчет #{r.id} от {r.driver_name}</span>
                  <span className="item-status status-completed">{r.orders_count} заказов</span>
                </div>
                <div className="item-meta">{new Date(r.created_at).toLocaleString('ru-RU')}</div>
                <div className="item-meta" style={{ color: 'var(--yellow)', fontSize: '16px', fontWeight: 'bold' }}>Выручка: {r.total_earnings} ₽</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'reports' && selectedReport && (
          <div className="order-detail">
            <button className="btn-back" onClick={() => { setSelectedReport(null); setExpandedReportOrders(false); }}>← Назад</button>
            <h3>Отчет #{selectedReport.id}</h3>
            <div className="order-info">
              <div className="order-row"><span>Водитель:</span> {selectedReport.driver_name}</div>
              <div className="order-row"><span>Начало смены:</span> {new Date(selectedReport.shift_start).toLocaleString('ru-RU')}</div>
              <div className="order-row"><span>Конец смены:</span> {new Date(selectedReport.shift_end).toLocaleString('ru-RU')}</div>
              <div className="order-row"><span>Заказов выполнено:</span> <strong>{selectedReport.orders_count}</strong></div>
              <div className="order-row"><span>Заработано:</span> <strong style={{ color: 'var(--yellow)' }}>{selectedReport.total_earnings} ₽</strong></div>
            </div>

            <button 
              className="btn-secondary" 
              onClick={() => setExpandedReportOrders(!expandedReportOrders)}
              style={{ width: '100%', marginTop: '15px', marginBottom: '15px' }}
            >
              {expandedReportOrders ? 'Скрыть детали заказов' : 'Показать детали заказов'}
            </button>

            {expandedReportOrders && (
              <div className="admin-list">
                {JSON.parse(selectedReport.orders_json || '[]').map((o) => (
                  <div key={o.id} className="admin-item" style={{ cursor: 'default', background: 'var(--black)', padding: '10px', borderRadius: '10px', marginBottom: '8px' }}>
                    <div className="item-row"><span>Заказ #{o.id}</span><span>{o.price} ₽</span></div>
                    <div className="item-meta" style={{ fontSize: '12px' }}>{new Date(o.completed_at).toLocaleTimeString('ru-RU')} • {o.address} → {o.address_to}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'pending' && (
          <div className="admin-list">
            {pendingDrivers.length === 0 && <div className="empty-state">Нет заявок</div>}
            {pendingDrivers.map((d) => (
              <div key={d.id} className="admin-item" style={{ cursor: 'default', padding: '16px', background: 'var(--black-card)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                <div className="item-row"><span className="item-kind">🚗 {d.username}</span></div>
                <div className="item-meta">{d.phone} • {d.car_model} ({d.car_number})</div>
                <div className="item-buttons" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button className="btn-success" style={{ flex: 1 }} onClick={() => approveDriver(d.id)}>✅ Одобрить</button>
                  <button className="btn-danger" style={{ flex: 1 }} onClick={() => blockDriver(d.id)}>❌ Отклонить</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'drivers' && (
          <div className="admin-list">
            {drivers.map((d) => (
              <SwipeableItem key={d.id} onDelete={() => deleteDriver(d.id)} onBlock={() => blockDriver(d.id)}>
                <div>
                  <div className="item-row">
                    <span className="item-kind">{d.is_on_shift ? '🟢' : '⚫'} {d.username}</span>
                    <span className="item-status">#{d.queue_position}</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                    <span style={{ color: getRatingColor(d.rating), fontSize: '18px', fontWeight: 'bold' }}>
                      ★ {d.rating ? d.rating.toFixed(1) : '5.0'}
                    </span>
                    {d.rating && d.rating < 3.5 && <span style={{ fontSize: '12px', color: '#ff6b6b' }}>(Плохой)</span>}
                    {d.rating && d.rating >= 3.5 && d.rating < 4.5 && <span style={{ fontSize: '12px', color: '#ffb74d' }}>(Средний)</span>}
                    {d.rating && d.rating >= 4.5 && <span style={{ fontSize: '12px', color: '#4caf50' }}>(Отличный)</span>}
                  </div>

                  <div className="item-meta" style={{ color: 'var(--text)' }}>{getDriverStatus(d)}</div>
                  <div className="item-meta">{d.car_model} • {d.car_number} {d.accepts_delivery ? '📦 Да' : '📦 Нет'}</div>
                </div>
              </SwipeableItem>
            ))}
          </div>
        )}

        {tab === 'admins' && (
          <div className="admin-list">
            <div className="order-form" style={{ marginBottom: '20px', background: 'var(--black-card)' }}>
              <h3 style={{ color: 'var(--yellow)', marginBottom: '10px' }}>Добавить админа</h3>
              <form onSubmit={handleAddAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input type="text" placeholder="Имя" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} required />
                <input type="text" placeholder="Пароль (4 цифры)" inputMode="numeric" maxLength={4} value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value.replace(/\D/g, '').slice(0, 4))} required />
                <button type="submit" className="btn-primary" style={{ width: '100%' }}>Создать</button>
              </form>
            </div>
            {admins.map((a) => (
              <div key={a.id} className="admin-item" style={{ background: 'var(--black-card)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                <div className="item-row"><span className="item-kind">{a.username}</span><span className="item-meta">Код: {a.login_code || '—'}</span></div>
                {a.id !== currentUser.id && <button className="btn-danger" onClick={() => handleDeleteAdmin(a.id)} style={{ marginTop: '10px', width: '100%' }}>Удалить</button>}
              </div>
            ))}
          </div>
        )}
      </main>
      {showSettings && <AccountSettings user={currentUser} token={token} authFetch={authFetch} onClose={() => setShowSettings(false)} onLogout={onLogout} onUpdate={setCurrentUser} />}
    </div>
  );
}

export default AdminCabinet;