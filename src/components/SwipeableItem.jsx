import { useState, useRef } from 'react';

function SwipeableItem({ children, onDelete, onBlock, itemType }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const isSwiping = useRef(false);
  const containerRef = useRef(null);
  
  const ACTION_WIDTH = 80; // Ширина одной кнопки
  const MAX_OFFSET = onDelete && onBlock ? ACTION_WIDTH * 2 : ACTION_WIDTH; // Макс сдвиг

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;

    // Если свайп больше по горизонтали, чем по вертикали — блокируем скролл
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      // Разрешаем свайп только влево (отрицательный offset)
      let newOffset = Math.min(0, Math.max(-MAX_OFFSET, deltaX));
      setOffset(newOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current) return;
    
    // Если сдвинули больше половины — фиксируем открытым
    if (offset < -MAX_OFFSET / 2) {
      setOffset(-MAX_OFFSET);
    } else {
      setOffset(0);
    }
    startX.current = null;
    startY.current = null;
  };

  const closeSwipe = () => setOffset(0);

  return (
    <div className="swipe-container" ref={containerRef}>
      <div className="swipe-actions">
        {onBlock && (
          <button className="swipe-btn block" onClick={() => { closeSwipe(); onBlock(); }}>
            <span>🚫</span>
            Блок
          </button>
        )}
        {onDelete && (
          <button className="swipe-btn delete" onClick={() => { closeSwipe(); onDelete(); }}>
            <span>🗑️</span>
            Удалить
          </button>
        )}
      </div>
      <div
        className="swipe-content"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (offset !== 0) closeSwipe(); }}
      >
        {children}
      </div>
    </div>
  );
}

export default SwipeableItem;