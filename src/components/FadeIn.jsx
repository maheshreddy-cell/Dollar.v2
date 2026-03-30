/**
 * Wraps children in a slide-up fade animation.
 * Use `delay` (ms) to stagger multiple sibling elements.
 */
export default function FadeIn({ children, delay = 0, duration = 220 }) {
  return (
    <div
      className="animate-fade-in-up"
      style={{
        animationDelay:    `${delay}ms`,
        animationDuration: `${duration}ms`,
        animationFillMode: 'both',
      }}
    >
      {children}
    </div>
  )
}
