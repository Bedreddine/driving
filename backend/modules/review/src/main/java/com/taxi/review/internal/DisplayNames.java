package com.taxi.review.internal;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

/** The name a reference client is shown with: "James Smith" and "Mr James Smith" become "J. Smith". */
final class DisplayNames {

    private DisplayNames() {}

    /** Courtesy titles left out ("M." only with its dot: a bare "M" may be an initial). */
    private static final Set<String> TITLES = Set.of("mr", "mr.", "mrs", "mrs.", "ms", "ms.", "mme", "mme.", "m.",
            "mlle", "mlle.", "dr", "dr.");

    /** First-name initial and last word; a single word as is; null for an empty name. */
    static String of(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return null;
        }
        var all = Arrays.asList(fullName.trim().split("\\s+"));
        var words = new ArrayList<String>();
        for (var w : all) {
            if (!words.isEmpty() || !TITLES.contains(w.toLowerCase(Locale.ROOT))) {
                words.add(w);
            }
        }
        if (words.isEmpty()) {
            return all.getLast(); // only a title: better than nothing
        }
        if (words.size() == 1) {
            return words.getFirst();
        }
        var initial = new String(Character.toChars(words.getFirst().codePointAt(0))).toUpperCase(Locale.ROOT);
        return initial + ". " + words.getLast();
    }
}
