/**
 * Structured error thrown by `fetchJson` when an outbound HTTP/JSON call
 * doesn't return parseable JSON. Captures the URL, response status, content
 * type, and a body preview so the caller can log what actually came back —
 * the missing breadcrumb behind the silent `SyntaxError: Unexpected end of
 * JSON input` that previously surfaced from bare `res.json()` calls.
 */
export class AdapterFetchError extends Error {
	constructor(
		public readonly url: string,
		public readonly httpStatus: number | null,
		public readonly contentType: string | null,
		public readonly bodyPreview: string | null,
		options?: { cause?: unknown },
	) {
		const parts = [`AdapterFetch ${url}`]
		if (httpStatus != null) parts.push(`status=${httpStatus}`)
		if (contentType) parts.push(`content-type=${contentType}`)
		if (bodyPreview != null) parts.push(`body="${bodyPreview.slice(0, 200).replace(/\s+/g, ' ')}"`)
		super(parts.join(' '), options)
		this.name = 'AdapterFetchError'
	}
}

const BODY_PREVIEW_CHARS = 500

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	let res: Response
	try {
		res = await fetch(url, init)
	} catch (cause) {
		throw new AdapterFetchError(url, null, null, null, { cause })
	}
	const contentType = res.headers.get('content-type')
	const text = await res.text()
	if (!res.ok) {
		throw new AdapterFetchError(url, res.status, contentType, text.slice(0, BODY_PREVIEW_CHARS))
	}
	try {
		return JSON.parse(text) as T
	} catch (cause) {
		throw new AdapterFetchError(url, res.status, contentType, text.slice(0, BODY_PREVIEW_CHARS), {
			cause,
		})
	}
}
