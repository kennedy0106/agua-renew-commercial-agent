import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider.jsx';
import { AnimatedThemeToggler } from './ui/animated-theme-toggler.jsx';

function ThemeHarness() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <AnimatedThemeToggler
      theme={resolvedTheme}
      onThemeChange={setTheme}
      aria-label={resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}
    />
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('cambia el tema, la clase raíz y conserva la preferencia', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);

    await user.click(screen.getByRole('button', { name: 'Usar tema oscuro' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('agua-renew-crm-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Usar tema claro' })).toBeVisible();
  });
});
