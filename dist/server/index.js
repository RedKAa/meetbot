"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecorderContext = createRecorderContext;
exports.startRecorderServer = startRecorderServer;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const config_1 = require("./config");
const logger_1 = require("./logger");
const session_1 = require("./session");
function createRecorderContext(env = process.env) {
    const config = (0, config_1.loadConfig)(env);
    const contextLogger = logger_1.logger.child({ module: 'recorder', port: config.port });
    ensureLiveDir(config);
    contextLogger.info({ recordingsRoot: config.recordingsRoot }, 'Recorder context initialised');
    return {
        config,
        logger: contextLogger
    };
}
function startRecorderServer(context = createRecorderContext()) {
    const { config, logger } = context;
    const wss = new ws_1.WebSocketServer({ port: config.port });
    logger.info({ port: config.port }, 'Recorder WebSocket server listening');
    wss.on('connection', (socket, request) => {
        const remote = extractRemote(request);
        new session_1.Session({
            config,
            logger: logger.child({ component: 'session' }),
            socket,
            remoteAddress: remote.remoteAddress,
            userAgent: remote.userAgent
        });
    });
    wss.on('error', error => {
        logger.error({ error }, 'WebSocket server error');
    });
    const shutdown = async () => {
        logger.info('Shutting down recorder WebSocket server');
        await new Promise((resolve, reject) => {
            wss.close(err => (err ? reject(err) : resolve()));
        });
    };
    process.once('SIGINT', () => {
        shutdown().finally(() => process.exit(0));
    });
    return {
        close: shutdown
    };
}
if (require.main === module) {
    startRecorderServer();
}
function extractRemote(request) {
    return {
        remoteAddress: request.socket.remoteAddress ?? undefined,
        userAgent: request.headers['user-agent']
    };
}
function ensureLiveDir(config) {
    const liveDir = path_1.default.join(config.recordingsRoot, 'live');
    ensureDir(liveDir);
}
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=index.js.map