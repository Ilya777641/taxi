import { useEffect } from 'react';
import AuthPage from './components/AuthPage';
import ClientCabinet from './components/ClientCabinet';
import DriverCabinet from './components/DriverCabinet';
import AdminCabinet from './components/AdminCabinet';
import { useAuth } from './useAuth';
import { API_URL } from './config';
import './App.css';

function App() {
  const { user, token, loading, login, logout, authFetch } = useAuth();

  // Синхронизация с OneSignal
  useEffect(() => {
    if (!user || !token) return;

    const registerOneSignal = async () => {
      try {
        // Ждём загрузки OneSignal SDK
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          // Запрашиваем разрешение на пуши (если ещё не дано)
          await OneSignal.Notifications.requestPermission();
          
          // Получаем уникальный ID подписки (playerId)
          const externalId = OneSignal.User.PushSubscription.id;
          
          if (externalId) {
            // Отправляем на бэкенд, чтобы привязать к базе
            await fetch(`${API_URL}/api/auth/onesignal`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({ onesignal_id: externalId }),
            });
            console.log('OneSignal ID сохранён на сервере:', externalId);
          }
        });
      } catch (err) {
        console.error('Ошибка при привязке OneSignal:', err);
      }
    };

    registerOneSignal();
  }, [user, token]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={login} />;
  }

  if (user.role === 'admin') {
    return <AdminCabinet user={user} token={token} authFetch={authFetch} onLogout={logout} />;
  }
  if (user.role === 'driver') {
    return <DriverCabinet user={user} token={token} authFetch={authFetch} onLogout={logout} />;
  }
  return <ClientCabinet user={user} token={token} authFetch={authFetch} onLogout={logout} />;
}

export default App;