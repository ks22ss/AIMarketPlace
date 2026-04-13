import jwt from "jsonwebtoken";

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
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { email: payload.email },
    secret,
    {
      subject: payload.sub,
      expiresIn: "7d",
      issuer,
      audience,
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret, {
    issuer,
    audience,
  }) as jwt.JwtPayload & { email?: string };

  if (!decoded.sub || typeof decoded.email !== "string") {
    throw new Error("Invalid token payload");
  }

  return { sub: decoded.sub, email: decoded.email };
}
