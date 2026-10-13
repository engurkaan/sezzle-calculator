import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '../calculator/types'
import { CONFIRM_TIMEOUT_MS, History } from './History'

const entries: HistoryEntry[] = [
  { id: 2, expression: '6 × 7', result: '42' },
  { id: 1, expression: '0.1 + 0.2', result: '0.3' },
]

function setup(props: Partial<Parameters<typeof History>[0]> = {}) {
  const handlers = {
    onToggleCollapsed: vi.fn(),
    onRecall: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
  }
  const user = userEvent.setup()
  render(<History entries={entries} collapsed={false} {...handlers} {...props} />)
  return { user, ...handlers }
}

describe('History', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists entries newest first with a count', () => {
    setup()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('6 × 7 =42')
    expect(items[1]).toHaveTextContent('0.1 + 0.2 =0.3')
    expect(screen.getByRole('button', { name: 'History' })).toHaveTextContent('History2')
  })

  it('shows an empty state without a clear button', () => {
    setup({ entries: [] })
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('recalls and deletes entries', async () => {
    const { user, onRecall, onDelete } = setup()

    await user.click(screen.getByRole('button', { name: 'Use 42 (6 × 7 = 42)' }))
    expect(onRecall).toHaveBeenCalledWith('42')

    await user.click(screen.getByRole('button', { name: 'Delete 0.1 + 0.2 = 0.3' }))
    expect(onDelete).toHaveBeenCalledWith(1)
  })

  it('toggles the collapsed state', async () => {
    const { user, onToggleCollapsed } = setup()
    const toggle = screen.getByRole('button', { name: /history/i })

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledOnce()
  })

  it('hides the entries and clear button while collapsed', () => {
    setup({ collapsed: true })
    expect(screen.getByRole('button', { name: /history/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('asks for confirmation before clearing everything', async () => {
    const { user, onClear } = setup()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClear).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm clear' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('cancels the confirmation after a timeout', () => {
    vi.useFakeTimers()
    const { onClear } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByRole('button', { name: 'Confirm clear' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(CONFIRM_TIMEOUT_MS))

    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
    expect(onClear).not.toHaveBeenCalled()
  })

  it('cancels the confirmation when focus moves away', async () => {
    const { user, onClear } = setup()

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await user.tab()

    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Clear all' }),
    ).toBeInTheDocument()
    expect(onClear).not.toHaveBeenCalled()
  })
})
