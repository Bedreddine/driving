package com.taxi.notification.internal;

import com.taxi.notification.VapidKeys;
import java.security.Security;
import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * The server's VAPID keys for browser push (taxi.web-push.*, env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT). Without keys browser push is off (logged once at startup); the endpoints still answer.
 * In the dev profile a temporary pair is made at startup, so local testing works (browsers must subscribe again
 * after each restart). Generate a lasting pair with {@code java -jar app.jar --taxi.generate-vapid}.
 */
@Component
class WebPushKeys {

    private static final Logger log = LoggerFactory.getLogger(WebPushKeys.class);

    static {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider()); // web-push's key handling asks for "BC" by name
        }
    }

    private final String publicKey;
    private final String privateKey;
    private final String subject;

    WebPushKeys(@Value("${taxi.web-push.public-key:}") String publicKey,
                @Value("${taxi.web-push.private-key:}") String privateKey,
                @Value("${taxi.web-push.subject:mailto:no-reply@localhost}") String subject,
                Environment env) {
        this.subject = subject == null || subject.isBlank() ? "mailto:no-reply@localhost" : subject.trim();
        var pub = publicKey == null ? "" : publicKey.trim();
        var priv = privateKey == null ? "" : privateKey.trim();
        if (pub.isEmpty() && priv.isEmpty() && env.acceptsProfiles(Profiles.of("dev"))) {
            var generated = VapidKeys.generate();
            pub = generated.publicKey();
            priv = generated.privateKey();
            log.info("Browser push: temporary VAPID keys for this dev run, public key {}", pub);
        }
        if (pub.isEmpty() || priv.isEmpty()) {
            log.info("Browser push is off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (java -jar app.jar --taxi.generate-vapid).");
            pub = null;
            priv = null;
        } else if (!valid(pub, priv)) {
            log.warn("Browser push is off: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not a valid pair.");
            pub = null;
            priv = null;
        }
        this.publicKey = pub;
        this.privateKey = priv;
    }

    boolean enabled() {
        return publicKey != null;
    }

    /** base64url, what the browser needs to subscribe (applicationServerKey); null when off. */
    String publicKey() {
        return publicKey;
    }

    String privateKey() {
        return privateKey;
    }

    String subject() {
        return subject;
    }

    private static boolean valid(String pub, String priv) {
        try {
            return Utils.verifyKeyPair(Utils.loadPrivateKey(priv), Utils.loadPublicKey(pub));
        } catch (Exception e) {
            return false;
        }
    }
}
