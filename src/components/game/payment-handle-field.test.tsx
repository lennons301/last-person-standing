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
