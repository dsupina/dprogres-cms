import { ButtonHTMLAttributes, ReactNode, ElementType } from 'react';
import { cn } from '../../lib/utils';
import LoadingSpinner from './LoadingSpinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'default';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  as?: ElementType;
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  as: Component = 'button',
  to,
  href,
  target,
  rel,
  ...props
}: ButtonProps) {
  const baseClasses = 'btn';
  
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
    outline: 'btn-outline',
    default: 'btn-default',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const componentProps = {
    className: cn(
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      className
    ),
    disabled: disabled || loading,
    ...(to && { to }),
    ...(href && { href }),
    ...(target && { target }),
    ...(rel && { rel }),
    ...props,
  };

  return (
    <Component {...componentProps}>
      {loading && <LoadingSpinner size="sm" className="mr-2" />}
      {icon && !loading && <span className="mr-2">{icon}</span>}
      {children}
    </Component>
  );
} 