import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

// Adaptación JSX del selector de Magic UI: mantiene el cambio inmediato y deja
// el acabado de movimiento en CSS para funcionar igual en todos los navegadores.
export function AnimatedThemeToggler({
  className,
  children,
  duration = 240,
  theme = "light",
  onThemeChange,
  ...props
}) {
  const isDark = theme === "dark"

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark"
    document.documentElement.style.setProperty("--theme-change-duration", `${duration}ms`)
    document.documentElement.classList.toggle("dark", nextTheme === "dark")
    onThemeChange?.(nextTheme)
  }

  return (
    <button type="button" onClick={toggleTheme} className={cn(className)} {...props}>
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {children}
      <span className="sr-only">Cambiar tema de color</span>
    </button>
  )
}
