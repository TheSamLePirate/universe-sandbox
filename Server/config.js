import fs from "fs";

export const PORT = process.env.PORT || 3009;
export const GOVEE_API_URL = "https://localhost:3008";

const DEFAULT_KEY_PATH = "/Users/olivierveinand/.vite-plugin-mkcert/dev.pem";
const DEFAULT_CERT_PATH = "/Users/olivierveinand/.vite-plugin-mkcert/cert.pem";

export const getKeyPath = () => process.env.SSL_KEY ?? DEFAULT_KEY_PATH;
export const getCertPath = () => process.env.SSL_CERT ?? DEFAULT_CERT_PATH;

export const getSSLOptions = () => {
    try {
        return {
            key: fs.readFileSync(getKeyPath()),
            cert: fs.readFileSync(getCertPath())
        };
    } catch (error) {
        console.error("Error reading SSL certificates:", error.message);
        throw error;
    }
};
