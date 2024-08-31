/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface Env {
	AIRTABLE_KEY: string;
	SECRET_KEY: string;
}

const AIRTABLE_BASE_ID = 'app4Bs8Tjwvk5qcD4';
const SUBMISSIONS_TABLE_NAME = 'Submissions';

export default {
	async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);

		if (pathname === '/') {
			return new Response('Hello World!', { status: 200 });
		} else if (pathname === '/submissions') {
			// Check for Authorization header
			const authHeader = request.headers.get('Authorization');
			if (!authHeader || authHeader !== `Bearer ${env.SECRET_KEY}`) {
				return new Response('Unauthorized', { status: 401 });
			}
			return await handleSubmissionsRequest(`${env.AIRTABLE_KEY}`);
		} else if (pathname === '/update' && request.method === 'POST') {
			// Check for Authorization header
			const authHeader = request.headers.get('Authorization');
			if (!authHeader || authHeader !== `Bearer ${env.SECRET_KEY}`) {
				return new Response('Unauthorized', { status: 401 });
			}
			return await handleUpdateRequest(request, `${env.AIRTABLE_KEY}`);
		} else {
			return new Response('Not Found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;

async function handleSubmissionsRequest(airtablekey: string) {
	if (!airtablekey || airtablekey === '' || airtablekey === 'undefined' || airtablekey === 'null') {
		return new Response(JSON.stringify({ error: 'Airtable API key is required' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	const response = await fetch(
		`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SUBMISSIONS_TABLE_NAME}?fields%5B%5D=SlackUsername&fields%5B%5D=OTP&fields%5B%5D=Slack+ID&fields%5B%5D=Eligibility&filterByFormula=AND(%7BStatus%7D%3D'Pending'%2CNOT(%7BOTP%7D%3D''))`,
		{
			headers: {
				Authorization: `Bearer ${airtablekey}`,
				'Content-Type': 'application/json',
			},
		},
	);

	const data: any = await response.json();

	// if !data then return the raw response from Airtable
	if (!data || !data.records) {
		return new Response(JSON.stringify(data), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	const rawSubmissions = data.records.map((record: any) => record);

	return new Response(JSON.stringify(rawSubmissions), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
		},
	});
}

async function handleUpdateRequest(request: any, airtablekey: string) {
	const { authenticated, recordId } = await request.json();

	if (!recordId) {
		return new Response(JSON.stringify({ error: 'Record ID is required' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	let fields = {};
	if (authenticated === 'true') {
		fields = { Authenticated: 'Verified', OTP: '' };
	} else if (authenticated === 'false') {
		fields = { Authenticated: 'Unverified', OTP: '' };
	} else {
		return new Response(JSON.stringify({ error: 'Invalid authentication value' }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	try {
		const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${SUBMISSIONS_TABLE_NAME}/${recordId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${airtablekey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fields }),
		});

		if (!response.ok) {
			throw new Error(`Failed to update record: ${response.statusText}`);
		}

		// @ts-expect-error
		return new Response(JSON.stringify({ message: `Record updated to [${fields.Authenticated.toUpperCase()}] successfully` }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error(error);
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}
