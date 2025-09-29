import React from "react";

type CustomButtonProps = {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

const CustomButton: React.FC<CustomButtonProps> = ({
  onClick,
  children,
  className,
}) => {
  return (
    <button
      onClick={onClick}
      className={`focus:shadow-outline flex cursor-pointer items-center justify-center rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-600 focus:ring-2 focus:ring-blue-300 focus:outline-none ${className}`}
    >
      {children}
    </button>
  );
};

export default CustomButton;
