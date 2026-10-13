import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Calculate } from '../api/client'
import type { CalculationResponse } from '../api/types'
import { fakeCalculate } from '../test/fakeBackend'
import { Calculator } from './Calculator'

function setup(calculate: Calculate = fakeCalculate) {
  const user = userEvent.setup()
  render(<Calculator calculate={calculate} />)
  const keypad = screen.getByRole('group', { name: 'Keypad' })
  const key = (name: string) => within(keypad).getByRole('button', { name })
  const click = async (...names: string[]) => {
    for (const name of names) {
      await user.click(key(name))
    }
  }
  return { user, key, click }
}

const display = () => screen.getByRole('status')

describe('Calculator', () => {
  it('renders every key', () => {
    const { key } = setup()
    for (const name of [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Add',
      'Subtract',
      'Multiply',
      'Divide',
      'Power',
      'Square root',
      'Percent',
      'Toggle sign',
      'Decimal point',
      'Equals',
      'All clear',
      'Backspace',
    ]) {
      expect(key(name)).toBeInTheDocument()
    }
    expect(display()).toHaveTextContent('0')
  })

  it('computes a chained expression via clicks', async () => {
    const calculate = vi.fn<Calculate>(fakeCalculate)
    const { click } = setup(calculate)

    await click('1', '2', 'Add', '7', 'Multiply', '2', 'Equals')

    await waitFor(() => expect(display()).toHaveTextContent('38'))
    expect(screen.getByTestId('expression')).toHaveTextContent('19 × 2 =')
    expect(calculate).toHaveBeenCalledTimes(2)
  })

  it('computes advanced operations', async () => {
    const { click } = setup()

    await click('9', 'Square root')
    await waitFor(() => expect(display()).toHaveTextContent('3'))

    await click('All clear', '2', 'Power', '8', 'Equals')
    await waitFor(() => expect(display()).toHaveTextContent('256'))

    await click('All clear', '2', '0', '0', 'Add', '1', '0', 'Percent', 'Equals')
    await waitFor(() => expect(display()).toHaveTextContent('220'))
  })

  it('marks the active operator as pressed', async () => {
    const { click, key } = setup()

    await click('4', 'Divide')

    expect(key('Divide')).toHaveAttribute('aria-pressed', 'true')
    expect(key('Add')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows backend errors as an alert and recovers on the next key', async () => {
    const { click } = setup()

    await click('5', 'Divide', '0', 'Equals')

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot divide by zero')

    await click('7')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(display()).toHaveTextContent('7')
  })

  it('shows a message when the service is unreachable', async () => {
    const calculate = vi.fn<Calculate>().mockRejectedValue(new TypeError('Failed to fetch'))
    const { click } = setup(calculate)

    await click('1', 'Add', '1', 'Equals')

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('ignores keys while a request is in flight', async () => {
    let finish!: (value: CalculationResponse) => void
    const calculate = vi.fn<Calculate>(
      () => new Promise<CalculationResponse>((resolve) => (finish = resolve)),
    )
    const { click } = setup(calculate)

    await click('2', 'Add', '3', 'Equals')
    expect(screen.getByRole('region', { name: 'Calculator' })).toHaveAttribute('aria-busy', 'true')

    await click('9', 'Multiply')
    expect(display()).toHaveTextContent('3')
    expect(calculate).toHaveBeenCalledOnce()

    finish({ operation: 'add', operands: ['2', '3'], result: '5' })
    await waitFor(() => expect(display()).toHaveTextContent('5'))
    expect(screen.getByRole('region', { name: 'Calculator' })).toHaveAttribute('aria-busy', 'false')
  })

  it('supports full keyboard input', async () => {
    const { user } = setup()

    await user.keyboard('12.5*4{Enter}')
    await waitFor(() => expect(display()).toHaveTextContent('50'))

    await user.keyboard('{Backspace}{Escape}')
    expect(display()).toHaveTextContent('0')

    await user.keyboard('81r')
    await waitFor(() => expect(display()).toHaveTextContent('9'))
  })

  it('does not double-apply Enter when a key has focus', async () => {
    const calculate = vi.fn<Calculate>(fakeCalculate)
    const { click, user } = setup(calculate)

    await click('2', 'Add', '3')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(display()).toHaveTextContent('5'))
    // The focused "3" key must not have been clicked as well.
    expect(calculate).toHaveBeenCalledOnce()
    expect(calculate).toHaveBeenCalledWith({ operation: 'add', a: '2', b: '3' }, expect.anything())
  })

  it('records history and recalls a previous result', async () => {
    const { click, user } = setup()
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument()

    await click('6', 'Multiply', '7', 'Equals')
    const history = screen.getByRole('region', { name: 'History' })
    const entry = await within(history).findByRole('button', { name: /use 42/i })
    expect(entry).toHaveTextContent('6 × 7 =')

    await click('All clear', '8', 'Add')
    await user.click(entry)
    await click('Equals')
    await waitFor(() => expect(display()).toHaveTextContent('50'))

    await user.click(within(history).getByRole('button', { name: 'Clear all' }))
    await user.click(within(history).getByRole('button', { name: 'Confirm clear' }))
    expect(within(history).getByText('No calculations yet.')).toBeInTheDocument()
  })

  it('deletes a single history entry', async () => {
    const { click, user } = setup()

    await click('2', 'Add', '2', 'Equals')
    await click('3', 'Add', '3', 'Equals')
    const history = screen.getByRole('region', { name: 'History' })
    await within(history).findByRole('button', { name: /use 6/i })

    await user.click(within(history).getByRole('button', { name: 'Delete 2 + 2 = 4' }))

    expect(within(history).queryByRole('button', { name: /use 4/i })).not.toBeInTheDocument()
    expect(within(history).getByRole('button', { name: /use 6/i })).toBeInTheDocument()
  })

  it('keeps history across reloads', async () => {
    const { click } = setup()
    await click('6', 'Multiply', '7', 'Equals')
    await screen.findByRole('button', { name: /use 42/i })

    cleanup()
    setup()

    expect(screen.getByRole('button', { name: /use 42/i })).toBeInTheDocument()
  })

  it('remembers whether history is collapsed', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    cleanup()
    setup()

    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('shrinks the font for long numbers', async () => {
    const { user } = setup()

    await user.keyboard('1234567890123456')
    expect(display()).toHaveTextContent('1,234,567,890,123,456')
    expect(display()).toHaveAttribute('data-size', 'small')

    await user.keyboard('7890')
    expect(display()).toHaveTextContent('12,345,678,901,234,567,890')
    expect(display()).toHaveAttribute('data-size', 'xsmall')
  })

  it('shows exact decimal results', async () => {
    const { user } = setup()

    await user.keyboard('.1*3-.3{Enter}')

    await waitFor(() => expect(screen.getByTestId('expression')).toHaveTextContent('0.3 − 0.3 ='))
    expect(display()).toHaveTextContent(/^0$/)
  })
})
