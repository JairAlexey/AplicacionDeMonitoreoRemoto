import React, { useEffect } from "react";

type ToastProps = {
  message: string;
  onClose: () => void;
  duration?: number;
};

const Toast: React.FC<ToastProps> = ({ message, onClose, duration }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className="fixed right-0 top-5 z-[9999] animate-toast-slide-in rounded bg-white p-4 text-black shadow-lg"
      style={{
        minWidth: '200px',
        transform: 'translateX(100%)',
      }}
    >
      <div className="flex items-center justify-between">
        <span>{message}</span>
      </div>
    </div>
  );
};

export default Toast;
