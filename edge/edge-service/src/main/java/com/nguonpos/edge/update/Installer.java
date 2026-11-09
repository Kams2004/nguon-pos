package com.nguonpos.edge.update;

import java.io.IOException;
import java.nio.file.Path;

/** Hands a verified installer to the part of the system allowed to install it. */
public interface Installer {

    /** Local file name the installer is saved under (never taken from the server). */
    String fileName(String version);

    void install(Path file, String version, String sha256, String signature) throws IOException;
}
