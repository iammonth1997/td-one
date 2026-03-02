// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SetPinPage from '../../app/set-pin/page.jsx';

vi.mock('next/link', () => ({
  default: ({ href, children, className }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe('SetPinPage component', () => {
  it('renders all input fields and submit button', () => {
    render(<SetPinPage />);
    expect(screen.getByPlaceholderText(/Employee ID/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm PIN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set PIN/i })).toBeInTheDocument();
  });

  it('shows error when PIN is less than 4 characters', async () => {
    render(<SetPinPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter PIN'), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm PIN'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Set PIN/i }));
    expect(await screen.findByText(/PIN ต้องมีอย่างน้อย 4/i)).toBeInTheDocument();
  });

  it('shows error when PINs do not match', async () => {
    render(<SetPinPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter PIN'), { target: { value: '1234' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm PIN'), { target: { value: '5678' } });
    fireEvent.click(screen.getByRole('button', { name: /Set PIN/i }));
    expect(await screen.findByText(/PIN ไม่ตรงกัน/i)).toBeInTheDocument();
  });

  it('renders link back to login page', () => {
    render(<SetPinPage />);
    expect(screen.getByText(/กลับหน้า Login/i)).toBeInTheDocument();
  });
});
