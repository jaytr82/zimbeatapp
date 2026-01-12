import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../../components/Header';

describe('Header', () => {
  it('renders the title correctly', () => {
    render(<Header title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders the more options button', () => {
    render(<Header title="Test Title" />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('applies correct CSS classes', () => {
    render(<Header title="Test Title" />);

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('fixed', 'top-0', 'left-0', 'right-0', 'bg-primary');
  });

  it('displays different titles', () => {
    const { rerender } = render(<Header title="First Title" />);
    expect(screen.getByText('First Title')).toBeInTheDocument();

    rerender(<Header title="Second Title" />);
    expect(screen.getByText('Second Title')).toBeInTheDocument();
  });
});