import { getVelocityToken } from "./auth.server";
import { velocityHttp, velocityHttpError } from "./http.server";

type Dependencies = {
  getToken: typeof getVelocityToken;
  request: typeof velocityHttp;
};

/** Only documented read/quote operations. No shipment creation or arbitrary URL/payload proxy. */
export async function velocityRequest(
  path: "/custom/api/v1/serviceability" | "/custom/api/v1/rates",
  payload: unknown,
  dependencies: Dependencies = { getToken: getVelocityToken, request: velocityHttp },
): Promise<{ body: unknown; retried: boolean }> {
  const apiKey = process.env["VELOCITY_API_KEY"];
  let token = apiKey || await dependencies.getToken();
  let retried = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await dependencies.request(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (result.status === 401 && attempt === 0 && !apiKey) {
      token = await dependencies.getToken({ forceRefresh: true, rejectedToken: token });
      retried = true;
      continue;
    }
    if (result.status < 200 || result.status >= 300) throw velocityHttpError(result.status);
    return { body: result.body, retried };
  }
  throw velocityHttpError(401);
}