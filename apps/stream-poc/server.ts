import { createServer } from "node:http";
import type { AddressInfo, Socket as NetSocket } from "node:net";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { createStreamPocWsRuntime } from "./server/ws-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

loadEnvConfig(process.cwd(), dev);

const app = next({ dev, hostname, port });
const nextHandler = app.getRequestHandler();
const wsRuntime = createStreamPocWsRuntime();

async function main() {
	await app.prepare();

	const server = createServer(async (request, response) => {
		try {
			await nextHandler(request, response);
		} catch (error) {
			console.error("[stream-poc] request failure", error);
			response.statusCode = 500;
			response.end("internal server error");
		}
	});

	server.on("upgrade", (request, socket: NetSocket, head) => {
		const handled = wsRuntime.handleUpgrade(request, socket, head);
		if (handled === false) {
			socket.destroy();
		}
	});

	server.listen(port, hostname, () => {
		const address = server.address() as AddressInfo | null;
		const resolvedPort = address?.port ?? port;
		console.log(`stream-poc ready at http://${hostname}:${resolvedPort}`);
	});
}

main().catch((error) => {
	console.error("[stream-poc] startup failure", error);
	process.exit(1);
});
