import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// Google's public keys for Firebase ID tokens (Secure Token service).
const JWKS = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com',
  ),
);

export interface FirebaseTokenClaims extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verify a Firebase ID token against Google's public keys.
 * Validates the signature, issuer and audience (the project id).
 */
export async function verifyFirebaseToken(
  idToken: string,
  projectId: string,
): Promise<FirebaseTokenClaims> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  return payload as FirebaseTokenClaims;
}
