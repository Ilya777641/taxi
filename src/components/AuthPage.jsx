import { useState } from 'react';
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
            phone: phone || null,
            car_model: role === 'driver' ? carModel : null,
            car_number: role === 'driver' ? carNumber : null,
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
            onClick={() => { setMode('login'); setError(''); setInfo(''); }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError(''); setInfo(''); }}
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
              placeholder="Введите имя"  // <- Убрали "Например, Илья"
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
                  placeholder="Номер телефона" // <- Поменяли на понятный текст
                />
              </label>

              {role === 'driver' && (
                <>
                  <label className="auth-label">
                    Марка машины
                    <input
                      type="text"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                      placeholder="Марка" // <- Убрали "Lada Granta"
                      required
                    />
                  </label>

                  <label className="auth-label">
                    Номер машины
                    <input
                      type="text"
                      value={carNumber}
                      onChange={(e) => setCarNumber(e.target.value)}
                      placeholder="Госномер" // <- Убрали "А123БВ"
                      required
                    />
                  </label>
                </>
              )}
            </>
          )}

          {error && <div className="auth-error">⚠️ {error}</div>}
          {info && <div className="auth-info">✅ {info}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Загрузка...' : (mode === 'login' ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthPage;