import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * BottomSheet — v1.2 glass-strong sheet with spring slide.
 *
 * Animation contract:
 *   - Backdrop fades over the existing transition-opacity (220ms).
 *   - Sheet body slides on the spring-soft easing for 340ms. We swapped the
 *     v1.0 linear translate for the spring curve so the sheet "lands" with
 *     a smoothed glide instead of arriving abruptly. No overshoot — overshoot
 *     on bottom sheets reads as a glitch.
 *
 * Visual contract:
 *   - Switched from solid bg-surface + cyan top accent to glass-strong with
 *     a rounded-t-2xl. The top accent is replaced by the glass inset-top
 *     highlight, which reads as the lit edge of a window panel rising up.
 *   - Backdrop alpha bumped to 65% from 60% to ensure the sheet sits in clear
 *     focus over the ambient mesh. The mesh's cyan/teal radials are visually
 *     dense enough that 60% wasn't enough separation on busy screens.
 *
 * v1.2 follow-up — Portal to document.body.
 *
 *   Bug: every BottomSheet rendered inside a screen (Library sort, Savings
 *   goal editor, Savings invest sheet, etc.) appeared inline at the bottom
 *   of the scrollable page content instead of as a viewport-anchored modal.
 *   Even when "closed" (translate-y-full), both sheets sat visibly on the
 *   page because translate-y-full only pushed them down by their own height
 *   — and their containing block was the page, not the viewport.
 *
 *   Root cause: PageTransition (the route cross-fade in AppShell) applies
 *   the `animate-fade-in-up` keyframe whose 100% step sets
 *   `transform: translateY(0)`. Because the animation's fill-mode is `both`,
 *   that transform value persists indefinitely after the animation
 *   completes. Per CSS spec, ANY transform value other than `none` on an
 *   ancestor traps `position: fixed` descendants to that ancestor instead
 *   of the viewport. Sheet rendered inside the route → sheet trapped
 *   inside PageTransition → sheet anchored to page content height.
 *
 *   Fix: portal the sheet (backdrop + panel) directly to document.body so
 *   it sits OUTSIDE every transformed ancestor. Now `position: fixed`
 *   anchors to the viewport as intended. One change unblocks every sheet
 *   in the app without touching PageTransition's visual behavior.
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // SSR guard — no document during a server render. Capacitor + Vite both
  // run client-side, so this is purely belt-and-braces.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/65 backdrop-blur-sm z-40 transition-opacity duration-[220ms] ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 glass-strong rounded-t-2xl z-50 safe-bottom max-w-md mx-auto transition-transform duration-[340ms] ease-spring-soft ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* v1.2 follow-up — drag handle is now a real tap-to-close button.
            Wrapped <button> spans the full sheet width so a tap anywhere
            in the top strip dismisses, mirroring how every native iOS/Android
            sheet behaves. Inner pill remains the visual affordance. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-full flex justify-center pt-3 pb-2 press-spring"
          style={{ touchAction: 'manipulation' }}
        >
          <div className="w-12 h-1.5 rounded-full bg-text-muted/40" aria-hidden />
        </button>
        <div className="flex items-center justify-between px-5 pt-1 pb-2">
          <div className="font-heading font-bold text-base">{title}</div>
          {/* v1.2 follow-up — w-11 h-11 = 44px, the WCAG 2.5.5 touch-target
              minimum. The old w-8 h-8 (32px) was below threshold and got
              especially mushy on the glass-strong backdrop blur where
              touch precision drops. `touchAction: manipulation` disables
              double-tap-zoom delay so the dismiss feels snappy. */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted text-3xl leading-none active:text-primary press-spring w-11 h-11 flex items-center justify-center rounded-pill -mr-2"
            style={{ touchAction: 'manipulation' }}
          >
            ×
          </button>
        </div>
        {/* v1.2 follow-up — BUG-7. Cap the content area at ~75% of the
            viewport and let it scroll. Without this, tall sheets (the
            Fundamental breakdown is 8 signals + header + footer) overflow
            below the screen with no way to reach the bottom rows. The
            translate-y slide stays on the outer panel, which keeps the
            spring-soft entry animation intact; only the inner content
            scrolls. `overscroll-contain` stops scroll-chaining back to the
            underlying page so the user can't accidentally dismiss the
            ambient mesh while reading the sheet.

            75vh leaves a clear strip of the dim backdrop above the sheet
            so the modal feels anchored, not full-screen. */}
        <div
          className="px-5 pb-6 overflow-y-auto overscroll-contain"
          style={{ maxHeight: '75vh' }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
