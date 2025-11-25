import React from "react";
import { FaMinus } from "react-icons/fa";

interface CustomTitleBarProps {
  title?: string;
  className?: string;
}

const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ 
  title = "Sistema de Monitoreo",
  className = ""
}) => {
  const minimizeWindow = () => {
    window.api.minimizeWindow();
  };

  return (
    <div className={`flex justify-between items-center bg-gray-600 text-white p-2 drag-region border-b border-gray-700 ${className}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="flex">
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
