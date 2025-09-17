"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
const defaultLevel = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
function createLogger(options = {}) {
    const { name, ...rest } = options;
    const merged = {
        level: defaultLevel,
        ...rest,
        base: {
            pid: process.pid,
            name: name ?? rest.base?.['name'] ?? undefined,
            ...rest.base
        }
    };
    return (0, pino_1.default)(merged);
}
exports.logger = createLogger({ name: 'meetbot-recorder' });
//# sourceMappingURL=logger.js.map