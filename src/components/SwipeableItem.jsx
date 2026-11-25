import { useState, useRef } from 'react';

function SwipeableItem({ children, onDelete, onBlock, customAction, actions, itemType }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const isSwiping = useRef(false);
  const containerRef = useRef(null);
  
  const ACTION_WIDTH = 80;
  
  const swipeActions = actions || (customAction ? [customAction] : onBlock ? [{
    text: 'Блок', color: '#f57c00', icon: '🚫', action: onBlock,
  }] : []);
  const MAX_OFFSET = ACTION_WIDTH * (swipeActions.length + (onDelete ? 1 : 0));

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      let newOffset = Math.min(0, Math.max(-MAX_OFFSET, deltaX));
      setOffset(newOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping.current) return;
    
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
        {swipeActions.map((action, index) => (
          <button
            key={`${action.text}-${index}`}
            className="swipe-btn"
            style={{ backgroundColor: action.color || '#f57c00' }}
            onClick={() => { closeSwipe(); action.action(); }}
          >
            <span>{action.icon || '🚫'}</span>
            {action.text}
          </button>
        ))}

        {/* Кнопка удаления */}
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
