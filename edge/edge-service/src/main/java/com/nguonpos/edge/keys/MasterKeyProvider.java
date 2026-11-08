package com.nguonpos.edge.keys;

/**
 * Supplies the till's 32-byte master key, creating it on first start. The
 * key never sits in plain text next to the data it protects, except with the
 * development-only {@link FileMasterKeyProvider}.
 */
public interface MasterKeyProvider {
    byte[] masterKey();

    String name();
}
