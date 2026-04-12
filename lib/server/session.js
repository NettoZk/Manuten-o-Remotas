"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionCookieName = getSessionCookieName;
exports.isSetupAllowed = isSetupAllowed;
exports.createSessionToken = createSessionToken;
exports.verifySessionToken = verifySessionToken;
var crypto_1 = require("crypto");
var SESSION_COOKIE_NAME = "manutencao_session";
function getSessionSecret() {
    var secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error("SESSION_SECRET is required for session management. Define it in your environment.");
    }
    return secret;
}
function encodeBase64Url(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
function decodeBase64Url(value) {
    var base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    var padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
}
function getSessionCookieName() {
    return SESSION_COOKIE_NAME;
}
function isSetupAllowed() {
    if (process.env.NODE_ENV !== "production") {
        return true;
    }
    return process.env.ENABLE_SETUP_ROUTE === "true";
}
function createSessionToken(payload) {
    var secret = getSessionSecret();
    var body = encodeBase64Url(JSON.stringify(payload));
    var signature = (0, crypto_1.createHmac)("sha256", secret).update(body).digest("base64");
    var signatureUrl = signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return "".concat(body, ".").concat(signatureUrl);
}
function verifySessionToken(token) {
    try {
        var _a = token.split("."), body = _a[0], signature = _a[1];
        if (!body || !signature) {
            return null;
        }
        var secret = getSessionSecret();
        var expectedSignature = (0, crypto_1.createHmac)("sha256", secret).update(body).digest("base64");
        var expectedUrl = expectedSignature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        var signatureBuffer = Buffer.from(signature);
        var expectedBuffer = Buffer.from(expectedUrl);
        if (signatureBuffer.length !== expectedBuffer.length ||
            !(0, crypto_1.timingSafeEqual)(signatureBuffer, expectedBuffer)) {
            return null;
        }
        var payload = JSON.parse(decodeBase64Url(body));
        return payload;
    }
    catch (_b) {
        return null;
    }
}
