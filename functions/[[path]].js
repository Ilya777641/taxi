import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:5173', 'https://taxi.my-money.site', 'https://taxi-9w7.pages.dev', 'https://2225dfc0.taxi-9w7.pages.dev'],
  credentials: true,
}));

// ============================================================
// ОТПРАВКА PUSH (OneSignal v16 - через external_id)
// ============================================================
async function sendPush(env, externalIds, title, message) {
  const ids = (externalIds || []).map(id => String(id));
  if (ids.length === 0) return;

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        include_aliases: {
          external_id: ids
        },
        target_channel: "push",
        headings: { en: title, ru: title },
        contents: { en: message, ru: message },
      }),
    });
    
    const data = await response.json();
    console.log('PUSH RESPONSE:', JSON.stringify(data));
  } catch (err) {
    console.error('PUSH FETCH ERROR:', err);
  }
}

// ============================================================
// УТИЛИТЫ
// ============================================================
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + 'taxi_salt_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyPassword(password, hash) {
  return (await hashPassword(password)) === hash;
}
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 7 * 24 * 60 * 60 };
  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigBytes = new Uint8Array(signature);
  let sigBinary = '';
  for (const b of sigBytes) sigBinary += String.fromCharCode(b);
  const sigB64 = btoa(sigBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sigB64}`;
}
async function verifyJWT(token, secret) {
  try {
    const [headerB64, bodyB64, sigB64] = token.split('.');
    const data = `${headerB64}.${bodyB64}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - sigB64.length % 4) % 4)), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(base64UrlDecode(bodyB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ============================================================
// MIDDLEWARE
// ============================================================
async function authRequired(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Не авторизован' }, 401);
  const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET || 'taxi-secret-key-change');
  if (!payload) return c.json({ error: 'Токен недействителен' }, 401);
  c.set('userId', payload.id);
  c.set('username', payload.username);
  c.set('role', payload.role);
  await next();
}
async function adminRequired(c, next) {
  if (c.get('role') !== 'admin') return c.json({ error: 'Доступ запрещён' }, 403);
  await next();
}

// ============================================================
// ЦЕНЫ
// ============================================================
async function calculatePrice(db, address) {
  if (!address) return { price: 0, type: 'local', found: false };
  const normalized = address.toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return { price: 0, type: 'local', found: false };

  const homeWords = ['языково', 'языковский', 'благоварский'];
  const isHome = (kw) => homeWords.includes(kw);

  const locResult = await db.prepare('SELECT keyword, display_name, price FROM taxi_locations').all();
  for (const loc of (locResult.results || [])) {
    const kw = loc.keyword.toLowerCase();
    if (isHome(kw)) continue;
    if (words.some(w => w === kw)) return { price: loc.price, type: 'long', found: true, matched: loc.display_name };
  }

  const stResult = await db.prepare('SELECT keyword, display_name, price FROM taxi_streets').all();
  for (const st of (stResult.results || [])) {
    const kw = st.keyword.toLowerCase();
    if (words.some(w => w === kw)) return { price: st.price, type: 'local', found: true, matched: st.display_name };
  }
  return { price: 0, type: 'local', found: false };
}

// ============================================================
// ПРОВЕРКА
// ============================================================
app.get('/api/ping', async (c) => {
  const result = await c.env.DB.prepare('SELECT datetime("now") AS now').first();
  return c.json({ ok: true, time: result.now });
});

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================
app.post('/api/auth/register', async (c) => {
  try {
    const { username, password, role, phone, car_model, car_number } = await c.req.json();
    if (!username || username.trim().length < 2) return c.json({ error: 'Имя минимум 2 символа' }, 400);
    if (!password || !/^\d{4}$/.test(password)) return c.json({ error: 'Пароль — ровно 4 цифры' }, 400);
    if (!['client', 'driver'].includes(role)) return c.json({ error: 'Роль: client или driver' }, 400);

    const existing = await c.env.DB.prepare('SELECT id FROM taxi_users WHERE username = ? AND password_hash = ?').bind(username.trim(), await hashPassword(password)).first();
    if (existing) return c.json({ error: 'Пользователь с таким именем и паролем уже существует.' }, 400);

    const hash = await hashPassword(password);
    const status = role === 'driver' ? 'pending' : 'active';
    const result = await c.env.DB.prepare(
      `INSERT INTO taxi_users (username, password_hash, role, phone, car_model, car_number, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, username, role, status`
    ).bind(username.trim(), hash, role, phone || null, car_model || null, car_number || null, status).first();

    const token = status === 'active' ? await createJWT({ id: result.id, username: result.username, role: result.role }, c.env.JWT_SECRET || 'taxi-secret-key-change') : null;
    return c.json({ token, user: result, pending: status === 'pending' });
  } catch (err) { return c.json({ error: 'Ошибка регистрации' }, 500); }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();
    const users = await c.env.DB.prepare('SELECT id, username, password_hash, role, status, avatar_url FROM taxi_users WHERE username = ?').bind(username?.trim()).all();
    if (!users.results || users.results.length === 0) return c.json({ error: 'Неверное имя или пароль' }, 401);

    let matchedUser = null;
    for (const u of users.results) {
      if (await verifyPassword(password, u.password_hash)) { matchedUser = u; break; }
    }

    if (!matchedUser) return c.json({ error: 'Неверное имя или пароль' }, 401);
    if (matchedUser.status === 'blocked') return c.json({ error: 'Заблокирован' }, 403);
    if (matchedUser.status === 'pending') return c.json({ error: 'На модерации', pending: true }, 403);

    const token = await createJWT({ id: matchedUser.id, username: matchedUser.username, role: matchedUser.role }, c.env.JWT_SECRET || 'taxi-secret-key-change');
    return c.json({ token, user: { id: matchedUser.id, username: matchedUser.username, role: matchedUser.role, avatar_url: matchedUser.avatar_url } });
  } catch (err) { return c.json({ error: 'Ошибка входа' }, 500); }
});

app.get('/api/auth/me', authRequired, async (c) => {
  const user = await c.env.DB.prepare('SELECT * FROM taxi_users WHERE id = ?').bind(c.get('userId')).first();
  if (!user) return c.json({ error: 'Не найден' }, 404);
  return c.json(user);
});

app.post('/api/auth/change-password', authRequired, async (c) => {
  try {
    const { oldPassword, newPassword } = await c.req.json();
    if (!/^\d{4}$/.test(oldPassword) || !/^\d{4}$/.test(newPassword)) return c.json({ error: 'Пароли — 4 цифры' }, 400);
    const user = await c.env.DB.prepare('SELECT password_hash FROM taxi_users WHERE id = ?').bind(c.get('userId')).first();
    if (!(await verifyPassword(oldPassword, user.password_hash))) return c.json({ error: 'Старый пароль неверный' }, 401);
    const newHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE taxi_users SET password_hash = ? WHERE id = ?').bind(newHash, c.get('userId')).run();
    return c.json({ success: true });
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.post('/api/auth/change-username', authRequired, async (c) => {
  try {
    const { newUsername } = await c.req.json();
    if (!newUsername || newUsername.trim().length < 2) return c.json({ error: 'Имя минимум 2 символа' }, 400);
    await c.env.DB.prepare('UPDATE taxi_users SET username = ? WHERE id = ?').bind(newUsername.trim(), c.get('userId')).run();
    return c.json({ success: true });
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.post('/api/auth/avatar', authRequired, async (c) => {
  try {
    const { image } = await c.req.json();
    await c.env.DB.prepare('UPDATE taxi_users SET avatar_url = ? WHERE id = ?').bind(image, c.get('userId')).run();
    return c.json({ success: true, avatar_url: image });
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.post('/api/auth/onesignal', authRequired, async (c) => {
  try {
    const { onesignal_id } = await c.req.json();
    if (!onesignal_id) return c.json({ error: 'Нет ID' }, 400);
    await c.env.DB.prepare('UPDATE taxi_users SET onesignal_id = ? WHERE id = ?').bind(onesignal_id, c.get('userId')).run();
    return c.json({ success: true });
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

// ============================================================
// ФОТО В R2
// ============================================================
app.post('/api/driver/car-photo', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  try {
    const formData = await c.req.formData();
    const file = formData.get('photo');
    if (!file || !(file instanceof File)) return c.json({ error: 'Файл не найден' }, 400);
    const ext = file.name.split('.').pop() || 'jpg';
    const key = `car_${c.get('userId')}_${Date.now()}.${ext}`;
    await c.env.CARS_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    const photoUrl = `/api/car-photo/${key}`;
    await c.env.DB.prepare('UPDATE taxi_users SET car_photo_url = ? WHERE id = ?').bind(photoUrl, c.get('userId')).run();
    return c.json({ success: true, car_photo_url: photoUrl });
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.get('/api/car-photo/:key', async (c) => {
  const object = await c.env.CARS_BUCKET.get(c.req.param('key'));
  if (!object) return c.json({ error: 'Photo not found' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg' } });
});

app.post('/api/driver/car', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const { car_model, car_number } = await c.req.json();
  await c.env.DB.prepare('UPDATE taxi_users SET car_model = ?, car_number = ? WHERE id = ?').bind(car_model, car_number, c.get('userId')).run();
  return c.json({ success: true });
});

// ============================================================
// ЗАКАЗЫ
// ============================================================
app.post('/api/orders', authRequired, async (c) => {
  try {
    if (c.get('role') !== 'client') return c.json({ error: 'Только клиенты' }, 403);
    const { order_kind, address, address_to, delivery_item, delivery_from, comment, scheduled_at } = await c.req.json();
    if (!address_to || !address_to.trim()) return c.json({ error: 'Введите адрес назначения' }, 400);
    if (order_kind === 'taxi' && (!address || !address.trim())) return c.json({ error: 'Введите адрес откуда' }, 400);
    if (order_kind === 'delivery' && (!delivery_item || !delivery_from)) return c.json({ error: 'Введите что и откуда доставить' }, 400);

    const priceInfo = await calculatePrice(c.env.DB, address_to);
    if (!priceInfo.found) return c.json({ error: 'Не могу определить цену.' }, 400);
    let finalPrice = priceInfo.price;

    const result = await c.env.DB.prepare(
      `INSERT INTO taxi_orders (client_id, order_kind, order_type, address, address_to, delivery_item, delivery_from, price, status, comment, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING *`
    ).bind(c.get('userId'), order_kind || 'taxi', priceInfo.type, address || null, address_to.trim(), delivery_item || null, delivery_from || null, finalPrice, comment || null, scheduled_at || null).first();

    const isScheduled = !!scheduled_at;
    const now = new Date();
    const scheduledDate = isScheduled ? new Date(scheduled_at) : null;
    const timeDiffMinutes = scheduledDate ? (scheduledDate - now) / (1000 * 60) : 0;
    
    if (!isScheduled || timeDiffMinutes <= 30) {
      const drivers = await c.env.DB.prepare('SELECT id FROM taxi_users WHERE role = ? AND is_on_shift = 1').bind('driver').all();
      const driverIds = (drivers.results || []).map(d => d.id);
      if (driverIds.length > 0) {
        const timeText = isScheduled ? `[⏰ Предзаказ на ${scheduledDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}] ` : '';
        await sendPush(c.env, driverIds, '🚖 Новый заказ!', `${timeText}${address || delivery_from} → ${address_to} (${finalPrice} ₽)`);
      }
    }

    return c.json(result);
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.get('/api/orders/my-active', authRequired, async (c) => {
  const order = await c.env.DB.prepare(
    `SELECT o.*, d.username AS driver_name, d.phone AS driver_phone, d.car_model, d.car_number, d.car_photo_url FROM taxi_orders o LEFT JOIN taxi_users d ON d.id = o.driver_id WHERE o.client_id = ? AND o.status IN ('pending', 'accepted', 'on_way', 'waiting') ORDER BY o.created_at DESC LIMIT 1`
  ).bind(c.get('userId')).first();
  return c.json(order || null);
});

app.get('/api/orders/my-history', authRequired, async (c) => {
  if (c.get('role') !== 'client') return c.json({ error: 'Только клиенты' }, 403);
  const orders = await c.env.DB.prepare(
    `SELECT o.*, d.username AS driver_name FROM taxi_orders o LEFT JOIN taxi_users d ON d.id = o.driver_id WHERE o.client_id = ? AND o.status IN ('completed', 'cancelled') ORDER BY o.created_at DESC LIMIT 50`
  ).bind(c.get('userId')).all();
  return c.json(orders.results || []);
});

app.post('/api/orders/:id/cancel', authRequired, async (c) => {
  const orderId = c.req.param('id');
  const result = await c.env.DB.prepare(`UPDATE taxi_orders SET status = 'cancelled', completed_at = datetime('now') WHERE id = ? AND client_id = ? AND status IN ('pending', 'accepted', 'on_way', 'waiting') RETURNING *`).bind(orderId, c.get('userId')).first();
  if (!result) return c.json({ error: 'Не найден' }, 404);
  return c.json(result);
});

// НОВЫЙ РОУТ: Отмена заказа водителем с причиной
app.post('/api/orders/:id/driver-cancel', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orderId = c.req.param('id');
  const { reason } = await c.req.json();
  
  if (!reason || !reason.trim()) return c.json({ error: 'Укажите причину отмены' }, 400);

  const result = await c.env.DB.prepare(
    `UPDATE taxi_orders SET status = 'cancelled', completed_at = datetime('now'), cancel_reason = ? WHERE id = ? AND driver_id = ? AND status IN ('accepted', 'on_way', 'waiting') RETURNING *`
  ).bind(reason.trim(), orderId, c.get('userId')).first();
  
  if (!result) return c.json({ error: 'Заказ не найден или уже завершен' }, 404);

  // Пуш клиенту об отмене
  try {
    await sendPush(c.env, [result.client_id], '❌ Заказ отменен водителем', `Причина: ${reason.trim()}`);
  } catch (err) {}

  return c.json(result);
});

// ============================================================
// ВОДИТЕЛЬ
// ============================================================
app.post('/api/driver/shift', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const { is_on_shift } = await c.req.json();
  const shiftVal = is_on_shift ? 1 : 0;
  let queuePos = 0;
  if (shiftVal === 1) {
    const max = await c.env.DB.prepare('SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1').bind('driver').first();
    queuePos = (max.max_pos || 0) + 1;
  }
  await c.env.DB.prepare('UPDATE taxi_users SET is_on_shift = ?, queue_position = ? WHERE id = ?').bind(shiftVal, queuePos, c.get('userId')).run();
  return c.json({ success: true, is_on_shift: shiftVal, queue_position: queuePos });
});

app.post('/api/driver/delivery', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const { accepts_delivery } = await c.req.json();
  await c.env.DB.prepare('UPDATE taxi_users SET accepts_delivery = ? WHERE id = ?').bind(accepts_delivery ? 1 : 0, c.get('userId')).run();
  return c.json({ success: true });
});

app.get('/api/driver/my-order', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  
  let order = await c.env.DB.prepare(
    `SELECT o.*, u.username AS client_name, u.phone AS client_phone FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id WHERE o.driver_id = ? AND o.status IN ('accepted', 'on_way', 'waiting') ORDER BY o.accepted_at DESC LIMIT 1`
  ).bind(c.get('userId')).first();
  if (order) return c.json({ order, type: 'active' });

  order = await c.env.DB.prepare(
    `SELECT o.*, u.username AS client_name, u.phone AS client_phone FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id WHERE o.assigned_to = ? AND o.status = 'pending' ORDER BY o.created_at ASC LIMIT 1`
  ).bind(c.get('userId')).first();
  if (order) return c.json({ order, type: 'assigned' });

  const me = await c.env.DB.prepare('SELECT is_on_shift FROM taxi_users WHERE id = ?').bind(c.get('userId')).first();
  if (me?.is_on_shift) {
    const freeOrder = await c.env.DB.prepare(
      `SELECT o.*, u.username AS client_name, u.phone AS client_phone FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id WHERE o.status = 'pending' AND o.assigned_to IS NULL AND (o.scheduled_at IS NULL OR o.scheduled_at <= datetime('now', '+30 minutes')) ORDER BY o.created_at ASC LIMIT 1`
    ).first();
    
    if (freeOrder) {
      return c.json({ order: freeOrder, type: 'assigned' });
    }
  }
  
  return c.json({ order: null, type: 'idle' });
});

app.get('/api/driver/my-history', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orders = await c.env.DB.prepare(
    `SELECT o.*, u.username AS client_name FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id WHERE o.driver_id = ? AND o.status = 'completed' ORDER BY o.completed_at DESC LIMIT 50`
  ).bind(c.get('userId')).all();

  const stats = await c.env.DB.prepare(`
    SELECT 
      SUM(CASE WHEN date(completed_at) = date('now') THEN price ELSE 0 END) AS today,
      SUM(CASE WHEN completed_at >= date('now', '-7 days') THEN price ELSE 0 END) AS week,
      SUM(CASE WHEN completed_at >= date('now', '-30 days') THEN price ELSE 0 END) AS month,
      SUM(price) AS all_time
    FROM taxi_orders 
    WHERE driver_id = ? AND status = 'completed'
  `).bind(c.get('userId')).first();

  return c.json({ orders: orders.results || [], stats });
});

app.post('/api/orders/:id/accept', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orderId = c.req.param('id');
  const driverId = c.get('userId');
  
  const result = await c.env.DB.prepare(
    `UPDATE taxi_orders SET driver_id = ?, status = 'accepted', accepted_at = datetime('now'), assigned_to = NULL WHERE id = ? AND status = 'pending' AND driver_id IS NULL RETURNING *`
  ).bind(driverId, orderId).first();
  
  if (!result) return c.json({ error: 'Заказ уже занят' }, 409);

  try {
    await sendPush(c.env, [result.client_id], '🚖 Водитель найден!', 'Ваш заказ принят. Ожидайте прибытия машины.');
  } catch (err) { console.error('PUSH ACCEPT ERROR:', err); }

  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1').bind('driver').first();
  await c.env.DB.prepare('UPDATE taxi_users SET queue_position = ?, last_order_at = datetime("now") WHERE id = ?').bind((max.max_pos || 0) + 1, driverId).run();
  
  return c.json(result);
});

app.post('/api/orders/:id/decline', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orderId = c.req.param('id');
  const driverId = c.get('userId');
  const order = await c.env.DB.prepare('SELECT declined_by FROM taxi_orders WHERE id = ?').bind(orderId).first();
  if (!order) return c.json({ error: 'Не найден' }, 404);
  const declined = JSON.parse(order.declined_by || '[]');
  if (!declined.includes(driverId)) declined.push(driverId);
  await c.env.DB.prepare('UPDATE taxi_orders SET declined_by = ?, assigned_to = NULL WHERE id = ?').bind(JSON.stringify(declined), orderId).run();
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1').bind('driver').first();
  await c.env.DB.prepare('UPDATE taxi_users SET queue_position = ? WHERE id = ?').bind((max.max_pos || 0) + 1, driverId).run();
  return c.json({ success: true });
});

app.post('/api/orders/:id/status', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orderId = c.req.param('id');
  const { status } = await c.req.json();
  const allowed = ['on_way', 'waiting', 'completed'];
  if (!allowed.includes(status)) return c.json({ error: 'Неверный статус' }, 400);
  
  const timeField = status === 'on_way' ? 'on_way_at' : status === 'waiting' ? 'waiting_at' : 'completed_at';
  
  const result = await c.env.DB.prepare(
    `UPDATE taxi_orders SET status = ?, ${timeField} = datetime('now') WHERE id = ? AND driver_id = ? AND status IN ('accepted', 'on_way', 'waiting') RETURNING *`
  ).bind(status, orderId, c.get('userId')).first();
  
  if (!result) return c.json({ error: 'Не найден' }, 404);

  try {
    const messages = {
      'on_way': { title: '🚖 Водитель в пути', body: 'Ваш водитель уже выехал за вами!' },
      'waiting': { title: '📍 Водитель на месте', body: 'Водитель ожидает вас по адресу. Пожалуйста, выходите.' },
      'completed': { title: '✅ Поездка завершена', body: 'Спасибо за поездку! Будем рады видеть вас снова.' }
    };
    const msg = messages[status];
    if (msg) {
      await sendPush(c.env, [result.client_id], msg.title, msg.body);
    }
  } catch (err) { console.error('PUSH STATUS ERROR:', err); }

  return c.json(result);
});

// ============================================================
// ЧАТ
// ============================================================
app.get('/api/orders/:id/messages', authRequired, async (c) => {
  const messages = await c.env.DB.prepare(`SELECT m.*, u.username FROM taxi_messages m JOIN taxi_users u ON u.id = m.sender_id WHERE m.order_id = ? ORDER BY m.created_at ASC`).bind(c.req.param('id')).all();
  return c.json(messages.results || []);
});

app.post('/api/orders/:id/messages', authRequired, async (c) => {
  const { text } = await c.req.json();
  if (!text || !text.trim()) return c.json({ error: 'Пустое сообщение' }, 400);
  const result = await c.env.DB.prepare(`INSERT INTO taxi_messages (order_id, sender_id, sender_role, text) VALUES (?, ?, ?, ?) RETURNING *`).bind(c.req.param('id'), c.get('userId'), c.get('role'), text.trim()).first();
  return c.json(result);
});

// ============================================================
// АДМИН
// ============================================================
app.get('/api/admin/orders', authRequired, adminRequired, async (c) => {
  const orders = await c.env.DB.prepare(
    `SELECT o.*, cl.username AS client_name, cl.phone AS client_phone, d.username AS driver_name, d.phone AS driver_phone, d.car_model, d.car_number FROM taxi_orders o LEFT JOIN taxi_users cl ON cl.id = o.client_id LEFT JOIN taxi_users d ON d.id = o.driver_id ORDER BY o.created_at DESC LIMIT 100`
  ).all();
  return c.json(orders.results || []);
});

app.delete('/api/admin/orders/:id', authRequired, adminRequired, async (c) => {
  await c.env.DB.prepare('DELETE FROM taxi_orders WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

app.get('/api/admin/drivers/pending', authRequired, adminRequired, async (c) => {
  const drivers = await c.env.DB.prepare(`SELECT id, username, phone, car_model, car_number, created_at FROM taxi_users WHERE role = 'driver' AND status = 'pending' ORDER BY created_at DESC`).all();
  return c.json(drivers.results || []);
});

app.get('/api/admin/drivers', authRequired, adminRequired, async (c) => {
  const drivers = await c.env.DB.prepare(`SELECT id, username, phone, car_model, car_number, status, is_on_shift, queue_position, accepts_delivery, created_at FROM taxi_users WHERE role = 'driver' ORDER BY queue_position ASC`).all();
  return c.json(drivers.results || []);
});

app.post('/api/admin/drivers/:id/approve', authRequired, adminRequired, async (c) => {
  const result = await c.env.DB.prepare(`UPDATE taxi_users SET status = 'active' WHERE id = ? AND role = 'driver' RETURNING id, username, status`).bind(c.req.param('id')).first();
  if (!result) return c.json({ error: 'Не найден' }, 404);
  return c.json(result);
});

app.post('/api/admin/drivers/:id/block', authRequired, adminRequired, async (c) => {
  const result = await c.env.DB.prepare(`UPDATE taxi_users SET status = 'blocked', is_on_shift = 0 WHERE id = ? AND role = 'driver' RETURNING id, username, status`).bind(c.req.param('id')).first();
  if (!result) return c.json({ error: 'Не найден' }, 404);
  return c.json(result);
});

app.delete('/api/admin/drivers/:id', authRequired, adminRequired, async (c) => {
  await c.env.DB.prepare('DELETE FROM taxi_users WHERE id = ? AND role = ?').bind(c.req.param('id'), 'driver').run();
  return c.json({ success: true });
});

app.get('/api/admin/stats', authRequired, adminRequired, async (c) => {
  const todayOrders = await c.env.DB.prepare(`SELECT COUNT(*) as c FROM taxi_orders WHERE date(created_at) = date('now')`).first();
  const todayCompleted = await c.env.DB.prepare(`SELECT COUNT(*) as c FROM taxi_orders WHERE date(completed_at) = date('now') AND status = 'completed'`).first();
  const onShift = await c.env.DB.prepare(`SELECT COUNT(*) as c FROM taxi_users WHERE role = 'driver' AND is_on_shift = 1`).first();
  const revenueToday = await c.env.DB.prepare(`SELECT SUM(price) as s FROM taxi_orders WHERE date(completed_at) = date('now') AND status = 'completed'`).first();
  const revenueAll = await c.env.DB.prepare(`SELECT SUM(price) as s FROM taxi_orders WHERE status = 'completed'`).first();

  return c.json({
    ordersToday: todayOrders.c || 0,
    completedToday: todayCompleted.c || 0,
    driversOnShift: onShift.c || 0,
    revenueToday: revenueToday.s || 0,
    revenueAll: revenueAll.s || 0
  });
});

app.get('/api/admin/prices', authRequired, adminRequired, async (c) => {
  const streets = await c.env.DB.prepare('SELECT * FROM taxi_streets ORDER BY display_name ASC').all();
  const locations = await c.env.DB.prepare('SELECT * FROM taxi_locations ORDER BY display_name ASC').all();
  return c.json({ streets: streets.results || [], locations: locations.results || [] });
});

app.post('/api/admin/prices/update', authRequired, adminRequired, async (c) => {
  const { type, id, price } = await c.req.json();
  const table = type === 'street' ? 'taxi_streets' : 'taxi_locations';
  await c.env.DB.prepare(`UPDATE ${table} SET price = ? WHERE id = ?`).bind(price, id).run();
  return c.json({ success: true });
});

app.get('/api/admin/admins', authRequired, adminRequired, async (c) => {
  const admins = await c.env.DB.prepare('SELECT id, username, created_at FROM taxi_users WHERE role = ? ORDER BY id ASC').bind('admin').all();
  return c.json(admins.results || []);
});

app.post('/api/admin/admins', authRequired, adminRequired, async (c) => {
  try {
    const { username, password } = await c.req.json();
    if (!username || username.trim().length < 2) return c.json({ error: 'Имя минимум 2 символа' }, 400);
    if (!password || !/^\d{4}$/.test(password)) return c.json({ error: 'Пароль — ровно 4 цифры' }, 400);
    const existing = await c.env.DB.prepare('SELECT id FROM taxi_users WHERE username = ? AND password_hash = ?').bind(username.trim(), await hashPassword(password)).first();
    if (existing) return c.json({ error: 'Такой админ уже существует' }, 400);
    const hash = await hashPassword(password);
    const result = await c.env.DB.prepare(`INSERT INTO taxi_users (username, password_hash, role, status) VALUES (?, ?, 'admin', 'active') RETURNING id, username`).bind(username.trim(), hash).first();
    return c.json(result);
  } catch (err) { return c.json({ error: 'Ошибка' }, 500); }
});

app.delete('/api/admin/admins/:id', authRequired, adminRequired, async (c) => {
  const targetId = c.req.param('id');
  if (targetId == c.get('userId')) return c.json({ error: 'Нельзя удалить себя' }, 400);
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM taxi_users WHERE role = ?').bind('admin').first();
  if (count.cnt <= 1) return c.json({ error: 'Нельзя удалить последнего админа' }, 400);
  await c.env.DB.prepare('DELETE FROM taxi_users WHERE id = ? AND role = ?').bind(targetId, 'admin').run();
  return c.json({ success: true });
});

export default app;