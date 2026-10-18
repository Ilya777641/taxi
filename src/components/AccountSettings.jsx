import { useState } from 'react';
import { API_URL } from '../config';

function AccountSettings({ user, token, authFetch, onClose, onLogout, onUpdate }) {
  const [tab, setTab] = useState('profile');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState(user.username);
  const [carModel, setCarModel] = useState(user.car_model || '');
  const [carNumber, setCarNumber] = useState(user.car_number || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [carPhotoFile, setCarPhotoFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Функция для конвертации файла в Base64 (для отправки на бэкенд)
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Пароль изменён');
      setOldPassword(''); setNewPassword('');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleChangeUsername = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await authFetch('/api/auth/change-username', {
        method: 'POST',
        body: JSON.stringify({ newUsername }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Логин изменён');
      onUpdate({ ...user, username: newUsername });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleUpdateCar = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const res = await authFetch('/api/driver/car', {
        method: 'POST',
        body: JSON.stringify({ car_model: carModel, car_number: carNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Данные машины обновлены');
      onUpdate({ ...user, car_model: carModel, car_number: carNumber });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) return;
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const base64 = await fileToBase64(avatarFile);
      const res = await authFetch('/api/auth/avatar', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Аватарка обновлена');
      onUpdate({ ...user, avatar_url: data.avatar_url });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handleUploadCarPhoto = async () => {
    if (!carPhotoFile) return;
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const base64 = await fileToBase64(carPhotoFile);
      const res = await authFetch('/api/driver/car-photo', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Фото машины обновлено');
      onUpdate({ ...user, car_photo_url: data.car_photo_url });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Настройки</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-tabs">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Профиль</button>
          <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>Безопасность</button>
          {user.role === 'driver' && (
            <button className={tab === 'car' ? 'active' : ''} onClick={() => setTab('car')}>Машина</button>
          )}
        </div>

        {tab === 'profile' && (
          <div className="settings-section">
            <h3>Аватарка</h3>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="avatar" className="avatar-preview" />
            ) : (
              <div className="avatar-placeholder">👤</div>
            )}
            <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files[0])} />
            <button className="btn-primary" onClick={handleUploadAvatar} disabled={loading || !avatarFile}>
              Загрузить аватарку
            </button>

            <h3 style={{ marginTop: '24px' }}>Смена логина</h3>
            <form onSubmit={handleChangeUsername}>
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              <button type="submit" className="btn-primary" disabled={loading}>Сохранить логин</button>
            </form>
          </div>
        )}

        {tab === 'security' && (
          <div className="settings-section">
            <h3>Смена пароля</h3>
            <form onSubmit={handleChangePassword}>
              <label>Старый пароль
                <input type="text" inputMode="numeric" maxLength={4} value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value.replace(/\D/g, '').slice(0, 4))} required />
              </label>
              <label>Новый пароль
                <input type="text" inputMode="numeric" maxLength={4} value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 4))} required />
              </label>
              <button type="submit" className="btn-primary" disabled={loading}>Сменить пароль</button>
            </form>
          </div>
        )}

        {tab === 'car' && user.role === 'driver' && (
          <div className="settings-section">
            <h3>Данные машины</h3>
            <form onSubmit={handleUpdateCar}>
              <label>Модель
                <input type="text" value={carModel} onChange={(e) => setCarModel(e.target.value)} required />
              </label>
              <label>Номер
                <input type="text" value={carNumber} onChange={(e) => setCarNumber(e.target.value)} required />
              </label>
              <button type="submit" className="btn-primary" disabled={loading}>Сохранить</button>
            </form>

            <h3 style={{ marginTop: '24px' }}>Фото машины</h3>
            {user.car_photo_url ? (
              <img src={user.car_photo_url} alt="car" className="car-photo-preview" />
            ) : (
              <div className="car-placeholder">🚗</div>
            )}
            <input type="file" accept="image/*" onChange={(e) => setCarPhotoFile(e.target.files[0])} />
            <button className="btn-primary" onClick={handleUploadCarPhoto} disabled={loading || !carPhotoFile}>
              Загрузить фото
            </button>
          </div>
        )}

        {error && <div className="settings-error">⚠️ {error}</div>}
        {success && <div className="settings-success">✅ {success}</div>}

        <div className="settings-footer">
          <button className="btn-danger" style={{width: '100%'}} onClick={onLogout}>🚪 Выйти из аккаунта</button>
        </div>
      </div>
    </div>
  );
}

export default AccountSettings;