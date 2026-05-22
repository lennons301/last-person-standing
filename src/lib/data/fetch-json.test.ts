import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdapterFetchError, fetchJson } from './fetch-json'

describe('fetchJson', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('parses a successful JSON response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ ok: true, n: 7 }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
			),
		)
		const data = await fetchJson<{ ok: boolean; n: number }>('https://example.test/x')
		expect(data).toEqual({ ok: true, n: 7 })
	})

	it('throws AdapterFetchError with status + body preview when the response is not 2xx', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('rate limit exceeded', {
						status: 429,
						headers: { 'content-type': 'text/plain' },
					}),
			),
		)
		await expect(fetchJson('https://example.test/x')).rejects.toMatchObject({
			name: 'AdapterFetchError',
			url: 'https://example.test/x',
			httpStatus: 429,
			contentType: 'text/plain',
			bodyPreview: 'rate limit exceeded',
		})
	})

	it('throws AdapterFetchError on empty body / unparseable JSON (the silent-500 case)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response('', {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
			),
		)
		const err = (await fetchJson('https://example.test/empty').catch(
			(e: unknown) => e,
		)) as AdapterFetchError
		expect(err).toBeInstanceOf(AdapterFetchError)
		expect(err.httpStatus).toBe(200)
		expect(err.bodyPreview).toBe('')
	})

	it('throws AdapterFetchError when fetch itself rejects (network failure)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed')
			}),
		)
		const err = (await fetchJson('https://example.test/down').catch(
			(e: unknown) => e,
		)) as AdapterFetchError
		expect(err).toBeInstanceOf(AdapterFetchError)
		expect(err.httpStatus).toBeNull()
		expect(err.url).toBe('https://example.test/down')
	})
})
