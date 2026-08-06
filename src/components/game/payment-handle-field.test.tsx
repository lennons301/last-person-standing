// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentHandleField } from './payment-handle-field'

describe('PaymentHandleField', () => {
	it('pre-fills the saved provider and handle', () => {
		render(
			<PaymentHandleField
				provider="revolut"
				handle="alicejones"
				onProviderChange={vi.fn()}
				onHandleChange={vi.fn()}
			/>,
		)

		expect((screen.getByLabelText('Revolut') as HTMLInputElement).checked).toBe(true)
		expect((screen.getByLabelText('Monzo') as HTMLInputElement).checked).toBe(false)
		expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('alicejones')
	})

	it('starts empty when nothing is saved, and says the field is optional', () => {
		render(
			<PaymentHandleField
				provider={null}
				handle=""
				onProviderChange={vi.fn()}
				onHandleChange={vi.fn()}
			/>,
		)

		expect((screen.getByLabelText('Monzo') as HTMLInputElement).checked).toBe(false)
		expect((screen.getByLabelText('Revolut') as HTMLInputElement).checked).toBe(false)
		expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('')
		expect(screen.getByText(/optional/i)).toBeTruthy()
	})

	it('announces the question as the group label, with the provider radios inside it', () => {
		render(
			<PaymentHandleField
				provider={null}
				handle=""
				onProviderChange={vi.fn()}
				onHandleChange={vi.fn()}
			/>,
		)

		// The visible question has to be the group's accessible name — otherwise
		// the radios read as two bare "Monzo"/"Revolut" options with nothing
		// saying what's being chosen.
		const group = screen.getByRole('group', { name: /where do players pay you/i })
		expect(group.contains(screen.getByLabelText('Monzo'))).toBe(true)
		expect(group.contains(screen.getByLabelText('Revolut'))).toBe(true)
	})

	it('names the username input from a visible label, not a hidden one', () => {
		const { rerender } = render(
			<PaymentHandleField
				provider={null}
				handle=""
				onProviderChange={vi.fn()}
				onHandleChange={vi.fn()}
			/>,
		)

		// With no provider chosen the field can't claim to be a Monzo one, and the
		// name it's announced by must be text a sighted user can see too.
		const input = screen.getByLabelText('Username')
		expect(input.hasAttribute('aria-label')).toBe(false)
		expect(screen.getByText('Username')).toBeTruthy()

		rerender(
			<PaymentHandleField
				provider="revolut"
				handle=""
				onProviderChange={vi.fn()}
				onHandleChange={vi.fn()}
			/>,
		)
		expect(screen.getByLabelText('Revolut username')).toBe(input)
	})

	it('reports provider and handle edits to its owner', () => {
		const onProviderChange = vi.fn()
		const onHandleChange = vi.fn()
		render(
			<PaymentHandleField
				provider={null}
				handle=""
				onProviderChange={onProviderChange}
				onHandleChange={onHandleChange}
			/>,
		)

		fireEvent.click(screen.getByLabelText('Monzo'))
		expect(onProviderChange).toHaveBeenCalledWith('monzo')

		fireEvent.change(screen.getByLabelText(/username/i), { target: { value: '@alicejones' } })
		expect(onHandleChange).toHaveBeenCalledWith('@alicejones')
	})
})
