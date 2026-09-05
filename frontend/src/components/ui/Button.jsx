import { cn } from '../../lib/utils';

/**
 * Small shadcn-style button primitive. Keeping the variants here means
 * actions across the pipeline, import, and settings flows share one vocabulary.
 */
export function Button({ className, variant = 'primary', size = 'default', ...props }) {
  return (
    <button
      className={cn('button', `button-${variant}`, size === 'sm' && 'button-small', className)}
      {...props}
    />
  );
}
