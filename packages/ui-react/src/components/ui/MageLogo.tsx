import React from 'react';
import { useI18n } from '@/lib/i18n';

interface MageLogoProps {
  className?: string;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

export const MageLogo: React.FC<MageLogoProps> = ({
  className = '',
  width = 70,
  height = 70,
  isAnimated = false,
}) => {
  const { t } = useI18n();
  const imageClassName = [className, isAnimated ? 'mage-logo-glow' : ''].filter(Boolean).join(' ') || undefined;

  return (
    <>
      {isAnimated ? (
        <style>{`@keyframes mage-logo-glow{0%,100%{filter:drop-shadow(0 0 0 transparent)}50%{filter:drop-shadow(0 0 4px rgba(255,255,255,.55))}}.mage-logo-glow{animation:mage-logo-glow 1.8s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.mage-logo-glow{animation:none}}`}</style>
      ) : null}
      <img
        src="/pwa-192.png"
        width={width}
        height={height}
        className={imageClassName}
        alt={t('mageLogo.aria.logo')}
        draggable={false}
      />
    </>
  );
};
