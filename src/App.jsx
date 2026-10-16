import AuthPage from './components/AuthPage';
import ClientCabinet from './components/ClientCabinet';
import DriverCabinet from './components/DriverCabinet';
import AdminCabinet from './components/AdminCabinet';
import { useAuth } from './useAuth';
import './App.css';

function App() {
  const { user, token, loading, login, logout, authFetch } = useAuth();

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