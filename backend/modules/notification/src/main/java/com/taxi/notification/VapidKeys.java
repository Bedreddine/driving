package com.taxi.notification;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

/**
 * A VAPID key pair for browser push (Web Push), in the usual text form: base64url without padding,
 * the public key as an uncompressed P-256 point (65 bytes), the private key as its 32-byte number.
 * Generate once per installation and keep it: browsers subscribed with one public key only accept that key.
 */
public record VapidKeys(String publicKey, String privateKey) {

    public static VapidKeys generate() {
        try {
            var generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            var pair = generator.generateKeyPair();
            var pub = (ECPublicKey) pair.getPublic();
            var priv = (ECPrivateKey) pair.getPrivate();
            var point = new byte[65];
            point[0] = 0x04; // uncompressed
            System.arraycopy(fixed32(pub.getW().getAffineX()), 0, point, 1, 32);
            System.arraycopy(fixed32(pub.getW().getAffineY()), 0, point, 33, 32);
            var encoder = Base64.getUrlEncoder().withoutPadding();
            return new VapidKeys(encoder.encodeToString(point), encoder.encodeToString(fixed32(priv.getS())));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No P-256 elliptic curve support in this Java runtime", e);
        }
    }

    private static byte[] fixed32(BigInteger n) {
        var raw = n.toByteArray(); // big-endian, may have a leading sign byte or be shorter than 32 bytes
        var out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }
}
