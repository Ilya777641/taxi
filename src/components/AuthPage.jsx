import { useState, useEffect } from 'react';
import { API_URL } from '../config';

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('client');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Стейты для звонка
  const [callPhone, setCallPhone] = useState(null); // Номер для звонка
  const [checkId, setCheckId] = useState(null);     // ID проверки
  const [phoneVerified, setPhoneVerified] = useState(false); // Подтвержден ли номер
  const [polling, setPolling] = useState(false);    // Ожидание звонка

  // Инициализация звонка при регистрации
  const handleInitCall = async () => {
    if (!phone || phone.length < 10) {
      setError('Введите корректный номер телефона');
      return;
    }
    setError('');
    setInfo('');
    try {
      const res = await fetch(`${API_URL}/api/auth/register/init-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCallPhone(data.call_phone);
      setCheckId(data.check_id);
      setPolling(true);
      setInfo('Позвоните на указанный номер для подтверждения');
    } catch (err) {
      setError(err.message);
    }
  };

  // Автоматическая проверка статуса звонка
  useEffect(() => {
    if (!polling || !checkId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/register/check-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ check_id: checkId }),
        });
        const data = await res.json();

        if (data.verified) {
          setPhoneVerified(true);
          setPolling(false);
          setInfo('✅ Номер телефона подтвержден! Теперь нажмите "Зарегистрироваться".');
        }
      } catch (err) {
        console.error('Ошибка проверки статуса', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [polling, checkId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (username.trim().length < 2) {
      setError('Имя минимум 2 символа');
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      setError('Пароль — ровно 4 цифры');
      return;
    }

    if (mode === 'register' && !phoneVerified) {
      setError('Сначала подтвердите номер телефона звонком');
      return;
    }

    setLoading(true);
    try {
      const url = mode === 'login'
        ? `${API_URL}/api/auth/login`
        : `${API_URL}/api/auth/register`;

      const body = mode === 'login'
        ? { username: username.trim(), password }
        : {
            username: username.trim(),
            password,
            role,
            phone,
            car_model: role === 'driver' ? carModel : null,
            car_number: role === 'driver' ? carNumber : null,
            check_id: checkId, // Передаем ID успешной проверки
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Что-то пошло не так');
        setLoading(false);
        return;
      }

      if (data.pending) {
        setInfo('✅ Заявка отправлена. Ожидайте одобрения администратора.');
        setLoading(false);
        return;
      }

      onLogin(data.token, data.user);
    } catch (err) {
      console.error(err);
      setError('Ошибка соединения');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🚖</div>
        <h1 className="auth-title">Такси</h1>
        <p className="auth-subtitle">Вызов такси онлайн</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(''); setInfo(''); setPhoneVerified(false); setCallPhone(null); }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); setInfo(''); setPhoneVerified(false); setCallPhone(null); }}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Имя
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите имя"
              maxLength={30}
              required
            />
          </label>

          <label className="auth-label">
            Пароль (4 цифры)
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              maxLength={4}
              required
            />
          </label>

          {mode === 'register' && (
            <>
              <div className="auth-role-toggle">
                <button
                  type="button"
                  className={role === 'client' ? 'active' : ''}
                  onClick={() => setRole('client')}
                >
                  👤 Клиент
                </button>
                <button
                  type="button"
                  className={role === 'driver' ? 'active' : ''}
                  onClick={() => setRole('driver')}
                >
                  🚖 Водитель
                </button>
              </div>

              <label className="auth-label">
                Телефон
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Номер телефона"
                  disabled={phoneVerified || polling}
                />
              </label>

              {!phoneVerified && !callPhone && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleInitCall}
                  style={{ width: '100%', marginBottom: '10px' }}
                >
                  📞 Подтвердить номер звонком
                </button>
              )}

              {callPhone && !phoneVerified && (
                <div style={{ textAlign: 'center', marginTop: '10px', background: 'var(--black)', padding: '15px', borderRadius: '10px', border: '1px solid var(--yellow)' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>Позвоните с этого номера:</p>
                  <a href={`tel:${callPhone}`} style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--yellow)', textDecoration: 'none' }}>
                    {callPhone}
                  </a>
                  {polling && <p style={{ fontSize: '12px', color: 'var(--yellow)', marginTop: '5px' }}>⏳ Ожидание звонка...</p>}
                </div>
              )}

              {phoneVerified && (
                <div className="auth-info" style={{ textAlign: 'center', fontWeight: 'bold' }}>
                  ✅ Номер подтвержден
                </div>
              )}

              {role === 'driver' && (
                <>
                  <label className="auth-label">
                    Марка машины
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="Марка"
                      required
                    />
                  </label>

                  <label className="auth-label">
                    Номер машины
                    <input
                      type="text"
                      value={carNumber}
                      onChange={(e) => setCarNumber(e.target.value)}
                      placeholder="Госномер"
                      required
                    />
                  </label>
                </>
              )}
            </>
          )}

          {error && <div className="auth-error">⚠️ {error}</div>}
          {info && <div className="auth-info">✅ {info}</div>}

          <button type="submit" className="auth-submit" disabled={loading || (mode === 'register' && !phoneVerified)}>
            {loading ? 'Загрузка...' : (mode === 'login' ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthPage;