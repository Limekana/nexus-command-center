import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Glass surface primitive — the v1.2 visual workhorse.
 *
 * Renders a translucent panel with backdrop blur, hairline border, and an
 * inset "lit edge" highlight. Sits on the ambient mesh (see body::before in
 * index.css) to create suite-wide depth. Variants control blur strength,
 * background alpha, and whether the surface is accent-lit.
 *
 *   default  panel / card — rounded-xl, mid blur, white inset edge
 *   strong   modal / sheet — heavier blur, more opaque, deeper shadow
 *   soft     floating chip / hover — low alpha, lighter blur
 *   glow     active / energized — cyan inset edge + halo
 *
 * Use this for new v1.2 surfaces (Insights pill backgrounds, ratings sheet,
 * Library shelf header, etc.). Existing `.card` callers stay as-is so we
 * don't churn the entire app — glass + card coexist in v1.2 and we migrate
 * surface-by-surface as visually warranted.
 */
export type GlassVariant = 'default' | 'strong' | 'soft' | 'glow';

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  variant?: GlassVariant;
  /** rounded preset — defaults to 'xl' (20px). Use 'pill' for chip-shaped
   *  containers, 't-2xl' for upward-revealing sheets. */
  radius?: 'md' | 'lg' | 'xl' | 'pill' | 't-2xl' | 'none';
  children?: ReactNode;
}

const VARIANT_CLASS: Record<GlassVariant, string> = {
  default: 'glass',
  strong:  'glass-strong',
  soft:    'glass-soft',
  glow:    'glass-glow',
};

const RADIUS_CLASS: Record<NonNullable<GlassProps['radius']>, string> = {
  md:     'rounded-md',
  lg:     'rounded-lg',
  xl:     'rounded-xl',
  pill:   'rounded-pill',
  't-2xl': 'rounded-t-2xl',
  none:   '',
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { variant = 'default', radius = 'xl', className = '', children, ...rest },
  ref,
) {
  const cls = [VARIANT_CLASS[variant], RADIUS_CLASS[radius], className]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});
