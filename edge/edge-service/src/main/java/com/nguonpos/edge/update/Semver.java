package com.nguonpos.edge.update;

import java.util.regex.Pattern;

/** Release versions are plain MAJOR.MINOR.PATCH (the installers on both OSes compare them the same way). */
public final class Semver {

    private static final Pattern FORMAT = Pattern.compile("\\d{1,5}\\.\\d{1,5}\\.\\d{1,5}");

    private Semver() {
    }

    public static boolean valid(String v) {
        return v != null && FORMAT.matcher(v).matches();
    }

    /** True when `candidate` is a release newer than `installed` ("dev" never updates). */
    public static boolean newer(String candidate, String installed) {
        if (!valid(candidate) || !valid(installed)) return false;
        String[] a = candidate.split("\\."), b = installed.split("\\.");
        for (int i = 0; i < 3; i++) {
            int c = Integer.compare(Integer.parseInt(a[i]), Integer.parseInt(b[i]));
            if (c != 0) return c > 0;
        }
        return false;
    }
}
