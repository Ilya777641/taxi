import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'https://taxi.my-money.site',
    'https://taxi.pages.dev',
  ],
  credentials: true,
}));

// ============================================================
// BASE64URL — UTF-8 SAFE
// ============================================================

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ============================================================
// ПАРОЛЬ — SHA-256
// ============================================================

async function hashPassword(password) {
  const data = new TextEncoder().encode(password + 'taxi_salt_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password, hash) {
  return (await hashPassword(password)) === hash;
}

// ============================================================
// JWT — UTF-8 SAFE
// ============================================================

async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 7 * 24 * 60 * 60 };

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigBytes = new Uint8Array(signature);
  let sigBinary = '';
  for (const b of sigBytes) sigBinary += String.fromCharCode(b);
  const sigB64 = btoa(sigBinary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [headerB64, bodyB64, sigB64] = token.split('.');
    const data = `${headerB64}.${bodyB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - sigB64.length % 4) % 4)),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes, new TextEncoder().encode(data)
    );

    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(bodyB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// НОЧНОЙ ТАРИФ
// ============================================================

function isNightTime() {
  const now = new Date();
  const hour = (now.getUTCHours() + 5) % 24; // UTC+5 (Башкортостан)
  return hour >= 0 && hour < 6;
}

// ============================================================
// MIDDLEWARE
// ============================================================

async function authRequired(c, next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Не авторизован' }, 401);
  }
  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET || 'taxi-secret-key-change');
  if (!payload) return c.json({ error: 'Токен недействителен' }, 401);

  c.set('userId', payload.id);
  c.set('username', payload.username);
  c.set('role', payload.role);
  await next();
}

async function adminRequired(c, next) {
  if (c.get('role') !== 'admin') {
    return c.json({ error: 'Доступ запрещён' }, 403);
  }
  await next();
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

    if (!username || username.trim().length < 4) {
      return c.json({ error: 'Логин минимум 4 символа' }, 400);
    }
    if (!password || !/^\d{4}$/.test(password)) {
      return c.json({ error: 'Пароль — ровно 4 цифры' }, 400);
    }
    if (!['client', 'driver'].includes(role)) {
      return c.json({ error: 'Роль: client или driver' }, 400);
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM taxi_users WHERE username = ?'
    ).bind(username.trim()).first();
    if (existing) return c.json({ error: 'Такой логин уже занят' }, 400);

    const hash = await hashPassword(password);
    const status = role === 'driver' ? 'pending' : 'active';

    const result = await c.env.DB.prepare(
      `INSERT INTO taxi_users (username, password_hash, role, phone, car_model, car_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, username, role, status`
    ).bind(
      username.trim(), hash, role,
      phone || null, car_model || null, car_number || null,
      status
    ).first();

    const token = status === 'active'
      ? await createJWT(
          { id: result.id, username: result.username, role: result.role },
          c.env.JWT_SECRET || 'taxi-secret-key-change'
        )
      : null;

    return c.json({ token, user: result, pending: status === 'pending' });
  } catch (err) {
    console.error('REGISTER ERROR:', err.message, err.stack);
    return c.json({ error: 'Ошибка регистрации' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    const user = await c.env.DB.prepare(
      'SELECT id, username, password_hash, role, status FROM taxi_users WHERE username = ?'
    ).bind(username?.trim()).first();

    if (!user) return c.json({ error: 'Неверный логин или пароль' }, 401);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return c.json({ error: 'Неверный логин или пароль' }, 401);

    if (user.status === 'blocked') return c.json({ error: 'Аккаунт заблокирован' }, 403);
    if (user.status === 'pending') return c.json({ error: 'Аккаунт на модерации', pending: true }, 403);

    const token = await createJWT(
      { id: user.id, username: user.username, role: user.role },
      c.env.JWT_SECRET || 'taxi-secret-key-change'
    );

    return c.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message, err.stack);
    return c.json({ error: 'Ошибка входа' }, 500);
  }
});

app.get('/api/auth/me', authRequired, async (c) => {
  const user = await c.env.DB.prepare(
    'SELECT id, username, role, phone, car_model, car_number, status, is_online, is_on_shift, accepts_delivery, queue_position FROM taxi_users WHERE id = ?'
  ).bind(c.get('userId')).first();
  if (!user) return c.json({ error: 'Не найден' }, 404);
  return c.json(user);
});

app.post('/api/auth/change-password', authRequired, async (c) => {
  try {
    const { oldPassword, newPassword } = await c.req.json();
    if (!/^\d{4}$/.test(oldPassword) || !/^\d{4}$/.test(newPassword)) {
      return c.json({ error: 'Пароли — 4 цифры' }, 400);
    }
    const user = await c.env.DB.prepare(
      'SELECT password_hash FROM taxi_users WHERE id = ?'
    ).bind(c.get('userId')).first();

    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) return c.json({ error: 'Старый пароль неверный' }, 401);

    const newHash = await hashPassword(newPassword);
    await c.env.DB.prepare('UPDATE taxi_users SET password_hash = ? WHERE id = ?')
      .bind(newHash, c.get('userId')).run();

    return c.json({ success: true });
  } catch (err) {
    console.error('CHANGE PW ERROR:', err.message);
    return c.json({ error: 'Ошибка' }, 500);
  }
});

// ============================================================
// ОПРЕДЕЛЕНИЕ ЦЕНЫ
// ============================================================

async function calculatePrice(db, address) {
  if (!address) return { price: 0, type: 'local', found: false };

  const words = address.toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);

  // 1. Населённые пункты
  for (const word of words) {
    const loc = await db.prepare(
      'SELECT price, display_name FROM taxi_locations WHERE LOWER(keyword) = ?'
    ).bind(word).first();
    if (loc) return { price: loc.price, type: 'long', found: true, matched: loc.display_name };
  }

  // 2. Улицы
  for (const word of words) {
    const street = await db.prepare(
      'SELECT price, display_name FROM taxi_streets WHERE LOWER(keyword) = ?'
    ).bind(word).first();
    if (street) return { price: street.price, type: 'local', found: true, matched: street.display_name };
  }

  return { price: 0, type: 'local', found: false };
}

// ============================================================
// ЗАКАЗЫ — КЛИЕНТ
// ============================================================

app.post('/api/orders', authRequired, async (c) => {
  try {
    if (c.get('role') !== 'client') return c.json({ error: 'Только клиенты' }, 403);

    const { order_kind, address, address_to, delivery_item, delivery_from } = await c.req.json();

    if (!address_to || !address_to.trim()) return c.json({ error: 'Введите адрес назначения' }, 400);
    if (order_kind === 'taxi' && (!address || !address.trim())) return c.json({ error: 'Введите адрес откуда' }, 400);
    if (order_kind === 'delivery' && (!delivery_item || !delivery_from)) return c.json({ error: 'Введите что и откуда доставить' }, 400);

    const priceInfo = await calculatePrice(c.env.DB, address_to);
    if (!priceInfo.found) return c.json({ error: 'Не могу определить цену по адресу. Обратитесь к оператору.' }, 400);

    let finalPrice = priceInfo.price;
    if (isNightTime() && priceInfo.type === 'long') finalPrice += 100;

    const result = await c.env.DB.prepare(
      `INSERT INTO taxi_orders 
        (client_id, order_kind, order_type, address, address_to, delivery_item, delivery_from, price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
       RETURNING *`
    ).bind(
      c.get('userId'),
      order_kind || 'taxi',
      priceInfo.type,
      address || null,
      address_to.trim(),
      delivery_item || null,
      delivery_from || null,
      finalPrice
    ).first();

    return c.json(result);
  } catch (err) {
    console.error('ORDER CREATE ERROR:', err.message);
    return c.json({ error: 'Ошибка создания заказа' }, 500);
  }
});

app.get('/api/orders/my-active', authRequired, async (c) => {
  const order = await c.env.DB.prepare(
    `SELECT o.*, d.username AS driver_name, d.phone AS driver_phone, d.car_model, d.car_number
     FROM taxi_orders o
     LEFT JOIN taxi_users d ON d.id = o.driver_id
     WHERE o.client_id = ? AND o.status IN ('pending', 'accepted', 'on_way', 'waiting')
     ORDER BY o.created_at DESC LIMIT 1`
  ).bind(c.get('userId')).first();
  return c.json(order || null);
});

app.post('/api/orders/:id/cancel', authRequired, async (c) => {
  const orderId = c.req.param('id');
  const result = await c.env.DB.prepare(
    `UPDATE taxi_orders SET status = 'cancelled', completed_at = datetime('now')
     WHERE id = ? AND client_id = ? AND status IN ('pending', 'accepted', 'on_way', 'waiting')
     RETURNING *`
  ).bind(orderId, c.get('userId')).first();
  if (!result) return c.json({ error: 'Заказ не найден' }, 404);
  return c.json(result);
});

// ============================================================
// ЗАКАЗЫ — ВОДИТЕЛЬ
// ============================================================

app.post('/api/driver/shift', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const { is_on_shift } = await c.req.json();
  const shiftVal = is_on_shift ? 1 : 0;

  let queuePos = 0;
  if (shiftVal === 1) {
    const max = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1'
    ).bind('driver').first();
    queuePos = (max.max_pos || 0) + 1;
  }

  await c.env.DB.prepare('UPDATE taxi_users SET is_on_shift = ?, queue_position = ? WHERE id = ?')
    .bind(shiftVal, queuePos, c.get('userId')).run();

  return c.json({ success: true, is_on_shift: shiftVal, queue_position: queuePos });
});

app.post('/api/driver/delivery', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const { accepts_delivery } = await c.req.json();
  await c.env.DB.prepare('UPDATE taxi_users SET accepts_delivery = ? WHERE id = ?')
    .bind(accepts_delivery ? 1 : 0, c.get('userId')).run();
  return c.json({ success: true });
});

app.get('/api/driver/my-order', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);

  let order = await c.env.DB.prepare(
    `SELECT o.*, u.username AS client_name, u.phone AS client_phone
     FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id
     WHERE o.driver_id = ? AND o.status IN ('accepted', 'on_way', 'waiting')
     ORDER BY o.accepted_at DESC LIMIT 1`
  ).bind(c.get('userId')).first();

  if (order) return c.json({ order, type: 'active' });

  order = await c.env.DB.prepare(
    `SELECT o.*, u.username AS client_name, u.phone AS client_phone
     FROM taxi_orders o JOIN taxi_users u ON u.id = o.client_id
     WHERE o.assigned_to = ? AND o.status = 'pending'
     ORDER BY o.created_at ASC LIMIT 1`
  ).bind(c.get('userId')).first();

  if (order) return c.json({ order, type: 'assigned' });
  return c.json({ order: null, type: 'idle' });
});

app.post('/api/orders/:id/accept', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);

  const orderId = c.req.param('id');
  const driverId = c.get('userId');

  const result = await c.env.DB.prepare(
    `UPDATE taxi_orders
     SET driver_id = ?, status = 'accepted', accepted_at = datetime('now'), assigned_to = NULL
     WHERE id = ? AND status = 'pending' AND assigned_to = ?
     RETURNING *`
  ).bind(driverId, orderId, driverId).first();

  if (!result) return c.json({ error: 'Заказ уже принят или не назначен вам' }, 409);

  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1'
  ).bind('driver').first();

  await c.env.DB.prepare('UPDATE taxi_users SET queue_position = ?, last_order_at = datetime("now") WHERE id = ?')
    .bind((max.max_pos || 0) + 1, driverId).run();

  return c.json(result);
});

app.post('/api/orders/:id/decline', authRequired, async (c) => {
  if (c.get('role') !== 'driver') return c.json({ error: 'Только водители' }, 403);
  const orderId = c.req.param('id');
  const driverId = c.get('userId');

  const order = await c.env.DB.prepare('SELECT declined_by FROM taxi_orders WHERE id = ?')
    .bind(orderId).first();
  if (!order) return c.json({ error: 'Не найден' }, 404);

  const declined = JSON.parse(order.declined_by || '[]');
  if (!declined.includes(driverId)) declined.push(driverId);

  await c.env.DB.prepare('UPDATE taxi_orders SET declined_by = ?, assigned_to = NULL WHERE id = ?')
    .bind(JSON.stringify(declined), orderId).run();

  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(queue_position), 0) AS max_pos FROM taxi_users WHERE role = ? AND is_on_shift = 1'
  ).bind('driver').first();
  await c.env.DB.prepare('UPDATE taxi_users SET queue_position = ? WHERE id = ?')
    .bind((max.max_pos || 0) + 1, driverId).run();

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
    `UPDATE taxi_orders SET status = ?, ${timeField} = datetime('now')
     WHERE id = ? AND driver_id = ? AND status IN ('accepted', 'on_way', 'waiting')
     RETURNING *`
  ).bind(status, orderId, c.get('userId')).first();

  if (!result) return c.json({ error: 'Не найден или не ваш заказ' }, 404);
  return c.json(result);
});

// ============================================================
// ЧАТ
// ============================================================

app.get('/api/orders/:id/messages', authRequired, async (c) => {
  const messages = await c.env.DB.prepare(
    `SELECT m.*, u.username FROM taxi_messages m
     JOIN taxi_users u ON u.id = m.sender_id
     WHERE m.order_id = ? ORDER BY m.created_at ASC`
  ).bind(c.req.param('id')).all();
  return c.json(messages.results || []);
});

app.post('/api/orders/:id/messages', authRequired, async (c) => {
  const { text } = await c.req.json();
  if (!text || !text.trim()) return c.json({ error: 'Пустое сообщение' }, 400);

  const result = await c.env.DB.prepare(
    `INSERT INTO taxi_messages (order_id, sender_id, sender_role, text)
     VALUES (?, ?, ?, ?) RETURNING *`
  ).bind(c.req.param('id'), c.get('userId'), c.get('role'), text.trim()).first();

  return c.json(result);
});

// ============================================================
// АДМИН
// ============================================================

app.get('/api/admin/orders', authRequired, adminRequired, async (c) => {
  const orders = await c.env.DB.prepare(
    `SELECT o.*, 
            cl.username AS client_name, cl.phone AS client_phone,
            d.username AS driver_name, d.phone AS driver_phone,
            d.car_model, d.car_number
     FROM taxi_orders o
     LEFT JOIN taxi_users cl ON cl.id = o.client_id
     LEFT JOIN taxi_users d ON d.id = o.driver_id
     ORDER BY o.created_at DESC LIMIT 100`
  ).all();
  return c.json(orders.results || []);
});

app.get('/api/admin/drivers/pending', authRequired, adminRequired, async (c) => {
  const drivers = await c.env.DB.prepare(
    `SELECT id, username, phone, car_model, car_number, created_at
     FROM taxi_users WHERE role = 'driver' AND status = 'pending'
     ORDER BY created_at DESC`
  ).all();
  return c.json(drivers.results || []);
});

app.get('/api/admin/drivers', authRequired, adminRequired, async (c) => {
  const drivers = await c.env.DB.prepare(
    `SELECT id, username, phone, car_model, car_number, status, is_on_shift, queue_position, accepts_delivery, created_at
     FROM taxi_users WHERE role = 'driver' ORDER BY queue_position ASC`
  ).all();
  return c.json(drivers.results || []);
});

app.post('/api/admin/drivers/:id/approve', authRequired, adminRequired, async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE taxi_users SET status = 'active' WHERE id = ? AND role = 'driver' RETURNING id, username, status`
  ).bind(c.req.param('id')).first();
  if (!result) return c.json({ error: 'Не найден' }, 404);
  return c.json(result);
});

app.post('/api/admin/drivers/:id/block', authRequired, adminRequired, async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE taxi_users SET status = 'blocked', is_on_shift = 0 WHERE id = ? AND role = 'driver' RETURNING id, username, status`
  ).bind(c.req.param('id')).first();
  if (!result) return c.json({ error: 'Не найден' }, 404);
  return c.json(result);
});

export default app;