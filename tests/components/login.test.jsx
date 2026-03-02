// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from '../../app/login/page.jsx';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('LoginPage component', () => {
  it('renders input fields and login button', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText(/Employee ID/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
  });
});
