import React, { useEffect, useState } from "react";
import { FaMinus, FaThumbtack } from "react-icons/fa";

interface CustomTitleBarProps {
  title?: string;
  className?: string;
}

const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ 
  title = "Sistema de Monitoreo",
  className = ""
}) => {
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchPinnedState = async () => {
      try {
        const result = await window.api.getAlwaysOnTop();
        if (!mounted) return;
        setIsPinned(Boolean((result as { alwaysOnTop?: boolean })?.alwaysOnTop));
      } catch (error) {
        console.warn("No se pudo obtener el estado de siempre visible", error);
      }
    };

    void fetchPinnedState();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleAlwaysOnTop = async () => {
    try {
      const desiredState = !isPinned;
      const result = await window.api.setAlwaysOnTop(desiredState);
      setIsPinned(Boolean((result as { alwaysOnTop?: boolean })?.alwaysOnTop ?? desiredState));
    } catch (error) {
      console.error("Error cambiando la visibilidad fija de la ventana", error);
    }
  };

  const minimizeWindow = () => {
    window.api.minimizeWindow();
  };

  return (
    <div className={`flex justify-between items-center bg-gray-600 text-white p-2 drag-region border-b border-gray-700 ${className}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="flex">
        <button
          onClick={toggleAlwaysOnTop}
          title={isPinned ? "Quitar siempre visible" : "Mantener siempre visible"}
          className={`w-8 h-6 flex items-center justify-center transition-colors no-drag ${
            isPinned ? "bg-gray-500 text-yellow-300" : "hover:bg-gray-500"
          }`}
        >
          <FaThumbtack size={12} />
        </button>
        <button
          onClick={minimizeWindow}
          className="w-8 h-6 flex items-center justify-center hover:bg-gray-500 transition-colors no-drag"
        >
          <FaMinus size={12} />
        </button>
      </div>
    </div>
  );
};

export default CustomTitleBar;
