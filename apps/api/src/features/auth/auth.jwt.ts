import jwt from "jsonwebtoken";

const algorithm = "HS256" as const;

function getJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET is required");
  }
  return value;
}

const secret = getJwtSecret();

const issuer = "aimarketplace-api";
const audience = "aimarketplace-web";

export type AccessTokenPayload = {
  sub: string;
  email: string;
  departmentId: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { email: payload.email, departmentId: payload.departmentId },
    secret,
    {
      subject: payload.sub,
      expiresIn: "7d",
      issuer,
      audience,
      algorithm,
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret, {
    issuer,
    audience,
    algorithms: [algorithm],
  }) as jwt.JwtPayload & { email?: string; departmentId?: string };

  if (!decoded.sub || typeof decoded.email !== "string") {
    throw new Error("Invalid token payload");
  }

  const departmentId = decoded.departmentId;
  if (typeof departmentId !== "string" || !departmentId) {
    throw new Error("Invalid token payload");
  }

  return { sub: decoded.sub, email: decoded.email, departmentId };
}
