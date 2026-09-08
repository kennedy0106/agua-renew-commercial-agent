import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react"

const STORAGE_KEY = "agua-renew-crm-theme"
const ThemeContext = createContext(null)

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function initialTheme() {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved === "light" || saved === "dark" ? saved : "system"
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)
  const [system, setSystem] = useState(systemTheme)
  const resolvedTheme = theme === "system" ? system : theme

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.style.colorScheme = resolvedTheme
    if (theme === "system") window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, theme)
  }, [resolvedTheme, theme])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const update = (event) => setSystem(event.matches ? "dark" : "light")
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme debe usarse dentro de ThemeProvider")
  return context
}
