const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const config = require("./config.json");
const uuid = require("uuid");
const WebSocket = require("ws");

const ACK_COUNT_NEEDED = 3;
let servers = [];

async function createWebSocket() {
    const ws = new WebSocket(config.ws);
    const authId = uuid.v1();
    let ackCountLeft = ACK_COUNT_NEEDED;

    ws.on("open", async () => {
        console.log("Connecting to the BattleMetrics websocket...");
        connect();
    });

    ws.on("message", async (msg) => {
        const data = JSON.parse(msg.toString());

        if (data === undefined) return;

        if (data.t === "error") {
            console.error(data.p);
            return;
        }

        if (data.t === "ack") {
            ackCountLeft--;
            if (ackCountLeft === 0) {
                console.log("Successfully connected to the BattleMetrics websocket!");
            }
            return;
        }

        if (data.t === "ACTIVITY") {
            const BMID = data.p.relationships.players.data[0].id;
            const server = servers.find((server) => server.id === data.p.relationships.servers.data[0].id);
            console.log(`Player ${BMID} joined ${server.attributes.name}`);
        }
    });

    ws.on("error", (err) => {
        console.error(err);
    });

    ws.on("close", (code) => {
        console.error(`BattleMetrics websocket closed with code ${code}. Reconnecting...`);

        setTimeout(() => {
            createWebSocket();
        }, 5000);
    });

    async function connect() {
        ws.send(
            JSON.stringify({
                i: authId,
                t: "auth",
                p: config.token,
            })
        );

        ws.send(
            JSON.stringify({
                i: authId,
                t: "filter",
                p: {
                    type: "ACTIVITY",
                    channel: "*",
                    filter: { tagTypeMode: "and", tags: {}, types: { whitelist: ["event:addPlayer"] } },
                },
            })
        );

        ws.send(
            JSON.stringify({
                i: authId,
                t: "join",
                p: (await getServers()).map((server) => `server:activity:${server}`),
            })
        );
    }
}

async function getServers() {
    const response = await fetch(`https://api.battlemetrics.com/servers?filter[rcon]=true&page[size]=100&access_token=${config.token}`);
    if (!response.ok) throw "Failed to get servers from BattleMetrics.";

    const data = await response.json();

    servers = data.data.filter((server) => server.attributes.private === false && server.attributes.rconActive === true);
    const serverIds = servers.map((server) => server.id);

    console.log(`${serverIds.length} servers were found with your token on BattleMetrics.`);
    console.log(serverIds);

    return serverIds;
}

createWebSocket();
