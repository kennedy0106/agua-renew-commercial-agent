import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./Shell.jsx', () => ({
  PageHeader: ({ title, description, actions }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import { Dashboard } from './Dashboard.jsx';

const data = {
  open: 12,
  pipelineValue: 18000,
  overdue: 2,
  conversionRate: 25,
  period: { key: '8w', label: 'Últimas 8 semanas' },
  priorityOpportunity: {
    id: 'op-1', stageKey: 'NEW', stageName: 'Nuevo', contactName: 'María López',
    title: 'Bidón 20 L', ownerName: null, nextAction: null, nextActionAt: null, estimatedValue: 1500,
  },
  recentOpportunities: [{
    id: 'op-1', stageKey: 'NEW', stageName: 'Nuevo', contactName: 'María López',
    title: 'Bidón 20 L', estimatedValue: 1500, expectedCloseDate: null, probability: 30,
  }],
  operationalSummary: { needsReview: 3, unassigned: 2, readyForHandoff: 1, openTasks: 4 },
  upcomingAgenda: [],
  stages: [{ id: 'new', stageKey: 'NEW', name: 'Nuevo', total: 12, value: 18000, color: '#0c5a63' }],
  trend: [{ bucketStart: '2026-08-31', created: 12, won: 3, lost: 1 }],
};

describe('Dashboard shadcn', () => {
  it('usa el diseño aprobado por defecto y conserva sus acciones reales', async () => {
    const user = userEvent.setup();
    const onOpenIntervention = vi.fn();
    render(<Dashboard
      data={data}
      user={{ role: 'ADMIN', displayName: 'Administrador Agua ReNew' }}
      notifications={[]}
      onOpenTasks={() => {}}
      onOpenCalendar={() => {}}
      onOpenIntervention={onOpenIntervention}
      onOpenOpportunity={() => {}}
      onReadNotification={() => {}}
      onPeriodChange={async () => true}
      periodLoading={false}
    />);

    expect(screen.getByText('Oportunidades activas')).toBeVisible();
    expect(screen.getByText('Listos para WhatsApp')).toBeVisible();
    expect(screen.getByRole('table', { name: 'Datos de la tendencia comercial' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Período de análisis' })).toBeVisible();
    expect(screen.queryByText('Insights de desempeño')).not.toBeInTheDocument();
    expect(screen.queryByText('Conversión de cierres')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Revisar bandeja/ }));
    expect(onOpenIntervention).toHaveBeenCalledOnce();
  });

  it('distingue carga y error recuperable sin inventar valores', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const shared = {
      user: { displayName: 'Administrador Agua ReNew' }, notifications: [],
      onOpenTasks: vi.fn(), onOpenCalendar: vi.fn(), onOpenIntervention: vi.fn(),
      onOpenOpportunity: vi.fn(), onReadNotification: vi.fn(), onPeriodChange: vi.fn(),
      periodLoading: false,
    };
    const { rerender } = render(<Dashboard {...shared} data={null} />);

    expect(screen.getByRole('status', { name: 'Cargando dashboard' })).toBeVisible();

    rerender(<Dashboard {...shared} data={null} error="El resumen no está disponible." onRetry={onRetry} />);
    expect(screen.getByText('No pudimos cargar el Resumen')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('presenta el dashboard V2 con KPIs por rol y gráficos equivalentes', async () => {
    const user = userEvent.setup();
    const onOpenIntervention = vi.fn();
    const { container } = render(<Dashboard
      data={data}
      user={{ role: 'ADMIN', displayName: 'Administrador Agua ReNew' }}
      notifications={[]}
      onOpenTasks={vi.fn()}
      onOpenCalendar={vi.fn()}
      onOpenIntervention={onOpenIntervention}
      onOpenOpportunity={vi.fn()}
      onReadNotification={vi.fn()}
      onPeriodChange={async () => true}
      periodLoading={false}
    />);

    const view = within(container);
    expect(view.getByText('Oportunidades activas')).toBeVisible();
    expect(view.getByText('Listos para WhatsApp')).toBeVisible();
    expect(view.getByText('Casos por revisar')).toBeVisible();
    expect(view.getByText('Sin responsable')).toBeVisible();
    expect(view.getByRole('table', { name: 'Datos de la tendencia comercial' })).toBeInTheDocument();
    expect(view.getByText(/Intensidad relativa/)).toBeVisible();
    expect(view.getAllByRole('img', { name: /Creadas:/ }).length).toBeGreaterThan(0);

    await user.click(view.getByRole('tab', { name: 'Pipeline' }));
    expect(view.getByRole('table', { name: 'Distribución actual del pipeline' })).toBeInTheDocument();
    expect(view.getByRole('tab', { name: 'Pipeline' })).toHaveAttribute('tabindex', '0');
    await user.keyboard('{ArrowLeft}');
    expect(view.getByRole('tab', { name: 'Tendencia' })).toHaveAttribute('aria-selected', 'true');
    await user.click(view.getByRole('button', { name: /Casos por revisar/ }));
    expect(onOpenIntervention).toHaveBeenCalledOnce();
  });

  it('adapta los indicadores V2 para asesores', () => {
    const { container } = render(<Dashboard
      data={data}
      user={{ role: 'ADVISOR', displayName: 'Ana Asesora' }}
      notifications={[]}
      onOpenTasks={vi.fn()}
      onOpenCalendar={vi.fn()}
      onOpenIntervention={vi.fn()}
      onOpenOpportunity={vi.fn()}
      onReadNotification={vi.fn()}
      onPeriodChange={async () => true}
      periodLoading={false}
    />);

    const view = within(container);
    expect(view.getByText('Mis oportunidades')).toBeVisible();
    expect(view.getByText('Seguimientos vencidos')).toBeVisible();
    expect(view.getByText('Tareas abiertas')).toBeVisible();
    expect(view.queryByText('Sin responsable')).not.toBeInTheDocument();
  });
});
