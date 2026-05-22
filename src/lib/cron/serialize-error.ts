import { AdapterFetchError } from '@/lib/data/fetch-json'

export interface SerializedError {
	message: string
	name: string
	stack?: string
	adapter?: {
		url: string
		httpStatus: number | null
		contentType: string | null
		bodyPreview: string | null
	}
	cause?: { name: string; message: string }
}

/**
 * Flatten an unknown thrown value into a structured shape that survives
 * `console.error` (Vercel's JSON log renderer) and HTTP response
 * serialisation. AdapterFetchError gets first-class treatment so adapter
 * failures land in logs with the request URL, status, content-type and
 * body preview — the breadcrumb that was previously absent.
 */
export function serializeError(err: unknown): SerializedError {
	if (err instanceof AdapterFetchError) {
		return {
			message: err.message,
			name: err.name,
			stack: err.stack,
			adapter: {
				url: err.url,
				httpStatus: err.httpStatus,
				contentType: err.contentType,
				bodyPreview: err.bodyPreview,
			},
			...causeFrom(err.cause),
		}
	}
	if (err instanceof Error) {
		return {
			message: err.message,
			name: err.name,
			stack: err.stack,
			...causeFrom(err.cause),
		}
	}
	return { message: String(err), name: 'NonError' }
}

function causeFrom(cause: unknown): { cause?: { name: string; message: string } } {
	if (cause instanceof Error) {
		return { cause: { name: cause.name, message: cause.message } }
	}
	return {}
}
