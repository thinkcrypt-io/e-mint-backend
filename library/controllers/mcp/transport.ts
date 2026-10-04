import express, { Request, Response } from 'express';

/**
 * The Model Context Protocol over HTTP, once for every e-mint MCP server: the
 * builder's (/mcp, /tenant/mcp) and Template Studio's (/templates/mcp,
 * docs/templates T-06). Each server brings its name, instructions, tools and
 * how a key is checked; this file does the rest.
 *
 * Streamable HTTP, stateless: every POST carries JSON-RPC (one message or a
 * batch) and gets JSON back; there's no server-sent stream (GET answers 405,
 * which the spec allows). The key comes as `Authorization: Bearer <key>` or
 * in the path (`/<mount>/<key>`) for connectors that only take a URL — so the
 * router is mounted before the request logger.
 */

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export type ToolOutput = { text: string; data?: any; isError?: boolean };

export type McpTool<C> = {
	name: string;
	title: string;
	description: string;
	inputSchema: any;
	annotations: Record<string, boolean>;
	run: (req: any, args: any, caller: C) => Promise<ToolOutput>;
};

export type McpServer<C> = {
	info: { name: string; title: string; version: string };
	instructions: (caller: C) => string;
	/** The tools this caller may call. */
	tools: (caller: C) => McpTool<C>[];
	/** Which of them tools/list offers (e.g. only the key's scopes); all when left out. */
	listed?: (tool: McpTool<C>, caller: C) => boolean;
	/** Why this caller may not run this tool (a scope, a permission), or null. */
	denied?: (tool: McpTool<C>, caller: C) => string | null;
	authenticate: (req: Request) => Promise<C | { error: string }>;
	/** Before the messages are handled: put the caller on the request. */
	prepare?: (req: any, caller: C) => void;
	/** Around all of a request's messages, e.g. a tenant scope. */
	around?: <T>(caller: C, fn: () => Promise<T>) => Promise<T>;
	/** Before each tool runs (sync models…). */
	beforeCall?: (req: any, tool: McpTool<C>, caller: C) => Promise<void>;
	/** A line for the server log after each call. */
	logLine?: (tool: McpTool<C>, caller: C, out: ToolOutput) => string;
	realm?: string;
};

export const rpcError = (id: any, code: number, message: string, data?: any) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data && { data }) } });
const rpcResult = (id: any, result: any) => ({ jsonrpc: '2.0', id, result });

const handle = async <C>(server: McpServer<C>, req: any, msg: any, caller: C) => {
	if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
	const { id, method, params } = msg;
	const notification = id === undefined;

	switch (method) {
		case 'initialize': {
			const asked = String(params?.protocolVersion || '');
			return rpcResult(id, {
				protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: server.info,
				instructions: server.instructions(caller),
			});
		}
		case 'ping':
			return notification ? null : rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, {
				tools: server.tools(caller).filter(t => !server.listed || server.listed(t, caller)).map(({ name, title, description, inputSchema, annotations }) => ({
					name,
					title,
					description,
					inputSchema,
					annotations: { title, ...annotations },
				})),
			});
		case 'tools/call': {
			const tool = server.tools(caller).find(t => t.name === params?.name);
			if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
			const denied = server.denied?.(tool, caller);
			if (denied) return rpcResult(id, { content: [{ type: 'text', text: denied }], isError: true });
			try {
				await server.beforeCall?.(req, tool, caller);
				const out = await tool.run(req, params?.arguments || {}, caller);
				if (server.logLine) console.log(server.logLine(tool, caller, out));
				return rpcResult(id, {
					content: [{ type: 'text', text: out.text }],
					...(out.data && { structuredContent: out.data }),
					...(out.isError && { isError: true }),
				});
			} catch (e: any) {
				console.error(`MCP ${tool.name}:`, e?.message);
				return rpcResult(id, { content: [{ type: 'text', text: `The tool failed: ${e?.message || 'unknown error'}` }], isError: true });
			}
		}
		default:
			if (notification) return null; // notifications/initialized, cancelled, …
			return rpcError(id, -32601, `Method not found: ${method}`);
	}
};

const notAllowed = (_req: Request, res: Response) => res.status(405).set('Allow', 'POST').json(rpcError(null, -32000, 'Use POST — this server has no event stream'));

/** An Express router serving one MCP server at its mount path (and `/<key>`). */
export const createMcpRouter = <C>(server: McpServer<C>) => {
	const post = async (req: any, res: Response) => {
		const caller = await server.authenticate(req);
		if (caller && typeof caller === 'object' && 'error' in (caller as any)) {
			res.setHeader('WWW-Authenticate', `Bearer realm="${server.realm || 'e-mint'}", error="invalid_token"`);
			return res.status(401).json(rpcError(null, -32001, (caller as any).error));
		}
		const c = caller as C;
		server.prepare?.(req, c);

		const body = req.body;
		const batch = Array.isArray(body);
		const messages = batch ? body : [body];
		if (!messages.length) return res.status(400).json(rpcError(null, -32600, 'Empty batch'));

		const answer = async () => {
			const replies = [];
			for (const m of messages) {
				const r = await handle(server, req, m, c);
				if (r) replies.push(r);
			}
			return replies;
		};
		const replies = server.around ? await server.around(c, answer) : await answer();
		if (!replies.length) return res.status(202).end();
		return res.status(200).json(batch ? replies : replies[0]);
	};

	const router = express.Router();
	router.post('/', post);
	router.post('/:key', post);
	for (const path of ['/', '/:key']) {
		router.get(path, notAllowed);
		router.delete(path, notAllowed);
	}
	return router;
};
