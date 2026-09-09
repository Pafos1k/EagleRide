import React from 'react';

const Logo: React.FC<{ className?: string, imageClassName?: string }> = ({ className, imageClassName = "w-[200px] h-[200px]" }) => {
  return (
    <div className={`flex items-center justify-start ${className}`}>
      <img src="/EagleLogo.png" alt="EagleRide Logo" className={`${imageClassName} object-contain`} />
    </div>
  );
};

export default Logo;
